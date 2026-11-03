"use client";

import { Area, AreaChart } from "recharts";
import { ArrowDownLeft, ArrowUpRight, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { MONTHLY_CASH_FLOW, money } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

/** The Dashboard's default view — the last six months — as a still. */
const PREVIEW_SERIES = MONTHLY_CASH_FLOW.slice(-6);

/**
 * The product preview on the promo panel: a stat card, the cash-flow chart and a
 * slice of the transactions table, floating and tilted so it reads as a polished
 * preview rather than a flat screenshot.
 *
 * Built from the real surfaces — the same tokens, the same Badge, the same
 * cash-flow figures the Dashboard plots — so it stays honest about what the
 * product looks like, and follows the theme rather than being a light-mode
 * screenshot pasted onto a dark page.
 *
 * Entirely decorative: `aria-hidden` and `pointer-events-none`, because it isn't
 * the product, and nothing here should take focus from the form.
 */
export function AuthPromoMockup() {
  return (
    <div aria-hidden className="pointer-events-none relative select-none">
      {/*
        Tilted and pushed right so the frame crops it — the reference's
        "peeking out of the panel" treatment.

        The drift is on this element and the entrance is on the parent, so the
        two animate `translate` without overwriting each other. The rotate lives
        in `transform`, which neither keyframe touches. It waits out the
        entrance (240ms delay + 600ms) before it starts.
      */}
      <div
        className="animate-auth-float w-[520px] -rotate-6 space-y-3"
        style={{ animationDelay: "840ms" }}
      >
        <div className="flex gap-3">
          <StatCard />
          <ChartCard />
        </div>
        <TransactionsCard />
      </div>
    </div>
  );
}

function Frame({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-2xl shadow-black/25",
        className,
      )}
    >
      {children}
    </div>
  );
}

function StatCard() {
  return (
    <Frame className="w-[210px] shrink-0">
      <p className="text-xs text-muted-foreground">Running balance</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular">
        {money(42380)}
      </p>
      <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-success">
        <TrendingUp className="size-3.5" />
        12.4%
      </span>
      <span className="ml-1.5 text-xs text-muted-foreground">
        vs last month
      </span>
    </Frame>
  );
}

function ChartCard() {
  return (
    <Frame className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium">Cash flow</p>
        <p className="text-[10px] text-muted-foreground">Last 6 months</p>
      </div>

      {/* The Dashboard's own series, drawn statically — no tooltip, no axes;
          this is a picture of the chart, not the chart. */}
      <AreaChart
        width={250}
        height={84}
        data={PREVIEW_SERIES}
        margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
      >
        <defs>
          <linearGradient id="authIn" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="hsl(var(--chart-in))"
              stopOpacity={0.45}
            />
            <stop
              offset="100%"
              stopColor="hsl(var(--chart-in))"
              stopOpacity={0}
            />
          </linearGradient>
          <linearGradient id="authOut" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="hsl(var(--chart-out))"
              stopOpacity={0.3}
            />
            <stop
              offset="100%"
              stopColor="hsl(var(--chart-out))"
              stopOpacity={0}
            />
          </linearGradient>
        </defs>
        <Area
          dataKey="moneyOut"
          type="monotone"
          stroke="hsl(var(--chart-out))"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          fill="url(#authOut)"
          isAnimationActive={false}
        />
        <Area
          dataKey="moneyIn"
          type="monotone"
          stroke="hsl(var(--chart-in))"
          strokeWidth={2}
          fill="url(#authIn)"
          isAnimationActive={false}
        />
      </AreaChart>
    </Frame>
  );
}

const ROWS = [
  { name: "Deposit — Nomad Studio", amount: 4200, in: true, status: "Matched" },
  { name: "Adobe Creative Cloud", amount: 96.99, in: false, status: "Matched" },
  { name: "Invoice INV-0024 paid", amount: 1850, in: true, status: "Review" },
];

function TransactionsCard() {
  return (
    <Frame>
      <p className="text-xs font-medium">Recent transactions</p>
      <ul className="mt-2 divide-y divide-border">
        {ROWS.map((row) => (
          <li key={row.name} className="flex items-center gap-3 py-2.5">
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-lg [&_svg]:size-3.5",
                row.in
                  ? "bg-primary/10 text-primary"
                  : "bg-warm text-warm-foreground",
              )}
            >
              {row.in ? <ArrowDownLeft /> : <ArrowUpRight />}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs">{row.name}</span>
            <Badge variant={row.status === "Matched" ? "success" : "warning"}>
              {row.status}
            </Badge>
            <span
              className={cn(
                "w-20 shrink-0 text-right text-xs font-medium tabular",
                row.in && "text-success",
              )}
            >
              {row.in ? "+" : "−"}
              {money(row.amount)}
            </span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}
