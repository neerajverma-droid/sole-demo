"use client";

import { useAtom } from "jotai";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Wallet } from "lucide-react";

import { ReportStatCard } from "@/components/reports/report-stat-card";
import { TabularReportScreen } from "@/components/reports/tabular-report-screen";
import { cashFlowPeriodAtom, cashFlowRangeAtom } from "@/lib/atoms";
import { cashFlowConfig } from "@/lib/report-configs";
import type { ReportSummaryFigure } from "@/lib/report-table";

/** The card each of the backend's three summary labels becomes. */
const FIGURE_ICON: Record<string, { icon: typeof ArrowUpRight; tone: "success" | "accent" | "primary" }> = {
  "Total Cash Inflows": { icon: ArrowUpRight, tone: "success" },
  "Total Cash Outflows": { icon: ArrowDownLeft, tone: "accent" },
  "Net Cash Movement": { icon: Wallet, tone: "primary" },
};

/**
 * Cash Flows.
 *
 * The shared tabular report, plus the one thing this report has that the
 * others don't: `sole-ocr` computes period totals for it (inflow, outflow,
 * net) and the old `sole-webapp` frontend actually showed them as cards above
 * the table — so this reads `report.summary` (only Cash Flow's endpoint sends
 * one) into the same `ReportStatCard` every other report's headline uses.
 *
 * Liquidity, not profit: this counts money as it crosses a bank, cash or
 * clearing account, not as it's earned — an invoice raised on credit shows up
 * here only once it's actually paid.
 */
export function CashFlowScreen() {
  const [period, setPeriod] = useAtom(cashFlowPeriodAtom);
  const [range, setRange] = useAtom(cashFlowRangeAtom);

  return (
    <TabularReportScreen
      config={cashFlowConfig}
      icon={ArrowLeftRight}
      period={period}
      onPeriodChange={setPeriod}
      range={range}
      onRangeChange={setRange}
      defaultPageSize={50}
      emptyIcon={ArrowLeftRight}
      emptyTitle="No cash movement in this period"
      emptyDescription="Nothing hit a bank, cash or clearing account between the two dates. Reconciled bank transactions will appear here."
      summary={(figures) => <SummaryCards figures={figures} />}
    />
  );
}

function SummaryCards({ figures }: { figures: ReportSummaryFigure[] }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      {figures.map((figure) => {
        const spec = FIGURE_ICON[figure.label] ?? { icon: Wallet, tone: "primary" as const };
        return (
          <ReportStatCard
            key={figure.label}
            icon={spec.icon}
            tone={spec.tone}
            label={figure.label}
            tip={`${figure.label}, summed over the period shown.`}
            value={figure.amount}
          />
        );
      })}
    </dl>
  );
}
