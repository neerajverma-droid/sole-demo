"use client";

import * as React from "react";
import { useAtom, useSetAtom } from "jotai";
import {
  Calculator,
  EllipsisVertical,
  FileSpreadsheet,
  FileText,
  Printer,
  Send,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

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
import { Shimmer } from "@/components/ui/shimmer";
import { PageHeader } from "@/components/layout/page-header";
import { BasAiReview } from "@/components/reports/bas-ai-review";
import { BasTransactionsTable } from "@/components/reports/bas-transactions-table";
import { BasWorksheet } from "@/components/reports/bas-worksheet";
import {
  ReportCustomRange,
  ReportPeriodSelect,
} from "@/components/reports/report-controls";
import { ReportPrintFrame } from "@/components/reports/report-print-frame";
import { SendReportDialog } from "@/components/reports/send-report-dialog";
import { useBasReportQuery } from "@/hooks/use-bas-report-query";
import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import apiRoutes from "@/config/api-routes";
import { apiErrorMessage } from "@/lib/api-error";
import { basPeriodAtom, basRangeAtom, sendReportOpenAtom } from "@/lib/atoms";
import {
  BAS_PAGE_SIZE,
  BAS_PERIODS,
  basRange,
  basTotals,
  downloadBasReport,
} from "@/lib/bas-report";
import { periodShape, reportMoney, spanLabel } from "@/lib/report-periods";
import { useCountryContext } from "@/hooks/use-country-context";
import { returnWord, taxWord } from "@/lib/country-context";

/**
 * The tip names the country's own form and authority: an Australian business
 * copies G-labels into an ATO form, a New Zealand one copies boxes into a
 * GST101A. Both halves come from the report the backend built.
 */
const basTip = (returnName: string, tax: string, authority: string | null) =>
  `Your ${tax} worksheet for each filing period in the range — the boxes you copy into the ${authority ? `${authority} ` : ""}${returnName} — and every reconciled transaction behind it.`;

/**
 * BAS report.
 *
 * Same shape as the other Reporting suite reports: one period control scoping
 * the page, the answer first, then the working. The answer is the worksheet —
 * GST payable or refund, and the labels behind it; the working is the
 * transactions that were counted.
 */
export function BasReportScreen() {
  const [period, setPeriod] = useAtom(basPeriodAtom);
  const [range, setRange] = useAtom(basRangeAtom);
  const setSendOpen = useSetAtom(sendReportOpenAtom);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<number>(BAS_PAGE_SIZE);

  // A new period is a new listing; page 4 of the last one means nothing here.
  React.useEffect(() => setPage(1), [period, range?.from, range?.to, pageSize]);

  const {
    data: report,
    isLoading,
    isError,
    isFetching,
    isPlaceholderData,
    error,
    refetch,
  } = useBasReportQuery(period, range, page, pageSize);

  // The business's financial year, as the query above resolved it.
  const fiscalYearStart = useFiscalYearStart();
  const shape = periodShape(period, range, undefined, fiscalYearStart);
  // The heading needs the business's own financial year, not Australia's:
  // "This FY" is 1 April – 31 March for a New Zealand business.
  const { country } = useCountryContext();

  const rangeLabel = report?.rangeLabel ?? spanLabel(shape.current);
  const isoRange = basRange(period, range, fiscalYearStart);

  const download = async (fileFormat: "pdf" | "csv") => {
    const toastId = toast.loading(`Preparing ${fileFormat.toUpperCase()}...`);
    try {
      await downloadBasReport(isoRange, fileFormat);
      toast.success("Download started", { id: toastId });
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Couldn't download the report. Try again."), {
        id: toastId,
      });
    }
  };

  const totals = report ? basTotals(report.quarters) : null;

  /*
   * The country's own wording. Until the report lands there is nothing to read
   * it from, so the heading falls back to the business's own return name from
   * the country context — which is already right — rather than flashing "BAS"
   * at a New Zealand business and then correcting itself.
   */
  const returnName = report?.returnName ?? returnWord(country);
  const tax = report?.taxLabel ?? taxWord(country);
  const authority = report?.taxAuthority ?? country.taxAuthority ?? null;
  const title = `${returnName} report`;

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={Calculator}
        title={title}
        titleTip={basTip(returnName, tax, authority)}
        description={`${tax} you owe, ${tax} you can claim, and the transactions behind both.`}
      >
        <ReportPeriodSelect
          periods={BAS_PERIODS}
          value={period}
          onChange={setPeriod}
          range={range}
          onRangeChange={setRange}
        />

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
      </PageHeader>

      {period === "Custom range" && (
        <ReportCustomRange
          from={range?.from ?? ""}
          to={range?.to ?? ""}
          label={rangeLabel}
          onChange={setRange}
        />
      )}

      {!isError && !isLoading && report && (
        <BasAiReview range={isoRange} />
      )}

      {isLoading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <ErrorState
          message={apiErrorMessage(error, `Couldn't load the ${returnName} report`)}
          onRetry={() => void refetch()}
        />
      ) : report ? (
        <ReportPrintFrame title={title} rangeLabel={rangeLabel}>
          {report.quarters.length > 0 && <BasWorksheet report={report} />}
          <BasTransactionsTable
            report={report}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            fetching={isFetching && isPlaceholderData}
          />
        </ReportPrintFrame>
      ) : null}

      <SendReportDialog
        endpoint={apiRoutes.reporting.gst}
        report={{
          title,
          period,
          rangeLabel,
          range: isoRange,
          headline: totals
            ? {
                label: totals.outcome === "refund" ? `${tax} refund` : `${tax} payable`,
                value: reportMoney(totals.net),
              }
            : undefined,
        }}
      />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-[15px]" aria-hidden>
      <Shimmer className="h-36 w-full rounded-lg" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Shimmer key={index} className="h-24 w-full rounded-lg" />
        ))}
      </div>
      <Shimmer className="h-80 w-full rounded-lg" />
      <Shimmer className="h-96 w-full rounded-lg" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
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
