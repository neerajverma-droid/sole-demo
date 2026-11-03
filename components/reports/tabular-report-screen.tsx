"use client";

import * as React from "react";
import { format } from "date-fns";
import { useSetAtom } from "jotai";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  EllipsisVertical,
  FileSpreadsheet,
  FileText,
  Printer,
  Send,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { Shimmer } from "@/components/ui/shimmer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import {
  ReportCustomRange,
  ReportPeriodSelect,
} from "@/components/reports/report-controls";
import {
  CELL,
  HEAD_TINT,
  RESULT_TINT,
  RULE,
} from "@/components/reports/report-table-tokens";
import { ReportPrintFrame } from "@/components/reports/report-print-frame";
import { SendReportDialog } from "@/components/reports/send-report-dialog";
import { useTabularReportQuery } from "@/hooks/use-tabular-report-query";
import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { apiErrorMessage } from "@/lib/api-error";
import { sendReportOpenAtom } from "@/lib/atoms";
import {
  cellAlignment,
  downloadTabularReport,
  formatReportCell,
  isGroupedRepeat,
  type ReportColumnSpec,
  type ReportRow,
  type ReportSummaryFigure,
  type TabularReportConfig,
} from "@/lib/report-table";
import {  periodShape, spanLabel, type ReportPeriod, type ReportRange } from "@/lib/report-periods";
import { cn } from "@/lib/utils";
import { useCountryContext } from "@/hooks/use-country-context";

const ALIGN_CLASS = {
  left: "text-left",
  right: "text-right tabular",
  center: "text-center",
} as const;

/**
 * Every plain tabular report in the suite, drawn once.
 *
 * Same furniture as the Profit & Loss and BAS screens — one period control in
 * the header scoping the page, a download menu, a send dialog, then the grid —
 * so a reader moving between reports meets the same page each time. What each
 * report supplies is its columns, where its rows come from, and (optionally) a
 * toolbar of its own server-side controls.
 *
 * The period control and the send/download actions disappear for a report that
 * genuinely has neither (the Audit Trail is an undated stream with no export
 * endpoint), rather than showing controls that quietly do nothing.
 */
export function TabularReportScreen({
  config,
  icon,
  period,
  onPeriodChange,
  range,
  onRangeChange,
  extra = {},
  toolbar,
  summary,
  emptyIcon: EmptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  defaultPageSize = 25,
  onRowClick,
  selectedRowId,
  detail,
  sort,
  onSortChange,
}: {
  config: TabularReportConfig;
  icon: LucideIcon;
  period: ReportPeriod;
  onPeriodChange: (next: ReportPeriod) => void;
  range: ReportRange | null;
  onRangeChange: (next: ReportRange) => void;
  /** The report's own server-side params — a section filter, a record type. */
  extra?: Record<string, string>;
  /** Controls for those params, drawn above the table. */
  toolbar?: React.ReactNode;
  /**
   * Cards above the grid, built from the backend's own `summary` figures —
   * only Cash Flow's endpoint sends any today. Not called at all when there
   * are none, so a report without a `summary` never has to guard against an
   * empty array itself.
   */
  summary?: (figures: ReportSummaryFigure[]) => React.ReactNode;
  /**
   * Topic-relevant, never `TriangleAlert` — that icon is reserved for the
   * genuine error state below it. A successful call that found nothing is not
   * a warning, and sharing the icon would make the two read the same.
   */
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
  /** Where "add the first one" would send someone — omitted where there's
   *  nothing to navigate to (a filtered-away Chart of Accounts, the Audit
   *  Trail's own stream). */
  emptyAction?: { label: string; href: string };
  defaultPageSize?: number;
  /**
   * Makes rows selectable. A report with a drill-down (Chart of Accounts) uses
   * this; the rest leave rows inert, because a row that highlights on hover and
   * then does nothing when clicked reads as broken.
   */
  onRowClick?: (row: ReportRow) => void;
  selectedRowId?: string | null;
  /** The open drill-down, drawn under the grid. */
  detail?: React.ReactNode;
  /**
   * The current sort, where the report supports one. Server-side: the column
   * headers only report the click, and the caller puts the key into `extra`, so
   * a sort covers every page rather than reordering the page on screen.
   */
  sort?: { by: string; dir: "asc" | "desc" };
  onSortChange?: (by: string, dir: "asc" | "desc") => void;
}) {
  // Shared with `SendReportDialog`, as every other report does it: one report
  // page is mounted at a time, so one atom can't be contended for.
  const setSendOpen = useSetAtom(sendReportOpenAtom);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(defaultPageSize);

  // Any change to what's being asked for starts at page one; staying on page 4
  // of a result that no longer has four pages shows an empty grid.
  const extraKey = JSON.stringify(extra);
  React.useEffect(() => {
    setPage(1);
  }, [period, range?.from, range?.to, pageSize, extraKey]);

  const {
    data: report,
    isLoading,
    isError,
    isFetching,
    isPlaceholderData,
    error,
    refetch,
  } = useTabularReportQuery(config, period, range, page, pageSize, extra);

  // The business's financial year, as the query above resolved it.
  const fiscalYearStart = useFiscalYearStart();
  const shape = periodShape(period, range, undefined, fiscalYearStart);
  const rangeLabel = report?.rangeLabel ?? spanLabel(shape.current);
  const dated = config.dated !== false;
  const exportable = Boolean(config.reportTypeId);

  const download = async (fileFormat: "pdf" | "csv") => {
    if (!config.reportTypeId) return;
    const toastId = toast.loading(`Preparing ${fileFormat.toUpperCase()}...`);
    try {
      await downloadTabularReport(
        config.reportTypeId,
        report?.range ?? isoSpan(shape.current),
        fileFormat,
        config.title,
        extra,
      );
      toast.success("Download started", { id: toastId });
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Couldn't download the report. Try again."), {
        id: toastId,
      });
    }
  };

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={icon}
        title={config.title}
        titleTip={config.tip}
        description={config.description}
      >
        {dated && (
          <ReportPeriodSelect
            periods={config.periods}
            value={period}
            onChange={onPeriodChange}
            range={range}
            onRangeChange={onRangeChange}
          />
        )}

        {exportable && (
          <>
            <Button onClick={() => setSendOpen(true)}>
              <Send />
              Send report
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Report actions">
                  <EllipsisVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={() => download("pdf")}>
                  <FileText className="text-muted-foreground" />
                  Download PDF
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => download("csv")}>
                  <FileSpreadsheet className="text-muted-foreground" />
                  Download CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => window.print()}>
                  <Printer className="text-muted-foreground" />
                  Print
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}

        {!exportable && (
          <Button variant="outline" onClick={() => window.print()}>
            <Printer />
            Print
          </Button>
        )}
      </PageHeader>

      {dated && period === "Custom range" && (
        <ReportCustomRange
          from={range?.from ?? ""}
          to={range?.to ?? ""}
          label={rangeLabel}
          onChange={onRangeChange}
        />
      )}

      {toolbar}

      {isLoading ? (
        <TabularSkeleton />
      ) : isError ? (
        <ReportErrorState
          message={apiErrorMessage(error, `Couldn't load the ${config.title}`)}
          onRetry={() => void refetch()}
        />
      ) : report ? (
        <ReportPrintFrame
          title={config.title}
          rangeLabel={dated ? report.rangeLabel : undefined}
        >
          {summary && report.summary && report.summary.length > 0
            ? summary(report.summary)
            : null}
          {report.total === 0 ? (
            <Empty>
              <EmptyMedia>
                <EmptyIcon aria-hidden />
              </EmptyMedia>
              <div className="space-y-1">
                <EmptyTitle>{emptyTitle}</EmptyTitle>
                <EmptyDescription>{emptyDescription}</EmptyDescription>
              </div>
              {emptyAction && (
                <EmptyActions>
                  <Button size="sm" asChild>
                    <Link href={emptyAction.href}>{emptyAction.label}</Link>
                  </Button>
                </EmptyActions>
              )}
            </Empty>
          ) : (
            <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <div className="border-b border-border p-4 sm:px-5">
                <h2 className="text-sm font-semibold">{config.title}</h2>
                <p className="text-xs text-muted-foreground tabular">
                  {dated && `${report.rangeLabel} · `}
                  {report.total} {config.itemLabel}
                  {report.total === 1 ? "" : "s"}
                </p>
              </div>

              <Table
                containerClassName={cn(
                  "max-h-[38rem]",
                  isFetching && isPlaceholderData && "opacity-60",
                )}
              >
                <TableHeader className="sticky top-0 z-20">
                  <TableRow>
                    {config.columns.map((column, index) => (
                      <TableHead
                        key={column.key}
                        className={cn(
                          HEAD_TINT,
                          index > 0 && RULE,
                          "px-4",
                          ALIGN_CLASS[cellAlignment(column)],
                          column.secondary && "hidden sm:table-cell",
                        )}
                        aria-sort={
                          column.sortKey && sort?.by === column.sortKey
                            ? sort.dir === "asc"
                              ? "ascending"
                              : "descending"
                            : undefined
                        }
                      >
                        {column.sortKey && onSortChange ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            // Negative margin cancels the button's own padding
                            // so the label still sits where a plain header's
                            // text would — a sortable header should look like
                            // a header first, a control second. No text colour
                            // of its own: `TableHeader` sets every `th`'s label
                            // to `--primary-heading`, and this inherits it
                            // rather than overriding it to a colour only the
                            // sortable columns would show.
                            className="-ml-3 h-7 gap-1 px-3 text-xs font-medium text-inherit hover:bg-transparent hover:text-inherit hover:opacity-70"
                            aria-label={`Sort by ${column.label ?? column.key}`}
                            onClick={() => {
                              const key = column.sortKey!;
                              // Clicking the sorted column flips it; a new
                              // column starts ascending, as every grid does.
                              onSortChange(
                                key,
                                sort?.by === key && sort.dir === "asc" ? "desc" : "asc",
                              );
                            }}
                          >
                            {column.label ?? column.key}
                            <SortIcon
                              active={sort?.by === column.sortKey}
                              dir={sort?.dir ?? "asc"}
                            />
                          </Button>
                        ) : (
                          (column.label ?? column.key)
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row, rowIndex) => (
                    <TableRow
                      key={row.id}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      // Keyboard reach for the drill-down: a row that opens a
                      // panel is a control, so it takes focus and Enter/Space.
                      tabIndex={onRowClick ? 0 : undefined}
                      role={onRowClick ? "button" : undefined}
                      onKeyDown={
                        onRowClick
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onRowClick(row);
                              }
                            }
                          : undefined
                      }
                      className={cn(
                        onRowClick && "cursor-pointer",
                        selectedRowId === row.id && RESULT_TINT,
                      )}
                    >
                      {config.columns.map((column, index) => (
                        <TableCell
                          key={column.key}
                          className={cn(
                            CELL,
                            index > 0 && RULE,
                            ALIGN_CLASS[cellAlignment(column)],
                            column.emphasis && "font-medium",
                            column.secondary && "hidden sm:table-cell",
                            // Reads as a group label where it heads a run —
                            // the same weight, case and colour the ledger's
                            // own category heading uses — not a plain value
                            // that happens to repeat.
                            column.groupRuns &&
                              !isGroupedRepeat(report.rows, rowIndex, column) &&
                              "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                          )}
                        >
                          {isGroupedRepeat(report.rows, rowIndex, column) ? null : (
                            <CellContent
                              value={report.rows[rowIndex].cells[column.key] ?? null}
                              spec={column}
                            />
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Page controls are for the screen — on paper they'd be a row
                  of dead buttons under a table that's already been cut to a
                  page. The old report excluded them too. */}
              <div className="border-t border-border p-3 sm:px-5 print:hidden">
                <NumberedPagination
                  page={{
                    page,
                    pageCount: report.pageCount,
                    total: report.total,
                    from: (page - 1) * pageSize + 1,
                    to: Math.min(report.total, (page - 1) * pageSize + report.rows.length),
                  }}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  itemLabel={config.itemLabel}
                  navLabel={`${config.title} pages`}
                  disabled={isFetching && isPlaceholderData}
                />
              </div>
            </section>
          )}
          {detail}
        </ReportPrintFrame>
      ) : null}

      {exportable && (
        <SendReportDialog
          reportTypeId={config.reportTypeId}
          report={{
            title: config.title,
            period,
            rangeLabel,
            range: report?.range ?? isoSpan(shape.current),
          }}
        />
      )}
    </div>
  );
}

/** The selected span as the two ISO dates the send call reports on. */
function isoSpan(span: { from: Date; to: Date }) {
  return {
    from: format(span.from, "yyyy-MM-dd"),
    to: format(span.to, "yyyy-MM-dd"),
  };
}

/** Which way a sortable column is pointing, if it's the one being sorted by. */
function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ChevronsUpDown className="size-3.5 opacity-60" aria-hidden />;
  return dir === "asc" ? (
    <ChevronUp className="size-3.5" aria-hidden />
  ) : (
    <ChevronDown className="size-3.5" aria-hidden />
  );
}

/** A `badge` column reads as a chip, tinted by its own value where it says how. */
function CellContent({
  value,
  spec,
}: {
  value: string | null;
  spec: ReportColumnSpec;
}) {
  const text = formatReportCell(value, spec);
  if (spec.format !== "badge" || text === "—") return <>{text}</>;
  return <Badge variant={spec.tone?.(text) ?? "outline"}>{text}</Badge>;
}


/** Stands in for a toolbar and the grid while the report loads. */
function TabularSkeleton() {
  return (
    <div className="space-y-[15px]" aria-hidden>
      <Shimmer className="h-14 w-full rounded-lg" />
      <Shimmer className="h-[28rem] w-full rounded-lg" />
    </div>
  );
}

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
