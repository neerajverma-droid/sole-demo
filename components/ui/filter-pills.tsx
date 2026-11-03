"use client";

import { cn } from "@/lib/utils";

/**
 * One rounded filter pill — the treatment introduced by the invoice template
 * gallery, shared so every pill on the platform matches.
 *
 * Split out from `FilterPills` because the Transactions strip needs the same
 * pill around content the options-and-counts API can't express — a count, a
 * word and a money total in one line. Reaching for the pill itself keeps that
 * strip on this treatment instead of a second one that drifts from it.
 *
 * Colours come from the tokens, not literals: `--primary` is the brand indigo
 * #4D4DFE, `--primary-foreground` white, and the resting pill is the page
 * surface with a hairline border and the muted fill on hover. Written this way
 * the same pill is also correct in dark mode, which hardcoded hexes wouldn't be.
 */
export function FilterPill({
  active,
  onSelect,
  label,
  variant = "solid",
  className,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  /** Spoken name, for a pill whose visible content reads oddly out loud. */
  label?: string;
  /**
   * "solid" (default) fills with the brand colour when active — every filter
   * strip outside Reputation. "soft" is Reputation's own treatment (the old
   * `Feedback.js`/`Requests.js` pills, and the HTML spec's `.rep-pill.on`): a
   * primary-tinted border and text over a near-white fill, never a solid
   * block of colour.
   */
  variant?: "solid" | "soft";
  /**
   * For a pill holding more than a word — the Transactions strip carries a
   * label, a count and a total, and needs more room between them than a
   * one-word pill does. Everything else keeps the default.
   */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? variant === "soft"
            ? "border border-primary bg-primary/10 font-semibold text-primary"
            : "bg-primary font-medium text-primary-foreground"
          : "border border-border bg-background hover:bg-muted",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A row of pills over a fixed set of options, one selected at a time. */
export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  counts,
  label,
  tourId,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  /** Optional per-option count, rendered beside the label. */
  counts?: Partial<Record<T, number>>;
  label: string;
  /** Anchors a page walkthrough step to this row of pills. */
  tourId?: string;
}) {
  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label={label}
      data-tour={tourId}
    >
      {options.map((option) => {
        const active = value === option;
        const count = counts?.[option];

        return (
          <FilterPill
            key={option}
            active={active}
            onSelect={() => onChange(option)}
          >
            {option}
            {count !== undefined && (
              <span
                className={cn(
                  "text-xs tabular",
                  active
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground",
                )}
              >
                {count}
              </span>
            )}
          </FilterPill>
        );
      })}
    </div>
  );
}
