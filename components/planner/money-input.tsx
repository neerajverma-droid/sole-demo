"use client";

import { Input } from "@/components/ui/input";
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
  label,
  invalid,
  id,
  disabled,
  placeholder,
  prefix,
}: {
  value: string;
  onChange: (value: string) => void;
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
    <div className="relative">
      <span
        className={cn(
          "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm",
          disabled ? "text-muted-foreground/50" : "text-muted-foreground",
        )}
      >
        {symbol}
      </span>
      <Input
        id={id}
        className={cn(
          symbol.length <= 1 ? "pl-7" : symbol.length === 2 ? "pl-9" : "pl-11",
          "tabular",
          invalid && "border-destructive focus-visible:ring-destructive",
          disabled && "cursor-not-allowed bg-muted",
        )}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        aria-invalid={!!invalid}
        disabled={disabled}
        placeholder={placeholder}
      />
    </div>
  );
}
