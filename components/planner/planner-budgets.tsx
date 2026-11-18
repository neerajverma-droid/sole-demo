"use client";

import * as React from "react";
import Link from "next/link";
import { useAtom } from "jotai";
import { Pencil, PiggyBank, Plus, Receipt, Trash2 } from "lucide-react";

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
import { LinkExpenseDialog } from "@/components/planner/budget-expenses";
import {
  PlannerBulkDelete,
  usePlannerSelection,
} from "@/components/planner/planner-bulk";
import {
  PlannerListPagination,
  skeletonRowCount,
  type PlannerPaging,
} from "@/components/planner/planner-pagination";
import { PLANNER_ROOT } from "@/components/planner/planner-detail";
import { useBulkDeleteBudgetsMutation } from "@/hooks/use-planner-query";
import { deleteBudgetIdAtom } from "@/lib/atoms";
import { invoiceMoney } from "@/lib/invoices";
import {
  budgetActual,
  budgetAmount,
  budgetCategoryLabel,
  budgetProgress,
  budgetRemaining,
  budgetStatus,
  budgetStatusVariant,
  type Budget,
} from "@/lib/planner";
import type { Expense } from "@/lib/expenses";
import { cn } from "@/lib/utils";

/**
 * The Budget tab: spending envelopes for recurring costs.
 *
 * Actual spend is read from the expense ledger rather than entered, so an
 * envelope can't quietly go stale — the figure moves when an expense is recorded.
 * A row opens the dialog that adds expenses to it; editing is in its menu.
 */
export function PlannerBudgets({
  budgets,
  expenses,
  today,
  loading = false,
  paging,
}: {
  budgets: Budget[];
  expenses: Expense[];
  today: string;
  /** Present once a page has loaded; absent before, when there's nothing to page. */
  paging?: PlannerPaging;
  /** While the list's fetch is still out — "no budgets yet" would be a guess. */
  loading?: boolean;
}) {
  const [, setDeleteId] = useAtom(deleteBudgetIdAtom);
  // The budget whose "add expenses" dialog is open, if any.
  const [addingTo, setAddingTo] = React.useState<Budget | null>(null);
  const selection = usePlannerSelection(budgets.map((budget) => budget.id));
  const bulkDelete = useBulkDeleteBudgetsMutation();

  // Whenever the list is loading, not only the first time — see PlannerGoals.
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
                  <Shimmer className="mx-auto h-4 w-16" />
                </TableCell>
                <TableCell>
                  <Shimmer className="mx-auto h-4 w-28" />
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
            itemLabel="budget"
            navLabel="Budgets pages"
            disabled
          />
        )}
      </div>
    );
  }

  if (budgets.length === 0) {
    return (
      <Empty>
        <EmptyMedia>
          <PiggyBank aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>No budgets yet</EmptyTitle>
          <EmptyDescription>
            Set a limit on a category of recurring costs, then link the
            expenses that count towards it to track what you&apos;ve spent.
          </EmptyDescription>
        </div>
        <EmptyCue label="Start here" />
        <EmptyActions>
          <Button size="sm" asChild data-usertour="budget-new">
            <Link href={`${PLANNER_ROOT}/budgets/new`}>
              <Plus />
              New Budget
            </Link>
          </Button>
        </EmptyActions>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <PlannerBulkDelete
        chosen={selection.chosen}
        noun="budget"
        plural="budgets"
        consequence="Your expenses aren't affected — a budget only reads them."
        deleteIds={bulkDelete.mutateAsync}
        onDone={selection.clear}
        onClear={selection.clear}
      />
      <TableFrame selection={selection}>
        <TableBody>
          {budgets.map((budget) => {
            const spent = budgetActual(budget, expenses, today);
            const amount = budgetAmount(budget);
            const left = budgetRemaining(budget, expenses, today);
            const status = budgetStatus(budget, expenses, today);

            return (
              <TableRow
                key={budget.id}
                className="cursor-pointer"
                data-state={selection.isChosen(budget.id) ? "selected" : undefined}
                onClick={() => setAddingTo(budget)}
              >
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <Checkbox
                    checked={selection.isChosen(budget.id)}
                    onCheckedChange={() => selection.toggle(budget.id)}
                    aria-label={`Select ${budget.name}`}
                  />
                </TableCell>
                <TableCell className="max-w-[16rem]">
                  {/* A real button as well as the clickable row, so the
                      dialog is reachable by keyboard. The whole name is on hover. */}
                  <FullTextTip text={budget.name}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setAddingTo(budget);
                      }}
                      className="block max-w-full truncate text-left font-medium outline-none hover:underline focus-visible:underline"
                    >
                      {budget.name}
                    </button>
                  </FullTextTip>
                  <RowSubtext
                    text={`${budgetCategoryLabel(budget)} · ${budget.period}`}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap text-center">
                  {status ? (
                    <Badge variant={budgetStatusVariant(status)}>{status}</Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-center font-medium tabular">
                  {invoiceMoney(spent)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-center tabular text-muted-foreground">
                  {invoiceMoney(amount)}
                </TableCell>
                <TableCell
                  className={cn(
                    "whitespace-nowrap text-center tabular",
                    left < 0 && "text-destructive",
                  )}
                >
                  {left < 0 && (
                    <span className="mr-1 text-xs">Over by</span>
                  )}
                  {invoiceMoney(Math.abs(left))}
                </TableCell>
                <TableCell className="whitespace-nowrap text-center">
                  <Progress
                    value={budgetProgress(budget, expenses, today) * 100}
                    className="mx-auto w-24"
                  />
                </TableCell>
                <TableCell
                  className={HUG_COLUMN}
                  onClick={(event) => event.stopPropagation()}
                >
                  {/* Out of the menu and onto the row, as on the Invoices list. */}
                  <div className="flex items-center justify-end gap-1">
                    <RowIconAction
                      icon={<Receipt />}
                      label="Add expenses"
                      onClick={() => setAddingTo(budget)}
                    />
                    <RowIconAction
                      icon={<Pencil />}
                      label="Edit budget"
                      href={`${PLANNER_ROOT}/budgets/${budget.id}`}
                    />
                    <RowIconAction
                      icon={<Trash2 />}
                      label="Delete budget"
                      destructive
                      onClick={() => setDeleteId(budget.id)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </TableFrame>
      {paging && (
        <PlannerListPagination
          paging={paging}
          itemLabel="budget"
          navLabel="Budgets pages"
          disabled={loading}
        />
      )}

      {addingTo && (
        <LinkExpenseDialog
          budgetId={addingTo.id}
          budgetName={addingTo.name}
          open
          onOpenChange={(open) => {
            if (!open) setAddingTo(null);
          }}
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
                  aria-label="Select all budgets"
                />
              )}
            </TableHead>
            {/* As on the Invoices list: only the name column is left-aligned;
                every other column is centred, and the actions sit at the right edge. */}
            <TableHead className="w-[16rem]">Budget</TableHead>
            <TableHead className="whitespace-nowrap text-center">Status</TableHead>
            <TableHead className="whitespace-nowrap text-center">Spent</TableHead>
            <TableHead className="whitespace-nowrap text-center">Budget</TableHead>
            <TableHead className="whitespace-nowrap text-center">Left</TableHead>
            <TableHead className="whitespace-nowrap text-center">Used</TableHead>
            <TableHead className={cn(HUG_COLUMN, "text-right")}>Actions</TableHead>
          </TableRow>
        </TableHeader>
        {children}
      </Table>
    </div>
  );
}
