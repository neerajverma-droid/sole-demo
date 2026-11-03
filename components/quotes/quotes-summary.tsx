"use client";

import * as React from "react";

import {
  ProportionBar,
  segmentHighlight,
  type ProportionSegment,
} from "@/components/dashboard/proportion-bar";
import { Shimmer } from "@/components/ui/shimmer";
import { HeroHairline } from "@/components/layout/page-header";
import { invoiceMoney } from "@/lib/invoices";
import {
  quoteAmountAud,
  quoteDisplayStatus,
  type Quote,
  type QuoteDisplayStatus,
} from "@/lib/quotes";
import { cn } from "@/lib/utils";

/**
 * The same layout as the Invoices summary: converted / open / lost as
 * proportions of money quoted, with the figures below doubling as the bar's
 * legend. Drafts are left out — they haven't gone to anyone yet.
 *
 * Converted is only what has actually been billed. An accepted quote that
 * hasn't been converted yet is still open work, so it sits under Open and is
 * called out there, rather than claiming an invoice that doesn't exist.
 */
const BANDS: {
  key: string;
  label: string;
  statuses: QuoteDisplayStatus[];
  bar: string;
  figure?: string;
}[] = [
  {
    key: "converted",
    label: "Converted",
    statuses: ["Converted"],
    bar: "bg-success",
    figure: "text-success",
  },
  {
    key: "open",
    label: "Open",
    statuses: ["Sent", "Saved", "Accepted"],
    bar: "bg-warning",
  },
  {
    key: "lost",
    label: "Declined or expired",
    statuses: ["Declined", "Expired"],
    bar: "bg-destructive",
    figure: "text-destructive",
  },
];

export function QuotesSummary({
  quotes,
  loading,
}: {
  quotes: Quote[];
  /** The summary's own fetch hasn't landed yet — shown in place of stale-looking zeroes. */
  loading?: boolean;
}) {
  const [hovered, setHovered] = React.useState<string | null>(null);

  if (loading) {
    return (
      <Shimmer
        className="h-40 w-full rounded-lg border border-border"
        aria-hidden
      />
    );
  }

  const bands = BANDS.map((band) => {
    const matching = quotes.filter((quote) =>
      band.statuses.includes(quoteDisplayStatus(quote)),
    );
    return {
      ...band,
      count: matching.length,
      accepted: matching.filter((quote) => quote.status === "Accepted").length,
      amount: matching.reduce((sum, quote) => sum + quoteAmountAud(quote), 0),
    };
  });

  const quoted = bands.reduce((sum, band) => sum + band.amount, 0);
  const draftCount = quotes.filter((quote) => quote.status === "Draft").length;

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
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">Quoted</h2>
          <p className="text-xs text-muted-foreground tabular">
            {invoiceMoney(quoted)} quoted
            {draftCount > 0 && ` · ${draftCount} in draft`}
          </p>
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
            label="Nothing quoted yet"
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
