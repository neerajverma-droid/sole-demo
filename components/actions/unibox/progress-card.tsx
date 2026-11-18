"use client";

import { CheckCircle2, Flame, TrendingUp } from "lucide-react";

import { UniboxCard } from "@/components/actions/unibox/unibox-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUniboxQuery } from "@/hooks/use-unibox-query";
import { daysAgo } from "@/lib/unibox";
import { actionCountText, activityDayLabel, progressView } from "@/lib/unibox-rules";
import { cn } from "@/lib/utils";

const COMPARISON_TONE: Record<string, string> = {
  ahead: "text-success",
  behind: "text-destructive",
  same: "text-muted-foreground",
};

/** YourProgressCard.js: level, the bar to the next one, the week, and what was done. */
export function ProgressCard() {
  const query = useUniboxQuery("progress");
  const loading = query.isLoading;

  const { score, level, nextLevelText, percent, counts, days, max, totalThisWeek, comparison, recent } =
    progressView(query.data);
  // Read once per render — the bars' dates only need to be right to the day.
  const now = Date.now();

  return (
    <UniboxCard icon={TrendingUp} title="Your progress" tourId="quick-actions-progress" sample={query.isDemo}>
      {loading ? (
        <div className="mt-3 space-y-2.5" aria-busy>
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Flame className="size-4 fill-current" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold">{level}</p>
              <p className="truncate text-[11.5px] text-muted-foreground">
                {nextLevelText}
              </p>
            </div>
            <span className="ml-auto text-[13px] font-semibold tabular" title="Business health score">
              {score}
            </span>
          </div>

          <div
            className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={`${level} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-success transition-[width] duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>

          <div className="mt-3 flex items-baseline justify-between gap-3">
            <p className="text-xs">
              <strong className="font-semibold tabular">{totalThisWeek}</strong> actions this week
            </p>
            <span
              className={cn(
                "whitespace-nowrap text-[11px] font-semibold",
                COMPARISON_TONE[comparison.direction] ?? COMPARISON_TONE.same,
              )}
            >
              {comparison.label}
            </span>
          </div>

          {counts.length > 0 ? (
            <div className="mt-2 flex h-14 items-stretch gap-1.5">
              {counts.map((count, index) => {
                const today = index === counts.length - 1;
                const when = activityDayLabel(index, counts.length, now);
                return (
                  <Tooltip key={`${days[index]}-${index}`} delayDuration={0}>
                    <TooltipTrigger asChild>
                      {/*
                        The whole column is the target, not just the bar: a quiet
                        day's bar is a few pixels tall, and a count you have to
                        hunt for is a count nobody reads.
                      */}
                      <button
                        type="button"
                        aria-label={`${when}: ${actionCountText(count)}`}
                        className="group/bar flex min-w-0 flex-1 cursor-default flex-col items-center justify-end gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex w-full flex-1 items-end justify-center">
                          <span
                            className={cn(
                              "w-full max-w-[26px] rounded-t-md transition-[filter,opacity]",
                              today ? "bg-primary" : "bg-primary/35",
                              count === 0 && "opacity-25",
                              "group-hover/bar:brightness-90 group-hover/bar:opacity-100 group-focus-visible/bar:opacity-100",
                            )}
                            style={{
                              height: count === 0 ? 4 : `${Math.max(14, Math.round((count / max) * 100))}%`,
                            }}
                          />
                        </span>
                        <span
                          className={cn(
                            "truncate text-[10px] font-medium",
                            today ? "text-primary" : "text-muted-foreground",
                          )}
                        >
                          {days[index]}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <span className="font-semibold tabular">{actionCountText(count)}</span>
                      <span className="text-muted-foreground"> · {when}</span>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          ) : null}

          <p className="mb-0.5 mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recent actions
          </p>
          {recent.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">Your completed actions will appear here.</p>
          ) : (
            <ul>
              {recent.map((action) => (
                <li key={action.id} className="flex items-center gap-2 py-1">
                  <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {action.title}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground/70">{daysAgo(action.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </UniboxCard>
  );
}
