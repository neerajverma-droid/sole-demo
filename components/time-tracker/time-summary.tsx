"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { FileText, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shimmer } from "@/components/ui/shimmer";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectMoney } from "@/components/projects/project-shared";
import { useTimeBreakdownQuery, useTimeStatsQuery } from "@/hooks/use-time-tracker-query";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import {
  STATS_RANGES,
  formatHoursMinutes,
  initials,
  type BreakdownGroup,
  type StatsRange,
} from "@/lib/time-tracker";

/** The design's two-way toggle ("Time | Amount", "Client | Project"), as the app's Tabs. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as T)}>
      <TabsList aria-label={label}>
        {options.map((option) => (
          <TabsTrigger key={option.value} value={option.value}>
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function RangeSelect({ value, onChange, label }: { value: StatsRange; onChange: (value: StatsRange) => void; label: string }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as StatsRange)}>
      <SelectTrigger className="h-9 w-[140px]" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATS_RANGES.map((range) => (
          <SelectItem key={range.value} value={range.value}>
            {range.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center text-sm text-muted-foreground">
      <TriangleAlert className="size-5" aria-hidden />
      <p>{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

const chartConfig = {
  billable: { label: "Billable", color: "hsl(var(--chart-in))" },
  nonBillable: { label: "Non-billable", color: "hsl(var(--chart-in-soft))" },
} satisfies ChartConfig;

type Mode = "time" | "amount";

function TrackedTimeCard() {
  const money = useProjectMoney();
  const reducedMotion = usePrefersReducedMotion();
  const [mode, setMode] = React.useState<Mode>("time");
  const [range, setRange] = React.useState<StatsRange>("week");
  const query = useTimeStatsQuery(range);
  const stats = query.data;
  const amountMode = mode === "amount";

  const points = (stats?.days ?? []).map((day) => {
    const date = parseISO(day.date);
    return {
      label: (stats?.days.length ?? 0) <= 7 ? format(date, "d EEE") : format(date, "d"),
      full: format(date, "EEE d MMM"),
      billable: amountMode ? day.billableAmount : day.billableHours,
      nonBillable: amountMode ? day.nonBillableAmount : day.nonBillableHours,
    };
  });

  const figures = stats
    ? amountMode
      ? [
          { label: "Total amount", value: money(stats.totalAmount) },
          { label: "Billable amount", value: money(stats.billableAmount) },
          { label: "Non-billable amount", value: money(stats.nonBillableAmount) },
        ]
      : [
          { label: "Total hours", value: formatHoursMinutes(stats.totalHours) },
          { label: "Billable hours", value: formatHoursMinutes(stats.billableHours) },
          { label: "Non-billable hours", value: formatHoursMinutes(stats.nonBillableHours) },
        ]
    : [];

  const loading = query.isLoading || query.isPlaceholderData;

  return (
    <section aria-label="Time tracked" className="rounded-lg border border-border bg-card p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Show"
          value={mode}
          onChange={setMode}
          options={[
            { value: "time", label: "Time" },
            { value: "amount", label: "Amount" },
          ]}
        />
        <RangeSelect value={range} onChange={setRange} label="Tracked time period" />
      </div>

      {query.isError && !stats ? (
        <CardError message="Couldn't load tracked time." onRetry={() => query.refetch()} />
      ) : (
        <>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
            {loading
              ? Array.from({ length: 3 }, (_, index) => <Shimmer key={index} className="h-12 w-28 rounded-md" />)
              : figures.map((figure) => (
                  <div key={figure.label}>
                    <dt className="text-sm text-muted-foreground">{figure.label}</dt>
                    <dd className="mt-1 text-xl font-semibold tracking-tight tabular">
                      {figure.value}
                    </dd>
                  </div>
                ))}
          </dl>

          <div className="my-3 flex items-center justify-center gap-5 text-xs">
            {(["billable", "nonBillable"] as const).map((key) => (
              <span key={key} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: chartConfig[key].color }} aria-hidden />
                {chartConfig[key].label}
              </span>
            ))}
          </div>

          {loading ? (
            <Shimmer className="h-[200px] w-full rounded-md" />
          ) : (
            <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
              <BarChart data={points} margin={{ left: 0, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={4} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={amountMode ? 56 : 36}
                  allowDecimals={false}
                  tickFormatter={(value: number) => (amountMode ? money(value) : `${value}h`)}
                  className="tabular"
                />
                <ChartTooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.5)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const point = payload[0].payload as (typeof points)[number];
                    const show = (value: number) => (amountMode ? money(value) : formatHoursMinutes(value));
                    return (
                      <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
                        <p className="mb-1 font-medium">{point.full}</p>
                        <p className="tabular">Billable: {show(point.billable)}</p>
                        <p className="tabular">Non-billable: {show(point.nonBillable)}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="nonBillable" stackId="time" fill="var(--color-nonBillable)" maxBarSize={26} isAnimationActive={!reducedMotion} />
                <Bar
                  dataKey="billable"
                  stackId="time"
                  fill="var(--color-billable)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={26}
                  isAnimationActive={!reducedMotion}
                />
              </BarChart>
            </ChartContainer>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Counts completed timer sessions.</p>
        </>
      )}
    </section>
  );
}

const AVATAR_TONES = ["#2563eb", "#0891b2", "#7c3aed", "#16a34a", "#e05252", "#d97706", "#db2777"];

function BreakdownCard() {
  const [group, setGroup] = React.useState<BreakdownGroup>("client");
  const [range, setRange] = React.useState<StatsRange>("week");
  const query = useTimeBreakdownQuery(range, group);
  const rows = query.data ?? [];
  // Bars are drawn against a fixed 24 hours, as sole-webapp's ClientHoursList
  // drew them, so an hour reads as an hour rather than as "everything" when
  // it's the only time in the period. A row past 24 hours widens the scale
  // instead of overflowing the bar.
  const scale = Math.max(24, ...rows.map((row) => row.totalHours));
  const width = (hours: number) => Math.min(100, (hours / scale) * 100);
  const loading = query.isLoading || query.isPlaceholderData;

  return (
    <section aria-label={`Time by ${group}`} className="rounded-lg border border-border bg-card p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Group by"
          value={group}
          onChange={setGroup}
          options={[
            { value: "client", label: "Client" },
            { value: "project", label: "Project" },
          ]}
        />
        <RangeSelect value={range} onChange={setRange} label={`Time by ${group} period`} />
      </div>

      {query.isError && !query.data ? (
        <CardError message="Couldn't load the breakdown." onRetry={() => query.refetch()} />
      ) : loading ? (
        <ul className="mt-4 space-y-4" aria-busy="true" aria-label="Loading breakdown">
          {Array.from({ length: 4 }, (_, index) => (
            <li key={index} className="flex items-center gap-3">
              <Shimmer className="size-7 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="flex justify-between gap-3">
                  <Shimmer className="h-4 w-32 rounded" />
                  <Shimmer className="h-4 w-14 rounded" />
                </div>
                <Shimmer className="h-2 w-full rounded-full" />
                <Shimmer className="h-3 w-40 rounded" />
              </div>
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
          <FileText className="size-5" aria-hidden />
          <p>No {group} time in this period</p>
        </div>
      ) : (
        <ul className="mt-4 max-h-[300px] space-y-4 overflow-y-auto pr-1">
          {rows.map((row, index) => (
            <li key={`${row.id}-${row.name}`} className="flex items-center gap-3">
              <span
                className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
                style={{ background: group === "client" ? AVATAR_TONES[index % AVATAR_TONES.length] : "#6366f1" }}
                aria-hidden
              >
                {initials(row.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium">{row.name}</span>
                  <span className="shrink-0 text-sm font-medium tabular">{formatHoursMinutes(row.totalHours)}</span>
                </div>
                <div className="my-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${width(row.totalHours)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground tabular">
                  {formatHoursMinutes(row.billableHours)} billable
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TimeSummary() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
      <TrackedTimeCard />
      <BreakdownCard />
    </div>
  );
}
