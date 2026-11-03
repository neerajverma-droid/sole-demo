"use client";

import * as React from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";

import { DatePicker } from "@/components/documents/date-picker";
import { MoneyInput } from "@/components/planner/money-input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { COUNTRY_CODES } from "@/lib/contacts";
import type { Option } from "@/lib/payroll-employees";
import { cn } from "@/lib/utils";

/**
 * The field shapes both employee drawers are built from — the create drawer's
 * thirty-odd fields and the profile's hundred share one treatment, so they're
 * written once here against any form's values.
 */

type Base<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  className?: string;
  hint?: string;
};

function RequiredMark() {
  return (
    <span className="ml-0.5 text-destructive" aria-hidden>
      *
    </span>
  );
}

const INVALID = "border-destructive focus-visible:ring-destructive";

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  className,
  hint,
  required,
  placeholder,
  type,
  inputMode,
  autoComplete,
}: Base<T> & {
  required?: boolean;
  placeholder?: string;
  type?: string;
  inputMode?: "numeric" | "decimal" | "tel" | "email";
  autoComplete?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem className={className}>
          <FormLabel>
            {label}
            {required && <RequiredMark />}
          </FormLabel>
          <FormControl>
            <Input
              {...field}
              value={String(field.value ?? "")}
              type={type}
              inputMode={inputMode}
              placeholder={placeholder}
              autoComplete={autoComplete}
              aria-required={required}
              aria-invalid={!!fieldState.error}
              className={cn(
                inputMode === "decimal" && "tabular",
                fieldState.error && INVALID,
              )}
            />
          </FormControl>
          {hint && !fieldState.error && (
            <FormDescription className="text-xs">{hint}</FormDescription>
          )}
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

/** A number typed as text — the error shows live rather than blocking keys. */
export function NumberField<T extends FieldValues>(
  props: Base<T> & { placeholder?: string; suffix?: string },
) {
  const { suffix, ...rest } = props;
  if (!suffix) return <TextField {...rest} inputMode="decimal" />;
  return (
    <FormField
      control={props.control}
      name={props.name}
      render={({ field, fieldState }) => (
        <FormItem className={props.className}>
          <FormLabel>{props.label}</FormLabel>
          <div className="relative">
            <FormControl>
              <Input
                {...field}
                value={String(field.value ?? "")}
                inputMode="decimal"
                placeholder={props.placeholder}
                aria-invalid={!!fieldState.error}
                className={cn("pr-9 tabular", fieldState.error && INVALID)}
              />
            </FormControl>
            <span
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
              aria-hidden
            >
              {suffix}
            </span>
          </div>
          {props.hint && !fieldState.error && (
            <FormDescription className="text-xs">{props.hint}</FormDescription>
          )}
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

export function MoneyField<T extends FieldValues>({
  control,
  name,
  label,
  className,
  hint,
}: Base<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <MoneyInput
            value={String(field.value ?? "")}
            onChange={field.onChange}
            label={label}
            invalid={!!fieldState.error}
          />
          {hint && !fieldState.error && (
            <FormDescription className="text-xs">{hint}</FormDescription>
          )}
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  className,
  hint,
  options,
  placeholder = "Select an option",
  required,
  leading,
}: Base<T> & {
  options: readonly Option[];
  placeholder?: string;
  required?: boolean;
  /** Options listed before `options`, e.g. "Manual selection". */
  leading?: readonly Option[];
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem className={className}>
          <FormLabel>
            {label}
            {required && <RequiredMark />}
          </FormLabel>
          <Select
            value={field.value ? String(field.value) : undefined}
            onValueChange={(next) => {
              field.onChange(next);
              field.onBlur();
            }}
          >
            <FormControl>
              <SelectTrigger
                aria-invalid={!!fieldState.error}
                className={cn(fieldState.error && INVALID)}
              >
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {[...(leading ?? []), ...options].map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hint && !fieldState.error && (
            <FormDescription className="text-xs">{hint}</FormDescription>
          )}
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

/** A date, with a way back to blank — the calendar alone can't unset one. */
export function DateField<T extends FieldValues>({
  control,
  name,
  label,
  className,
  hint,
}: Base<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <div className="flex items-center justify-between gap-2">
            <FormLabel>{label}</FormLabel>
            {field.value && (
              <button
                type="button"
                onClick={() => field.onChange("")}
                className="text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:underline"
              >
                Clear
              </button>
            )}
          </div>
          <DatePicker
            value={String(field.value ?? "")}
            onChange={field.onChange}
            label={label}
          />
          {hint && (
            <FormDescription className="text-xs">{hint}</FormDescription>
          )}
        </FormItem>
      )}
    />
  );
}

/** An on/off setting, in a ruled row with its explanation. */
export function ToggleField<T extends FieldValues>({
  control,
  name,
  label,
  className,
  hint,
}: Base<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem
          className={cn(
            "flex items-center justify-between gap-4 space-y-0 rounded-md border border-border p-3",
            className,
          )}
        >
          <div className="space-y-0.5">
            <FormLabel className="font-normal">{label}</FormLabel>
            {hint && (
              <FormDescription className="text-xs">{hint}</FormDescription>
            )}
          </div>
          <FormControl>
            <Switch checked={!!field.value} onCheckedChange={field.onChange} />
          </FormControl>
        </FormItem>
      )}
    />
  );
}

/** A tick box with its label beside it — for a one-off choice made at creation. */
export function CheckField<T extends FieldValues>({
  control,
  name,
  label,
  className,
}: Base<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem
          className={cn("flex items-center gap-2 space-y-0", className)}
        >
          <FormControl>
            <Checkbox
              checked={!!field.value}
              onCheckedChange={(next) => field.onChange(next === true)}
            />
          </FormControl>
          <FormLabel className="font-normal">{label}</FormLabel>
        </FormItem>
      )}
    />
  );
}

/**
 * Country code and number as one field. A code Microkeeper already holds that
 * isn't in the short list is kept as an option rather than silently swapped.
 */
export function MobileField<T extends FieldValues>({
  control,
  codeName,
  numberName,
  label,
  required,
  className,
}: {
  control: Control<T>;
  codeName: FieldPath<T>;
  numberName: FieldPath<T>;
  label: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <FormField
      control={control}
      name={numberName}
      render={({ field, fieldState }) => (
        <FormItem className={className}>
          <FormLabel>
            {label}
            {required && <RequiredMark />}
          </FormLabel>
          <div className="flex gap-2">
            <FormField
              control={control}
              name={codeName}
              render={({ field: codeField }) => {
                const code = String(codeField.value ?? "");
                const codes = COUNTRY_CODES.some((entry) => entry.code === code)
                  ? COUNTRY_CODES
                  : [...COUNTRY_CODES, { code, label: code, lengths: [] }];
                return (
                  <Select
                    value={code || undefined}
                    onValueChange={codeField.onChange}
                  >
                    <SelectTrigger
                      className="w-[116px] shrink-0"
                      aria-label="Country code"
                    >
                      <SelectValue placeholder="Code" />
                    </SelectTrigger>
                    <SelectContent>
                      {codes
                        .filter((entry) => entry.code)
                        .map((entry) => (
                          <SelectItem key={entry.code} value={entry.code}>
                            {entry.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                );
              }}
            />
            <FormControl>
              <Input
                {...field}
                value={String(field.value ?? "")}
                inputMode="tel"
                placeholder="412 345 678"
                aria-required={required}
                aria-invalid={!!fieldState.error}
                className={cn("tabular", fieldState.error && INVALID)}
              />
            </FormControl>
          </div>
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

/** Two columns from `sm` up, as every sectioned drawer lays its fields out. */
export function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}
