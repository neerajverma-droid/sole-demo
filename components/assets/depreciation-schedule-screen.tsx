"use client";

import Link from "next/link";
import { ArrowLeft, Landmark, TrendingDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  assetMoney,
  depreciationSchedule,
  formatAssetDate,
} from "@/lib/assets";
import { documentTax } from "@/lib/country-context";
import { toIsoDate } from "@/lib/invoices";
import { cn } from "@/lib/utils";
import { useAssetsQuery } from "@/hooks/use-assets-query";
import { useCountryContext } from "@/hooks/use-country-context";
import { useAssetsStore } from "@/stores/assets";

const ASSETS_ROOT = "/assets";

/**
 * A figure that carries no status.
 *
 * Every number on this page takes it. The panel this replaces coloured the
 * accumulated figure red and the book value green, which read as "bad" and
 * "good" — but depreciation is neither: a large accumulated figure is a
 * deduction already claimed, and a small book value is an old asset, not a
 * problem. Paired with the token in dark mode.
 */
const NEUTRAL_FIGURE = "text-[#0F1117] dark:text-foreground";

/** A fraction as a percentage, or the stand-in when there isn't one. */
function rateLabel(rate: number | null): string {
  return rate === null ? "N/A" : `${(rate * 100).toFixed(2)}%`;
}

/**
 * The depreciation schedule.
 *
 * Read-only, and the counterpart to the setup page: that one asks what the
 * rules are, this one shows what they come to. Both read the same
 * `depreciationSchedule`, which is built on the same `depreciationPreview` the
 * setup page previews with — so the rate quoted here is the rate you chose
 * there, rather than a second implementation of it.
 */
export function DepreciationScheduleScreen({ assetId }: { assetId: string }) {
  // Hydrates the register on a direct/refreshed visit to this route, same as
  // AssetsScreen — this page doesn't only get reached by clicking through it.
  useAssetsQuery();
  const assets = useAssetsStore((state) => state.assets);
  const asset = assets.find((entry) => entry.id === assetId);
  const { country } = useCountryContext();

  const assetHref = `${ASSETS_ROOT}/${assetId}`;
  const setupHref = `${ASSETS_ROOT}/${assetId}/depreciation`;

  if (!asset) {
    return (
      <div className="mx-auto max-w-3xl">
        <Empty>
          <EmptyMedia>
            <Landmark aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>Asset not found</EmptyTitle>
            <EmptyDescription>
              It may have been deleted from the register.
            </EmptyDescription>
          </div>
          <EmptyActions>
            <Button variant="outline" size="sm" asChild>
              <Link href={ASSETS_ROOT}>Back to assets</Link>
            </Button>
          </EmptyActions>
        </Empty>
      </div>
    );
  }

  const { depreciation } = asset;
  // GST comes out at the rate on the purchase date: the business's custom rate,
  // else its country's (10% AU, 15% NZ / ZA).
  const schedule = depreciationSchedule(
    asset,
    depreciation,
    toIsoDate(new Date()),
    documentTax(country, asset.purchaseDate).rate,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href={assetHref}>
            <ArrowLeft />
            {asset.name}
          </Link>
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Depreciation schedule
          </h1>
          <p className="text-sm text-muted-foreground">{asset.name}</p>
        </div>
      </div>

      {!depreciation.enabled ? (
        /*
          Nothing to show, and one thing to do about it.

          The way out is the primary action rather than a link in the copy: this
          page has no other purpose until depreciation exists, so there is no
          competing thing to press.
        */
        <Empty className="py-14">
          <EmptyMedia className="bg-muted text-muted-foreground">
            <TrendingDown aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>No depreciation set up for this asset</EmptyTitle>
            <EmptyDescription>
              Choose a method and an effective life, and the yearly write-down
              appears here.
            </EmptyDescription>
          </div>
          <EmptyActions>
            <Button asChild>
              <Link href={setupHref}>Set up depreciation</Link>
            </Button>
          </EmptyActions>
        </Empty>
      ) : (
        <div className="space-y-6">
          {/* What the schedule was worked out from, and where it stands. */}
          <section className="rounded-[14px] border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Depreciation summary</h2>
              <Button variant="ghost" size="sm" asChild>
                <Link href={setupHref}>Edit settings</Link>
              </Button>
            </div>

            <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryItem label="Method" value={depreciation.method} />
              <SummaryItem
                label="Rate"
                value={rateLabel(schedule.preview.rate)}
              />
              <SummaryItem
                label="Effective life"
                value={
                  depreciation.effectiveLife
                    ? `${depreciation.effectiveLife} years`
                    : "—"
                }
              />
              <SummaryItem
                label="Start date"
                value={
                  depreciation.startDate
                    ? formatAssetDate(depreciation.startDate)
                    : "—"
                }
              />
              <SummaryItem
                label="Opening value"
                value={assetMoney(schedule.depreciableCost)}
              />
              <SummaryItem
                label="Residual value"
                value={assetMoney(schedule.residual)}
              />
              <SummaryItem
                label="Accumulated depreciation"
                value={assetMoney(schedule.accumulated)}
              />
              <SummaryItem
                label="Current book value"
                value={assetMoney(schedule.currentBookValue)}
              />
            </dl>
          </section>

          {schedule.years.length === 0 ? (
            /* Enabled, but with nothing to work from — an effective life of
               nothing produces no rows, and saying so beats an empty table. */
            <Empty className="py-12">
              <EmptyMedia className="bg-muted text-muted-foreground">
                <TrendingDown aria-hidden />
              </EmptyMedia>
              <div className="space-y-1">
                <EmptyTitle>Nothing to schedule yet</EmptyTitle>
                <EmptyDescription>
                  Add an effective life to the settings and the yearly
                  write-down appears here.
                </EmptyDescription>
              </div>
              <EmptyActions>
                <Button variant="outline" size="sm" asChild>
                  <Link href={setupHref}>Edit settings</Link>
                </Button>
              </EmptyActions>
            </Empty>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[88px]">Year</TableHead>
                    <TableHead className="text-right">Opening value</TableHead>
                    <TableHead className="text-right">Depreciation</TableHead>
                    <TableHead className="text-right">Closing value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedule.years.map((row) => (
                    <TableRow key={row.year}>
                      <TableCell
                        className={cn("w-[88px] tabular", NEUTRAL_FIGURE)}
                      >
                        {row.year}
                      </TableCell>
                      <TableCell
                        className={cn("text-right tabular", NEUTRAL_FIGURE)}
                      >
                        {assetMoney(row.openingValue)}
                      </TableCell>
                      <TableCell
                        className={cn("text-right tabular", NEUTRAL_FIGURE)}
                      >
                        {assetMoney(row.depreciation)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular",
                          NEUTRAL_FIGURE,
                        )}
                      >
                        {assetMoney(row.closingValue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn("truncate text-sm font-medium tabular", NEUTRAL_FIGURE)}
      >
        {value}
      </dd>
    </div>
  );
}
