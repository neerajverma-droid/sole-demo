"use client";

import * as React from "react";
import { useSetAtom } from "jotai";
import {
  EllipsisVertical,
  FileSpreadsheet,
  FileText,
  Printer,
  Send,
  TableProperties,
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
import { useTrialBalanceQuery } from "@/hooks/use-trial-balance-query";
import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { apiErrorMessage } from "@/lib/api-error";
import { sendReportOpenAtom } from "@/lib/atoms";
import { toIsoDate } from "@/lib/invoices";
import { downloadTabularReport } from "@/lib/report-table";
import { reportMoney } from "@/lib/report-periods";
import {
  TRIAL_BALANCE_REPORT_TYPE_ID,
  recentFinancialYears,
} from "@/lib/trial-balance";

const TB_TIP =
  "Every ledger account's closing debit or credit balance, as at one date — the check every set of books passes before a period is closed off.";

/**
 * Trial Balance.
 *
 * Point-in-time like the Balance Sheet, and for the same reason: the backend
 * reads every account's balance `entry_date <= end_date` and has no notion of
 * a range. `sole-webapp`'s own screen shows a date-range picker here anyway —
 * a leftover, not a real capability (see `lib/trial-balance.ts`) — so this
 * uses the same "as at" financial-year picker as Balance Sheet instead of
 * replicating a control that does nothing.
 */
export function TrialBalanceScreen() {
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

  const { data: report, isLoading, isError, error, refetch } = useTrialBalanceQuery(asAt);

  const download = async (fileFormat: "pdf" | "csv") => {
    const toastId = toast.loading(`Preparing ${fileFormat.toUpperCase()}...`);
    try {
      await downloadTabularReport(
        TRIAL_BALANCE_REPORT_TYPE_ID,
        { from: asAt.start, to: asAt.end },
        fileFormat,
        "Trial Balance",
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
        icon={TableProperties}
        title="Trial Balance"
        titleTip={TB_TIP}
        description="Every account's closing balance, as at one date."
      >
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
          message={apiErrorMessage(error, "Couldn't load the Trial Balance")}
          onRetry={() => void refetch()}
        />
      ) : report ? (
        <ReportPrintFrame title="Trial Balance" rangeLabel={report.rangeLabel}>
          {report.validation && (
            <BalanceCheckBanner
              balanced={report.validation.balanced}
              title={report.validation.balanced ? "In balance" : "Out of balance"}
              description={
                report.validation.balanced
                  ? `Debits and credits both total ${reportMoney(report.validation.totalDebit)}.`
                  : `Off by ${reportMoney(Math.abs(report.validation.difference))} — debits ${reportMoney(report.validation.totalDebit)}, credits ${reportMoney(report.validation.totalCredit)}.`
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
        reportTypeId={TRIAL_BALANCE_REPORT_TYPE_ID}
        report={{
          title: "Trial Balance",
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
