"use client";

import { CircleCheck, Clock, Zap } from "lucide-react";

import type { RuleSyncStats } from "@/lib/rules";
import { CountUp } from "@/components/ui/count-up";
import { Shimmer } from "@/components/ui/shimmer";
import { STAT_TONES, type StatTone } from "@/components/ui/stat-cards";
import { cn } from "@/lib/utils";

/**
 * Three stat cards, straight off the real sync-stats endpoint — "matched"
 * only means something in terms of what the rules actually caught.
 */
export function RulesSummary({
  stats,
  loading,
}: {
  stats: RuleSyncStats | undefined;
  /** The first fetch hasn't landed yet — the rules list can be shown without it. */
  loading: boolean;
}) {
  if (loading || !stats) {
    return (
      <dl className="grid gap-4 sm:grid-cols-3" aria-hidden>
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex items-center gap-2.5">
              <Shimmer className="size-8 rounded-md" />
              <Shimmer className="h-4 w-24" />
            </div>
            <Shimmer className="mt-3 h-7 w-16" />
            <Shimmer className="mt-1.5 h-3 w-28" />
          </div>
        ))}
      </dl>
    );
  }

  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      <Stat
        icon={<Zap aria-hidden />}
        label="Auto matches"
        value={stats.autoMatchCount}
        meta="Rules applied automatically"
      />
      <Stat
        icon={<CircleCheck aria-hidden />}
        label="Matched"
        tone="success"
        value={stats.matched}
        meta={`of ${stats.total} total`}
        iconTone="text-success"
      />
      <Stat
        icon={<Clock aria-hidden />}
        label="Unmatched"
        tone="warning"
        value={stats.unmatched}
        meta="Pending match"
        iconTone="text-warning"
      />
    </dl>
  );
}

function Stat({
  icon,
  tone = "primary",
  label,
  value,
  meta,
  iconTone,
}: {
  icon: React.ReactNode;
  /** What the figure means — see STAT_TONES. */
  tone?: StatTone;
  label: string;
  value: number;
  meta: string;
  /** Only the icon takes colour; the figure stays neutral. */
  iconTone?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-md [&_svg]:size-4",
            STAT_TONES[tone],
            iconTone,
          )}
          aria-hidden
        >
          {icon}
        </span>
        <dt className="text-sm text-muted-foreground">{label}</dt>
      </div>
      <dd className="mt-3 text-2xl font-semibold leading-none tracking-tight tabular">
        <CountUp value={value} />
      </dd>
      <p className="mt-1.5 text-xs text-muted-foreground tabular">{meta}</p>
    </div>
  );
}
