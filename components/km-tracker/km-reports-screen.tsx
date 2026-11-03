"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Empty,
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { useKmFormat, useKmRules, type KmFormat } from "@/hooks/use-km-tracker-query";
import { apiErrorMessage } from "@/lib/api-error";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import {
  KM_BUSINESS_USE_BASES,
  fetchKmReport,
  formatKmDateTime,
  kmLogbookPeriodCheck,
  kmReasonLabel,
  kmReportExportRows,
  kmReportFilename,
  kmTripTypeLabel,
  kmVehicleTypeLabel,
  toKmMethod,
  type KmCalculationMethod,
  type KmReport,
  type KmTierSummary,
} from "@/lib/km-tracker";
import { cn } from "@/lib/utils";

const REPORT_NAME = "km-tracker";

/**
 * Method-specific trip reports — sole-webapp's `ReportsPage`: pick a method
 * and a date range, view the trips claimed under it, and download them as an
 * Excel workbook (a Summary sheet and a Trips sheet). For the logbook method
 * the range is the logbook period, so it also says whether that period meets
 * the country's minimum — the ATO's 12 continuous weeks, Inland Revenue's 90
 * consecutive days. For New Zealand's kilometre rate the server adds the
 * income year's tier breakdown, shown above the trips and exported as a sheet.
 */
export function KmReportsScreen() {
  const { rules } = useKmRules();
  const format = useKmFormat();
  const [method, setMethod] = React.useState<KmCalculationMethod>("logbook");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  const reportMutation = useMutation({
    mutationFn: fetchKmReport,
    onSuccess: () => track(EVENTS.REPORT_VIEWED, { report: REPORT_NAME }),
    onError: (error) => toast.error(apiErrorMessage(error, "Couldn't load the report.")),
  });
  const report = reportMutation.data;
  const loading = reportMutation.isPending;

  const issue = !startDate || !endDate
    ? "Pick both a start and an end date."
    : endDate < startDate
      ? "The end date must be on or after the start date."
      : null;

  const logbook = method === "logbook";
  const periodCheck = kmLogbookPeriodCheck(rules, startDate, endDate);
  // The sheet stays exactly as it was for Australia; elsewhere the money
  // columns say which currency and each trip its rate's year.
  const exportCurrency =
    rules.countryIso2 && rules.countryIso2 !== "AU"
      ? report?.currency || rules.currency || format.country.currency
      : null;
  const money = (label: string) => (exportCurrency ? `${label} (${exportCurrency})` : label);
  // A report on screen for different inputs than the ones now selected.
  const stale =
    !!report &&
    (report.method !== method || report.startDate !== startDate || report.endDate !== endDate);

  const view = () => {
    setTouched(true);
    if (issue) return;
    reportMutation.mutate({ method, startDate, endDate });
  };

  const download = () => {
    if (!report || report.rows.length === 0) return;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          Method: `${format.method(report.method)} method`,
          "Start Date": report.startDate,
          "End Date": report.endDate,
          Trips: report.summary.tripCount,
          "Total Distance (KM)": report.summary.totalDistanceKm,
          "Business KM": report.summary.totalBusinessKm,
          [money("Estimated Deduction")]: report.summary.totalEstimatedDeduction,
          [money("Total Amount")]: report.summary.totalAmount,
        },
      ]),
      "Summary",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(kmReportExportRows(report.rows, { currency: exportCurrency })),
      "Trips",
    );
    if (report.yearSummary) {
      const year = report.yearSummary;
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          year.vehicleClaims.map((claim) => ({
            "Income Year": year.incomeYearLabel,
            "Rate Year": year.rateYear,
            Provisional: year.provisional ? "Yes" : "No",
            Vehicle: claim.vehicle,
            "Vehicle Type": kmVehicleTypeLabel(rules, claim.vehicleType),
            "Total KM": claim.totalKm,
            "Business %": claim.businessUsePercentage,
            "Business Use From": KM_BUSINESS_USE_BASES[claim.businessUseBasis],
            "Tier 1 KM": claim.tier1Km,
            [money("Tier 1 Rate")]: claim.tier1Rate,
            "Tier 2 KM": claim.tier2Km,
            [money("Tier 2 Rate")]: claim.tier2Rate,
            [money("Claim")]: claim.claimAmount,
          })),
        ),
        "Year summary",
      );
    }
    XLSX.writeFile(workbook, kmReportFilename(report));
    track(EVENTS.REPORT_EXPORTED, { report: REPORT_NAME, format: "xlsx" });
    toast.success("Report downloaded", { description: kmReportFilename(report) });
  };

  return (
    <div className="space-y-[15px]">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/km-tracker">
            <ArrowLeft />
            KM Tracker
          </Link>
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">KM Tracker reports</h1>
            <p className="text-sm text-muted-foreground">
              Trips claimed under one method over a period, ready for your accountant.
            </p>
          </div>
          <Button
            variant="outline"
            className="shrink-0 self-start"
            onClick={download}
            disabled={!report || report.rows.length === 0 || loading || stale}
            title={
              !report
                ? "View a report first"
                : stale
                  ? "View the report for the new selection first"
                  : report.rows.length === 0
                    ? "There are no trips to download"
                    : undefined
            }
          >
            <Download />
            Download Excel
          </Button>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <form
          className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            view();
          }}
        >
          <Field label="Calculation method" htmlFor="km-report-method">
            <Select value={method} onValueChange={(value) => setMethod(toKmMethod(value))}>
              <SelectTrigger id="km-report-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {rules.methods.map((option) => (
                  <SelectItem key={option.key} value={option.key}>
                    {option.label} method
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={logbook ? "Logbook period start" : "Start date"} required>
            <DatePicker value={startDate} onChange={setStartDate} label="Start date" />
          </Field>
          <Field label={logbook ? "Logbook period end" : "End date"} required>
            <DatePicker value={endDate} onChange={setEndDate} label="End date" />
          </Field>
          <Button type="submit" disabled={loading} className="md:mb-0">
            {loading && <Loader2 className="animate-spin" />}
            View report
          </Button>
        </form>

        {touched && issue && <p className="mt-3 text-sm text-destructive">{issue}</p>}

        {logbook && periodCheck && !issue && (
          <p
            className={cn(
              "mt-4 flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
              periodCheck.meets
                ? "border-success/30 bg-success/5 text-success"
                : "border-warning/30 bg-warning/5 text-warning",
            )}
          >
            {periodCheck.meets ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            {periodCheck.message}
          </p>
        )}
      </section>

      {loading ? (
        <div className="space-y-4" aria-hidden>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Shimmer key={index} className="h-24 rounded-lg border border-border" />
            ))}
          </div>
          <Shimmer className="h-64 rounded-lg border border-border" />
        </div>
      ) : !report ? (
        <Empty>
          <EmptyMedia>
            <FileSpreadsheet aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>Choose a method and a period</EmptyTitle>
            <EmptyDescription>
              Then select View report to see every trip claimed under that method.
            </EmptyDescription>
          </div>
        </Empty>
      ) : (
        <ReportResults report={report} stale={stale} format={format} />
      )}
    </div>
  );
}

function ReportResults({
  report,
  stale,
  format,
}: {
  report: KmReport;
  stale: boolean;
  format: KmFormat;
}) {
  const cards = [
    { label: "Trips", value: String(report.summary.tripCount) },
    { label: "Total distance", value: `${format.km(report.summary.totalDistanceKm)} KM` },
    { label: "Business KM", value: `${format.km(report.summary.totalBusinessKm)} KM` },
    { label: "Estimated deduction", value: format.money(report.summary.totalEstimatedDeduction) },
  ];

  return (
    <div className={cn("space-y-4 transition-opacity", stale && "opacity-60")}>
      {stale && (
        <p className="text-sm text-muted-foreground">
          Showing the last report — select View report to update it for your new selection.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="mt-2 text-xl font-semibold tabular">{card.value}</p>
          </div>
        ))}
      </div>

      {report.yearSummary && <KmYearSummary summary={report.yearSummary} format={format} />}

      {report.rows.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <FileSpreadsheet aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>No trips in this period</EmptyTitle>
            <EmptyDescription>
              Nothing was claimed under the {format.method(report.method).toLowerCase()} method
              between these dates.
            </EmptyDescription>
          </div>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <Table className="min-w-[1000px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Purpose &amp; route</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Distance</TableHead>
                  <TableHead className="text-right">Business %</TableHead>
                  <TableHead className="text-right">Deductible KM</TableHead>
                  <TableHead className="text-right">Est. deduction</TableHead>
                  <TableHead className="text-right">Odometer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap tabular">{formatKmDateTime(row.startTime)}</TableCell>
                    <TableCell className="whitespace-nowrap tabular text-muted-foreground">
                      {formatKmDateTime(row.endTime)}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate">{row.vehicle || "—"}</TableCell>
                    <TableCell className="max-w-[260px]">
                      <span className="block font-medium">{kmReasonLabel(row.reason)}</span>
                      <span className="block truncate text-xs text-muted-foreground" title={`${row.startLocation} to ${row.endLocation}`}>
                        {row.startLocation || "—"} to {row.endLocation || "—"}
                      </span>
                    </TableCell>
                    <TableCell>{kmTripTypeLabel(row.tripType)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular">{format.km(row.distanceKm)} KM</TableCell>
                    <TableCell className="text-right tabular">{format.percent(row.businessPercentage)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular">{format.km(row.deductibleKm)} KM</TableCell>
                    <TableCell className="text-right tabular">{format.money(row.estimatedDeduction)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular text-muted-foreground">
                      {row.odometerStart ?? "—"} / {row.odometerEnd ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The income year under the kilometre rate: total and business km, each
 * vehicle's tier split at its rates, the claim — provisional until the year's
 * rates are published — and the server's warnings as it wrote them.
 */
function KmYearSummary({ summary, format }: { summary: KmTierSummary; format: KmFormat }) {
  const { rules } = format;
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">
          {summary.incomeYearLabel ? `Income year ${summary.incomeYearLabel}` : "Income year"}
        </h2>
        {summary.rateYear && (
          <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-medium">
            {summary.rateYear} rates
          </Badge>
        )}
        {summary.provisional && (
          <Badge variant="warning" className="px-1.5 py-0 text-[11px] font-medium">
            Provisional
          </Badge>
        )}
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Total KM</dt>
          <dd className="font-medium tabular">{format.km(summary.totalKm)} KM</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Business KM</dt>
          <dd className="font-medium tabular">{format.km(summary.claimedBusinessKm)} KM</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Claim (plus tolls and parking)</dt>
          <dd className="font-semibold tabular">
            {format.money(summary.claimAmount)}
            <span className="font-normal text-muted-foreground">
              {" "}
              ({format.money(summary.totalClaim)})
            </span>
          </dd>
        </div>
      </dl>
      {summary.vehicleClaims.length > 0 && (
        <div className="overflow-x-auto">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle</TableHead>
                <TableHead className="text-right">Total KM</TableHead>
                <TableHead className="text-right">Business %</TableHead>
                <TableHead className="text-right">Tier 1</TableHead>
                <TableHead className="text-right">Tier 2</TableHead>
                <TableHead className="text-right">Claim</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.vehicleClaims.map((claim) => (
                <TableRow key={claim.vehicle}>
                  <TableCell>
                    <span className="block font-medium">{claim.vehicle}</span>
                    {claim.vehicleType && (
                      <span className="block text-xs text-muted-foreground">
                        {kmVehicleTypeLabel(rules, claim.vehicleType)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular">
                    {format.km(claim.totalKm)} KM
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {format.percent(claim.businessUsePercentage)}
                    <span className="block text-xs text-muted-foreground">
                      {KM_BUSINESS_USE_BASES[claim.businessUseBasis]}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular">
                    {format.km(claim.tier1Km)} KM × {format.money(claim.tier1Rate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular">
                    {format.km(claim.tier2Km)} KM × {format.money(claim.tier2Rate)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular">
                    {format.money(claim.claimAmount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {summary.provisional && rules.copy.provisionalNote && (
        <p className="text-xs text-muted-foreground">{rules.copy.provisionalNote}</p>
      )}
      {[
        ...new Set(
          [...summary.warnings, ...summary.vehicleClaims.flatMap((claim) => claim.warnings)].map(
            (warning) => warning.message,
          ),
        ),
      ].map((message) => (
        <p key={message} className="flex gap-1.5 text-xs text-warning">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {message}
        </p>
      ))}
    </section>
  );
}
