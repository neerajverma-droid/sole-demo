"use client";

import Link from "next/link";
import { useAtom } from "jotai";
import {
  MoreHorizontal,
  Pencil,
  PiggyBank,
  Trash2,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyActions,
  EmptyCue,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { MenuAction } from "@/components/ui/menu-action";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PLANNER_ROOT } from "@/components/planner/planner-detail";
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

/**
 * The Budget tab: spending envelopes for recurring costs.
 *
 * Actual spend is read from the expense ledger rather than entered, so an
 * envelope can't quietly go stale — the figure moves when an expense is recorded.
 */
export function PlannerBudgets({
  budgets,
  expenses,
  today,
  loading = false,
}: {
  budgets: Budget[];
  expenses: Expense[];
  today: string;
  /** While the list's fetch is still out — "no budgets yet" would be a guess. */
  loading?: boolean;
}) {
  const [, setDeleteId] = useAtom(deleteBudgetIdAtom);

  if (loading && budgets.length === 0) return <BudgetsSkeleton />;

  if (budgets.length === 0) {
    return (
      <Empty>
        <EmptyMedia>
          <PiggyBank aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>No budgets yet</EmptyTitle>
          <EmptyDescription>
            Set a limit on a category of recurring costs, and Sole tracks what
            you&apos;ve spent against it from your expenses.
          </EmptyDescription>
        </div>
        <EmptyCue label="Start here" />
        <EmptyActions>
          <Button size="sm" asChild>
            <Link href={`${PLANNER_ROOT}/budgets/new`}>New Budget</Link>
          </Button>
        </EmptyActions>
      </Empty>
    );
  }

  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {budgets.map((budget) => {
        const spent = budgetActual(budget, expenses, today);
        const amount = budgetAmount(budget);
        const left = budgetRemaining(budget, expenses, today);
        const status = budgetStatus(budget, expenses, today);

        return (
          <li
            key={budget.id}
            className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
                  aria-hidden
                >
                  <Wallet className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{budget.name}</p>
                    {status && (
                      <Badge variant={budgetStatusVariant(status)}>
                        {status}
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {budgetCategoryLabel(budget)} · {budget.period}
                  </p>
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    aria-label={`Actions for ${budget.name}`}
                  >
                    <MoreHorizontal className="size-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <MenuAction
                    icon={<Pencil />}
                    label="Edit"
                    href={`${PLANNER_ROOT}/budgets/${budget.id}`}
                  />
                  <DropdownMenuSeparator />
                  <MenuAction
                    icon={<Trash2 />}
                    label="Delete"
                    onSelect={() => setDeleteId(budget.id)}
                    destructive
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Progress value={budgetProgress(budget, expenses, today) * 100} />

            <dl className="flex flex-wrap items-baseline justify-between gap-3 text-sm">
              <div className="flex items-baseline gap-1.5">
                <dt className="text-muted-foreground">Spent</dt>
                <dd className="font-medium tabular">{invoiceMoney(spent)}</dd>
                <dd className="text-xs text-muted-foreground tabular">
                  of {invoiceMoney(amount)}
                </dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <dt className="text-muted-foreground">
                  {left < 0 ? "Over by" : "Left"}
                </dt>
                <dd className="font-medium tabular">
                  {invoiceMoney(Math.abs(left))}
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

/** Stands in for the cards while the fetch is out, in the same two columns. */
function BudgetsSkeleton() {
  return (
    <ul className="grid gap-4 lg:grid-cols-2" aria-hidden>
      {[0, 1, 2, 3].map((row) => (
        <li
          key={row}
          className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Skeleton className="size-9 shrink-0 rounded-xl" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="size-8 shrink-0 rounded-md" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="flex items-baseline justify-between gap-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20" />
          </div>
        </li>
      ))}
    </ul>
  );
}
