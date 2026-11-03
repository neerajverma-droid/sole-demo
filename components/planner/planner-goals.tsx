"use client";

import Link from "next/link";
import { ChevronRight, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyCue,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PLANNER_ROOT } from "@/components/planner/planner-detail";
import { invoiceMoney } from "@/lib/invoices";
import {
  formatGoalDate,
  goalAllocated,
  goalProgress,
  goalStatus,
  goalStatusVariant,
  goalTarget,
  type Goal,
} from "@/lib/planner";

/**
 * The Goals tab: the list. Opening one leaves for its own page, so the planner
 * header and a detail header are never stacked on top of each other.
 */
export function PlannerGoals({
  goals,
  today,
  loading = false,
}: {
  goals: Goal[];
  today: string;
  /** While the list's fetch is still out — "no goals yet" would be a guess. */
  loading?: boolean;
}) {
  if (loading && goals.length === 0) return <GoalsSkeleton />;

  if (goals.length === 0) {
    return (
      <Empty>
        <EmptyMedia>
          <Target aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>No goals yet</EmptyTitle>
          <EmptyDescription>
            Create your first savings goal to start tracking what you&apos;re
            setting aside.
          </EmptyDescription>
        </div>
        <EmptyCue label="Start here" />
        <EmptyActions>
          <Button size="sm" asChild>
            <Link href={`${PLANNER_ROOT}/goals/new`}>Create goal</Link>
          </Button>
        </EmptyActions>
      </Empty>
    );
  }

  return (
    <ul className="space-y-3">
      {goals.map((goal) => (
        <li key={goal.id}>
          <GoalRow goal={goal} today={today} />
        </li>
      ))}
    </ul>
  );
}

function GoalRow({ goal, today }: { goal: Goal; today: string }) {
  const status = goalStatus(goal, today);
  const target = goalTarget(goal);
  const allocated = goalAllocated(goal);

  return (
    <Link
      href={`${PLANNER_ROOT}/goals/${goal.id}`}
      className="block w-full space-y-3 rounded-lg border border-border bg-card p-4 text-left shadow-sm outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            <Target className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-medium">{goal.name}</p>
              {/* Nothing until the goal has a target and a date. */}
              {status && (
                <Badge variant={goalStatusVariant(status)}>{status}</Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground tabular">
              {goal.type} · {formatGoalDate(goal.targetDate)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <p className="text-sm tabular">
            {invoiceMoney(allocated)}
            <span className="text-muted-foreground">
              {" "}
              of {target > 0 ? invoiceMoney(target) : "—"}
            </span>
          </p>
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </div>
      </div>

      <Progress value={goalProgress(goal) * 100} />
    </Link>
  );
}

/**
 * Stands in for the rows while the fetch is out — same card, same height, so
 * nothing shifts when the real goals land.
 */
function GoalsSkeleton() {
  return (
    <ul className="space-y-3" aria-hidden>
      {[0, 1, 2].map((row) => (
        <li
          key={row}
          className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Skeleton className="size-9 shrink-0 rounded-xl" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </li>
      ))}
    </ul>
  );
}
