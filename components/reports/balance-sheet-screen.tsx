"use client";

import * as React from "react";
import { useSetAtom } from "jotai";
import {
  EllipsisVertical,
  FileSpreadsheet,
  FileText,
  Printer,
  Scale,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shimmer } from "@/components/ui/shimmer";
import { PageHeader } from "@/components/layout/page-header";
import { BalanceCheckBanner } from "@/components/reports/balance-check-banner";
import { LadderTable } from "@/components/reports/ladder-table";
import { ReportPrintFrame } from "@/components/reports/report-print-frame";
import { SendReportDialog } from "@/components/reports/send-report-dialog";
import { useBalanceSheetQuery } from "@/hooks/use-balance-sheet-query";
import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { apiErrorMessage } from "@/lib/api-error";
import { sendReportOpenAtom } from "@/lib/atoms";
import {
  BALANCE_SHEET_REPORT_TYPE_ID,
  recentFinancialYears,
} from "@/lib/balance-sheet";
import { downloadTabularReport } from "@/lib/report-table";
import { reportMoney } from "@/lib/report-periods";
import { toIsoDate } from "@/lib/invoices";

const BS_TIP =
  "What the business owns, owes and is worth, as at one date — every account, grouped into Assets, Liabilities and Equity.";

/**
 * Balance Sheet.
 *
 * Stated as at a date, not over a range — so the page's one input is which
 * financial year's end to report against, the same FY list the Depreciation
 * report already offers. Everything below it reads that one snapshot: the
 * balance check first (a real, already-computed fact worth leading with), then
 * the ladder.
 */
export function BalanceSheetScreen() {
  const today = toIsoDate(new Date());
  // The business's financial years — they end 31 March in New Zealand.
  const fiscalYearStart = useFiscalYearStart();
  const financialYears = React.useMemo(
    () => recentFinancialYears(today, fiscalYearStart),
    [today, fiscalYearStart],
  );
  const [selected, setSelected] = React.useState(financialYears[0].end);
  // Read back through the list, so a choice made before the country context
  // landed (against 30 June) falls to the newest year rather than to nothing.
  const asAt = financialYears.find((fy) => fy.end === selected) ?? financialYears[0];
  const setSendOpen = useSetAtom(sendReportOpenAtom);

  const { data: report, isLoading, isError, error, refetch } = useBalanceSheetQuery(asAt);

  const download = async (fileFormat: "pdf" | "csv") => {
    const toastId = toast.loading(`Preparing ${fileFormat.toUpperCase()}...`);
    try {
      await downloadTabularReport(
        BALANCE_SHEET_REPORT_TYPE_ID,
        { from: asAt.start, to: asAt.end },
        fileFormat,
        "Balance Sheet",
      );
      toast.success("Download started", { id: toastId });
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Couldn't download the report. Try again."), {
        id: toastId,
      });
    }
  };

  const outOfBalance = report?.validation?.rows.filter((row) => Math.abs(row.difference) >= 0.01) ?? [];

  return (
    <div className="space-y-[15px]">
      <PageHeader icon={Scale} title="Balance Sheet" titleTip={BS_TIP} description="As at one date — what the business owns, owes and is worth.">
        <Select value={asAt.end} onValueChange={setSelected}>
          <SelectTrigger className="w-40" aria-label="As at">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {financialYears.map((fy) => (
              <SelectItem key={fy.end} value={fy.end}>
                {fy.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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

      {isLoading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <ErrorState
          message={apiErrorMessage(error, "Couldn't load the Balance Sheet")}
          onRetry={() => void refetch()}
        />
      ) : report ? (
        <ReportPrintFrame title="Balance Sheet" rangeLabel={report.rangeLabel}>
          {report.validation && (
            <BalanceCheckBanner
              balanced={report.validation.isBalanced}
              title={
                report.validation.isBalanced
                  ? "In balance"
                  : "Out of balance"
              }
              description={
                report.validation.isBalanced
                  ? "Assets equal liabilities plus equity for every year shown."
                  : outOfBalance
                      .map(
                        (row) =>
                          `${row.financialYear}: off by ${reportMoney(Math.abs(row.difference))}`,
                      )
                      .join(" · ")
              }
            />
          )}
          <LadderTable
            report={report}
            emptyTitle="No accounts to show"
            emptyDescription="Nothing has been posted to the ledger as at this date yet."
          />
        </ReportPrintFrame>
      ) : null}

      <SendReportDialog
        reportTypeId={BALANCE_SHEET_REPORT_TYPE_ID}
        report={{
          title: "Balance Sheet",
          period: asAt.label,
          rangeLabel: report?.rangeLabel ?? `As at ${asAt.label}`,
          range: { from: asAt.start, to: asAt.end },
        }}
      />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-[15px]" aria-hidden>
      <Shimmer className="h-14 w-full rounded-lg" />
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
