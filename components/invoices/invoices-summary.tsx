"use client";

import * as React from "react";

import {
  ProportionBar,
  segmentHighlight,
  type ProportionSegment,
} from "@/components/dashboard/proportion-bar";
import {
  SummaryPeriodToggle,
  useSummaryPeriod,
} from "@/components/documents/summary-period-toggle";
import { Shimmer } from "@/components/ui/shimmer";
import {
  invoiceMoney,
  type InvoicePeriodStats,
  type InvoiceSummaryStats,
} from "@/lib/invoices";
import { HeroHairline } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";

/**
 * The screen's one rich moment: paid / pending / overdue as proportions of
 * money, with the figures below doubling as the bar's legend. Drafts are left
 * out — they haven't been issued, so they aren't owed yet.
 *
 * A part-paid invoice is split across the bands: what has been received counts
 * as Paid, and only the balance is Pending. The three figures then add up to
 * what was invoiced, rather than a half-paid invoice sitting wholly in Pending
 * with its payment counted nowhere.
 *
 * Scoped to this financial year or this calendar month by issue date, as
 * sole-webapp's invoice analytics were.
 */
const BANDS: {
  key: "paid" | "pending" | "overdue";
  label: string;
  bar: string;
  figure?: string;
}[] = [
  {
    key: "paid",
    label: "Paid",
    bar: "bg-success",
    figure: "text-success",
  },
  {
    key: "pending",
    label: "Pending",
    bar: "bg-warning",
  },
  {
    key: "overdue",
    label: "Overdue",
    bar: "bg-destructive",
    figure: "text-destructive",
  },
];

const EMPTY_BAND = { count: 0, partPaid: 0, amount: 0 };
const EMPTY_PERIOD: InvoicePeriodStats = {
  issued: 0,
  draftCount: 0,
  paid: EMPTY_BAND,
  pending: EMPTY_BAND,
  overdue: { ...EMPTY_BAND, oldestDays: 0 },
};

export function InvoicesSummary({
  stats,
  loading,
}: {
  /** The server's figures for this year and this month; absent until they land. */
  stats?: InvoiceSummaryStats;
  /** The summary's own fetch hasn't landed yet — shown in place of stale-looking zeroes. */
  loading?: boolean;
}) {
  const [hovered, setHovered] = React.useState<string | null>(null);
  const { period, setPeriod, window: periodWindow } = useSummaryPeriod();

  if (loading) {
    // Carries the tour anchor too, so the list tour can open on this card
    // while its fetch is still out and follow it when the figures land.
    return (
      <Shimmer
        className="h-40 w-full rounded-lg border border-border"
        data-usertour="invoice-stats"
        aria-hidden
      />
    );
  }

  // The server has already split by money: a part-paid invoice is in Paid for
  // what it has received and in Pending for the balance. The period it adds up
  // (the business's financial year, or this month) is chosen by the toggle.
  const totals = stats?.[period === "month" ? "month" : "year"] ?? EMPTY_PERIOD;
  const bands = BANDS.map((band) => ({ ...band, ...totals[band.key] }));

  const issued = totals.issued;
  const overdue = totals.overdue;
  const draftCount = totals.draftCount;

  // Percentages come off the issued total, so the bar and figures agree.
  const segments: ProportionSegment[] = bands
    .filter((band) => band.amount > 0)
    .map((band) => ({
      key: band.key,
      label: band.label,
      percent: Math.round((band.amount / issued) * 100),
      valueLabel: invoiceMoney(band.amount),
      className: band.bar,
    }));

  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      data-usertour="invoice-summary"
    >
      <HeroHairline />
      <div className="space-y-4 p-5" data-usertour="invoice-stats">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium" title={periodWindow.label}>
            Invoiced {periodWindow.phrase}
          </h2>
          {/* The toggle sits last so it stays put while the heading's
              wording changes under the pointer. */}
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-muted-foreground tabular">
              {invoiceMoney(issued)} issued
              {draftCount > 0 && ` · ${draftCount} in draft`}
            </p>
            <SummaryPeriodToggle
              value={period}
              onChange={setPeriod}
              label="Invoice summary period"
            />
          </div>
        </div>

        {issued > 0 ? (
          <ProportionBar
            label="Paid, pending and overdue as a proportion of invoiced"
            segments={segments}
            hovered={hovered}
            onHoverChange={setHovered}
          />
        ) : (
          <ProportionBar
            label={`Nothing invoiced ${periodWindow.phrase}`}
            segments={[]}
            hovered={null}
            onHoverChange={() => {}}
            empty
          />
        )}

        <dl className="grid gap-[15px] sm:grid-cols-3">
          {bands.map((band) => (
            <div
              key={band.key}
              onMouseEnter={() => setHovered(band.key)}
              onMouseLeave={() => setHovered(null)}
              className={cn("min-w-0", segmentHighlight(hovered, band.key))}
            >
              <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={cn("size-2 shrink-0 rounded-sm", band.bar)}
                  aria-hidden
                />
                {band.label}
              </dt>
              <dd
                className={cn(
                  "mt-1 text-xl font-semibold tracking-tight tabular",
                  band.figure,
                )}
              >
                {invoiceMoney(band.amount)}
              </dd>
            <p className="text-xs text-muted-foreground tabular">
                {band.count} {band.count === 1 ? "invoice" : "invoices"}
                {band.partPaid > 0 && ` · ${band.partPaid} part-paid`}
                {band.key === "overdue" &&
                  band.count > 0 &&
                  ` · oldest ${overdue.oldestDays} days`}
              </p>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
