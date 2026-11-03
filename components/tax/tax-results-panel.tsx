"use client";

import { Badge } from "@/components/ui/badge";
import { reportMoney } from "@/lib/report-periods";
import {
  estimateTax,
  ratePercent,
  type TaxDraft,
  type TaxEstimate,
} from "@/lib/tax-estimator";
import { cn } from "@/lib/utils";

/**
 * The live figure beside the form.
 *
 * Every row is derived from the draft on each keystroke rather than on a
 * Calculate — the panel is the reason to fill the form in, and a figure that
 * only arrives at the end makes the four steps feel like paperwork instead of a
 * conversation. `estimateTax` is pure arithmetic, so recomputing the lot per
 * character costs nothing.
 *
 * The whole breakdown is on show, not just the total. Someone who doesn't
 * believe the number wants to find the line they disagree with, and a headline
 * figure with nothing under it gives them nowhere to look.
 */
export function TaxResultsPanel({ draft }: { draft: TaxDraft }) {
  const estimate = estimateTax(draft);
  const groups = resultGroups(estimate);

  return (
    <aside className="w-full shrink-0 lg:w-[380px]">
      {/*
        Sticky to the top of the viewport, not the page: the form is four steps
        long and the figure is what someone is watching while they fill it in.
        `max-h` with its own scroll so a long breakdown can't push the total off
        the bottom of a short window.
      */}
      <div className="lg:sticky lg:top-6">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="space-y-4 border-b border-border p-5">
            <div className="space-y-0.5">
              <h2 className="text-base font-semibold tracking-tight">
                Your Results
              </h2>
              <p className="text-sm text-muted-foreground">
                Your estimated tax result
              </p>
            </div>

            {/* Reads off the Entity Type field, so the panel says what it has
                actually calculated rather than what it usually calculates —
                a company pays a flat rate and no Medicare levy, and this is
                the only thing on the panel that says which set of rules ran. */}
            <Badge
              variant="outline"
              className="rounded-full border-transparent bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
            >
              Calculated for: {draft.entityType}
            </Badge>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                Estimated Tax Payable
              </p>
              <p className="text-[28px] font-semibold leading-none tracking-tight tabular">
                {reportMoney(estimate.estimatedTaxPayable)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                * Estimate only, not tax advice
              </p>
            </div>
          </div>

          <div className="divide-y divide-border">
            {groups.map((group) => (
              <div key={group.heading} className="space-y-1.5 p-5">
                <p className="text-sm font-semibold">{group.heading}</p>
                <dl className="space-y-1.5">
                  {group.rows.map((row) => (
                    <ResultRow key={row.label} row={row} />
                  ))}
                </dl>
              </div>
            ))}

            {/*
              Outside every group, because it isn't part of any of them: the
              five above build up to a liability, and this is what has already
              been paid against it.
            */}
            <div className="space-y-3 p-5">
              <dl>
                <ResultRow
                  row={{
                    label: "Less: PAYG Instalments Paid",
                    value: estimate.paygInstalments,
                    deduction: true,
                  }}
                />
              </dl>

              <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3">
                <dt className="text-sm font-semibold">Estimated Tax Payable</dt>
                <dd className="text-sm font-semibold tabular">
                  {reportMoney(estimate.estimatedTaxPayable)}
                </dd>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/**
 * One line of the breakdown.
 *
 * `deduction` marks a row that subtracts. The colour is the only thing it
 * changes, and only when the row has a figure in it: a red $0.00 would be
 * warning someone about a deduction they haven't claimed.
 */
type Row = {
  label: string;
  value: number;
  /** The muted second line under the label, where a row needs one. */
  sub?: string;
  deduction?: boolean;
};

function ResultRow({ row }: { row: Row }) {
  const empty = row.value === 0;

  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="min-w-0 text-sm text-muted-foreground">
        {row.label}
        {row.sub && (
          <span className="block text-[11px] text-muted-foreground/80">
            {row.sub}
          </span>
        )}
      </dt>
      <dd
        className={cn(
          "shrink-0 text-sm tabular",
          // Three states, in the order they win. Nothing entered reads faintest;
          // a deduction with a figure in it is the only red on the panel;
          // everything else is ordinary body text.
          empty
            ? "text-muted-foreground/70"
            : row.deduction
              ? "text-destructive"
              : "text-foreground",
        )}
      >
        {reportMoney(row.value)}
      </dd>
    </div>
  );
}

type Group = { heading: string; rows: Row[] };

/**
 * The breakdown, in the order it's read.
 *
 * A list rather than markup per row, so the zero and deduction rules are
 * applied by one component to every line — the alternative is fifteen call
 * sites each deciding what colour a figure is, which is fourteen chances to
 * decide differently.
 */
function resultGroups(estimate: TaxEstimate): Group[] {
  return [
    {
      heading: "Income",
      rows: [
        { label: "Revenue", value: estimate.revenue },
        { label: "Expenses", value: estimate.expenses, deduction: true },
        { label: "Additional Income", value: estimate.additionalIncome },
        {
          label: "Additional Deductions",
          value: estimate.additionalDeductions,
          deduction: true,
        },
        {
          label: "Depreciation",
          value: estimate.depreciation,
          deduction: true,
        },
        {
          label: "Capital Works Deduction",
          value: estimate.capitalWorksDeduction,
          deduction: true,
        },
        {
          label: "Non-Deductible Add-backs",
          value: estimate.nonDeductibleAddBacks,
        },
        { label: "Total Capital Gain/Loss", value: estimate.netCapitalGain },
      ],
    },
    {
      heading: "Superannuation",
      rows: [
        { label: "Total Contributions", value: estimate.superContributions },
        {
          label: "Taxable Contributions",
          value: estimate.taxableContributions,
        },
        {
          label: "Non-Taxable Contributions",
          value: estimate.nonTaxableContributions,
        },
      ],
    },
    {
      heading: "Taxable Income",
      rows: [
        { label: "Total Taxable Income", value: estimate.taxableIncome },
        {
          label: "Tax on Taxable Income",
          sub: `Marginal Tax Rate: ${ratePercent(estimate.marginalRate)}`,
          value: estimate.taxOnTaxableIncome,
        },
      ],
    },
    {
      heading: "Medicare Levy",
      rows: [
        { label: "Spouse's Gross Income", value: estimate.spouseIncome },
        { label: "Medicare Levy Payable", value: estimate.medicareLevy },
        {
          label: "Medicare Levy Surcharge",
          value: estimate.medicareSurcharge,
        },
      ],
    },
    {
      heading: "Low Income Tax Offset",
      rows: [
        {
          label: "Total Amount of Tax Offset",
          value: estimate.lowIncomeOffset,
          deduction: true,
        },
      ],
    },
  ];
}
