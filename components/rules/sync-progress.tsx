"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Shimmer } from "@/components/ui/shimmer";
import {
  syncProgressLabel,
  syncProgressPercent,
  type RuleSyncStats,
} from "@/lib/rules";

/**
 * How far through the account's transactions the rules have got.
 *
 * The stat cards above say how many rules exist and what they caught; this says
 * how much of the work is left, which is the only figure that answers "is there
 * anything for me to do here". Straight off the real sync-stats endpoint, so
 * running a rule moves it the next time it's polled.
 */
export function SyncProgress({
  stats,
  loading,
}: {
  stats: RuleSyncStats | undefined;
  loading: boolean;
}) {
  if (loading || !stats) {
    return (
      <Card aria-hidden>
        <CardContent className="flex flex-wrap items-center gap-6 pt-6">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="space-y-1.5">
              <Shimmer className="h-4 w-28" />
              <Shimmer className="h-3 w-40" />
            </div>
            <Shimmer className="h-2 w-full rounded-full" />
          </div>
          <div className="shrink-0 space-y-1 text-right">
            <Shimmer className="ml-auto h-8 w-14" />
            <Shimmer className="ml-auto h-3 w-16" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const percent = syncProgressPercent(stats);
  // A sliver of bar for any progress at all — 0.13% is under a pixel wide,
  // which would read as nothing matched.
  const barValue = stats.matched > 0 ? Math.max(percent, 1) : 0;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-6 pt-6">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold">Sync progress</h2>
            <p className="text-xs text-muted-foreground tabular">
              {stats.matched} matched, {stats.unmatched} remaining
            </p>
          </div>
          <Progress
            value={barValue}
            aria-label="Transactions matched"
            aria-valuetext={`${syncProgressLabel(stats)} complete`}
          />
        </div>

        {/* The figure last, and large: the bar shows the shape, this is the
            number someone would quote. */}
        <div className="shrink-0 text-right">
          <p className="text-3xl font-semibold tracking-tight tabular">
            {syncProgressLabel(stats)}
          </p>
          <p className="text-xs text-muted-foreground">Complete</p>
        </div>
      </CardContent>
    </Card>
  );
}
