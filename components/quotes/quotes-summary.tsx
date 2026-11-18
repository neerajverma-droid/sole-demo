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
import { HeroHairline } from "@/components/layout/page-header";
import { invoiceMoney } from "@/lib/invoices";
import type { QuotePeriodStats, QuoteSummaryStats } from "@/lib/quotes";
import { cn } from "@/lib/utils";

/**
 * The same layout as the Invoices summary: converted / open / lost as
 * proportions of money quoted, with the figures below doubling as the bar's
 * legend. Drafts are left out — they haven't gone to anyone yet.
 *
 * Converted is only what has actually been billed. An accepted quote that
 * hasn't been converted yet is still open work, so it sits under Open and is
 * called out there, rather than claiming an invoice that doesn't exist.
 *
 * Scoped to this financial year or this calendar month by quote date, as
 * sole-webapp's quote analytics were.
 */
const BANDS: {
  key: "converted" | "open" | "lost";
  label: string;
  bar: string;
  figure?: string;
}[] = [
  {
    key: "converted",
    label: "Converted",
    bar: "bg-success",
    figure: "text-success",
  },
  {
    key: "open",
    label: "Open",
    bar: "bg-warning",
  },
  {
    key: "lost",
    label: "Declined or expired",
    bar: "bg-destructive",
    figure: "text-destructive",
  },
];

const EMPTY_PERIOD: QuotePeriodStats = {
  quoted: 0,
  draftCount: 0,
  converted: { count: 0, amount: 0 },
  open: { count: 0, accepted: 0, amount: 0 },
  lost: { count: 0, amount: 0 },
};

export function QuotesSummary({
  stats,
  loading,
}: {
  /** The server's figures for this year and this month; absent until they land. */
  stats?: QuoteSummaryStats;
  /** The summary's own fetch hasn't landed yet — shown in place of stale-looking zeroes. */
  loading?: boolean;
}) {
  const [hovered, setHovered] = React.useState<string | null>(null);
  const { period, setPeriod, window: periodWindow } = useSummaryPeriod();

  if (loading) {
    // Carries the tour anchor too — see the Invoices summary.
    return (
      <Shimmer
        className="h-40 w-full rounded-lg border border-border"
        data-usertour="quote-summary"
        aria-hidden
      />
    );
  }

  // The server has already worked out each quote's status (billed beats every
  // other, a lapsed sent quote is expired) and its money in the business's
  // currency. The period it adds up (the business's financial year, or this
  // month) is chosen by the toggle.
  const totals = stats?.[period === "month" ? "month" : "year"] ?? EMPTY_PERIOD;
  const bands = BANDS.map((band) => ({
    ...band,
    count: totals[band.key].count,
    amount: totals[band.key].amount,
    accepted: band.key === "open" ? totals.open.accepted : 0,
  }));

  const quoted = totals.quoted;
  const draftCount = totals.draftCount;

  // Percentages come off the quoted total, so the bar and figures agree.
  const segments: ProportionSegment[] = bands
    .filter((band) => band.amount > 0)
    .map((band) => ({
      key: band.key,
      label: band.label,
      percent: Math.round((band.amount / quoted) * 100),
      valueLabel: invoiceMoney(band.amount),
      className: band.bar,
    }));

  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      data-usertour="quote-summary"
    >
      <HeroHairline />
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium" title={periodWindow.label}>
            Quoted {periodWindow.phrase}
          </h2>
          {/* The toggle sits last so it stays put while the heading's
              wording changes under the pointer. */}
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-muted-foreground tabular">
              {invoiceMoney(quoted)} quoted
              {draftCount > 0 && ` · ${draftCount} in draft`}
            </p>
            <SummaryPeriodToggle
              value={period}
              onChange={setPeriod}
              label="Quote summary period"
            />
          </div>
        </div>

        {quoted > 0 ? (
          <ProportionBar
            label="Converted, open and lost as a proportion of quoted"
            segments={segments}
            hovered={hovered}
            onHoverChange={setHovered}
          />
        ) : (
          <ProportionBar
            label={`Nothing quoted ${periodWindow.phrase}`}
            segments={[]}
            hovered={null}
            onHoverChange={() => {}}
            empty
          />
        )}

        <dl className="grid gap-[15px] sm:grid-cols-3" data-usertour="quote-stats">
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
                {band.count} {band.count === 1 ? "quote" : "quotes"}
                {band.key === "open" &&
                  band.accepted > 0 &&
                  ` · ${band.accepted} accepted`}
              </p>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
