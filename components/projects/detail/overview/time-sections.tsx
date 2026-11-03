"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Clock } from "lucide-react";

import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { useProjectMoney } from "@/components/projects/project-shared";
import {
  useProjectBillableBreakdownQuery,
  useProjectOverdueQuery,
  useProjectStatsSummaryQuery,
  useProjectTaskStatusQuery,
  useProjectTimeChartQuery,
} from "@/hooks/use-project-overview-query";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import {
  DEFAULT_PROJECT_STATS_PERIOD,
  formatHoursMinutes,
  type ProjectStatsPeriod,
  type ProjectTimePoint,
} from "@/lib/project-overview";
import { formatProjectDate } from "@/lib/projects";
import { cn } from "@/lib/utils";

import {
  ChartEmpty,
  DonutRing,
  FigureStrip,
  HLegend,
  OVERVIEW_COLORS,
  OverviewSection,
  PeriodSelect,
  SectionError,
  SectionShimmer,
  HalfDonut,
  hsl,
} from "./primitives";

/*
 * The period-scoped widgets. Each keeps its own period, as each had its own
 * dropdown in sole-webapp — "This Week" to start, like there.
 */

function usePeriod() {
  return React.useState<ProjectStatsPeriod>(DEFAULT_PROJECT_STATS_PERIOD);
}

/* ------------------------------------------------------------------ *
 * Time & task summary (old StatsGrid)
 * ------------------------------------------------------------------ */

export function TimeSummarySection({ projectId }: { projectId: string }) {
  const money = useProjectMoney();
  const [period, setPeriod] = usePeriod();
  const query = useProjectStatsSummaryQuery(projectId, period);
  const stats = query.data;

  return (
    <OverviewSection
      action={<PeriodSelect value={period} onChange={setPeriod} label="Time summary period" />}
    >
      {query.isLoading ? (
        <SectionShimmer className="h-[150px]" />
      ) : query.isError || !stats ? (
        <SectionError message="Couldn't load tracked time." onRetry={() => query.refetch()} />
      ) : (
        <>
          <FigureStrip
            items={[
              { label: "Total Tracked", value: formatHoursMinutes(stats.totalTracked) },
              { label: "Billable Hours", value: formatHoursMinutes(stats.billableHours) },
              { label: "Billable Amount", value: money(stats.billableAmount) },
              { label: "Non-Billable Hours", value: formatHoursMinutes(stats.nonBillableHours) },
            ]}
          />
          <div className="my-4 border-t border-border" />
          <FigureStrip
            items={[
              { label: "Total Tasks", value: stats.totalTasks },
              { label: "Completed", value: stats.completedTasks },
              { label: "Remaining", value: stats.remainingTasks },
              {
                label: "Progress",
                value: <ProgressValue percent={stats.progress} />,
              },
            ]}
          />
        </>
      )}
    </OverviewSection>
  );
}

function ProgressValue({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <span className="flex items-center gap-3 pt-1.5">
      <span
        className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Tasks completed"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className="block h-full rounded-full bg-primary" style={{ width: `${clamped}%` }} />
      </span>
      <span className="text-sm font-semibold">{percent}%</span>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Time tracked (old Timetrackedchart)
 * ------------------------------------------------------------------ */

const timeChartConfig = {
  billable: { label: "Billable", color: hsl(OVERVIEW_COLORS.billable) },
  nonBillable: { label: "Non Billable", color: hsl(OVERVIEW_COLORS.nonBillable) },
} satisfies ChartConfig;

/** The old chart's y-axis: at least 10h, then rounded up to 5s or 10s. */
function hourAxis(points: ProjectTimePoint[]): { max: number; ticks: number[] } {
  const peak = Math.max(0, ...points.flatMap((point) => [point.billable, point.nonBillable]));
  const max = peak <= 10 ? 10 : peak <= 50 ? Math.ceil(peak / 5) * 5 : Math.ceil(peak / 10) * 10;
  const step = max <= 10 ? 2 : max <= 50 ? 5 : 10;
  return { max, ticks: Array.from({ length: max / step + 1 }, (_, index) => index * step) };
}

export function TimeTrackedSection({
  projectId,
  className,
}: {
  projectId: string;
  className?: string;
}) {
  const [period, setPeriod] = usePeriod();
  const [showBillable, setShowBillable] = React.useState(true);
  const [showNonBillable, setShowNonBillable] = React.useState(true);
  const query = useProjectTimeChartQuery(projectId, period);
  const reducedMotion = usePrefersReducedMotion();
  const points = query.data ?? [];
  const axis = hourAxis(points);
  // A year is 365 daily points — dots there are just noise on the line.
  const dots = points.length <= 31;

  return (
    <OverviewSection
      className={className}
      title="Time Tracked"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelect value={period} onChange={setPeriod} label="Time tracked period" />
          <SeriesToggle
            label="Billable"
            color={OVERVIEW_COLORS.billable}
            on={showBillable}
            onToggle={() => setShowBillable((on) => !on)}
          />
          <SeriesToggle
            label="Non Billable"
            color={OVERVIEW_COLORS.nonBillable}
            on={showNonBillable}
            onToggle={() => setShowNonBillable((on) => !on)}
          />
        </div>
      }
    >
      {query.isLoading ? (
        <SectionShimmer className="h-[220px]" />
      ) : query.isError ? (
        <SectionError message="Couldn't load tracked time." onRetry={() => query.refetch()} />
      ) : points.length === 0 ? (
        <ChartEmpty
          title="No time tracked"
          description="Time logged against this project's tasks appears here."
        />
      ) : (
        <ChartContainer config={timeChartConfig} className="aspect-auto h-[220px] w-full">
          <AreaChart data={points} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              minTickGap={16}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={40}
              domain={[0, axis.max]}
              ticks={axis.ticks}
              tickFormatter={(value: number) => `${value}h`}
              className="tabular"
            />
            <ChartTooltip content={<HoursTooltip />} />
            {showBillable && (
              <Area
                dataKey="billable"
                type="monotone"
                stroke="var(--color-billable)"
                strokeWidth={2.5}
                fill="var(--color-billable)"
                fillOpacity={0.1}
                dot={dots ? { r: 3.5, fill: "hsl(var(--card))", strokeWidth: 2 } : false}
                isAnimationActive={!reducedMotion}
              />
            )}
            {showNonBillable && (
              <Area
                dataKey="nonBillable"
                type="monotone"
                stroke="var(--color-nonBillable)"
                strokeWidth={2.5}
                fill="var(--color-nonBillable)"
                fillOpacity={0.1}
                dot={dots ? { r: 3.5, fill: "hsl(var(--card))", strokeWidth: 2 } : false}
                isAnimationActive={!reducedMotion}
              />
            )}
          </AreaChart>
        </ChartContainer>
      )}
    </OverviewSection>
  );
}

/** The old chart's legend doubled as a show/hide switch per series. */
function SeriesToggle({
  label,
  color,
  on,
  onToggle,
}: {
  label: string;
  color: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
        on ? "text-foreground hover:bg-muted" : "text-muted-foreground line-through hover:bg-muted",
      )}
    >
      <span
        aria-hidden
        className="size-[11px] rounded-[3px]"
        style={{ background: on ? hsl(color) : "hsl(var(--muted-foreground) / 0.4)" }}
      />
      {label}
    </button>
  );
}

type TooltipPayload = { dataKey?: string | number; value?: number; color?: string };

function HoursTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="grid min-w-[8rem] gap-1.5 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
      <div className="font-medium">{label}</div>
      {payload.map((item) => {
        const key = String(item.dataKey) as keyof typeof timeChartConfig;
        return (
          <div key={key} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-[2px]" style={{ background: item.color }} />
            <span className="flex-1 text-muted-foreground">{timeChartConfig[key]?.label}</span>
            <span className="font-medium tabular">{item.value ?? 0}h</span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Billable vs non-billable (old Billabledonutchart)
 * ------------------------------------------------------------------ */

export function BillableSplitSection({ projectId }: { projectId: string }) {
  const [period, setPeriod] = usePeriod();
  const query = useProjectBillableBreakdownQuery(projectId, period);
  const data = query.data;
  // As sole-webapp's chart: non-billable is whatever billable isn't, so a
  // project with no billable time reads 100% non-billable even at 0h 0m.
  const billable = data?.percentage ?? 0;
  const nonBillable = 100 - billable;

  return (
    <OverviewSection
      title="Billable vs Non-Billable"
      action={<PeriodSelect value={period} onChange={setPeriod} label="Billable split period" />}
    >
      {query.isLoading ? (
        <SectionShimmer className="h-[230px]" />
      ) : query.isError || !data ? (
        <SectionError message="Couldn't load the billable split." onRetry={() => query.refetch()} />
      ) : (
        <>
          <div className="flex justify-center pt-1">
            <HalfDonut
              segments={[
                {
                  label: "Billable",
                  value: billable,
                  color: OVERVIEW_COLORS.billable,
                  title: `Billable: ${billable}%`,
                },
                {
                  label: "Non-Billable",
                  value: nonBillable,
                  color: OVERVIEW_COLORS.nonBillable,
                  title: `Non-Billable: ${nonBillable}%`,
                },
              ]}
            >
              <span className="text-xl font-semibold tabular">
                {formatHoursMinutes(data.total)}
              </span>
            </HalfDonut>
          </div>
          <HLegend
            className="justify-center"
            items={[
              { label: `${billable}% Billable`, color: OVERVIEW_COLORS.billable },
              { label: `${nonBillable}% Non-Billable`, color: OVERVIEW_COLORS.nonBillable },
            ]}
          />
        </>
      )}
    </OverviewSection>
  );
}

/* ------------------------------------------------------------------ *
 * Task status (old Taskstatuspiechart)
 * ------------------------------------------------------------------ */

export function TaskStatusSection({
  projectId,
  className,
}: {
  projectId: string;
  className?: string;
}) {
  const [period, setPeriod] = usePeriod();
  const query = useProjectTaskStatusQuery(projectId, period);
  const counts = query.data;
  const total = counts ? counts.active + counts.inactive + counts.completed : 0;
  const share = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);
  const segments = counts
    ? [
        { label: "Active", value: counts.active, color: OVERVIEW_COLORS.active },
        { label: "Inactive", value: counts.inactive, color: OVERVIEW_COLORS.inactive },
        { label: "Completed", value: counts.completed, color: OVERVIEW_COLORS.completed },
      ].map((segment) => ({
        ...segment,
        title: `${segment.label}: ${segment.value} (${share(segment.value)}%)`,
      }))
    : [];

  return (
    <OverviewSection
      className={className}
      title="Task Status"
      action={<PeriodSelect value={period} onChange={setPeriod} label="Task status period" />}
    >
      {query.isLoading ? (
        <SectionShimmer className="h-[230px]" />
      ) : query.isError || !counts ? (
        <SectionError message="Couldn't load task status." onRetry={() => query.refetch()} />
      ) : total === 0 ? (
        <ChartEmpty
          title="No task data"
          description="Tasks created in this period appear here by status."
        />
      ) : (
        <>
          <div className="flex justify-center pt-2">
            <DonutRing segments={segments} size={150}>
              <span className="text-lg font-semibold tabular">{total}</span>
              <span className="text-[11px] text-muted-foreground">Tasks</span>
            </DonutRing>
          </div>
          <HLegend
            className="justify-center"
            items={segments.map((segment) => ({
              label: segment.label,
              color: segment.color,
              value: segment.value,
            }))}
          />
        </>
      )}
    </OverviewSection>
  );
}

/* ------------------------------------------------------------------ *
 * Overdue (old Overduetaskslist)
 * ------------------------------------------------------------------ */

/**
 * The route only knows whether the project itself is past its end date, so
 * the list is at most one row. The period dropdown is kept because the old
 * widget had one, though the server's answer doesn't depend on it.
 */
export function OverdueSection({ projectId }: { projectId: string }) {
  const [period, setPeriod] = usePeriod();
  const query = useProjectOverdueQuery(projectId, period);
  const overdue = query.data;

  return (
    <OverviewSection
      title="Overdue Tasks"
      action={<PeriodSelect value={period} onChange={setPeriod} label="Overdue period" />}
    >
      {query.isLoading ? (
        <SectionShimmer className="h-[230px]" />
      ) : query.isError || !overdue ? (
        <SectionError message="Couldn't load overdue status." onRetry={() => query.refetch()} />
      ) : !overdue.isOverdue ? (
        <ChartEmpty title="No overdue tasks" />
      ) : (
        <div className="flex items-center gap-3 py-2.5">
          <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
            <Clock className="size-3.5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">Project deadline exceeded</span>
            <span className="block text-xs text-muted-foreground">
              Due {formatProjectDate(overdue.endDate)}
            </span>
          </span>
          <span className="whitespace-nowrap text-xs font-semibold text-destructive tabular">
            {overdue.daysOverdue} {overdue.daysOverdue === 1 ? "day" : "days"} overdue
          </span>
        </div>
      )}
    </OverviewSection>
  );
}
