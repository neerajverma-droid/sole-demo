"use client";

import * as React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CountUp } from "@/components/ui/count-up";
import { InfoTip } from "@/components/ui/info-tip";
import { Shimmer } from "@/components/ui/shimmer";
import { HeroHairline } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import { money } from "@/lib/dashboard-data";
import { axisMoney, niceMoneyDomain } from "@/lib/chart-axis";
import type { BalancePoint } from "@/lib/dashboard";
import { useDashboardBalanceQuery } from "@/hooks/use-dashboard-query";

const CARD_BG = "hsl(var(--card))";
const ACCENT = "hsl(var(--chart-in))";

const chartConfig = {
  balance: { label: "Running balance", color: ACCENT },
} satisfies ChartConfig;

/** How many of the most recent months the hero's chart plots. */
const SERIES_MONTHS = 6;

/**
 * Month-on-month change for one point in the series — what the hero's chip
 * shows. Null for the first month, which has nothing to compare against.
 */
function balanceDeltaAt(
  series: BalancePoint[],
  index: number,
): { label: string; up: boolean } | null {
  const current = series[index];
  const previous = series[index - 1];
  if (!current || !previous || previous.balance === 0) return null;

  const change =
    ((current.balance - previous.balance) / Math.abs(previous.balance)) * 100;
  const isLatest = index === series.length - 1;

  return {
    label: `${Math.abs(change).toFixed(1)}% ${
      isLatest ? "this month" : `from ${previous.month}`
    }`,
    up: change >= 0,
  };
}

/**
 * The hero moment: the anchor card carrying a single large figure, themed
 * like every other card on the page rather than staying dark across both
 * modes. The figure and the chart are one instrument — hovering a month
 * retargets the number and the chip.
 *
 * It used to say that and then use the `hero` tokens anyway, which are dark in
 * BOTH themes — so this one card sat as a black slab in the middle of a page
 * of white ones. It takes the ordinary card surface now. The `hero` tokens are
 * left alone for the four surfaces that do want to stay dark either way (the
 * onboarding preview, the subscription panel, the admin sign-in and the
 * run-rules banner).
 *
 * The gradient hairline stays: that's the card's accent, not its theme.
 */
export function BalanceHero() {
  const { data, isLoading } = useDashboardBalanceQuery();
  const series = React.useMemo(
    () => (data?.series ?? []).slice(-SERIES_MONTHS),
    [data],
  );
  const hasActivity = series.length > 0;

  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
  const latestIndex = series.length - 1;
  const shownIndex = hoveredIndex ?? latestIndex;
  const shown = series[shownIndex];
  const delta = balanceDeltaAt(series, shownIndex);

  // h-full so the card fills its grid row instead of leaving a strip of page
  // background under the chart; the chart then flexes to fill.
  return (
    <section
      // Same surface, border and shadow as the tiles beside it, so the row
      // reads as one group rather than a dark card with three light ones.
      className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm"
    >
      {isLoading ? (
        <Shimmer className="m-6 h-40 flex-1 sm:m-8" />
      ) : (
        <>
      <HeroHairline />
      <div className="flex min-h-0 flex-1 flex-col gap-8 p-3 sm:p-6">
        <div>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          Cash on hand
          <InfoTip text="The total balance across your connected bank accounts right now." />
          {hasActivity && hoveredIndex !== null && (
            <span className="text-muted-foreground/70">· {shown.month}</span>
          )}
        </p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 ">
          <span className="text-4xl font-semibold tracking-tight tabular">
            {hasActivity ? (
              <CountUp value={shown.balance} format={money} />
            ) : (
              money(0)
            )}
          </span>
          {hasActivity ? (
            delta && <DeltaChip label={delta.label} up={delta.up} />
          ) : (
            <span className="text-sm text-muted-foreground">
              No activity yet
            </span>
          )}
        </div>
        </div>

        <BalanceChart series={series} onHoverIndexChange={setHoveredIndex} />
      </div>
        </>
      )}
    </section>
  );
}

function DeltaChip({ label, up }: { label: string; up: boolean }) {
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
        up ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

function BalanceChart({
  series,
  onHoverIndexChange,
}: {
  series: BalancePoint[];
  onHoverIndexChange: (index: number | null) => void;
}) {
  const active = series.length > 0;

  /*
   * Round bounds and round ticks, anchored at zero.
   *
   * The axis was hidden and scaled `dataMin - 2500 → dataMax + 2500`, which
   * left the card with nothing but a curve: no way to read what any point was
   * worth without hovering it, and a fill that began partway up the scale. A
   * filled area reads as magnitude from its baseline, so the baseline has to
   * be zero or the shape overstates a small balance.
   */
  const { domain, ticks } = React.useMemo(
    () => niceMoneyDomain(series.map((point) => point.balance)),
    [series],
  );

  return (
    <ChartContainer
      config={chartConfig}
      // aspect-auto + flex-1 so the chart fills whatever height the row gives.
      className="aspect-auto min-h-32 w-full flex-1"
    >
      <AreaChart
        data={series}
        // Right margin so the last tick label isn't cropped by the card edge.
        margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
        onMouseMove={(state) => {
          if (!active) return;
          const next = state?.activeTooltipIndex;
          onHoverIndexChange(
            state?.isTooltipActive && typeof next === "number" ? next : null,
          );
        }}
        onMouseLeave={() => onHoverIndexChange(null)}
      >
        <defs>
          {/*
            Three stops rather than two. A straight 0.45 → 0 ramp loses almost
            all its colour in the first third, which is what left the fill
            looking washed out once the card went light; the middle stop holds
            the tint through the body of the shape and still fades to nothing
            at the baseline, so it reads as depth rather than as a block.
          */}
          <linearGradient id="fillHeroBalance" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.4} />
            <stop offset="45%" stopColor={ACCENT} stopOpacity={0.16} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {/*
          Horizontal only, and solid rather than dashed: a dash pattern reads
          as "projected" or "threshold" when it is only a grid, and at this
          density it fights the curve. One shade off the surface so it sits
          behind the data instead of competing with it.
        */}
        <CartesianGrid
          vertical={false}
          stroke="hsl(var(--border))"
          strokeOpacity={0.7}
        />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          className="text-xs"
        />
        <YAxis
          // Explicit ticks, so the labels are the round numbers the domain was
          // built around rather than whatever recharts would subdivide to.
          domain={domain}
          ticks={ticks}
          tickFormatter={axisMoney}
          tickLine={false}
          axisLine={false}
          /*
           * 60, not 52. The widest label this formatter produces is a negative
           * on a 2.5-step axis — "-$2.5k" — which measures ~52px with its tick
           * margin, so a 52px gutter would sit flush against the plot with no
           * air. An overdrawn balance is exactly when the axis has to stay
           * readable.
           */
          width={60}
          tickMargin={8}
          // Text tokens, never the series colour — the line carries identity,
          // the labels carry the reading.
          className="text-xs tabular"
        />
        {active && (
          <ChartTooltip
            cursor={{ strokeWidth: 1 }}
            content={
              <ChartTooltipContent
                hideIndicator
                formatter={(value) => (
                  <span className="font-medium tabular">
                    {money(Number(value))}
                  </span>
                )}
              />
            }
          />
        )}
        <Area
          dataKey="balance"
          type="monotone"
          stroke={active ? ACCENT : "hsl(var(--muted-foreground) / 0.3)"}
          strokeWidth={2}
          fill={active ? "url(#fillHeroBalance)" : "transparent"}
          /*
           * A dot on the last point only — where the balance is now, which is
           * the figure the hero above is quoting. Every other point stays bare:
           * a marker on all six is the "number on every point" problem in dot
           * form, and the tooltip already answers the rest.
           *
           * The 2px ring is the card surface, so the dot sits on the line
           * rather than being drawn over by it.
           */
          dot={(props) => {
            const { key, cx, cy, index } = props as unknown as {
              key?: string;
              cx: number;
              cy: number;
              index: number;
            };
            if (!active || index !== series.length - 1) {
              return <g key={key} />;
            }
            return (
              <circle
                key={key}
                cx={cx}
                cy={cy}
                r={4}
                fill={ACCENT}
                stroke={CARD_BG}
                strokeWidth={2}
              />
            );
          }}
          activeDot={
            active
              ? { r: 4, fill: ACCENT, stroke: CARD_BG, strokeWidth: 2 }
              : false
          }
        />
      </AreaChart>
    </ChartContainer>
  );
}
