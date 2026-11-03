"use client";

import * as React from "react";
import Link from "next/link";
import {
  Download,
  FileSpreadsheet,
  Landmark,
  Loader2,
  ReceiptText,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shimmer } from "@/components/ui/shimmer";
import { StatCards, type StatCard } from "@/components/ui/stat-cards";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { PayrollSeatsNotice } from "@/components/payroll/payroll-banners";
import { usePayrollSeatsQuery } from "@/hooks/use-payroll-query";
import {
  useFetchPayrollReportForExport,
  usePayrollReportQuery,
} from "@/hooks/use-payroll-reports-query";
import { apiErrorMessage } from "@/lib/api-error";
import { downloadCsv } from "@/lib/file-parser";
import { payrollMoney } from "@/lib/payroll";
import { PAYRUNS_ROOT } from "@/lib/payroll-payruns";
import {
  PAYROLL_REPORTS,
  PAYROLL_REPORT_EXPORT_LIMIT,
  PAYROLL_REPORT_PAGE_SIZE,
  payrollReport,
  payrollReportCsv,
  payrollReportFilename,
  payrollReportYears,
  reportCellText,
  reportPageInfo,
  reportRecordCount,
  type BuiltPayrollReport,
  type PayrollReportColumn,
  type PayrollReportFigure,
  type PayrollReportId,
  type PayrollReportSection,
} from "@/lib/payroll-reports";
import { cn } from "@/lib/utils";

const FIGURE_ICONS: Record<string, StatCard["icon"]> = {
  gross: Wallet,
  payg: Landmark,
  net: ReceiptText,
};

/**
 * The five payroll reports sole-webapp's `ReportsList.js` offered, one at a
 * time, for one financial year. Read-only: pick a report and a year, page
 * through it, export it as CSV.
 */
export function PayrollReportsScreen() {
  const years = React.useMemo(() => payrollReportYears(), []);
  const [reportId, setReportId] = React.useState<PayrollReportId>(
    PAYROLL_REPORTS[0].id,
  );
  const [year, setYear] = React.useState(years[0].value);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(PAYROLL_REPORT_PAGE_SIZE);
  const [exporting, setExporting] = React.useState(false);

  // Status only, as on the leave screen — sole-webapp never gated reports on
  // the subscription; a year of past runs is still worth reading when paused.
  const seatsQuery = usePayrollSeatsQuery();
  const reportQuery = usePayrollReportQuery(reportId, {
    year,
    page,
    limit: pageSize,
  });
  const fetchForExport = useFetchPayrollReportForExport();

  const definition = payrollReport(reportId);
  const report = reportQuery.data;
  const recordCount = report ? reportRecordCount(report) : 0;
  const yearLabel = years.find((fy) => fy.value === year)?.label ?? year;

  const exportCsv = async () => {
    setExporting(true);
    try {
      const whole = await fetchForExport(reportId, year);
      downloadCsv(payrollReportFilename(reportId, year), payrollReportCsv(whole));
      if (whole.totalPages > 1) {
        toast.warning(
          `Only the first ${PAYROLL_REPORT_EXPORT_LIMIT.toLocaleString("en-AU")} rows were exported.`,
        );
      }
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to export report."));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={FileSpreadsheet}
        title="Payroll reports"
        description="Summaries, breakdowns and ledger exports of your pay runs, by financial year."
      >
        <Button
          variant="outline"
          onClick={() => void exportCsv()}
          disabled={exporting || !report || recordCount === 0}
          data-usertour="payroll-reports-export"
        >
          {exporting ? <Loader2 className="animate-spin" aria-hidden /> : <Download />}
          Export CSV
        </Button>
      </PageHeader>
      {seatsQuery.data && <PayrollSeatsNotice seats={seatsQuery.data} />}

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm md:flex-row md:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <label
            htmlFor="payroll-report-picker"
            className="text-xs font-medium text-muted-foreground"
          >
            Report
          </label>
          <Select
            value={reportId}
            onValueChange={(next) => {
              setReportId(next as PayrollReportId);
              setPage(1);
            }}
          >
            <SelectTrigger
              id="payroll-report-picker"
              className="w-full"
              data-usertour="payroll-reports-picker"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYROLL_REPORTS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{definition.description}</p>
        </div>
        <div className="space-y-1.5 md:self-start">
          <label
            htmlFor="payroll-report-year"
            className="text-xs font-medium text-muted-foreground"
          >
            Financial year
          </label>
          <Select
            value={year}
            onValueChange={(next) => {
              setYear(next);
              setPage(1);
            }}
          >
            <SelectTrigger
              id="payroll-report-year"
              className="w-full md:w-40"
              data-usertour="payroll-reports-year"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((fy) => (
                <SelectItem key={fy.value} value={fy.value}>
                  {fy.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {reportQuery.isLoading ? (
        <ReportSkeleton />
      ) : reportQuery.isError || !report ? (
        <Empty>
          <EmptyMedia>
            <TriangleAlert aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>Couldn&apos;t load the report</EmptyTitle>
            <EmptyDescription>
              {apiErrorMessage(reportQuery.error, "Failed to load report.")}
            </EmptyDescription>
          </div>
          <EmptyActions>
            <Button size="sm" variant="outline" onClick={() => void reportQuery.refetch()}>
              Try again
            </Button>
          </EmptyActions>
        </Empty>
      ) : recordCount === 0 && page === 1 ? (
        <Empty>
          <EmptyMedia>
            <FileSpreadsheet aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>No payroll in {yearLabel}</EmptyTitle>
            <EmptyDescription>
              There are no pay runs paid in this financial year. Once a pay run
              is completed, it shows up in every report here.
            </EmptyDescription>
          </div>
          <EmptyActions>
            <Button size="sm" variant="outline" asChild>
              <Link href={PAYRUNS_ROOT}>Go to pay runs</Link>
            </Button>
          </EmptyActions>
        </Empty>
      ) : (
        <ReportBody
          report={report}
          refreshing={reportQuery.isPlaceholderData}
          page={page}
          pageSize={pageSize}
          itemLabel={definition.itemLabel}
          onPageChange={setPage}
          onPageSizeChange={(next) => {
            setPageSize(next);
            setPage(1);
          }}
        />
      )}
    </div>
  );
}

function ReportBody({
  report,
  refreshing,
  page,
  pageSize,
  itemLabel,
  onPageChange,
  onPageSizeChange,
}: {
  report: BuiltPayrollReport;
  /** The previous page is on screen while the next one loads. */
  refreshing: boolean;
  page: number;
  pageSize: number;
  itemLabel: string;
  onPageChange: (next: number) => void;
  onPageSizeChange: (next: number) => void;
}) {
  return (
    <div
      className={cn("space-y-[15px] transition-opacity", refreshing && "opacity-60")}
      aria-busy={refreshing}
    >
      {report.figures && report.figures.length > 0 && (
        <StatCards stats={report.figures.map(figureCard)} />
      )}

      {report.sections.map((section, index) => (
        <ReportSection key={section.title ?? index} section={section} />
      ))}

      <NumberedPagination
        page={reportPageInfo({ page, pageSize, report })}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        itemLabel={itemLabel}
        navLabel="Report pages"
        disabled={refreshing}
      />
    </div>
  );
}

function figureCard(figure: PayrollReportFigure): StatCard {
  return {
    key: figure.key,
    label: figure.label,
    value: payrollMoney(figure.value),
    icon: FIGURE_ICONS[figure.key] ?? Wallet,
  };
}

const alignRight = (column: PayrollReportColumn) =>
  column.format === "money" || column.format === "hours";

function ReportSection({ section }: { section: PayrollReportSection }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      {section.title && (
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{section.title}</h2>
        </div>
      )}
      <div className="overflow-x-auto">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              {section.columns.map((column) => (
                <TableHead
                  key={column.key}
                  className={cn("whitespace-nowrap", alignRight(column) && "text-right")}
                >
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {section.rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={section.columns.length}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Nothing on this page.
                </TableCell>
              </TableRow>
            ) : (
              section.rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(row.total && "bg-muted/50 font-semibold hover:bg-muted/50")}
                >
                  {section.columns.map((column, index) => (
                    <TableCell
                      key={column.key}
                      className={cn(
                        "whitespace-nowrap",
                        alignRight(column) && "text-right tabular",
                        index === 0 && !row.total && "font-medium",
                        !row.total && index > 0 && "text-muted-foreground",
                      )}
                    >
                      {reportCellText(row.values[column.key], column)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** Shaped like a report — the picker card stays real above it. */
function ReportSkeleton() {
  return (
    <div className="space-y-[15px]" aria-hidden>
      <Shimmer className="h-96 w-full rounded-lg border border-border" />
      <Shimmer className="h-9 w-72 rounded-md" />
    </div>
  );
}
