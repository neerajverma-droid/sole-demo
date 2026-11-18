"use client";

import { format } from "date-fns";
import { useAtom, useSetAtom } from "jotai";
import {
  EllipsisVertical,
  FileSpreadsheet,
  FileText,
  LineChart,
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
import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { Shimmer } from "@/components/ui/shimmer";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageHeader } from "@/components/layout/page-header";
import { ProfitLossBar } from "@/components/reports/profit-loss-bar";
import { ProfitLossSummary } from "@/components/reports/profit-loss-summary";
import { ProfitLossTable } from "@/components/reports/profit-loss-table";
import {
  ReportCustomRange,
  ReportPeriodSelect,
} from "@/components/reports/report-controls";
import { ReportPrintFrame } from "@/components/reports/report-print-frame";
import { SendReportDialog } from "@/components/reports/send-report-dialog";
import {
  usePlFinancialYearsQuery,
  usePlReportQuery,
} from "@/hooks/use-profit-loss-query";
import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { apiErrorMessage } from "@/lib/api-error";
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import {
  plGstInclusiveAtom,
  plLayoutAtom,
  plPeriodAtom,
  plRangeAtom,
  sendReportOpenAtom,
} from "@/lib/atoms";
import { periodShape, spanLabel } from "@/lib/report-periods";
import {
  PL_PERIODS,
  PL_REPORT_TYPE_ID,
  reportMoney,
} from "@/lib/reports";

const PL_TIP =
  "Income less every cost, for the period you choose. The figures are what's been recorded in Sole — coding anything still unreconciled will move them.";

/**
 * Profit & Loss.
 *
 * The answer first, then the picture, then the working: net profit and its three
 * supporting figures, a bar showing what share of income the costs took, and the
 * full ladder in a table underneath. Someone who came to check whether the month
 * was up never has to reach the table; someone who came to find out why lands on
 * it after one scroll.
 *
 * The period is the page's one input, and it scopes everything below it — cards,
 * bar and table all read the same report object, so there's no way for the
 * headline and the breakdown to describe different months.
 */
export function ProfitLossScreen() {
  const [period, setPeriod] = useAtom(plPeriodAtom);
  const [range, setRange] = useAtom(plRangeAtom);
  const [gstInclusive, setGstInclusive] = useAtom(plGstInclusiveAtom);
  const [layout, setLayout] = useAtom(plLayoutAtom);
  const setSendOpen = useSetAtom(sendReportOpenAtom);

  const {
    data: report,
    isLoading,
    isError,
    error,
    refetch,
  } = usePlReportQuery(period, range, gstInclusive);
  // Years further back than "Last financial year", offered in the period
  // control itself rather than a second year picker beside it.
  const { data: financialYears } = usePlFinancialYearsQuery();

  const empty = report ? report.blocks.length === 0 : false;
  // The header and the custom-range control need a range label before the
  // report has loaded — `periodShape` is the same synchronous engine the
  // report itself is built from, so this can't disagree with it once it lands.
  const fiscalYearStart = useFiscalYearStart();
  const shape = periodShape(period, range, undefined, fiscalYearStart);
  const rangeLabel = report?.rangeLabel ?? spanLabel(shape.current);

  const downloadReport = async (fileFormat: "pdf" | "csv" | "xlsx") => {
    try {
      const toastId = toast.loading(`Preparing ${fileFormat.toUpperCase()}...`);
      const form = new FormData();
      form.append("report_type_id", PL_REPORT_TYPE_ID);
      form.append("action", "download");
      form.append("start_date", format(shape.current.from, "yyyy-MM-dd"));
      form.append("end_date", format(shape.current.to, "yyyy-MM-dd"));
      form.append("format", fileFormat);
      form.append("gst_inclusive", gstInclusive ? "true" : "false");

      const response = await api.post(apiRoutes.reporting.reports, form, {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      // Content-Disposition header usually looks like: attachment; filename="Report.pdf"
      // we can try to extract it from response headers if needed, or just hardcode a fallback
      const contentDisposition = response.headers["content-disposition"];
      let filename = `Profit & Loss.${fileFormat}`;
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
        icon={LineChart}
        title="Profit & Loss"
        titleTip={PL_TIP}
        description="What you earned, what it cost, and what was left."
      >
        <ReportPeriodSelect
          periods={PL_PERIODS}
          value={period}
          onChange={setPeriod}
          range={range}
          onRangeChange={setRange}
          financialYears={financialYears}
        />

        <Button onClick={() => setSendOpen(true)} data-usertour="report-send">
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
            <DropdownMenuItem onSelect={() => downloadReport("xlsx")}>
              <FileSpreadsheet className="text-muted-foreground" />
              Download Excel
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
          onChange={setRange}
        />
      )}

      {/*
        Outside `ReportPrintFrame`, so none of this reaches the printed page —
        `globals.css` only unhides `.print-document` when printing.
      */}
      <div className="flex flex-wrap items-center justify-end gap-3 rounded-lg border border-dashed border-border px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="pl-layout" className="text-xs text-muted-foreground">
              Columns
            </Label>
            <ToggleGroup
              id="pl-layout"
              type="single"
              value={layout}
              onValueChange={(next) =>
                next && setLayout(next as "total" | "monthly")
              }
              className="gap-1.5"
            >
              <ToggleGroupItem
                value="total"
                variant="outline"
                size="sm"
                className="px-3 text-xs data-[state=on]:border-primary/30 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
              >
                Period total
              </ToggleGroupItem>
              <ToggleGroupItem
                value="monthly"
                variant="outline"
                size="sm"
                className="px-3 text-xs data-[state=on]:border-primary/30 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
              >
                Monthly breakdown
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex items-center gap-2">
            <Label
              htmlFor="pl-gst-inclusive"
              className="flex items-center gap-1 text-xs text-muted-foreground"
            >
              Include GST
              <InfoTip text="On: every account across Income, Cost of Sales, Expenses and LIDT includes GST. Off: all amounts exclude GST (default)." />
            </Label>
            <Switch
              id="pl-gst-inclusive"
              checked={gstInclusive}
              onCheckedChange={setGstInclusive}
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <ReportLoadingSkeleton />
      ) : isError ? (
        <ReportErrorState
          message={apiErrorMessage(error, "Couldn't load the Profit & Loss report")}
          onRetry={() => void refetch()}
        />
      ) : report ? (
        <ReportPrintFrame title="Profit & Loss" rangeLabel={rangeLabel}>
          <ProfitLossSummary report={report} empty={empty} />
          <ProfitLossBar report={report} empty={empty} />
          <ProfitLossTable report={report} empty={empty} layout={layout} />
        </ReportPrintFrame>
      ) : null}

      <SendReportDialog
        reportTypeId={PL_REPORT_TYPE_ID}
        report={{
          title: "Profit & Loss",
          period,
          rangeLabel,
          range: {
            from: format(shape.current.from, "yyyy-MM-dd"),
            to: format(shape.current.to, "yyyy-MM-dd"),
          },
          headline: report && {
            label: "Net profit",
            value: reportMoney(empty ? 0 : report.headline.netProfit.amount),
          },
        }}
        extraFields={{ gst_inclusive: gstInclusive ? "true" : "false" }}
      />
    </div>
  );
}

/** Stands in for the summary cards, bar and table while the report loads. */
function ReportLoadingSkeleton() {
  return (
    <div className="space-y-[15px]" aria-hidden>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Shimmer key={index} className="h-24 w-full rounded-lg" />
        ))}
      </div>
      <Shimmer className="h-20 w-full rounded-lg" />
      <Shimmer className="h-96 w-full rounded-lg" />
    </div>
  );
}

/**
 * A failed fetch reads nothing like an honest empty report — same shell the
 * rest of the app uses for a distinct error state, not the "no accounts yet"
 * empty state the mock preview toggle shows.
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

function comingSoon(what: string, period: string) {
  toast(`${what} is coming soon`, {
    description: `It'll cover ${period.toLowerCase()} exactly as shown here.`,
  });
}
