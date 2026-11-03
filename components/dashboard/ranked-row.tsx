"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * A ranked row that is its own bar chart: a proportional indigo track sits
 * behind the label and figure, so the list reads as data rather than text.
 * Keeps ProportionBar's tooltip and focus contract.
 */
export function RankedRow({
  label,
  valueLabel,
  percent,
  totalLabel,
  leading,
  onSelect,
  className,
}: {
  label: string;
  valueLabel: string;
  /** Share of the category total. */
  percent: number;
  /** Names the denominator, e.g. "income". */
  totalLabel: string;
  /** The largest row carries the accent at full strength. */
  leading?: boolean;
  /** Given, the row becomes a button that drills into what it stands for. */
  onSelect?: () => void;
  className?: string;
}) {
  // Only rows that go somewhere become buttons; the rest stay the readable,
  // focusable figures they were.
  const Row = onSelect ? "button" : "div";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Row
          {...(onSelect
            ? { type: "button" as const, onClick: onSelect }
            : { tabIndex: 0 })}
          aria-label={`${label}, ${valueLabel}, ${percent}% of ${totalLabel}`}
          className={cn(
            "relative flex w-full items-baseline justify-between gap-4 overflow-hidden rounded-md px-2.5 py-2 text-left outline-none ring-offset-1 focus-visible:ring-2 focus-visible:ring-ring",
            onSelect
              ? "cursor-pointer transition-colors hover:bg-muted/50"
              : "cursor-default",
            className,
          )}
        >
          <span
            className={cn(
              "absolute inset-y-0 left-0 rounded-md transition-[width] duration-300",
              leading ? "bg-primary/15" : "bg-primary/[0.07]",
            )}
            style={{ width: `${Math.max(percent, 2)}%` }}
            aria-hidden
          />
          <span className="relative truncate text-sm">{label}</span>
          <span className="relative flex shrink-0 items-baseline gap-2.5">
            <span className="text-xs text-muted-foreground tabular">
              {percent}%
            </span>
            <span className="text-sm font-medium tabular">{valueLabel}</span>
          </span>
        </Row>
      </TooltipTrigger>
      <TooltipContent>
        {label} · {valueLabel} · {percent}% of {totalLabel}
      </TooltipContent>
    </Tooltip>
  );
}
