"use client";

import * as React from "react";
import { Link2, Receipt, Search, SearchX, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyActions,
  EmptyCue,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useAttachBudgetExpenseMutation,
  useAvailableBudgetExpensesQuery,
  useBudgetExpensesQuery,
  useDetachBudgetExpenseMutation,
} from "@/hooks/use-planner-query";
import { apiErrorMessage } from "@/lib/api-error";
import { formatInvoiceDate, invoiceMoney } from "@/lib/invoices";
import type { BudgetExpense } from "@/lib/planner-api";

/**
 * The expenses counting against a budget, and the picker for adding more.
 *
 * A budget reads its spend from the ledger by category, but not every expense
 * in a category belongs to every budget — so this is where you say which ones
 * do. Linking changes what the budget has spent; it never touches the expense.
 *
 * Only rendered for a budget that exists: there is nothing to attach an expense
 * to until the budget has been saved.
 */
export function BudgetLinkedExpenses({
  budgetId,
  budgetAmount,
}: {
  budgetId: string;
  /** The budget's limit, so the linked total can be read against it. */
  budgetAmount: number;
}) {
  const [picking, setPicking] = React.useState(false);
  const linkedQuery = useBudgetExpensesQuery(budgetId);
  const detach = useDetachBudgetExpenseMutation();

  /** Which row's unlink is in flight, so only that row shows it. */
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  const linked = linkedQuery.data?.expenses ?? [];
  const total = linked.reduce((sum, expense) => sum + expense.amount, 0);
  const loading = linkedQuery.isLoading;

  const remove = async (expense: BudgetExpense) => {
    setRemovingId(expense.id);
    try {
      await detach.mutateAsync({ budgetId, expenseId: expense.id });
      toast.success("Expense unlinked", {
        description: `${expense.name} no longer counts against this budget.`,
      });
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to unlink that expense."));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-4">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2.5 text-base">
            Linked expenses
            {!loading && linked.length > 0 && (
              <Badge variant="secondary">{linked.length}</Badge>
            )}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            These expenses count against this budget. Unlinking one leaves the
            expense itself untouched.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => setPicking(true)}
        >
          <Link2 />
          Link expense
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading ? (
          <ExpenseRowsSkeleton />
        ) : linked.length === 0 ? (
          <Empty className="border-dashed bg-transparent shadow-none">
            <EmptyMedia>
              <Receipt aria-hidden />
            </EmptyMedia>
            <div className="space-y-1">
              <EmptyTitle>Nothing linked yet</EmptyTitle>
              <EmptyDescription>
                Link an expense and its amount starts counting towards this
                budget&apos;s limit.
              </EmptyDescription>
            </div>
            <EmptyCue label="Start here" />
            <EmptyActions>
              <Button size="sm" onClick={() => setPicking(true)}>
                <Link2 />
                Link expense
              </Button>
            </EmptyActions>
          </Empty>
        ) : (
          <>
            <ul className="divide-y rounded-lg border border-border">
              {linked.map((expense) => (
                <li
                  key={expense.id}
                  className="flex items-center gap-3 p-3"
                >
                  <ExpenseIdentity expense={expense} />
                  <span className="shrink-0 text-sm font-medium tabular">
                    {invoiceMoney(expense.amount)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    disabled={removingId === expense.id}
                    onClick={() => remove(expense)}
                    aria-label={`Unlink ${expense.name}`}
                  >
                    <X className="size-4 text-muted-foreground" />
                  </Button>
                </li>
              ))}
            </ul>

            {/* The sum of what's shown, against the limit it counts towards —
                both figures are on screen, so neither can be a surprise. */}
            <p className="text-xs text-muted-foreground tabular">
              {invoiceMoney(total)} linked
              {budgetAmount > 0 && ` of ${invoiceMoney(budgetAmount)} budgeted`}
            </p>
          </>
        )}
      </CardContent>

      <LinkExpenseDialog
        budgetId={budgetId}
        open={picking}
        onOpenChange={setPicking}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * The picker
 * ------------------------------------------------------------------ */

/**
 * Choosing an expense to link.
 *
 * The list is narrowed by the server, not here: it returns only expenses inside
 * the budget's current cycle, in one of its categories, and not already linked.
 * That's worth saying on screen, because otherwise an empty list reads as a
 * broken search rather than as "there is nothing eligible".
 */
function LinkExpenseDialog({
  budgetId,
  open,
  onOpenChange,
}: {
  budgetId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = React.useState("");
  const search = useDebouncedValue(query, 300);
  const attach = useAttachBudgetExpenseMutation();

  /** Which row's link is in flight, so only that row shows it. */
  const [linkingId, setLinkingId] = React.useState<string | null>(null);

  // A dialog opened again starts on a clean search rather than the last one.
  React.useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const availableQuery = useAvailableBudgetExpensesQuery(
    budgetId,
    search,
    open,
  );
  const available = availableQuery.data?.expenses ?? [];
  const searching = search.trim().length > 0;

  const link = async (expense: BudgetExpense) => {
    setLinkingId(expense.id);
    try {
      await attach.mutateAsync({ budgetId, expenseId: expense.id });
      toast.success("Expense linked", {
        description: `${expense.name} · ${invoiceMoney(expense.amount)} now counts against this budget.`,
      });
    } catch (error) {
      // The API rejects a duplicate by name, which is worth showing verbatim.
      toast.error(apiErrorMessage(error, "Failed to link that expense."));
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link an expense</DialogTitle>
          <DialogDescription>
            Only expenses in this budget&apos;s categories and current period
            can be linked, and each one only once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name"
              aria-label="Search expenses"
              className="pl-9"
            />
          </div>

          {availableQuery.isLoading ? (
            <ExpenseRowsSkeleton />
          ) : available.length > 0 ? (
            <>
              <ul className="divide-y rounded-lg border border-border">
                {available.map((expense) => (
                  <li
                    key={expense.id}
                    className="flex items-center gap-3 p-3"
                  >
                    <ExpenseIdentity expense={expense} />
                    <span className="shrink-0 text-sm font-medium tabular">
                      {invoiceMoney(expense.amount)}
                    </span>
                    <Button
                      size="sm"
                      className="shrink-0"
                      disabled={linkingId === expense.id}
                      onClick={() => link(expense)}
                    >
                      {linkingId === expense.id ? "Linking..." : "Link"}
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground tabular">
                {available.length}{" "}
                {available.length === 1 ? "expense" : "expenses"} available to
                link
              </p>
            </>
          ) : (
            /* Two different nothings: a search that matched none, and a budget
               with nothing eligible at all. They need different advice. */
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center">
              {searching ? (
                <>
                  <SearchX className="size-5 text-muted-foreground" aria-hidden />
                  <p className="text-sm font-medium">
                    No expense matches &ldquo;{search.trim()}&rdquo;
                  </p>
                  <p className="max-w-[40ch] text-sm text-muted-foreground">
                    Only expenses in this budget&apos;s categories and period
                    are searched. Try a shorter name.
                  </p>
                </>
              ) : (
                <>
                  <Receipt className="size-5 text-muted-foreground" aria-hidden />
                  <p className="text-sm font-medium">
                    Nothing left to link
                  </p>
                  <p className="max-w-[40ch] text-sm text-muted-foreground">
                    Every expense in this budget&apos;s categories and current
                    period is already linked — or none have been recorded yet.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Shared pieces
 * ------------------------------------------------------------------ */

/** The name, the date, and the two facts worth knowing at a glance. */
function ExpenseIdentity({ expense }: { expense: BudgetExpense }) {
  return (
    <>
      <span
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
        aria-hidden
      >
        <Receipt className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{expense.name}</p>
          {expense.paidWithCash && <Badge variant="secondary">Cash</Badge>}
          {expense.reconciled && <Badge variant="success">Reconciled</Badge>}
        </div>
        <p className="truncate text-xs text-muted-foreground tabular">
          {expense.date ? formatInvoiceDate(expense.date) : "No date"}
        </p>
      </div>
    </>
  );
}

/** Stands in for the rows while a fetch is out, at the same height. */
function ExpenseRowsSkeleton() {
  return (
    <ul className="divide-y rounded-lg border border-border" aria-hidden>
      {[0, 1, 2].map((row) => (
        <li key={row} className="flex items-center gap-3 p-3">
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-16 shrink-0" />
          <Skeleton className="size-8 shrink-0 rounded-md" />
        </li>
      ))}
    </ul>
  );
}
