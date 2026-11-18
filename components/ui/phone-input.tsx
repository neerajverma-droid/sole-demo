"use client";

import * as React from "react";
import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  caretAfterFormatting,
  cleanPhoneValue,
  exceedsMaxDigits,
  phonePlaceholder,
  phoneStateForCountry,
  phoneStateFromInput,
  phoneStateFromValue,
  phoneValue,
  resolveDeletion,
  type PhoneState,
} from "@/lib/phone";
import { cn } from "@/lib/utils";

/** 🇦🇺 from "AU" — the regional-indicator-symbol trick, no flag image or data file needed. */
function flagEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

const REGION_NAMES =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

/**
 * The dial-code list, built from libphonenumber-js's own metadata rather
 * than porting sole-webapp's 13,000-line static `countries.js` — same
 * fields it actually uses (name, iso2, dial code, flag), computed instead of
 * stored.
 */
const COUNTRIES = getCountries()
  .map((iso2) => ({
    iso2,
    name: REGION_NAMES?.of(iso2) ?? iso2,
    callingCode: getCountryCallingCode(iso2),
    emoji: flagEmoji(iso2),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const COUNTRY_BY_ISO = new Map(COUNTRIES.map((country) => [country.iso2, country]));

/**
 * The flag-and-dial-code picker ("🇦🇺 +61") with a searchable country list.
 *
 * `PhoneInput` uses it for its own country, and forms that store the dial code
 * and the number as two fields (contacts) use it on its own next to a plain
 * number input. `onCloseFocus` says where focus goes when the list closes —
 * usually the number field beside it.
 */
export function CountryCodePicker({
  country,
  invalid = false,
  className,
  onSelect,
  onCloseFocus,
}: {
  country: CountryCode;
  invalid?: boolean;
  className?: string;
  onSelect: (country: CountryCode) => void;
  onCloseFocus?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selectedCountry = COUNTRY_BY_ISO.get(country);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          aria-label={
            selectedCountry
              ? `Country code: ${selectedCountry.name}, plus ${selectedCountry.callingCode}`
              : "Choose a country code"
          }
          className={cn(
            "shrink-0 items-center justify-between gap-1.5 whitespace-nowrap px-3",
            invalid && "border-destructive focus-visible:ring-destructive",
            className,
          )}
        >
          {selectedCountry ? (
            <>
              <span className="text-xl leading-none" aria-hidden>
                {selectedCountry.emoji}
              </span>
              <span className="text-sm tabular-nums">
                +{selectedCountry.callingCode}
              </span>
            </>
          ) : (
            "Select"
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[300px] p-0"
        align="start"
        onCloseAutoFocus={(event) => {
          if (!onCloseFocus) return;
          event.preventDefault();
          onCloseFocus();
        }}
      >
        <Command>
          <CommandInput placeholder="Search country or code…" />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <ScrollArea className="[&>[data-radix-scroll-area-viewport]]:max-h-[250px]">
              <CommandGroup>
                {COUNTRIES.map((entry) => (
                  <CommandItem
                    key={entry.iso2}
                    // Searchable by name, dial code or ISO code ("au", "61").
                    value={`${entry.name} +${entry.callingCode} ${entry.iso2}`}
                    onSelect={() => {
                      onSelect(entry.iso2);
                      setOpen(false);
                    }}
                  >
                    <span className="mr-2 text-2xl">{entry.emoji}</span>
                    {entry.name}
                    <span className="ml-1 text-muted-foreground">
                      (+{entry.callingCode})
                    </span>
                    <Check
                      className={cn(
                        "ml-auto size-4",
                        country === entry.iso2 ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A phone field the way mobile and checkout forms do it: the country picker
 * shows the flag **and the dial code** ("🇦🇺 +61"), and the text field next to
 * it takes just the national number — "0412 345 678", trunk 0 and all — which
 * is how people actually type their own number.
 *
 * Nothing needs typing to get the country code in: it's already there from the
 * picker, and `defaultCountry` (the business's country) chooses it until the
 * person picks another. Pasting a full international number ("+61 412 345 678")
 * still works — the dial code moves into the picker and the country follows it.
 *
 * What it reports through `onChange` is always the international form
 * ("+61 412 345 678"), or "" while nothing is typed, so callers can store and
 * validate it as-is. A value passed in may be in either form; it's read back
 * into country + national number. The parsing and formatting live in
 * `lib/phone.ts`.
 */
export function PhoneInput({
  value: valueProp,
  defaultCountry = "AU",
  className,
  invalid = false,
  id,
  required = false,
  onChange,
  onBlur,
}: {
  value?: string;
  defaultCountry?: CountryCode;
  className?: string;
  invalid?: boolean;
  id?: string;
  required?: boolean;
  onChange?: (value: string) => void;
  onBlur?: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [state, setState] = React.useState<PhoneState>(() =>
    phoneStateFromValue(valueProp, defaultCountry),
  );
  /** Whether the person has chosen a country themselves. */
  const [picked, setPicked] = React.useState(false);
  /** Where the caret goes once the re-formatted text is on screen. */
  const caret = React.useRef<number | null>(null);

  // The two syncs below adjust state while rendering rather than in an effect:
  // React re-renders before painting, so a value that arrives from outside
  // never shows for a frame as the old number.

  // A value from outside — a saved number loading, a form reset. What this
  // field just reported coming back round is recognised (it is exactly what the
  // current text would report) and left alone.
  const [seenValue, setSeenValue] = React.useState(valueProp);
  if (valueProp !== undefined && valueProp !== seenValue) {
    setSeenValue(valueProp);
    const clean = cleanPhoneValue(valueProp);
    if (clean !== phoneValue(state)) {
      setState(phoneStateFromValue(clean, defaultCountry));
      // A cleared form starts over, including following the business country.
      if (!clean) setPicked(false);
    }
  }

  // Until a number is typed or a country picked, the field follows the
  // business's country as it changes.
  const [seenDefault, setSeenDefault] = React.useState(defaultCountry);
  if (defaultCountry !== seenDefault) {
    setSeenDefault(defaultCountry);
    if (!picked && state.text === "") {
      setState({ country: defaultCountry, text: "" });
    }
  }

  // Re-formatting moves the caret to the end; put it back after the digit it
  // was on. Runs every render because the text can come out unchanged.
  React.useLayoutEffect(() => {
    const target = caret.current;
    if (target === null) return;
    caret.current = null;
    const input = inputRef.current;
    if (input && document.activeElement === input) {
      input.setSelectionRange(target, target);
    }
  });

  const commit = (next: PhoneState) => {
    const value = phoneValue(next);
    const changed = value !== phoneValue(state);
    setState(next);
    if (changed) onChange?.(value);
  };

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const input = event.currentTarget;
    const edited = resolveDeletion(
      input.value,
      input.selectionStart ?? input.value.length,
      state.text,
    );
    // Returning without committing snaps the field back to what it held.
    if (exceedsMaxDigits(edited.raw)) return;

    const next = phoneStateFromInput(edited.raw, state.country);
    caret.current = caretAfterFormatting(edited.raw, edited.caret, next.text);
    commit(next);
  };

  return (
    <div className={cn("flex gap-2", className)}>
      <CountryCodePicker
        country={state.country}
        invalid={invalid}
        // Radix would hand focus back to the picker; the number is next.
        onCloseFocus={() => inputRef.current?.focus()}
        onSelect={(country) => {
          setPicked(true);
          commit(phoneStateForCountry(state.text, country));
        }}
      />

      <Input
        ref={inputRef}
        // `tel` brings up the phone keypad; the font-size stays at 16px on
        // small screens (see Input), which is what stops iOS zooming on focus.
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        name="phone"
        id={id}
        placeholder={phonePlaceholder(state.country)}
        value={state.text}
        onChange={handleChange}
        onBlur={onBlur}
        aria-invalid={invalid}
        required={required}
        className={cn(invalid && "border-destructive focus-visible:ring-destructive")}
      />
    </div>
  );
}
