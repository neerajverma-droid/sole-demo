"use client";

import * as React from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import { LineChart, TrendingDown, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import {
  CASH_FLOW_PERIODS,
  COMPARE_MODES,
  cashFlowSeries,
  compareSuffix,
  comparisonRange,
  defaultCustomRange,
  percentChange,
  periodRange,
  rangeLabel,
  totalsFor,
  type CashFlowPeriod,
  type CashFlowSeriesPoint,
  type CompareMode,
  type CustomRange,
} from "@/lib/cash-flow";
import { money } from "@/lib/dashboard-data";
import type { CashFlowMonth } from "@/lib/dashboard";
import { useDashboardCashFlowQuery } from "@/hooks/use-dashboard-query";
import { cn } from "@/lib/utils";
import { activeCurrencySymbol } from "@/lib/country-context";

const chartConfig = {
  moneyIn: { label: "Money in", color: "hsl(var(--chart-in))" },
  // Money out is the warm secondary — the second series, not a shade of the first.
  moneyOut: { label: "Money out", color: "hsl(var(--chart-out))" },
} satisfies ChartConfig;

/** The comparison sits behind the current period at roughly a third strength. */
const COMPARE_OPACITY = 0.35;

export function CashFlowChart() {
  const { data, isLoading } = useDashboardCashFlowQuery();
  const months = data ?? [];
  const hasData = months.length > 0;

  const [period, setPeriod] = React.useState<CashFlowPeriod>("Last 6 months");
  const [custom, setCustom] = React.useState<CustomRange | null>(null);
  const [comparing, setComparing] = React.useState(true);
  const [mode, setMode] = React.useState<CompareMode>("Same period last year");

  const effectiveCustom = custom ?? defaultCustomRange(months);
  const range = periodRange(months, period, effectiveCustom);
  const compareTo = comparing ? comparisonRange(range, mode) : null;
  const series = cashFlowSeries(months, range, compareTo);

  const totals = totalsFor(months, range);
  const baseline = compareTo ? totalsFor(months, compareTo) : null;

  return (
    <Card>
      {/* The header, not the card: the card is taller than a laptop screen
          leaves room for, and this is where the controls the tour describes
          are. */}
      <CardHeader data-usertour="dashboard-cash-flow" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Cash flow</CardTitle>
            <p className="text-xs text-muted-foreground">
              Money in vs money out · {rangeLabel(months, range)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <PeriodSelect
              months={months}
              period={period}
              onPeriodChange={setPeriod}
              custom={effectiveCustom}
              onCustomChange={setCustom}
            />
            <CompareControl
              on={comparing}
              onOnChange={setComparing}
              mode={mode}
              onModeChange={setMode}
            />
          </div>
        </div>

        {hasData && (
          <DeltaSummary
            totals={totals}
            baseline={baseline}
            suffix={
              comparing
                ? compareTo
                  ? compareSuffix(mode)
                  : "no comparable history"
                : null
            }
          />
        )}
      </CardHeader>

      <CardContent>
        {hasData ? (
          <Chart series={series} comparing={!!compareTo} />
        ) : (
          <EmptyChart loading={isLoading} />
        )}
      </CardContent>
    </Card>
  );
}

function PeriodSelect({
  months,
  period,
  onPeriodChange,
  custom,
  onCustomChange,
}: {
  months: CashFlowMonth[];
  period: CashFlowPeriod;
  onPeriodChange: (period: CashFlowPeriod) => void;
  custom: CustomRange;
  onCustomChange: (range: CustomRange) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Select
        value={period}
        onValueChange={(value) => onPeriodChange(value as CashFlowPeriod)}
      >
        <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Period">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CASH_FLOW_PERIODS.map((option) => (
            <SelectItem key={option} value={option} className="text-xs">
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Only offered once Custom is chosen — a month-range picker sitting
          permanently beside a period that already knows its months is a control
          with nothing to do. */}
      {period === "Custom" && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              Choose months
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 space-y-3">
            {/* Months, not days: the underlying figures are monthly, and a day
                picker would promise a precision the data doesn't have. */}
            <MonthSelect
              months={months}
              id="cash-flow-from"
              label="From"
              value={custom.fromKey}
              onChange={(fromKey) => onCustomChange({ ...custom, fromKey })}
            />
            <MonthSelect
              months={months}
              id="cash-flow-to"
              label="To"
              value={custom.toKey}
              onChange={(toKey) => onCustomChange({ ...custom, toKey })}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function MonthSelect({
  months,
  id,
  label,
  value,
  onChange,
}: {
  months: CashFlowMonth[];
  id: string;
  label: string;
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {months.map((month) => (
            <SelectItem key={month.key} value={month.key} className="text-xs">
              {month.month} {month.year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CompareControl({
  on,
  onOnChange,
  mode,
  onModeChange,
}: {
  on: boolean;
  onOnChange: (on: boolean) => void;
  mode: CompareMode;
  onModeChange: (mode: CompareMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
        <Switch
          id="cash-flow-compare"
          checked={on}
          onCheckedChange={onOnChange}
        />
        <Label
          htmlFor="cash-flow-compare"
          className="text-xs font-normal text-muted-foreground"
        >
          Compare to
        </Label>
      </div>

      {/* Only while there's a comparison to choose the basis of. */}
      {on && (
        // A segmented control rather than two outline toggles: this is one
        // choice with two answers, and the toggle group said so only through
        // `bg-accent` — a grey a shade off the card, which read as neither
        // option being selected. The brand fill is the same one the Geographic
        // insights metric toggle uses for the same job.
        <Tabs
          value={mode}
          onValueChange={(value) => onModeChange(value as CompareMode)}
        >
          <TabsList className="h-8" aria-label="Comparison period">
            {COMPARE_MODES.map((option) => (
              <TabsTrigger
                key={option}
                value={option}
                className="h-6 text-xs font-normal data-[state=active]:bg-primary data-[state=active]:font-medium data-[state=active]:text-primary-foreground"
              >
                {option}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
    </div>
  );
}

/**
 * The three figures the chart is there to answer, stated before it.
 *
 * Direction and goodness are separate: money out rising is an up arrow and a
 * red one, because more money leaving isn't an improvement. Only money in and
 * net read green when they climb.
 */
function DeltaSummary({
  totals,
  baseline,
  suffix,
}: {
  totals: { moneyIn: number; moneyOut: number; net: number };
  baseline: { moneyIn: number; moneyOut: number; net: number } | null;
  suffix: string | null;
}) {
  const figures = [
    {
      label: "Money in",
      value: totals.moneyIn,
      change: baseline ? percentChange(totals.moneyIn, baseline.moneyIn) : null,
      upIsGood: true,
    },
    {
      label: "Money out",
      value: totals.moneyOut,
      change: baseline
        ? percentChange(totals.moneyOut, baseline.moneyOut)
        : null,
      upIsGood: false,
    },
    {
      label: "Net",
      value: totals.net,
      change: baseline ? percentChange(totals.net, baseline.net) : null,
      upIsGood: true,
    },
  ];

  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {figures.map((figure) => {
        const up = figure.change !== null && figure.change >= 0;
        const good = up === figure.upIsGood;
        const Arrow = up ? TrendingUp : TrendingDown;

        return (
          <div key={figure.label} className="rounded-md border p-3">
            <dt className="text-xs text-muted-foreground">{figure.label}</dt>
            <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-lg font-semibold tracking-tight tabular">
                {money(figure.value)}
              </span>
              {figure.change === null ? (
                suffix && (
                  <span className="text-xs text-muted-foreground">
                    {suffix === "no comparable history" ? suffix : "—"}
                  </span>
                )
              ) : (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-xs font-medium",
                    good ? "text-success" : "text-destructive",
                  )}
                >
                  <Arrow className="size-3.5" aria-hidden />
                  <span className="tabular">
                    {Math.abs(figure.change).toFixed(0)}%
                  </span>
                  <span className="font-normal text-muted-foreground">
                    {suffix}
                  </span>
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function Chart({
  series,
  comparing,
}: {
  series: CashFlowSeriesPoint[];
  comparing: boolean;
}) {
  // Recharts animates in JavaScript, so the stylesheet's reduced-motion block
  // never reaches it — the preference has to be read here and passed on.
  const reducedMotion = usePrefersReducedMotion();

  return (
    <ChartContainer config={chartConfig} className="h-[360px] w-full">
      <ComposedChart data={series} margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          {/* Three stops so the fill falls away rather than banding. */}
          <linearGradient id="fillMoneyIn" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-moneyIn)"
              stopOpacity={0.45}
            />
            <stop
              offset="55%"
              stopColor="var(--color-moneyIn)"
              stopOpacity={0.12}
            />
            <stop
              offset="100%"
              stopColor="var(--color-moneyIn)"
              stopOpacity={0}
            />
          </linearGradient>
          <linearGradient id="fillMoneyOut" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-moneyOut)"
              stopOpacity={0.3}
            />
            <stop
              offset="100%"
              stopColor="var(--color-moneyOut)"
              stopOpacity={0}
            />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          className="text-xs"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tickMargin={8}
          className="text-xs tabular"
          tickFormatter={(value: number) => `${activeCurrencySymbol()}${Math.round(value / 1000)}k`}
        />
        <ChartTooltip content={<CashFlowTooltip />} />

        {/* Declared first so they render behind: the comparison is context for
            the current period, not a peer of it. Lines rather than areas —
            two more filled shapes would turn the plot into mud. */}
        {comparing && (
          <Line
            dataKey="compareOut"
            type="monotone"
            stroke="var(--color-moneyOut)"
            strokeOpacity={COMPARE_OPACITY}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            activeDot={false}
            isAnimationActive={!reducedMotion}
            // Null months (a comparison period shorter than the current one)
            // leave a gap rather than a line drawn through nothing.
            connectNulls={false}
          />
        )}
        {comparing && (
          <Line
            dataKey="compareIn"
            type="monotone"
            stroke="var(--color-moneyIn)"
            strokeOpacity={COMPARE_OPACITY}
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
            activeDot={false}
            isAnimationActive={!reducedMotion}
            connectNulls={false}
          />
        )}

        <Area
          dataKey="moneyOut"
          type="monotone"
          stroke="var(--color-moneyOut)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          fill="url(#fillMoneyOut)"
          isAnimationActive={!reducedMotion}
        />
        <Area
          dataKey="moneyIn"
          type="monotone"
          stroke="var(--color-moneyIn)"
          strokeWidth={2.5}
          fill="url(#fillMoneyIn)"
          isAnimationActive={!reducedMotion}
        />
      </ComposedChart>
    </ChartContainer>
  );
}

/**
 * Both periods for the hovered month, and the gap between them.
 *
 * Its own component rather than ChartTooltipContent: that one lists whatever
 * series are present, which here would be four unlabelled rows. The question is
 * "this month against that month", so the two are paired and differenced.
 */
function CashFlowTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: CashFlowSeriesPoint }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  const rows = [
    {
      label: "Money in",
      swatch: "bg-chart-in",
      current: point.moneyIn,
      compare: point.compareIn,
    },
    {
      label: "Money out",
      swatch: "bg-chart-out",
      current: point.moneyOut,
      compare: point.compareOut,
    },
  ];

  return (
    <div className="min-w-[13rem] rounded-lg border bg-background px-2.5 py-2 text-xs shadow-xl">
      <p className="font-medium">
        {point.currentLabel}
        {point.compareLabel && (
          <span className="font-normal text-muted-foreground">
            {" "}
            vs {point.compareLabel}
          </span>
        )}
      </p>

      <dl className="mt-2 space-y-2">
        {rows.map((row) => {
          const difference =
            row.compare === null ? null : row.current - row.compare;

          return (
            <div key={row.label} className="space-y-1">
              <div className="flex items-center justify-between gap-4">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <span
                    className={cn("size-2 shrink-0 rounded-sm", row.swatch)}
                    aria-hidden
                  />
                  {row.label}
                </dt>
                <dd className="font-medium tabular">{money(row.current)}</dd>
              </div>

              {row.compare !== null && (
                <div className="flex items-center justify-between gap-4 pl-3.5 text-muted-foreground">
                  <dt>{point.compareLabel}</dt>
                  <dd className="tabular">{money(row.compare)}</dd>
                </div>
              )}

              {difference !== null && (
                <div className="flex items-center justify-between gap-4 pl-3.5">
                  <dt className="text-muted-foreground">Difference</dt>
                  <dd className="tabular font-medium">
                    {difference >= 0 ? "+" : "−"}
                    {money(Math.abs(difference))}
                  </dd>
                </div>
              )}
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function EmptyChart({ loading }: { loading?: boolean }) {
  return (
    <Empty className="h-[360px] justify-center border-0 bg-transparent shadow-none">
      <EmptyMedia>
        <LineChart aria-hidden />
      </EmptyMedia>
      <div className="space-y-1">
        <EmptyTitle>{loading ? "Loading…" : "No transactions yet"}</EmptyTitle>
        {!loading && (
          <EmptyDescription>
            Record your first income or expense and this chart will show your
            cash flow across the year.
          </EmptyDescription>
        )}
      </div>
      {!loading && (
      <EmptyActions>
        <Button variant="outline" size="sm" asChild>
          <a href="/transactions">Record a transaction</a>
        </Button>
      </EmptyActions>
      )}
    </Empty>
  );
}
