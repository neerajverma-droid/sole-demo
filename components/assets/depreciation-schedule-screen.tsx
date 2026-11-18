"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Download, TrendingDown, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Shimmer } from "@/components/ui/shimmer";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiErrorMessage } from "@/lib/api-error";
import {
  depreciationScheduleCsv,
  depreciationScheduleFilename,
  downloadScheduleCsv,
  groupByIncomeYear,
  isCurrentPeriod,
  isFuturePeriod,
  scheduleTotals,
  type AssetDepreciationSchedule,
} from "@/lib/asset-depreciation-schedule";
import { assetMoney, formatAssetDate } from "@/lib/assets";
import { toIsoDate } from "@/lib/invoices";
import { cn } from "@/lib/utils";
import { useAssetDepreciationScheduleQuery } from "@/hooks/use-asset-depreciation-schedule-query";
import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { useAssetsStore } from "@/stores/assets";

const ASSETS_ROOT = "/assets";

/**
 * A figure that carries no status.
 *
 * Every number on this page takes it. Depreciation is neither good nor bad: a
 * large accumulated figure is a deduction already claimed, and a small book
 * value is an old asset, not a problem. Paired with the token in dark mode.
 */
const NEUTRAL_FIGURE = "text-[#0F1117] dark:text-foreground";

/** A stored percentage (20 = 20%), or the stand-in when there isn't one. */
function rateLabel(ratePercent: number | null): string {
  return ratePercent === null ? "N/A" : `${ratePercent.toFixed(2)}%`;
}

function lifeLabel(years: number | null): string {
  if (years === null) return "N/A";
  return `${years} ${years === 1 ? "year" : "years"}`;
}

/**
 * The depreciation schedule, as the backend stores it.
 *
 * Read-only, and the counterpart to the settings page: that one asks what the
 * rules are, this one shows the monthly entries the server generated from
 * them — the same entries the journal posts and the depreciation report sums,
 * so the three can't disagree. Matches sole-webapp's schedule drawer (summary,
 * monthly table with the current period marked, totals, CSV export), with the
 * months grouped by income year so each year's subtotal reads against the
 * report.
 */
export function DepreciationScheduleScreen({ assetId }: { assetId: string }) {
  const { data: schedule, isLoading, isError, error, refetch } =
    useAssetDepreciationScheduleQuery(assetId);
  // Only a fallback for the heading when there's no record to name the asset —
  // the register may already be in memory from the page we came from.
  const storedName = useAssetsStore(
    (state) => state.assets.find((entry) => entry.id === assetId)?.name ?? "",
  );
  const assetName = schedule?.assetName || storedName;

  const setupHref = `${ASSETS_ROOT}/${assetId}/depreciation`;
  const entries = schedule?.entries ?? [];

  const exportCsv = () => {
    if (!entries.length) return;
    downloadScheduleCsv(
      depreciationScheduleFilename(assetName, assetId),
      depreciationScheduleCsv(entries),
    );
  };

  return (
    <div className="mx-auto min-w-0 max-w-6xl space-y-6">
      <div className="space-y-3">
        {/* The register, not /assets/:id — that's the edit form. */}
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href={ASSETS_ROOT}>
            <ArrowLeft />
            Assets
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Depreciation schedule
            </h1>
            {assetName && (
              <p className="truncate text-sm text-muted-foreground">
                {assetName}
              </p>
            )}
          </div>
          {entries.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <ScheduleLoadingSkeleton />
      ) : isError ? (
        <Empty>
          <EmptyMedia>
            <TriangleAlert aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>Couldn&apos;t load the schedule</EmptyTitle>
            <EmptyDescription>
              {apiErrorMessage(error, "Couldn't load the depreciation schedule")}
            </EmptyDescription>
          </div>
          <EmptyActions>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              Try again
            </Button>
          </EmptyActions>
        </Empty>
      ) : !schedule ? (
        /*
          Nothing to show, and one thing to do about it — the primary action,
          since this page has no other purpose until depreciation exists.
        */
        <Empty className="py-14">
          <EmptyMedia className="bg-muted text-muted-foreground">
            <TrendingDown aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>No depreciation set up for this asset</EmptyTitle>
            <EmptyDescription>
              Choose a method and an effective life, and the monthly write-down
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
          <ScheduleSummary schedule={schedule} setupHref={setupHref} />

          {entries.length === 0 ? (
            /* A record with nothing to write off (no rate, or a zero
               depreciable value) produces no rows — say so, not an empty table. */
            <Empty className="py-12">
              <EmptyMedia className="bg-muted text-muted-foreground">
                <TrendingDown aria-hidden />
              </EmptyMedia>
              <div className="space-y-1">
                <EmptyTitle>Nothing to schedule yet</EmptyTitle>
                <EmptyDescription>
                  Check the method, effective life and residual value in the
                  settings and the monthly write-down appears here.
                </EmptyDescription>
              </div>
              <EmptyActions>
                <Button variant="outline" size="sm" asChild>
                  <Link href={setupHref}>Edit settings</Link>
                </Button>
              </EmptyActions>
            </Empty>
          ) : (
            <ScheduleTable schedule={schedule} />
          )}
        </div>
      )}
    </div>
  );
}

/** What the schedule was worked out from, and where it stands — all server values. */
function ScheduleSummary({
  schedule,
  setupHref,
}: {
  schedule: AssetDepreciationSchedule;
  setupHref: string;
}) {
  return (
    <section className="rounded-[14px] border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Depreciation summary</h2>
        <Button variant="ghost" size="sm" asChild>
          <Link href={setupHref}>Edit settings</Link>
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
        <SummaryItem label="Method" value={schedule.method} />
        <SummaryItem label="Rate" value={rateLabel(schedule.ratePercent)} />
        <SummaryItem
          label="Effective life"
          value={lifeLabel(schedule.effectiveLifeYears)}
        />
        <SummaryItem
          label="Start date"
          value={schedule.startDate ? formatAssetDate(schedule.startDate) : "—"}
        />
        <SummaryItem
          label="Opening value"
          value={assetMoney(schedule.openingValue)}
        />
        <SummaryItem
          label="Residual value"
          value={assetMoney(schedule.residualValue)}
        />
        <SummaryItem
          label="Accumulated depreciation"
          value={assetMoney(schedule.accumulatedDepreciation)}
        />
        <SummaryItem
          label="Current book value"
          value={assetMoney(schedule.bookValue)}
        />
      </dl>
    </section>
  );
}

/**
 * The server's monthly entries, grouped by income year with a subtotal under
 * each, and the grand total at the foot. Scrolls sideways inside its own box
 * on a phone rather than widening the page.
 */
function ScheduleTable({ schedule }: { schedule: AssetDepreciationSchedule }) {
  const today = toIsoDate(new Date());
  const fiscalYearStart = useFiscalYearStart();
  const groups = React.useMemo(
    () => groupByIncomeYear(schedule.entries, fiscalYearStart),
    [schedule.entries, fiscalYearStart],
  );
  const totals = scheduleTotals(schedule.entries);
  const first = schedule.entries[0];
  const last = schedule.entries[schedule.entries.length - 1];

  return (
    <section className="min-w-0 space-y-3">
      <h2 className="text-sm font-semibold">
        Monthly schedule{" "}
        <span className="font-normal text-muted-foreground">
          ({schedule.entries.length}{" "}
          {schedule.entries.length === 1 ? "period" : "periods"})
        </span>
      </h2>
      <div className="max-w-full overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
        <Table className="min-w-[680px]">
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Days held</TableHead>
              <TableHead className="text-right">Opening book value</TableHead>
              <TableHead className="text-right">Depreciation</TableHead>
              <TableHead className="text-right">Closing book value</TableHead>
            </TableRow>
          </TableHeader>
          {groups.map((group) => (
            <TableBody key={group.startYear}>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableCell
                  colSpan={5}
                  className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {group.label}
                  <span className="ml-2 font-normal normal-case tracking-normal">
                    {formatAssetDate(group.start)} – {formatAssetDate(group.end)}
                  </span>
                </TableCell>
              </TableRow>
              {group.entries.map((entry) => {
                const current = isCurrentPeriod(entry, today);
                const future = isFuturePeriod(entry, today);
                const figure = future ? "text-muted-foreground" : NEUTRAL_FIGURE;
                return (
                  <TableRow
                    key={entry.periodStart}
                    aria-current={current ? "date" : undefined}
                    className={cn(current && "bg-primary/5 hover:bg-primary/10")}
                  >
                    <TableCell className={cn("whitespace-nowrap tabular", figure)}>
                      {formatAssetDate(entry.periodStart)} –{" "}
                      {formatAssetDate(entry.periodEnd)}
                      {current && (
                        <Badge variant="secondary" className="ml-2">
                          Current
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className={cn("text-right tabular", figure)}>
                      {entry.daysHeld}
                    </TableCell>
                    <TableCell className={cn("text-right tabular", figure)}>
                      {assetMoney(entry.openingBookValue)}
                    </TableCell>
                    <TableCell
                      className={cn("text-right font-medium tabular", figure)}
                    >
                      {assetMoney(entry.depreciation)}
                    </TableCell>
                    <TableCell className={cn("text-right tabular", figure)}>
                      {assetMoney(entry.closingBookValue)}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="border-b-2 hover:bg-transparent">
                <TableCell className="whitespace-nowrap text-sm font-medium">
                  {group.label} subtotal
                </TableCell>
                <TableCell className={cn("text-right tabular", NEUTRAL_FIGURE)}>
                  {group.daysHeld}
                </TableCell>
                <TableCell className={cn("text-right tabular", NEUTRAL_FIGURE)}>
                  {assetMoney(group.openingBookValue)}
                </TableCell>
                <TableCell
                  className={cn("text-right font-semibold tabular", NEUTRAL_FIGURE)}
                >
                  {assetMoney(group.depreciation)}
                </TableCell>
                <TableCell className={cn("text-right tabular", NEUTRAL_FIGURE)}>
                  {assetMoney(group.closingBookValue)}
                </TableCell>
              </TableRow>
            </TableBody>
          ))}
          <TableFooter>
            <TableRow>
              <TableCell className="font-medium">Total</TableCell>
              <TableCell className="text-right font-medium tabular">
                {totals.daysHeld}
              </TableCell>
              <TableCell className="text-right font-medium tabular">
                {assetMoney(first.openingBookValue)}
              </TableCell>
              <TableCell className="text-right font-semibold tabular">
                {assetMoney(totals.depreciation)}
              </TableCell>
              <TableCell className="text-right font-medium tabular">
                {assetMoney(last.closingBookValue)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </section>
  );
}

/** Shaped like the summary and table, as the other asset reports skeleton themselves. */
function ScheduleLoadingSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <Shimmer className="h-44 w-full rounded-[14px]" />
      <Shimmer className="h-96 w-full rounded-lg" />
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
