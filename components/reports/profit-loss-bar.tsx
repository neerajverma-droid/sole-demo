"use client";

import {
  plSplit,
  reportMoney,
  reportPercent,
  type PlReport,
} from "@/lib/reports";
import { cn } from "@/lib/utils";

/**
 * Where the income went, as one bar.
 *
 * Income is the full width and gets cut into what it cost and what was left, so
 * the segments are shares of a whole rather than three unrelated lengths — a bar
 * of income, expenses and net profit side by side would sum to twice the income
 * and describe nothing.
 *
 * Deliberately thin and unlabelled inside. It's here to make the ratio legible
 * at a glance before anyone reads a figure; the numbers underneath are what the
 * report actually answers with, and a chart competing with them would be a third
 * version of the same fact.
 *
 * `chart-in` and `chart-out` rather than success and destructive: spending isn't
 * an error, it's money out, and those are the tokens the product uses for the
 * two directions money moves.
 */
export function ProfitLossBar({
  report,
  empty = false,
}: {
  report: PlReport;
  empty?: boolean;
}) {
  const split = plSplit(report);
  const { income, expenses, netProfit } = report.headline;

  /*
   * Nothing to divide. The track stays — an empty bar is a shape waiting to be
   * filled, where removing it altogether would leave the page looking like it
   * has no such feature.
   */
  if (empty) {
    return (
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-sm font-medium">Where the income went</h2>
          <p className="text-xs text-muted-foreground">Nothing to split yet</p>
        </div>
        <div
          className="mt-4 h-2.5 w-full rounded-full bg-muted"
          role="img"
          aria-label="No income or costs recorded for this period."
        />
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Once income and costs are coded, this shows what share of your income
          the costs took and how much you kept.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-medium">Where the income went</h2>
        <p className="text-xs text-muted-foreground tabular">
          {split.loss
            ? `Costs ran ${reportPercent(split.expenseShare)} of income`
            : `${reportPercent(split.profitShare)} of income kept as profit`}
        </p>
      </div>

      {/* The track is the muted page surface, so a segment reads as a share of
          it rather than as a bar floating on white. */}
      <div
        className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`Of ${reportMoney(income.amount)} income, ${reportMoney(
          expenses.amount,
        )} went on costs, leaving ${reportMoney(netProfit.amount)}.`}
      >
        <div
          className="h-full bg-chart-out motion-safe:transition-[width] motion-safe:duration-500"
          style={{ width: `${split.expensePercent}%` }}
        />
        <div
          className="h-full bg-chart-in motion-safe:transition-[width] motion-safe:duration-500"
          style={{ width: `${split.profitPercent}%` }}
        />
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <Segment
          swatch="bg-muted-foreground/30"
          label="Income"
          value={income.amount}
          share="100% of income"
        />
        <Segment
          swatch="bg-chart-out"
          label="Expenses"
          value={expenses.amount}
          share={`${reportPercent(split.expenseShare)} of income`}
        />
        <Segment
          swatch="bg-chart-in"
          label={split.loss ? "Net loss" : "Net profit"}
          value={netProfit.amount}
          share={
            split.loss
              ? "Costs exceeded income"
              : `${reportPercent(split.profitShare)} of income`
          }
        />
      </dl>
    </section>
  );
}

function Segment({
  swatch,
  label,
  value,
  share,
}: {
  swatch: string;
  label: string;
  value: number;
  share: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn("size-2 shrink-0 rounded-full", swatch)}
          aria-hidden
        />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-1 pl-4">
        <p className="text-sm font-medium tabular">{reportMoney(value)}</p>
        <p className="text-xs text-muted-foreground tabular">{share}</p>
      </dd>
    </div>
  );
}
