"use client";

import type { LucideIcon } from "lucide-react";

import { InfoTip } from "@/components/ui/info-tip";
import { Shimmer } from "@/components/ui/shimmer";
import { cn } from "@/lib/utils";

export type StatBreakdown = {
  label: string;
  tone?: "success" | "warning" | "danger";
};

export type StatCard = {
  key: string;
  label: string;
  /** Plain-English explanation for a figure people will question. */
  tip?: string;
  value: string;
  /** The "N on track, N review, N funding gap" line beneath the figure. */
  breakdown?: StatBreakdown[];
  /** A single supporting line, where there's no breakdown to show. */
  meta?: string;
  icon: LucideIcon;
  /** What the figure means — decides the tile's colour. Indigo by default. */
  tone?: StatTone;
  /** Escape hatch for a tile no tone covers, e.g. the warm money-out accent. */
  tileTone?: string;
  /**
   * Makes the card a filter as well as a figure — the payroll employee list
   * narrows to failed syncs from its "Needs attention" card, as sole-webapp's
   * did. Absent, the card is a plain figure as before.
   */
  onSelect?: () => void;
  /** The filter this card applies is the one in force. */
  active?: boolean;
  /** Spoken name for the card's button, where the label alone undersells it. */
  selectLabel?: string;
};

const TONES: Record<string, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

/**
 * What a figure means, said in colour on its icon tile.
 *
 * The one place the mapping lives, so a "matched" tile is the same green on
 * Super contributions as on Transactions, and a screen can't invent a fifth
 * meaning. Only the tile and its icon are tinted — a card surface stays white,
 * because a wall of tinted cards is the thing this is meant to avoid.
 *
 * Teal is the palette's fifth colour rather than a token, so it's written the
 * way the nav writes it: a 600/400 pair that holds up in both themes.
 */
export type StatTone = "primary" | "success" | "warning" | "accent" | "danger";

export const STAT_TONES: Record<StatTone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  accent: "bg-teal-600/10 text-teal-700 dark:bg-teal-400/10 dark:text-teal-400",
  danger: "bg-destructive/10 text-destructive",
};

/**
 * How many columns a given number of tiles gets.
 *
 * Keyed off the count rather than fixed at five: the planner Overview passes
 * five and the cash wallet passes three, and a hardcoded five left the row two
 * cells short — three tiles squeezed into five columns' worth of width, labels
 * truncating, and 40% of the row empty. Deriving it means a caller can add or
 * drop a figure without the row going wrong again.
 *
 * Written out in full because Tailwind scans for literal class names; building
 * these by interpolation would leave the classes out of the stylesheet.
 */
const COLUMNS: Record<number, string> = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 xl:grid-cols-4",
  5: "sm:grid-cols-2 xl:grid-cols-5",
};

/**
 * A row of figures, each a card with an icon tile, the number, and a supporting
 * line beneath it.
 *
 * Introduced by the Business planner and shared from here, since Super
 * contributions wants the same cards and shouldn't import from the planner —
 * the same move `StatStrip` made when Client refunds wanted the Products strip.
 *
 * One tile treatment throughout — indigo unless a card is specifically about
 * money you're short of — and colour only ever on the icon or a status word,
 * never on a number.
 */
export function StatCards({
  stats,
  loading,
  className,
}: {
  stats: StatCard[];
  /** A fetch behind these figures is in flight — e.g. switching period tabs. */
  loading?: boolean;
  /** Overrides on the grid — e.g. a tighter gap on a denser screen. */
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-4",
        // Anything past five wraps at five rather than shrinking further.
        COLUMNS[stats.length] ?? COLUMNS[5],
        className,
      )}
    >
      {stats.map((stat) => (
        <div
          key={stat.key}
          className={cn(
            "min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm",
            stat.onSelect && "relative transition-colors hover:bg-muted/40",
            stat.active && "border-primary/50 ring-1 ring-primary/40",
          )}
        >
          {/* Stretched over the whole card rather than wrapping it: a button
              can't hold the dt/dd pair, and the list has to stay a list. */}
          {stat.onSelect && (
            <button
              type="button"
              onClick={stat.onSelect}
              aria-pressed={stat.active ?? false}
              aria-label={stat.selectLabel ?? `Filter by ${stat.label.toLowerCase()}`}
              className="absolute inset-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          )}
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-xl [&_svg]:size-4",
                stat.tileTone ?? STAT_TONES[stat.tone ?? "primary"],
              )}
              aria-hidden
            >
              <stat.icon />
            </span>
            <dt className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
              <span className="truncate">{stat.label}</span>
              {stat.tip && (
                // Above the card's own button, so the tip still opens.
                <span className="relative z-10 inline-flex">
                  <InfoTip text={stat.tip} />
                </span>
              )}
            </dt>
          </div>

          {loading ? (
            <dd className="mt-3 space-y-1.5" aria-hidden>
              <Shimmer className="h-6 w-24 rounded-md" />
              <Shimmer className="h-3.5 w-32 rounded-md" />
            </dd>
          ) : (
            <dd className="mt-3 space-y-1.5">
              <p className="text-xl font-semibold leading-none tracking-tight tabular">
                {stat.value}
              </p>
              {stat.breakdown ? (
                <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground tabular">
                  {stat.breakdown.map((entry, index) => (
                    <span key={entry.label} className="flex items-center gap-1.5">
                      {index > 0 && <span aria-hidden>·</span>}
                      <span className={entry.tone ? TONES[entry.tone] : undefined}>
                        {entry.label}
                      </span>
                    </span>
                  ))}
                </p>
              ) : (
                stat.meta && (
                  <p className="text-xs text-muted-foreground tabular">
                    {stat.meta}
                  </p>
                )
              )}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}
