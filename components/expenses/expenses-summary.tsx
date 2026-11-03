"use client";

import { CircleCheck, Clock, Receipt, TrendingDown, TrendingUp } from "lucide-react";

import { HeroHairline } from "@/components/layout/page-header";
import { InfoTip } from "@/components/ui/info-tip";
import { Shimmer } from "@/components/ui/shimmer";
import { invoiceMoney } from "@/lib/invoices";
import type {
  ExpenseComparison,
  ExpensePeriod,
  ExpenseSummaryFigures,
} from "@/lib/expenses";
import { CountUp } from "@/components/ui/count-up";
import { STAT_TONES, type StatTone } from "@/components/ui/stat-cards";
import { cn } from "@/lib/utils";
import { useCountryContext } from "@/hooks/use-country-context";
import { taxWord } from "@/lib/country-context";

const NO_COMPARISON: ExpenseComparison = {
  percent: null,
  up: false,
  label: "No comparison for this period",
};

/**
 * The screen's hero: what was spent in the period, what's reconciled, what
 * still isn't. Matched and pending carry semantic colour on the icon only; the
 * total keeps the brand tile and every figure stays neutral.
 *
 * Entirely the real backend summary now — no more locally-computed "12
 * recorded"/"3 to match" counts, which meant this component (and the screen
 * feeding it) needed the account's complete expense list just to produce a
 * subtitle. The backend's own summary doesn't return counts either, so
 * there's no accurate substitute cheap enough to fetch on every load; the
 * comparison line already carries the meaningful signal.
 */
export function ExpensesSummary({
  period,
  summary: remote,
  loading,
}: {
  period: ExpensePeriod;
  /** The real backend summary, once loaded. */
  summary?: ExpenseSummaryFigures;
  loading: boolean;
}) {
  const scope = period.toLowerCase();
  const { country } = useCountryContext();
  const tax = taxWord(country);

  if (loading) {
    return (
      <section
        className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
        aria-hidden
      >
        <HeroHairline />
        <dl className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="min-w-0 space-y-3 p-5">
              <div className="flex items-center gap-2.5">
                <Shimmer className="size-10 shrink-0 rounded-xl" />
                <Shimmer className="h-4 w-28" />
              </div>
              <Shimmer className="h-7 w-24" />
              <Shimmer className="h-3 w-32" />
            </div>
          ))}
        </dl>
      </section>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      data-usertour="expense-summary"
    >
      <HeroHairline />
      <dl className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Stat
          icon={<Receipt aria-hidden />}
          label="Total expenses"
          tip={`Everything you recorded ${scope}, ${tax} included — the figure you actually paid.`}
          value={remote?.total.amount ?? 0}
          change={remote?.total.change ?? NO_COMPARISON}
        />
        <Stat
          icon={<CircleCheck aria-hidden />}
          label="Matched expenses"
        tone="success"
          tip="Expenses reconciled against a bank transaction. These are the ones your accountant can rely on."
          value={remote?.matched.amount ?? 0}
          change={remote?.matched.change ?? NO_COMPARISON}
          iconTone="text-success"
        />
        <Stat
          icon={<Clock aria-hidden />}
          label="Pending expenses"
        tone="warning"
          tip="Recorded but not yet matched to a transaction. Match them so nothing is claimed twice or missed."
          value={remote?.pending.amount ?? 0}
          change={remote?.pending.change ?? NO_COMPARISON}
          // Money still outstanding takes the warm accent, on the tile only.
          iconTone="text-warm-foreground"
          tileTone="bg-warm"
        />
      </dl>
    </section>
  );
}

function Stat({
  icon,
  tone = "primary",
  label,
  tip,
  value,
  change,
  iconTone,
  tileTone,
}: {
  icon: React.ReactNode;
  /** What the figure means — see STAT_TONES. */
  tone?: StatTone;
  label: string;
  tip: string;
  value: number;
  change: ExpenseComparison;
  /** Only the icon takes semantic colour; the figure stays neutral. */
  iconTone?: string;
  tileTone?: string;
}) {
  return (
    <div className="min-w-0 p-5">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5",
            // The tone carries both halves; the older per-card overrides still
            // win where a screen needs something the tones don't cover.
            STAT_TONES[tone],
            tileTone,
            iconTone,
          )}
          aria-hidden
        >
          {icon}
        </span>
        <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {label}
          <InfoTip text={tip} />
        </dt>
      </div>
      <dd className="mt-3 text-2xl font-semibold leading-none tracking-tight tabular">
        <CountUp value={value} format={invoiceMoney} />
      </dd>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Comparison change={change} />
      </div>
    </div>
  );
}

/**
 * The change against the previous period. When there's nothing to compare
 * against we say so rather than showing an arrow with no meaning behind it.
 */
function Comparison({ change }: { change: ExpenseComparison }) {
  if (change.percent === null) {
    return <span>{change.label}</span>;
  }
  const Icon = change.up ? TrendingUp : TrendingDown;
  return (
    <span className="flex items-center gap-1 tabular">
      <Icon className="size-3.5" aria-hidden />
      {change.label}
    </span>
  );
}
