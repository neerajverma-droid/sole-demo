"use client";

import { PrefixInput } from "@/components/ui/prefix-input";
import { useCountryContext } from "@/hooks/use-country-context";
import { countryCurrencySymbol } from "@/lib/country-context";
import { cn } from "@/lib/utils";

/**
 * A money field, prefixed with the business's own currency symbol ("$", "R"). Holds typed text and shows a live error rather than blocking
 * keystrokes, per the platform rule — shared by the goal, budget, plan and
 * wallet forms so the prefix and alignment match in all four.
 */
export function MoneyInput({
  value,
  onChange,
  onBlur,
  label,
  invalid,
  id,
  disabled,
  placeholder,
  prefix,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Focus left the field — when a form starts showing its error. */
  onBlur?: () => void;
  label: string;
  invalid?: boolean;
  /** For a form that pairs the field with a visible `<Label htmlFor>`. */
  id?: string;
  /**
   * A field that isn't answerable yet — the tax estimator's super figures
   * before the toggle above them is on. The prefix dims with it, so the whole
   * control reads as off rather than an active field that rejects typing.
   */
  disabled?: boolean;
  placeholder?: string;
  prefix?: string;
}) {
  const { country } = useCountryContext();
  const symbol = prefix ?? countryCurrencySymbol(country);
  return (
    <PrefixInput
      prefix={symbol}
      id={id}
      wrapperClassName={cn(disabled && "bg-muted")}
      className="tabular"
      inputMode="decimal"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      aria-label={label}
      aria-invalid={!!invalid}
      disabled={disabled}
      placeholder={placeholder}
    />
  );
}
