"use client";

import { useAtom } from "jotai";
import { Table2 } from "lucide-react";

import { TabularReportScreen } from "@/components/reports/tabular-report-screen";
import { tlPeriodAtom, tlRangeAtom } from "@/lib/atoms";
import { transactionListingConfig } from "@/lib/report-configs";

/**
 * Transaction Listing.
 *
 * What the original Reports page offered, and only that: pick a period, see
 * every transaction in it as the backend lists it — one row each — page
 * through, download or send. It runs on the shared tabular report.
 *
 * The richer screen (`transaction-listing-screen.tsx`: money in / out, GST
 * total, category groups) is set aside, not deleted: it worked out each row's
 * direction from a fixed list of category names that doesn't hold the chart of
 * accounts' own, so every row read as money in. It can come back once the
 * direction is read from the bank transaction itself.
 */
export function TransactionListingReport() {
  const [period, setPeriod] = useAtom(tlPeriodAtom);
  const [range, setRange] = useAtom(tlRangeAtom);

  return (
    <TabularReportScreen
      config={transactionListingConfig}
      icon={Table2}
      period={period}
      onPeriodChange={setPeriod}
      range={range}
      onRangeChange={setRange}
      defaultPageSize={50}
      emptyIcon={Table2}
      emptyTitle="No transactions in this period"
      emptyDescription="Nothing has been coded between these dates. Widen the date range above, or record what you've been paid and spent and it will appear here."
      emptyAction={{ label: "Go to Transactions", href: "/transactions" }}
    />
  );
}
