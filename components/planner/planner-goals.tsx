"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { Pencil, PiggyBank, Target, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyActions,
  EmptyCue,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  PlannerBulkDelete,
  usePlannerSelection,
} from "@/components/planner/planner-bulk";
import { Progress } from "@/components/ui/progress";
import { RowIconAction } from "@/components/documents/row-actions";
import { FullTextTip, RowSubtext } from "@/components/planner/planner-cells";
import { Shimmer } from "@/components/ui/shimmer";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  GOAL_ALLOCATION_HASH,
  PLANNER_ROOT,
} from "@/components/planner/planner-detail";
import {
  PlannerListPagination,
  skeletonRowCount,
  type PlannerPaging,
} from "@/components/planner/planner-pagination";
import { useBulkDeleteGoalsMutation } from "@/hooks/use-planner-query";
import { deleteGoalIdAtom } from "@/lib/atoms";
import { invoiceMoney, parseIsoDate } from "@/lib/invoices";
import {
  formatGoalDate,
  goalAllocated,
  goalProgress,
  goalStatus,
  goalStatusVariant,
  goalTarget,
  type Goal,
} from "@/lib/planner";
import { cn } from "@/lib/utils";

/** Where a goal's row leads: its page, scrolled to the allocation section. */
const allocateHref = (goal: Goal) =>
  `${PLANNER_ROOT}/goals/${goal.id}#${GOAL_ALLOCATION_HASH}`;

/**
 * The Goals tab: the list. Opening one leaves for its own page, so the planner
 * header and a detail header are never stacked on top of each other.
 *
 * A goal exists to be funded, so its row goes straight to the allocation
 * section of its page; editing the goal itself is in the row's menu.
 */
export function PlannerGoals({
  goals,
  today,
  loading = false,
  paging,
}: {
  goals: Goal[];
  today: string;
  /** Present once a page has loaded; absent before, when there's nothing to page. */
  paging?: PlannerPaging;
  /** While the list is being fetched, first time or after a change. */
  loading?: boolean;
}) {
  const router = useRouter();
  const [, setDeleteId] = useAtom(deleteGoalIdAtom);
  const selection = usePlannerSelection(goals.map((goal) => goal.id));
  const bulkDelete = useBulkDeleteGoalsMutation();

  // Whenever the list is loading, not only the first time: after a goal is
  // saved the list reloads, and shimmering over the stale rows is what shows
  // the new one arriving.
  if (loading) {
    const skeletonRows = skeletonRowCount(paging, 4);
    return (
      <div className="space-y-4">
        <TableFrame>
          <TableBody aria-hidden>
            {Array.from({ length: skeletonRows }, (_, row) => row).map((row) => (
              <TableRow key={row}>
                <TableCell>
                  <Shimmer className="size-4" />
                </TableCell>
                <TableCell>
                  <Shimmer className="h-4 w-40" />
                </TableCell>
                <TableCell>
                  <Shimmer className="mx-auto h-5 w-16 rounded-full" />
                </TableCell>
                <TableCell>
                  <Shimmer className="mx-auto h-4 w-16" />
                </TableCell>
                <TableCell>
                  <Shimmer className="mx-auto h-4 w-16" />
                </TableCell>
                <TableCell>
                  <Shimmer className="mx-auto h-4 w-28" />
                </TableCell>
                <TableCell>
                  <Shimmer className="mx-auto h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Shimmer className="ml-auto h-8 w-24" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableFrame>
        {paging && (
          <PlannerListPagination
            paging={paging}
            itemLabel="goal"
            navLabel="Goals pages"
            disabled
          />
        )}
      </div>
    );
  }

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
    <div className="space-y-4">
      <PlannerBulkDelete
        chosen={selection.chosen}
        noun="goal"
        plural="goals"
        consequence="Their allocations are removed too. The cash was only ever earmarked, so nothing is refunded or moved."
        deleteIds={bulkDelete.mutateAsync}
        onDone={selection.clear}
        onClear={selection.clear}
      />
      <TableFrame selection={selection}>
        <TableBody>
          {goals.map((goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              today={today}
              selected={selection.isChosen(goal.id)}
              onSelect={() => selection.toggle(goal.id)}
              onAllocate={() => router.push(allocateHref(goal))}
              onEdit={() => router.push(`${PLANNER_ROOT}/goals/${goal.id}`)}
              onDelete={() => setDeleteId(goal.id)}
            />
          ))}
        </TableBody>
      </TableFrame>
      {paging && (
        <PlannerListPagination
          paging={paging}
          itemLabel="goal"
          navLabel="Goals pages"
          disabled={loading}
        />
      )}
    </div>
  );
}

function TableFrame({
  children,
  selection,
}: {
  children: React.ReactNode;
  /** Absent while loading, when there's nothing to select yet. */
  selection?: { allChosen: boolean; toggleAll: () => void };
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[44px]">
              {selection && (
                <Checkbox
                  checked={selection.allChosen}
                  onCheckedChange={selection.toggleAll}
                  aria-label="Select all goals"
                />
              )}
            </TableHead>
            {/* As on the Invoices list: only the name column is left-aligned;
                every other column is centred, and the actions sit at the right edge. */}
            <TableHead className="w-[16rem]">Goal</TableHead>
            <TableHead className="whitespace-nowrap text-center">Status</TableHead>
            <TableHead className="whitespace-nowrap text-center">Allocated</TableHead>
            <TableHead className="whitespace-nowrap text-center">Target</TableHead>
            <TableHead className="whitespace-nowrap text-center">Progress</TableHead>
            <TableHead className="whitespace-nowrap text-center">Target date</TableHead>
            <TableHead className={cn(HUG_COLUMN, "text-right")}>Actions</TableHead>
          </TableRow>
        </TableHeader>
        {children}
      </Table>
    </div>
  );
}

/** "12 days left", "Due today", "3 days overdue" — null without a date. */
function dueLabel(targetDate: string, today: string): string | null {
  const due = parseIsoDate(targetDate);
  const now = parseIsoDate(today);
  if (!due || !now) return null;
  const days = Math.round((due.getTime() - now.getTime()) / 86_400_000);
  if (days === 0) return "Due today";
  const count = Math.abs(days);
  const unit = count === 1 ? "day" : "days";
  return days > 0 ? `${count} ${unit} left` : `${count} ${unit} overdue`;
}

function GoalRow({
  goal,
  today,
  selected,
  onSelect,
  onAllocate,
  onEdit,
  onDelete,
}: {
  goal: Goal;
  today: string;
  selected: boolean;
  onSelect: () => void;
  onAllocate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = goalStatus(goal, today);
  const target = goalTarget(goal);
  const allocated = goalAllocated(goal);
  const percent = Math.round(goalProgress(goal) * 100);
  const due = goal.targetDate ? dueLabel(goal.targetDate, today) : null;
  const overdue = !!due && due.endsWith("overdue");

  return (
    <TableRow
      className="cursor-pointer"
      data-state={selected ? "selected" : undefined}
      onClick={onAllocate}
    >
      <TableCell onClick={(event) => event.stopPropagation()}>
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          aria-label={`Select ${goal.name || "goal"}`}
        />
      </TableCell>
      <TableCell className="max-w-[16rem]">
        {/* A real link as well as the clickable row, so it's reachable and
            announced by keyboard and screen reader. The whole name is on hover. */}
        <FullTextTip text={goal.name || "Untitled goal"}>
          <Link
            href={allocateHref(goal)}
            onClick={(event) => event.stopPropagation()}
            className="block truncate font-medium outline-none hover:underline focus-visible:underline"
          >
            {goal.name || "Untitled goal"}
          </Link>
        </FullTextTip>
        <RowSubtext text={goal.type} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-center">
        {/* Nothing to judge until the goal has a target and a date. */}
        {status ? (
          <Badge variant={goalStatusVariant(status)}>{status}</Badge>
        ) : (
          <Badge variant="secondary">Incomplete</Badge>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-center font-medium tabular">
        {invoiceMoney(allocated)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-center tabular text-muted-foreground">
        {target > 0 ? invoiceMoney(target) : "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap text-center">
        <div className="flex items-center justify-center gap-2">
          <Progress value={goalProgress(goal) * 100} className="w-20" />
          <span className="w-9 text-right text-xs tabular text-muted-foreground">
            {target > 0 ? `${percent}%` : "—"}
          </span>
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-center tabular">
        <span className="text-muted-foreground">
          {formatGoalDate(goal.targetDate)}
        </span>
        {due && (
          <span
            className={cn(
              "block text-xs",
              overdue ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {due}
          </span>
        )}
      </TableCell>
      <TableCell className={HUG_COLUMN} onClick={(event) => event.stopPropagation()}>
        {/* Out of the menu and onto the row, as on the Invoices list. */}
        <div className="flex items-center justify-end gap-1">
          <RowIconAction
            icon={<PiggyBank />}
            label="Allocate funds"
            onClick={onAllocate}
          />
          <RowIconAction icon={<Pencil />} label="Edit goal" onClick={onEdit} />
          <RowIconAction
            icon={<Trash2 />}
            label="Delete goal"
            destructive
            onClick={onDelete}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}
