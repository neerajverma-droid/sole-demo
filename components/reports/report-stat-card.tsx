"use client";

import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";

import { CountUp } from "@/components/ui/count-up";
import { InfoTip } from "@/components/ui/info-tip";
import { STAT_TONES, type StatTone } from "@/components/ui/stat-cards";
import { reportMoney, type ReportDelta } from "@/lib/report-periods";
import { cn } from "@/lib/utils";

/**
 * A report's supporting figure, and the movement under it.
 *
 * Built here rather than through `StatCards` because these need a trend line —
 * an arrow and a colour on the comparison — and that component's supporting slot
 * takes a string. The tile treatment still comes from `STAT_TONES`, so the
 * colours can't drift from the rest of the product.
 *
 * Shared by every Reporting suite report: the P&L reads money into it, the
 * Transaction Listing reads a count, which is why the formatter is a prop.
 */
export function ReportStatCard({
  icon: Icon,
  tone = "primary",
  tileTone,
  label,
  tip,
  value,
  format = reportMoney,
  delta,
  breakdown,
  empty = false,
  emptyMeta = "Nothing recorded yet",
}: {
  icon: LucideIcon;
  tone?: StatTone;
  /** Escape hatch for a tile no tone covers — the warm money-out accent. */
  tileTone?: string;
  label: string;
  tip: string;
  value: number;
  format?: (value: number) => string;
  /** Omitted where there's nothing meaningful to compare against. */
  delta?: ReportDelta;
  /** Extra detail under the figure — chips, a split, a caveat. */
  breakdown?: React.ReactNode;
  /** Zero, and no comparison: there's nothing behind it to compare against. */
  empty?: boolean;
  emptyMeta?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-xl [&_svg]:size-4",
            STAT_TONES[tone],
            tileTone,
          )}
          aria-hidden
        >
          <Icon />
        </span>
        <dt className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <span className="truncate">{label}</span>
          <InfoTip text={tip} />
        </dt>
      </div>
      <dd className="mt-3 space-y-1.5">
        <p
          className={cn(
            "text-xl font-semibold leading-none tracking-tight tabular",
            // Zero is a real answer, but a muted one: nothing here is news.
            empty && "text-muted-foreground",
          )}
        >
          {empty ? format(0) : <CountUp value={value} format={format} />}
        </p>
        {empty ? (
          <p className="text-xs text-muted-foreground">{emptyMeta}</p>
        ) : (
          <>
            {delta && <ReportDeltaLine delta={delta} small />}
            {breakdown}
          </>
        )}
      </dd>
    </div>
  );
}

/**
 * The movement against the previous period.
 *
 * Green for a favourable move and red for an unfavourable one — which is not
 * the same as green for a rise. Expenses climbing is a rise and bad news, and
 * `reportDelta` is where each figure declares which way is up for it.
 *
 * Nothing moved gets neither an arrow nor a colour: an arrow pointing at a
 * change of zero is a shape with no fact behind it.
 */
export function ReportDeltaLine({
  delta,
  small = false,
}: {
  delta: ReportDelta;
  small?: boolean;
}) {
  const Icon = delta.up ? TrendingUp : TrendingDown;

  return (
    <p
      className={cn(
        "flex items-center gap-1 font-medium tabular",
        small ? "text-xs" : "text-sm",
        delta.flat
          ? "text-muted-foreground"
          : delta.favourable
            ? "text-success"
            : "text-destructive",
      )}
    >
      {!delta.flat && (
        <Icon className={small ? "size-3" : "size-3.5"} aria-hidden />
      )}
      {delta.label}
    </p>
  );
}
