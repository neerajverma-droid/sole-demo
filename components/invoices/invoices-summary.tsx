"use client";

import * as React from "react";

import {
  ProportionBar,
  segmentHighlight,
  type ProportionSegment,
} from "@/components/dashboard/proportion-bar";
import { Shimmer } from "@/components/ui/shimmer";
import {
  OUTSTANDING_STATUSES,
  invoiceAmount,
  invoiceMoney,
  overdueSummary,
  toIsoDate,
  type Invoice,
  type InvoiceStatus,
} from "@/lib/invoices";
import { HeroHairline } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";

/**
 * The screen's one rich moment: paid / pending / overdue as proportions of
 * money, with the figures below doubling as the bar's legend. Drafts are left
 * out — they haven't been issued, so they aren't owed yet.
 */
const BANDS: {
  key: string;
  label: string;
  statuses: InvoiceStatus[];
  bar: string;
  figure?: string;
}[] = [
  {
    key: "paid",
    label: "Paid",
    statuses: ["Paid"],
    bar: "bg-success",
    figure: "text-success",
  },
  {
    key: "pending",
    label: "Pending",
    statuses: OUTSTANDING_STATUSES.filter((status) => status !== "Overdue"),
    bar: "bg-warning",
  },
  {
    key: "overdue",
    label: "Overdue",
    statuses: ["Overdue"],
    bar: "bg-destructive",
    figure: "text-destructive",
  },
];

export function InvoicesSummary({
  invoices,
  loading,
}: {
  invoices: Invoice[];
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
    const matching = invoices.filter((invoice) =>
      band.statuses.includes(invoice.status),
    );
    return {
      ...band,
      count: matching.length,
      amount: matching.reduce(
        (sum, invoice) => sum + invoiceAmount(invoice),
        0,
      ),
    };
  });

  const issued = bands.reduce((sum, band) => sum + band.amount, 0);
  const overdue = overdueSummary(invoices, toIsoDate(new Date()));
  const draftCount = invoices.filter(
    (invoice) => invoice.status === "Draft",
  ).length;

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
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">Invoiced this year</h2>
          <p className="text-xs text-muted-foreground tabular">
            {invoiceMoney(issued)} issued
            {draftCount > 0 && ` · ${draftCount} in draft`}
          </p>
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
            label="Nothing invoiced yet"
            segments={[]}
            hovered={null}
            onHoverChange={() => {}}
            empty
          />
        )}

        <dl className="grid gap-[15px] sm:grid-cols-3" data-usertour="invoice-stats">
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
