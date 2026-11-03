"use client";

import * as React from "react";
import { Check, ChevronDown, FileText, Trash2, Upload, X } from "lucide-react";

import { DatePicker } from "@/components/documents/date-picker";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CONTROL_SURFACE_TRIGGER } from "@/components/ui/control-surface";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AddressAutocomplete,
  type AddressComponents,
} from "@/components/documents/address-autocomplete";
import { Field } from "@/components/documents/field";
import { parseIsoDate } from "@/lib/invoices";
import { cn } from "@/lib/utils";

/**
 * The controls every payment-gateway onboarding form shares.
 *
 * Thin wrappers over the platform's own `Field`, `Input` and `Select` rather
 * than new components — the point is that these forms look like every other
 * form on the platform, so what's shared here is the wiring (value, change,
 * error) and not a second treatment.
 *
 * These started life inside SolePay's onboarding and moved here when NextTap's
 * onboarding was added: two gateways asking for a business address in two
 * subtly different text fields would be two places for the same treatment to
 * drift. SolePay's `fields.tsx` re-exports from here, so its screens are
 * untouched.
 */

/** A validator's findings: field key → the one message to show under it. */
export type OnboardingIssues = Record<string, string>;

/** Marks an invalid control, the way the contact drawer does. */
const INVALID = "border-destructive focus-visible:ring-destructive";

/**
 * Scrolls to and focuses the first invalid field on a failed Save — the same
 * job shadcn's form helpers do by focusing the first react-hook-form error,
 * adapted for these screens' plain `useState` drafts, which have no form
 * library holding a ref per field to focus automatically.
 *
 * `issues` keys are in the same top-to-bottom order the validator checks
 * them in, which already matches the order fields appear on the page — so
 * the first key is the first invalid field, not an arbitrary one.
 */
export function focusFirstIssue(
  issues: OnboardingIssues,
  fieldIds: Record<string, string>,
) {
  const firstKey = Object.keys(issues)[0];
  if (!firstKey) return;
  const id = fieldIds[firstKey];
  if (!id) return;
  const element = document.getElementById(id);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.focus({ preventScroll: true });
}

export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  required,
  placeholder,
  hint,
  type,
  inputMode,
  disabled,
  max,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  type?: string;
  inputMode?: "numeric" | "tel" | "decimal";
  /**
   * A field whose answer is decided elsewhere — the mirrored billing account.
   * Shown rather than hidden, so what it will be saved as is visible.
   */
  disabled?: boolean;
  /** For a date field that can't be in the future. */
  max?: string;
}) {
  return (
    <Field
      label={label}
      htmlFor={id}
      required={required}
      hint={hint}
      error={error}
    >
      {type === "date" ? (
        <DatePicker
          id={id}
          label={label}
          value={value}
          onChange={onChange}
          toDate={parseIsoDate(max ?? "")}
          disabled={disabled}
          invalid={!!error}
        />
      ) : (
        <Input
          id={id}
          type={type}
          max={max}
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          aria-required={required}
          aria-invalid={!!error}
          disabled={disabled}
          className={cn(
            error && INVALID,
            disabled && "cursor-not-allowed bg-muted",
          )}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

/** A plain label, or an `{id, name}` pair when the stored value isn't the label itself — an entity type or an ID type, where the gateway stores a code rather than the text shown for it. */
export type SelectFieldOption = string | { id: string; name: string };

function normalizeOption(option: SelectFieldOption): { value: string; label: string } {
  return typeof option === "string"
    ? { value: option, label: option }
    : { value: option.id, label: option.name };
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  error,
  required,
  placeholder = "Select an option",
  hint,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectFieldOption[];
  error?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  /** For a select whose options depend on an answer that hasn't been given yet. */
  disabled?: boolean;
}) {
  return (
    <Field
      label={label}
      htmlFor={id}
      required={required}
      hint={hint}
      error={error}
    >
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          id={id}
          aria-required={required}
          aria-invalid={!!error}
          className={cn(error && INVALID)}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => {
            const normalized = normalizeOption(option);
            return (
              <SelectItem key={normalized.value} value={normalized.value}>
                {normalized.label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </Field>
  );
}

/**
 * A searchable version of `SelectField` — sole-webapp's own `FormSearchableSelect`,
 * used for exactly two fields on the real Entity form (Entity Type and
 * Industry) rather than the plain `<Select>`/`<SelectItem>` pair its own
 * MemberForm uses for ID type. Built on the same Popover + Command pattern as
 * `IndustryCombobox` and the client combobox, so typing to filter behaves
 * identically everywhere it appears.
 */
export function SearchableSelectField({
  id,
  label,
  value,
  onChange,
  options,
  error,
  required,
  placeholder = "Select an option",
  searchPlaceholder = "Search…",
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectFieldOption[];
  error?: string;
  required?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  hint?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const normalized = options.map(normalizeOption);
  const selected = normalized.find((option) => option.value === value);

  return (
    <Field label={label} htmlFor={id} required={required} hint={hint} error={error}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-required={required}
            aria-invalid={!!error}
            className={cn(
              "h-10 w-full justify-between px-3 font-normal",
              CONTROL_SURFACE_TRIGGER,
              !selected && "text-muted-foreground",
              error && INVALID,
            )}
          >
            <span className="truncate">{selected?.label ?? placeholder}</span>
            <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>No match.</CommandEmpty>
              <CommandGroup>
                {normalized.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "size-4",
                        value === option.value ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </Field>
  );
}

/**
 * A free-text answer that runs to more than a line — a business description,
 * or notes about how transactions are taken.
 */
export function TextAreaField({
  id,
  label,
  value,
  onChange,
  error,
  required,
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <Field
      label={label}
      htmlFor={id}
      required={required}
      hint={hint}
      error={error}
    >
      <Textarea
        id={id}
        value={value}
        placeholder={placeholder}
        aria-required={required}
        aria-invalid={!!error}
        className={cn("min-h-[104px]", error && INVALID)}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

/**
 * A small closed set of answers, shown all at once.
 *
 * A radio row rather than a select wherever there are two or three options:
 * the answers are short and the choice is the question, so hiding them behind
 * a trigger costs a click and tells the reader nothing.
 */
export function RadioField({
  id,
  label,
  value,
  onChange,
  options,
  error,
  required,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  error?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <Field
      label={label}
      htmlFor={id}
      required={required}
      hint={hint}
      error={error}
    >
      <RadioGroup
        id={id}
        value={value}
        onValueChange={onChange}
        className="flex flex-wrap gap-x-6 gap-y-2 pt-1"
      >
        {options.map((option) => (
          <Label
            key={option.value}
            className="flex items-center gap-2 text-sm font-normal"
          >
            <RadioGroupItem value={option.value} />
            {option.label}
          </Label>
        ))}
      </RadioGroup>
    </Field>
  );
}

/**
 * The address search that sits above the manual fields.
 *
 * The same live Google Places lookup the business profile form uses
 * (`AddressAutocomplete`) — picking a suggestion fills address line 1, city,
 * state, postcode and country below it; the fields stay editable by hand
 * either way, for an address the search doesn't have.
 */
export function AddressSearchField({
  id,
  value,
  onChange,
  onSelect,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: AddressComponents) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Search for an address</Label>
      <AddressAutocomplete
        id={id}
        value={value}
        placeholder="Start typing an address"
        onChange={onChange}
        onSelect={onSelect}
      />
      <p className="text-xs text-muted-foreground">
        Or enter the address manually below.
      </p>
    </div>
  );
}

/** A file already on file with the gateway, as a drop zone shows it. */
export type UploadedDocument = {
  id: string;
  name: string;
  uploadedAt?: string;
};

/** A file picked locally but not yet sent. */
export type PendingDocument = { name: string } | null;

/**
 * One document slot: what it wants, and the file that answered it.
 *
 * Drop and click are the same action, so the dashed area is both — a zone that
 * only accepted a drag would be unusable to anyone who doesn't have the file in
 * a window beside this one.
 *
 * `existing` is the copy the gateway already holds, shown above the zone so
 * replacing a document and adding one read differently. SolePay passes none
 * (its upload endpoint returns the slot's file directly); NextTap lists its
 * uploads separately and can delete them, which is what `onDeleteExisting` is.
 */
export function DocumentDropZone({
  title,
  hint,
  file,
  existing,
  optional,
  disabled,
  accept = "image/*,application/pdf",
  acceptLabel = "images or PDF",
  onSelect,
  onClear,
  onDeleteExisting,
  error,
}: {
  title: string;
  hint: string;
  file: PendingDocument;
  existing?: UploadedDocument | null;
  /** Says so on the label, for a slot the gateway doesn't insist on. */
  optional?: boolean;
  disabled?: boolean;
  accept?: string;
  acceptLabel?: string;
  onSelect: (file: File) => void;
  onClear: () => void;
  onDeleteExisting?: (id: string) => void;
  /** Why the last file picked for this slot was turned away. */
  error?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  /** Whether a file is over the zone, so it can say it's ready to take it. */
  const [over, setOver] = React.useState(false);

  return (
    <div
      className={cn(
        "space-y-3 rounded-[14px] border border-border bg-card p-4 shadow-sm",
        disabled && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
          aria-hidden
        >
          <FileText className="size-4" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium">
            {title}
            {optional ? (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                (optional)
              </span>
            ) : (
              <span className="ml-0.5 text-destructive" aria-label="Required">
                *
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>

      {/* What the gateway already holds. Kept above the zone rather than in
          place of it, because a slot can be re-uploaded without the old copy
          disappearing first. */}
      {existing && (
        <div className="flex items-center gap-2 rounded-[9px] border border-emerald-200 bg-emerald-50/60 px-3 py-2 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <FileText
            className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{existing.name}</p>
            {existing.uploadedAt && (
              <p className="text-xs text-muted-foreground tabular">
                {new Date(existing.uploadedAt).toLocaleString()}
              </p>
            )}
          </div>
          {onDeleteExisting && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 rounded-[9px] text-muted-foreground hover:text-destructive"
              aria-label={`Remove ${existing.name}`}
              disabled={disabled}
              onClick={() => onDeleteExisting(existing.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      )}

      {file ? (
        /* Answered. The name and a way to undo it — re-dropping over a filled
           slot would be ambiguous about which file won. */
        <div className="flex items-center gap-2 rounded-[9px] border border-border px-3 py-2">
          <FileText
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 rounded-[9px] text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${file.name}`}
            disabled={disabled}
            onClick={onClear}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            if (disabled) return;
            // Without this the browser opens the file instead of handing it over.
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setOver(false);
            if (disabled) return;
            const dropped = event.dataTransfer.files?.[0];
            if (dropped) onSelect(dropped);
          }}
          className={cn(
            "flex w-full flex-col items-center gap-1.5 rounded-[9px] border border-dashed p-5 text-center outline-none",
            "motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            disabled
              ? "cursor-not-allowed border-border"
              : over
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40 hover:bg-muted/40",
          )}
        >
          <Upload className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium">
            {existing ? "Drop a replacement here" : "Drop file here"}
          </span>
          <span className="text-xs text-muted-foreground">
            Or click to browse · {acceptLabel}
          </span>
        </button>
      )}

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen) onSelect(chosen);
          // Cleared so choosing the same file twice still fires a change.
          event.target.value = "";
        }}
      />
    </div>
  );
}
