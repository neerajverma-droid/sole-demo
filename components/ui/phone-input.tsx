"use client";

import * as React from "react";
import { AsYouType, getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js";
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
import { cn } from "@/lib/utils";

const cleanPhoneValue = (value: string | undefined): string => {
  if (!value) return "";
  return value.replace(/undefined|null/gi, "").trim();
};

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

/**
 * A phone field with its own country/dial-code picker — ported from
 * sole-webapp's `components/ui/phone-input/index.js` (read for the behavior,
 * not imported): formats as you type via libphonenumber-js's `AsYouType`,
 * detects the country from what's typed or pasted, and lets picking a
 * country from the popover set the dial code directly. The reference also
 * wraps its state in an undo/redo history hook, but nothing in its own
 * render ever calls back/forward — dropped here in favour of plain state,
 * since there's no control that would have used it.
 */
export function PhoneInput({
  value: valueProp,
  defaultCountry = "AU",
  className,
  invalid = false,
  id,
  required = false,
  onChange,
}: {
  value?: string;
  defaultCountry?: CountryCode;
  className?: string;
  invalid?: boolean;
  id?: string;
  required?: boolean;
  onChange?: (value: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [value, setValue] = React.useState(cleanPhoneValue(valueProp));
  const [openCommand, setOpenCommand] = React.useState(false);
  const [countryCode, setCountryCode] = React.useState<CountryCode>(defaultCountry);

  // Sync from the parent (edit mode, loading a saved number).
  React.useEffect(() => {
    if (valueProp !== undefined) setValue(cleanPhoneValue(valueProp));
  }, [valueProp]);

  React.useEffect(() => {
    const clean = cleanPhoneValue(value);
    if (!clean) {
      setCountryCode(defaultCountry);
      return;
    }
    const asYouType = new AsYouType();
    asYouType.input(clean);
    const detected = asYouType.getCountry();
    if (detected) setCountryCode(detected);
  }, [value, defaultCountry]);

  const selectedCountry = COUNTRIES.find((country) => country.iso2 === countryCode);

  const handleOnInput: React.FormEventHandler<HTMLInputElement> = (event) => {
    const asYouType = new AsYouType();
    let inputValue = cleanPhoneValue(event.currentTarget.value);
    if (inputValue && !inputValue.startsWith("+")) {
      inputValue = `+${inputValue}`;
    }
    const formattedValue = inputValue ? asYouType.input(inputValue) : "";
    const number = asYouType.getNumber();
    if (number?.country) setCountryCode(number.country);

    setValue(formattedValue);
    onChange?.(formattedValue);
  };

  const handleOnPaste: React.ClipboardEventHandler<HTMLInputElement> = (event) => {
    event.preventDefault();
    const clipboardData = event.clipboardData?.getData("text/plain");
    if (!clipboardData) return;

    const asYouType = new AsYouType();
    const formattedValue = asYouType.input(clipboardData);
    const number = asYouType.getNumber();
    if (number?.country) setCountryCode(number.country);

    setValue(formattedValue);
    onChange?.(formattedValue);
  };

  return (
    <div className={cn("flex gap-2", className)}>
      <Popover open={openCommand} onOpenChange={setOpenCommand} modal>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={openCommand}
            aria-invalid={invalid}
            className={cn(
              "w-max items-center justify-between whitespace-nowrap",
              invalid && "border-destructive focus-visible:ring-destructive",
            )}
          >
            {selectedCountry ? (
              <span className="text-xl">{selectedCountry.emoji}</span>
            ) : (
              "Select"
            )}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search country..." />
            <CommandList>
              <CommandEmpty>No country found.</CommandEmpty>
              <ScrollArea className="[&>[data-radix-scroll-area-viewport]]:max-h-[250px]">
                <CommandGroup>
                  {COUNTRIES.map((country) => (
                    <CommandItem
                      key={country.iso2}
                      value={`${country.name} (+${country.callingCode})`}
                      onSelect={() => {
                        const newValue = `+${country.callingCode}`;
                        setValue(newValue);
                        setCountryCode(country.iso2);
                        onChange?.(newValue);
                        inputRef.current?.focus();
                        setOpenCommand(false);
                      }}
                    >
                      <span className="mr-2 text-2xl">{country.emoji}</span>
                      {country.name}
                      <span className="ml-1 text-muted-foreground">
                        (+{country.callingCode})
                      </span>
                      <Check
                        className={cn(
                          "ml-auto size-4",
                          countryCode === country.iso2 ? "opacity-100" : "opacity-0",
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

      <Input
        ref={inputRef}
        type="text"
        name="phone"
        id={id}
        placeholder="Phone"
        value={value}
        onInput={handleOnInput}
        onPaste={handleOnPaste}
        aria-invalid={invalid}
        required={required}
      />
    </div>
  );
}
