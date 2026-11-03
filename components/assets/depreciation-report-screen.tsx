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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { downloadCsv } from "@/lib/file-parser";
import { assetMoney, type DepreciationMethod } from "@/lib/assets";
import {
  depreciationReportCsv,
  recentFinancialYears,
} from "@/lib/asset-depreciation-report";
import { useDepreciationReportQuery } from "@/hooks/use-asset-depreciation-report-query";
import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { toIsoDate } from "@/lib/invoices";

const ASSETS_ROOT = "/assets";

/** Short enough for a table cell — the full name is what the badge's title carries. */
const METHOD_ABBREVIATION: Record<DepreciationMethod, string> = {
  "Straight line": "SL",
  "Diminishing value": "DV",
  "Full depreciation on purchase": "Full",
};

/**
 * Every depreciating asset, and what it's claimed for one financial year —
 * the counterpart to the per-asset depreciation screens: those ask what the
 * rules are for one asset, this reports what they added up to across all of
 * them. Read-only, matching sole-webapp's own report exactly (same FY
 * window, same columns, same CSV export).
 */
export function DepreciationReportScreen() {
  const today = toIsoDate(new Date());
  // The business's financial years — 1 April to 31 March in New Zealand.
  const fiscalYearStart = useFiscalYearStart();
  const financialYears = React.useMemo(
    () => recentFinancialYears(today, fiscalYearStart),
    [today, fiscalYearStart],
  );
  const [selected, setSelected] = React.useState(
    `${financialYears[0].start}|${financialYears[0].end}`,
  );
  // Read back through the list, so a choice made before the country context
  // landed (a July year) falls to the newest year rather than to nothing.
  const chosen =
    financialYears.find((fy) => `${fy.start}|${fy.end}` === selected) ??
    financialYears[0];
  const fyStart = chosen.start;
  const fyEnd = chosen.end;

  const {
    data: report,
    isLoading,
    isError,
    error,
    refetch,
  } = useDepreciationReportQuery(fyStart, fyEnd);
  const rows = report?.rows ?? [];

  const totalCost = rows.reduce((sum, row) => sum + row.purchasePrice, 0);
  const totalAccumulated = rows.reduce(
    (sum, row) => sum + row.accumulatedDepreciation,
    0,
  );
  const totalBookValue = rows.reduce((sum, row) => sum + row.bookValue, 0);

  const exportCsv = () => {
    if (!report) return;
    downloadCsv(
      `depreciation_report_${fyStart}_${fyEnd}.csv`,
      depreciationReportCsv(report),
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href={ASSETS_ROOT}>
            <ArrowLeft />
            Assets
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Depreciation report
            </h1>
            <p className="text-sm text-muted-foreground">
              What every depreciating asset claimed for the financial year.
            </p>
          </div>
          <Select
            value={`${fyStart}|${fyEnd}`}
            onValueChange={setSelected}
          >
            <SelectTrigger
              className="w-40"
              aria-label="Financial year"
              data-usertour="asset-report-year"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {financialYears.map((fy) => (
                <SelectItem key={fy.start} value={`${fy.start}|${fy.end}`}>
                  {fy.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <ReportLoadingSkeleton />
      ) : isError ? (
        <ReportErrorState
          message={apiErrorMessage(error, "Couldn't load the depreciation report")}
          onRetry={() => void refetch()}
        />
      ) : !report || report.assetCount === 0 ? (
        <Empty>
          <EmptyMedia>
            <TrendingDown aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>No depreciating assets for this year</EmptyTitle>
            <EmptyDescription>
              Nothing in the asset register claimed depreciation in this
              financial year. Assets with a depreciation schedule will appear
              here once they do.
            </EmptyDescription>
          </div>
        </Empty>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard label="Assets" value={String(report.assetCount)} />
            <SummaryCard
              label="FY total depreciation"
              value={assetMoney(report.totalDepreciation)}
            />
            <SummaryCard
              label="Total book value"
              value={assetMoney(totalBookValue)}
            />
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download />
              Export CSV
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Accum. dep.</TableHead>
                  <TableHead className="text-right">Book value</TableHead>
                  <TableHead className="text-right">FY dep.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.assetId}>
                    <TableCell className="font-medium">
                      {row.assetName || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.assetType || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" title={row.method}>
                        {METHOD_ABBREVIATION[row.method]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {assetMoney(row.purchasePrice)}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {assetMoney(row.accumulatedDepreciation)}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {assetMoney(row.bookValue)}
                    </TableCell>
                    <TableCell className="text-right tabular font-medium">
                      {assetMoney(row.fyDepreciation)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="font-medium">
                    Total
                  </TableCell>
                  <TableCell className="text-right tabular font-medium">
                    {assetMoney(totalCost)}
                  </TableCell>
                  <TableCell className="text-right tabular font-medium">
                    {assetMoney(totalAccumulated)}
                  </TableCell>
                  <TableCell className="text-right tabular font-medium">
                    {assetMoney(totalBookValue)}
                  </TableCell>
                  <TableCell className="text-right tabular font-medium">
                    {assetMoney(report.totalDepreciation)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Stands in for the summary cards and the table while the report loads —
 * shaped like this screen's own content, the same way every other report in
 * the suite (Profit & Loss, BAS, the tabular reports) skeletons itself rather
 * than blocking behind a spinner.
 */
function ReportLoadingSkeleton() {
  return (
    <div className="space-y-[15px]" aria-hidden>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Shimmer key={index} className="h-[4.5rem] w-full rounded-[14px]" />
        ))}
      </div>
      <Shimmer className="h-96 w-full rounded-lg" />
    </div>
  );
}

/** A failed fetch, same shell every report in the suite uses for one. */
function ReportErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Empty>
      <EmptyMedia>
        <TriangleAlert aria-hidden />
      </EmptyMedia>
      <div className="space-y-1">
        <EmptyTitle>Couldn&apos;t load the report</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </div>
      <EmptyActions>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </EmptyActions>
    </Empty>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-border bg-card p-4 shadow-sm">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
        aria-hidden
      >
        <TrendingDown className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular">{value}</p>
      </div>
    </div>
  );
}
