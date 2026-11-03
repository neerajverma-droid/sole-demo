"use client";

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { format } from "date-fns";
import { useAtom, useSetAtom } from "jotai";
import {
  EllipsisVertical,
  FileSpreadsheet,
  FileText,
  Printer,
  Send,
  Table2,
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
import {
  ReportCustomRange,
  ReportPeriodSelect,
} from "@/components/reports/report-controls";
import { ReportPrintFrame } from "@/components/reports/report-print-frame";
import { SendReportDialog } from "@/components/reports/send-report-dialog";
import { TransactionListingSummary } from "@/components/reports/transaction-listing-summary";
import { TransactionListingTable } from "@/components/reports/transaction-listing-table";
import { useTransactionListingQuery } from "@/hooks/use-transaction-listing-query";
import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { apiErrorMessage } from "@/lib/api-error";
import {
  sendReportOpenAtom,
  tlPeriodAtom,
  tlRangeAtom,
} from "@/lib/atoms";
import {  periodShape, reportMoney, spanLabel } from "@/lib/report-periods";
import {
  TL_PERIODS,
  TRANSACTION_LISTING_REPORT_TYPE_ID,
  transactionCount,
} from "@/lib/transaction-listing";
import { useCountryContext } from "@/hooks/use-country-context";

const TL_TIP =
  "Every transaction coded to a category in the period, grouped by category. Read-only — this is the copy you export or send on, and coding is changed on the Transactions screen.";

/**
 * Transaction Listing.
 *
 * The same shape as the Profit & Loss report, and deliberately: one period
 * control scoping everything below it, a summary of what the period holds, then
 * the detail. What differs is what the detail is — a P&L is figures derived from
 * transactions, this is the transactions themselves.
 *
 * Everything on the page reads one listing object, so the count in the hero and
 * the rows in the table can't describe different periods.
 */
export function TransactionListingScreen() {
  const [period, setPeriod] = useAtom(tlPeriodAtom);
  const [range, setRange] = useAtom(tlRangeAtom);
  const setSendOpen = useSetAtom(sendReportOpenAtom);

  const {
    data: listing,
    isLoading,
    isError,
    error,
    refetch,
  } = useTransactionListingQuery(period, range);

  const empty = listing ? listing.groups.length === 0 : false;
  // The header and the custom-range control need a range label before the
  // listing has loaded — see the same note on the P&L screen.
  const fiscalYearStart = useFiscalYearStart();
  const shape = periodShape(period, range, undefined, fiscalYearStart);
  const rangeLabel = listing?.rangeLabel ?? spanLabel(shape.current);

  const downloadReport = async (fileFormat: "pdf" | "csv") => {
    try {
      const toastId = toast.loading(`Preparing ${fileFormat.toUpperCase()}...`);
      const form = new FormData();
      form.append("report_type_id", TRANSACTION_LISTING_REPORT_TYPE_ID);
      form.append("action", "download");
      form.append("start_date", format(shape.current.from, "yyyy-MM-dd"));
      form.append("end_date", format(shape.current.to, "yyyy-MM-dd"));
      form.append("format", fileFormat);

      const response = await api.post(apiRoutes.reporting.reports, form, {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      // Content-Disposition header usually looks like: attachment; filename="Report.pdf"
      // we can try to extract it from response headers if needed, or just hardcode a fallback
      const contentDisposition = response.headers["content-disposition"];
      let filename = `Transaction Listing.${fileFormat}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success("Download started", { id: toastId });
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Couldn't download the report. Try again."));
    }
  };

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={Table2}
        title="Transaction Listing"
        titleTip={TL_TIP}
        description="Every transaction in the period, grouped by category and ready to send on."
      >
        <ReportPeriodSelect
          periods={TL_PERIODS}
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
            <DropdownMenuItem onSelect={() => downloadReport("pdf")}>
              <FileText className="text-muted-foreground" />
              Download PDF
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => downloadReport("csv")}>
              <FileSpreadsheet className="text-muted-foreground" />
              Download CSV
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* The one action here the browser can actually do today. */}
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

      {isLoading ? (
        <ReportLoadingSkeleton />
      ) : isError ? (
        <ReportErrorState
          message={apiErrorMessage(
            error,
            "Couldn't load the transaction listing",
          )}
          onRetry={() => void refetch()}
        />
      ) : listing ? (
        <ReportPrintFrame title="Transaction Listing" rangeLabel={rangeLabel}>
          <TransactionListingSummary listing={listing} empty={empty} />
          <TransactionListingTable listing={listing} empty={empty} />
        </ReportPrintFrame>
      ) : null}

      <SendReportDialog
        reportTypeId={TRANSACTION_LISTING_REPORT_TYPE_ID}
        report={{
          title: "Transaction Listing",
          period,
          rangeLabel,
          range: {
            from: format(shape.current.from, "yyyy-MM-dd"),
            to: format(shape.current.to, "yyyy-MM-dd"),
          },
          headline:
            empty || !listing
              ? undefined
              : {
                  label: "Transactions",
                  value: `${transactionCount(listing.summary.count.amount)} · ${reportMoney(
                    listing.summary.gst,
                  )} GST`,
                },
        }}
      />
    </div>
  );
}

/** Stands in for the summary cards and table while the listing loads. */
function ReportLoadingSkeleton() {
  return (
    <div className="space-y-[15px]" aria-hidden>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Shimmer key={index} className="h-24 w-full rounded-lg" />
        ))}
      </div>
      <Shimmer className="h-96 w-full rounded-lg" />
    </div>
  );
}

/**
 * A failed fetch reads nothing like an honest empty listing — same shell the
 * rest of the app uses for a distinct error state, not the "nothing coded
 * yet" empty state the mock preview toggle shows.
 */
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
        <EmptyTitle>Couldn&apos;t load the listing</EmptyTitle>
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

function comingSoon(what: string, period: string) {
  toast(`${what} is coming soon`, {
    description: `It'll cover ${period.toLowerCase()} exactly as shown here.`,
  });
}
