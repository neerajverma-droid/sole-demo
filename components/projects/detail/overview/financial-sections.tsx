"use client";

import * as React from "react";

import { Shimmer } from "@/components/ui/shimmer";
import { useProjectMoney } from "@/components/projects/project-shared";
import { useCountryContext } from "@/hooks/use-country-context";
import { useProjectFinancialMetricsQuery } from "@/hooks/use-project-overview-query";
import {
  decimalHoursToHoursMinutes,
  formatHoursMinutes,
  type ProjectFinancialMetrics,
} from "@/lib/project-overview";
import { formatMoneyIn } from "@/lib/country-context";
import { cn } from "@/lib/utils";

import {
  DonutRing,
  FigureStrip,
  HLegend,
  OVERVIEW_COLORS,
  OverviewSection,
  SectionError,
  VerticalBars,
  type Segment,
} from "./primitives";

/**
 * sole-webapp's FinancialMetricsDashboard in the design's layout: the four
 * budget cards, the budget breakdown bar, the forecast strip, the cost and
 * value charts, then the expense and task strips. One whole-of-project request
 * feeds all of it, so it loads and fails as one.
 */
export function FinancialSections({ projectId }: { projectId: string }) {
  const query = useProjectFinancialMetricsQuery(projectId);

  if (query.isLoading) return <FinancialShimmer />;
  if (query.isError || !query.data) {
    return (
      <OverviewSection title="Financials">
        <SectionError
          message="Couldn't load this project's financials."
          onRetry={() => query.refetch()}
        />
      </OverviewSection>
    );
  }
  return <FinancialBody metrics={query.data} />;
}

function FinancialBody({ metrics: m }: { metrics: ProjectFinancialMetrics }) {
  const money = useProjectMoney();
  const tick = useCompactMoney();

  // The old bar's five bands, each a share of the budget. Recognised value
  // isn't one of them, so the bar can stop short of full — as it did there.
  const breakdown: Segment[] = [
    { label: "Paid", value: m.paidValue, color: OVERVIEW_COLORS.paid },
    { label: "Invoiced", value: m.invoicedValue, color: OVERVIEW_COLORS.invoiced },
    { label: "Committed", value: m.committedValue, color: OVERVIEW_COLORS.committed },
    { label: "Future Work", value: m.futureWorkValue, color: OVERVIEW_COLORS.future },
    { label: "Uncommitted", value: m.uncommittedValue, color: OVERVIEW_COLORS.uncommitted },
  ].map((segment) => ({ ...segment, title: `${segment.label}: ${money(segment.value)}` }));

  const costSegments: Segment[] = [
    { label: "Labour", value: m.labourCost, color: OVERVIEW_COLORS.labour },
    { label: "Expenses", value: m.expenseCost, color: OVERVIEW_COLORS.expenses },
  ].map((segment) => ({ ...segment, title: `${segment.label}: ${money(segment.value)}` }));

  const budgetBase = m.totalBudget || 1;
  const signed = (value: number, loss: boolean) => `${loss ? "-" : "+"}${money(Math.abs(value))}`;

  return (
    <div className="space-y-[15px]">
      <div className="grid grid-cols-1 gap-[15px] sm:grid-cols-2 xl:grid-cols-4">
        <BudgetCard
          label="Total Budget"
          value={money(m.totalBudget)}
          sub={
            m.remainingDays == null ? "No end date set" : `${m.remainingDays} days remaining`
          }
        />
        <BudgetCard
          label="Remaining Budget"
          value={money(m.remainingBudget)}
          sub={`${m.remainingBudgetPercent}% of budget left`}
          // Under a fifth left is the old dashboard's warning line.
          tone={m.remainingBudgetPercent < 20 ? "destructive" : undefined}
        />
        <BudgetCard
          label="Current Profit and Loss"
          value={signed(m.actualProfitLoss, m.isActualLoss)}
          sub={m.isActualLoss ? "Currently at a loss" : "Currently profitable"}
          tone={m.isActualLoss ? "destructive" : "success"}
        />
        <BudgetCard
          label="Expected Profit"
          value={m.expectedProfit < 0 ? `-${money(Math.abs(m.expectedProfit))}` : money(m.expectedProfit)}
          sub={`Forecast income: ${money(m.forecastIncome)}`}
          tone={m.isForecastLoss ? "destructive" : "success"}
        />
      </div>

      <OverviewSection title="Budget Breakdown">
        <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-muted">
          {breakdown.map((segment) => {
            const width = Math.max(0, (segment.value / budgetBase) * 100);
            if (width === 0) return null;
            return (
              <span
                key={segment.label}
                className="h-full"
                style={{ width: `${width}%`, background: `hsl(${segment.color})` }}
                title={segment.title}
              />
            );
          })}
        </div>
        <HLegend
          items={breakdown.map((segment) => ({
            label: segment.label,
            color: segment.color,
            value: money(segment.value),
          }))}
        />
      </OverviewSection>

      <OverviewSection>
        <FigureStrip
          items={[
            { label: "Forecast Income", value: money(m.forecastIncome) },
            { label: "Forecast Cost", value: money(m.forecastCost) },
            { label: "Total Cost Incurred", value: money(m.totalCostIncurred) },
            { label: "Remaining Cash to Collect", value: money(m.remainingCashToCollect) },
            { label: "Total Recognised Income", value: money(m.totalRecognisedRevenue) },
          ]}
        />
      </OverviewSection>

      <div className="grid grid-cols-1 gap-[15px] lg:grid-cols-2">
        <OverviewSection title="Cost Breakdown">
          {/* The legend sits straight under the ring, as the old chart had it. */}
          <div className="flex justify-center pt-1">
            <DonutRing segments={costSegments} size={170}>
              <span className="text-[11px] text-muted-foreground">Total</span>
              <span className="text-lg font-semibold tabular">
                {money(m.labourCost + m.expenseCost)}
              </span>
            </DonutRing>
          </div>
          <HLegend
            className="mt-3 justify-center"
            items={costSegments.map((segment) => ({
              label: segment.label,
              color: segment.color,
              value: money(segment.value),
            }))}
          />
        </OverviewSection>

        <OverviewSection title="Value Distribution">
          <VerticalBars items={breakdown} formatTick={tick} />
        </OverviewSection>
      </div>

      <OverviewSection title="Expenses">
        <FigureStrip
          items={[
            { label: "Total Expenses", value: money(m.totalExpenses) },
            { label: "Billed Expenses", value: money(m.invoicedExpenses) },
            { label: "Unbilled Expenses", value: money(m.uninvoicedExpenses) },
            {
              label: "Expense Margin",
              value: `${m.expenseMarginPercent}%`,
              tone: m.expenseMarginPercent < 0 ? "destructive" : undefined,
            },
          ]}
        />
      </OverviewSection>

      <OverviewSection>
        <FigureStrip
          items={[
            { label: "Total Task Value", value: money(m.totalTaskValue) },
            { label: "Total Tasks", value: m.totalTasks },
            { label: "Completed Tasks", value: m.completedTasks },
            { label: "Invoiced Tasks", value: m.invoicedTasks },
            { label: "Labour Cost", value: money(m.totalLabourCost) },
            {
              label: "Tracked Hours",
              value: formatHoursMinutes(decimalHoursToHoursMinutes(m.totalTrackedHours)),
            },
          ]}
        />
      </OverviewSection>
    </div>
  );
}

function BudgetCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "success" | "destructive";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-[15px] shadow-sm">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 truncate text-xl font-bold leading-tight tracking-tight tabular",
          tone === "success" && "text-success",
          tone === "destructive" && "text-destructive",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

/** "$5K" for the value axis, in the business's currency — full amounts crowd it. */
function useCompactMoney(): (value: number) => string {
  const { country } = useCountryContext();
  return React.useMemo(() => {
    const ctx = { locale: country.locale, currency: country.currency };
    return (value: number) => formatMoneyIn(ctx, value, { notation: "compact", maximumFractionDigits: 1 });
  }, [country.locale, country.currency]);
}

function FinancialShimmer() {
  return (
    <div className="space-y-[15px]" aria-busy>
      <div className="grid grid-cols-1 gap-[15px] sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Shimmer key={index} className="h-[96px] rounded-lg border border-border" />
        ))}
      </div>
      <Shimmer className="h-[112px] rounded-lg border border-border" />
      <Shimmer className="h-[96px] rounded-lg border border-border" />
      <div className="grid grid-cols-1 gap-[15px] lg:grid-cols-2">
        <Shimmer className="h-[290px] rounded-lg border border-border" />
        <Shimmer className="h-[290px] rounded-lg border border-border" />
      </div>
    </div>
  );
}
