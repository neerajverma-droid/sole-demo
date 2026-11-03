"use client";

import * as React from "react";
import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shimmer } from "@/components/ui/shimmer";
import { PROJECT_STATS_PERIODS, type ProjectStatsPeriod } from "@/lib/project-overview";
import { cn } from "@/lib/utils";

/*
 * The overview's building blocks, drawn after the design's `pov-*` widgets.
 * Charts are hand-rolled SVG on the theme's CSS variables (as the design's
 * are) rather than Recharts: they're single-series rings and bars where a
 * charting library would only add axes to hide.
 */

/** Colours as HSL triplets so they can go straight into `hsl(...)`. */
export const OVERVIEW_COLORS = {
  paid: "var(--success)",
  invoiced: "var(--primary)",
  committed: "var(--chart-out)",
  // No token for a fourth hue; the design's sky blue reads in both themes.
  future: "210 90% 56%",
  uncommitted: "var(--muted-foreground)",
  labour: "var(--primary)",
  expenses: "var(--chart-out)",
  billable: "var(--chart-in)",
  nonBillable: "var(--chart-out)",
  active: "214 90% 56%",
  inactive: "var(--muted-foreground)",
  completed: "var(--success)",
} as const;

export const hsl = (triplet: string) => `hsl(${triplet})`;

export function OverviewSection({
  title,
  action,
  className,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card p-[15px] shadow-sm", className)}>
      {(title || action) && (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
          {title ? <h2 className="text-base font-semibold">{title}</h2> : <span />}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function PeriodSelect({
  value,
  onChange,
  label,
}: {
  value: ProjectStatsPeriod;
  onChange: (period: ProjectStatsPeriod) => void;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as ProjectStatsPeriod)}>
      <SelectTrigger className="h-8 w-[140px] text-xs" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PROJECT_STATS_PERIODS.map((option) => (
          <SelectItem key={option} value={option} className="text-xs">
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export type StripItem = {
  label: string;
  value: React.ReactNode;
  tone?: "success" | "destructive";
};

const TONE_CLASS = { success: "text-success", destructive: "text-destructive" } as const;

/** A row of figures split by hairlines — the design's `pov-strip`. */
export function FigureStrip({ items }: { items: StripItem[] }) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-[15px] md:gap-0">
      {items.map((item) => (
        <div
          key={item.label}
          className="min-w-0 md:border-l md:border-border md:px-4 md:first:border-l-0 md:first:pl-0"
        >
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd
            className={cn(
              "mt-1 truncate text-lg font-bold tracking-tight tabular",
              item.tone && TONE_CLASS[item.tone],
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export type LegendItem = { label: string; color: string; value?: React.ReactNode };

/** The design's `pov-hleg`: a square swatch, a label and an optional bold figure. */
export function HLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <div className={cn("mt-3.5 flex flex-wrap gap-x-5 gap-y-2 text-[13px]", className)}>
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span
            aria-hidden
            className="size-[11px] shrink-0 rounded-[3px]"
            style={{ background: hsl(item.color) }}
          />
          {item.label}
          {item.value != null && (
            <b className="font-semibold text-foreground tabular">{item.value}</b>
          )}
        </span>
      ))}
    </div>
  );
}

export type Segment = { label: string; value: number; color: string; title?: string };

/* ------------------------------------------------------------------ *
 * Hover tooltips
 * ------------------------------------------------------------------ */

/**
 * The hover card every overview chart shares. Native SVG `<title>`s were too
 * slow to appear to count as a tooltip, so a chart is wrapped in a
 * `ChartTipArea` that follows the pointer, and each mark reports the segment
 * under it. Styled like the Recharts tooltip on the time-tracked chart, so
 * every chart on the tab answers a hover the same way.
 */
const ChartTipContext = React.createContext<(segment: Segment | null) => void>(() => {});

function ChartTipArea({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [segment, setSegment] = React.useState<Segment | null>(null);
  const [point, setPoint] = React.useState({ x: 0, y: 0, flip: false });

  return (
    <ChartTipContext.Provider value={setSegment}>
      <div
        ref={ref}
        className={cn("relative", className)}
        onMouseMove={(event) => {
          const box = ref.current?.getBoundingClientRect();
          if (!box) return;
          const x = event.clientX - box.left;
          // Past the middle the card opens to the left of the pointer, so the
          // right-most marks don't push it off the edge of the card.
          setPoint({ x, y: event.clientY - box.top, flip: x > box.width / 2 });
        }}
        onMouseLeave={() => setSegment(null)}
      >
        {children}
        {segment && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-20 flex items-center gap-2 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
            style={{
              left: point.flip ? point.x - 12 : point.x + 12,
              top: point.y + 12,
              transform: point.flip ? "translateX(-100%)" : undefined,
            }}
          >
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ background: hsl(segment.color) }}
            />
            {segment.title ?? `${segment.label}: ${segment.value}`}
          </div>
        )}
      </div>
    </ChartTipContext.Provider>
  );
}

/** Hover handlers for one mark, plus the dimming of the marks around it. */
function useTipMark(segment: Segment) {
  const setTip = React.useContext(ChartTipContext);
  return {
    onMouseEnter: () => setTip(segment),
    onMouseLeave: () => setTip(null),
    className: "cursor-pointer transition-opacity hover:opacity-80",
  };
}

/** Centre text over a ring. Pointer-transparent, so hovering it still reaches the ring. */
function RingCentre({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Rings
 * ------------------------------------------------------------------ */

function RingSegment({
  segment,
  length,
  circumference,
  offset,
}: {
  segment: Segment;
  length: number;
  circumference: number;
  offset: number;
}) {
  const mark = useTipMark(segment);
  return (
    <circle
      cx="70"
      cy="70"
      r="52"
      fill="none"
      stroke={hsl(segment.color)}
      strokeWidth="17"
      strokeDasharray={`${length} ${circumference - length}`}
      strokeDashoffset={-offset}
      transform="rotate(-90 70 70)"
      {...mark}
    />
  );
}

/**
 * A full ring split by value, with `children` written in its centre. An
 * all-zero ring draws the muted track, so the caller can still show the
 * design's empty ring.
 */
export function DonutRing({
  segments,
  size = 140,
  children,
}: {
  segments: Segment[];
  size?: number;
  children?: React.ReactNode;
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0);
  const circumference = 2 * Math.PI * 52;
  let offset = 0;

  return (
    <ChartTipArea className="inline-block">
      <svg viewBox="0 0 140 140" width={size} height={size} className="block" aria-hidden>
        {total <= 0 ? (
          <circle cx="70" cy="70" r="52" fill="none" stroke="hsl(var(--muted))" strokeWidth="17" />
        ) : (
          segments
            .filter((segment) => segment.value > 0)
            .map((segment) => {
              const length = (segment.value / total) * circumference;
              const ring = (
                <RingSegment
                  key={segment.label}
                  segment={segment}
                  length={length}
                  circumference={circumference}
                  offset={offset}
                />
              );
              offset += length;
              return ring;
            })
        )}
      </svg>
      <RingCentre>{children}</RingCentre>
    </ChartTipArea>
  );
}

function ArcSegment({ segment, from, to }: { segment: Segment; from: number; to: number }) {
  const mark = useTipMark(segment);
  // Angles run from 180° (left end) to 0° (right end) across the top.
  const point = (fraction: number) => {
    const angle = Math.PI * (1 - fraction);
    return `${70 + 56 * Math.cos(angle)} ${74 - 56 * Math.sin(angle)}`;
  };
  return (
    <path
      d={`M ${point(from)} A 56 56 0 0 1 ${point(to)}`}
      fill="none"
      stroke={hsl(segment.color)}
      strokeWidth="14"
      strokeLinecap="butt"
      {...mark}
    />
  );
}

/**
 * The old Billable vs Non-Billable chart: a half doughnut, left to right,
 * with the first segment's share and then the second's — flat ends, so each
 * arc is exactly its percentage. `children` sits in the bowl. With nothing to
 * split the track goes muted rather than reading as 100% of either.
 */
export function HalfDonut({
  segments,
  children,
}: {
  segments: Segment[];
  children?: React.ReactNode;
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0);
  let from = 0;

  return (
    <ChartTipArea className="inline-block">
      <svg viewBox="0 0 140 82" className="block h-[130px] w-[222px] max-w-full" aria-hidden>
        {total <= 0 ? (
          <path
            d="M 14 74 A 56 56 0 0 1 126 74"
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="14"
          />
        ) : (
          segments
            .filter((segment) => segment.value > 0)
            .map((segment) => {
              const to = from + segment.value / total;
              const arc = <ArcSegment key={segment.label} segment={segment} from={from} to={to} />;
              from = to;
              return arc;
            })
        )}
      </svg>
      {children && (
        <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center">{children}</div>
      )}
    </ChartTipArea>
  );
}

/** 1, 2 or 5 × a power of ten at or above `value` — a tidy axis top. */
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
}

/** Vertical bars on a five-tick axis — the design's `povVBars`. */
export function VerticalBars({
  items,
  formatTick,
}: {
  items: Segment[];
  formatTick: (value: number) => string;
}) {
  const max = niceCeil(Math.max(...items.map((item) => item.value), 0) / 5) * 5;
  const ticks = Array.from({ length: 6 }, (_, index) => (max * (5 - index)) / 5);

  return (
    <ChartTipArea className="flex h-[220px] gap-3">
      <div className="flex shrink-0 flex-col justify-between pb-[22px] text-right text-[11px] text-muted-foreground tabular">
        {ticks.map((tick) => (
          <div key={tick}>{formatTick(tick)}</div>
        ))}
      </div>
      <div className="flex flex-1 items-stretch gap-3 sm:gap-[18px]">
        {items.map((item) => (
          <Bar key={item.label} item={item} max={max} />
        ))}
      </div>
    </ChartTipArea>
  );
}

function Bar({ item, max }: { item: Segment; max: number }) {
  const mark = useTipMark(item);
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-1 items-end border-b border-border">
        <div
          className={cn("mx-auto min-h-[2px] w-full max-w-[70px] rounded-t", mark.className)}
          style={{
            height: `${(Math.max(item.value, 0) / max) * 100}%`,
            background: hsl(item.color),
          }}
          onMouseEnter={mark.onMouseEnter}
          onMouseLeave={mark.onMouseLeave}
        />
      </div>
      <div className="mt-2 h-4 truncate text-center text-[11px] text-muted-foreground">
        {item.label}
      </div>
    </div>
  );
}

/** The design's `chart-empty`: a dashed panel with a title and a line. */
export function ChartEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="grid min-h-[180px] place-items-center rounded-md border border-dashed border-border p-6 text-center text-muted-foreground">
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        {description && <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed">{description}</p>}
      </div>
    </div>
  );
}

/** A widget's own failure — small, so one bad endpoint doesn't blank the tab. */
export function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="grid min-h-[120px] place-items-center rounded-md border border-dashed border-border p-6 text-center">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw />
          Try again
        </Button>
      </div>
    </div>
  );
}

export function SectionShimmer({ className }: { className?: string }) {
  return <Shimmer className={cn("h-[220px] w-full", className)} />;
}
