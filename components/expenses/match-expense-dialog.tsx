"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { Check, Search, SearchX, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { matchExpenseIdAtom } from "@/lib/atoms";
import {
  expenseTotal,
  formatExpenseAmount,
  formatExpenseDate,
} from "@/lib/expenses";
// The expense helpers format an expense; arbitrary sums — a running total, a
// remainder, one transaction's amount — go through the same money formatter
// they're built on.
import { invoiceMoney } from "@/lib/invoices";
import {
  formatTransactionDate,
  matchCandidates,
  searchOpenTransactions,
  type Transaction,
} from "@/lib/transactions";
import { useExpensesStore } from "@/stores/expenses";
import { useTransactionsStore } from "@/stores/transactions";
import { cn } from "@/lib/utils";

/**
 * The AI treatment's ramp, borrowed from the invoice list's AI Match button.
 *
 * The same indigo-through-violet gradient, so the thing the button promises and
 * the thing that opens are visibly one feature. Still frame at 0% is the brand
 * indigo, which is what a reduced-motion or gradient-less render falls back to.
 */
const HEADER_GRADIENT =
  "bg-[linear-gradient(110deg,hsl(var(--primary)),#8B7CFF,hsl(var(--primary)))]";

/** Which half of the dialog is up. Multiple leads, per the brief. */
type MatchTab = "multiple" | "potential";

/**
 * Reconciling an expense against the bank feed.
 *
 * The invoice dialog's twin, and deliberately so — same atom-driven open, same
 * transactions store, same helpers, same eight-second undo. What differs is the
 * direction and the arithmetic: an expense is money out, so the feed's
 * suggestions are debits rather than credits, and one expense can be covered by
 * several transactions where an invoice is settled by one payment.
 *
 * Which is why this one has two tabs. "Assign to Multiple" is a multi-select
 * with a running total and what's left to cover; "Potential Transactions" is
 * the invoice dialog's one-tap confirm, for the common case where the feed has
 * already worked it out.
 */
export function MatchExpenseDialog() {
  const [expenseId, setExpenseId] = useAtom(matchExpenseIdAtom);
  const expenses = useExpensesStore((state) => state.expenses);
  const matchExpense = useExpensesStore((state) => state.matchExpense);
  const unmatchExpense = useExpensesStore((state) => state.unmatchExpense);
  const transactions = useTransactionsStore((state) => state.transactions);
  const reconcile = useTransactionsStore((state) => state.reconcile);
  const unreconcile = useTransactionsStore((state) => state.unreconcile);

  const expense = expenses.find((entry) => entry.id === expenseId);

  const [tab, setTab] = React.useState<MatchTab>("multiple");
  const [query, setQuery] = React.useState("");
  /** The rows ticked on the multiple tab, by transaction id. */
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  /*
   * A dialog opened on a different expense starts clean — no carried-over
   * search, and nothing ticked from the last one. Ticks especially: they're
   * about to be reconciled, and inheriting them would be the worst kind of
   * stale state.
   */
  React.useEffect(() => {
    setQuery("");
    setSelected(new Set());
    setTab("multiple");
  }, [expenseId]);

  const total = expense ? expenseTotal(expense) : 0;

  /*
   * Debits, not credits. An expense is money leaving, so the half of the feed
   * that could possibly cover it is the outgoing half — offering the wrong half
   * is worse than offering none. The supplier stands in for the invoice's
   * number as the reference the feed's suggestions are matched against.
   */
  const candidates = expense
    ? matchCandidates(
        expense.supplierName || expense.description,
        total,
        transactions,
        "Debit",
      )
    : [];

  /*
   * Everything still waiting to be reconciled. `searchOpenTransactions` returns
   * nothing for an empty query — it's built for a search box that hasn't been
   * typed in — so the unfiltered list is derived here, on the same rules.
   */
  const open = transactions.filter(
    (transaction) =>
      transaction.status !== "Matched" &&
      !transaction.personal &&
      !transaction.transfer,
  );
  const searching = query.trim().length > 0;
  const rows = searching ? searchOpenTransactions(query, transactions) : open;

  const selectedTransactions = open.filter((transaction) =>
    selected.has(transaction.id),
  );
  const selectedTotal = selectedTransactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0,
  );
  /** Never negative: overshooting the expense covers it, it doesn't owe back. */
  const remaining = Math.max(0, total - selectedTotal);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /**
   * Commit the match.
   *
   * Every chosen transaction leaves the review queue, and the expense stops
   * asking to be matched — both halves of the same fact, as on the invoice
   * side.
   */
  const commit = (chosen: Transaction[]) => {
    if (!expense || chosen.length === 0) return;

    for (const transaction of chosen) reconcile(transaction.id);

    /*
     * TODO: the API owns the true one-expense-to-many-transactions
     * representation. `matchExpense` records a single reference, so the first
     * transaction's is what the row shows while the rest are reconciled without
     * being named on the expense — which is right for the feed but incomplete
     * on this side.
     */
    matchExpense(expense.id, chosen[0].reference);

    const names = chosen.map((transaction) => transaction.reference).join(", ");

    /*
     * Long enough to notice and act on. Reconciling the wrong payment is easy
     * to do and, without this, easy to miss — the row simply stops offering to
     * match and nothing says which transactions it took.
     */
    toast.success(
      chosen.length === 1
        ? `Matched to transaction ${names}`
        : `Matched to ${chosen.length} transactions`,
      {
        duration: 8000,
        description: `${expense.description} · ${names} · ${invoiceMoney(
          chosen.reduce((sum, transaction) => sum + transaction.amount, 0),
        )}`,
        action: {
          label: "Undo",
          onClick: () => {
            for (const transaction of chosen) unreconcile(transaction.id);
            unmatchExpense(expense.id);
            toast(`${expense.description} unmatched`, {
              description: `${names} ${chosen.length === 1 ? "is" : "are"} back in your review queue.`,
            });
          },
        },
      },
    );

    setExpenseId(null);
    setSelected(new Set());
    setQuery("");
  };

  return (
    <Dialog
      open={expenseId !== null}
      onOpenChange={(open) => !open && setExpenseId(null)}
    >
      {/*
        `p-0` so the gradient can run to the edges, and the built-in close is
        recoloured for it — it's a direct child button of DialogContent, and on
        an indigo bar the default near-black X is invisible.
      */}
      <DialogContent
        className={cn(
          "flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl",
          "[&>button]:text-white [&>button]:opacity-80 [&>button:hover]:opacity-100",
        )}
      >
        <DialogHeader
          className={cn(
            "shrink-0 space-y-0 p-5 pr-14 text-left",
            HEADER_GRADIENT,
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15 text-white"
              aria-hidden
            >
              <Sparkles className="size-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-base text-white">
                Match possible transactions
              </DialogTitle>
              <DialogDescription className="text-white/80">
                Pick the bank transactions that cover this expense.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {expense && (
          <>
            {/* What we're covering, so the amounts below can be read against
                something without going back to the list. */}
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-border p-5">
              <div className="min-w-0 space-y-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">
                    {expense.description}
                  </p>
                  {expense.supplierName && (
                    <Badge
                      variant="outline"
                      className="shrink-0 rounded-full border-transparent bg-muted px-2 py-0 text-[11px] font-medium text-muted-foreground"
                    >
                      {expense.supplierName}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground tabular">
                  {formatExpenseDate(expense.date)}
                </p>
              </div>

              {/* Only while there's a running total to report. On the other tab
                  a single transaction either covers it or doesn't, and a
                  SELECTED TOTAL of nothing is a figure about nothing. */}
              {tab === "multiple" && (
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Selected total
                  </p>
                  <p className="text-sm font-semibold tabular">
                    {invoiceMoney(selectedTotal)}
                  </p>
                </div>
              )}

              <div className="shrink-0 space-y-1 text-right">
                <p className="text-base font-semibold text-primary tabular">
                  {formatExpenseAmount(expense)}
                </p>
                <Badge
                  variant="outline"
                  className="rounded-full border-destructive/20 bg-destructive/10 px-2 py-0 text-[11px] font-medium text-destructive tabular"
                >
                  Remaining: {invoiceMoney(remaining)}
                </Badge>
              </div>
            </div>

            <Tabs
              value={tab}
              onValueChange={(next) => setTab(next as MatchTab)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="shrink-0 px-5 pt-4">
                <TabsList aria-label="How to match this expense">
                  <TabsTrigger value="multiple">Assign to Multiple</TabsTrigger>
                  <TabsTrigger value="potential">
                    Potential Transactions
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent
                value="multiple"
                className="mt-0 flex min-h-0 flex-1 flex-col"
              >
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search by description, reference or amount"
                      aria-label="Search transactions"
                      className="pl-9"
                    />
                  </div>

                  <h3 className="text-sm font-semibold">
                    {rows.length} Possible{" "}
                    {rows.length === 1 ? "Match" : "Matches"} Found
                  </h3>

                  {rows.length === 0 ? (
                    <EmptyFeed
                      searching={searching}
                      icon={searching ? SearchX : Search}
                    />
                  ) : (
                    <ul className="space-y-2">
                      {rows.map((transaction) => (
                        <li key={transaction.id}>
                          <SelectableRow
                            transaction={transaction}
                            checked={selected.has(transaction.id)}
                            onToggle={() => toggle(transaction.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex shrink-0 justify-end border-t border-border p-4">
                  <Button
                    disabled={selected.size === 0}
                    onClick={() => commit(selectedTransactions)}
                  >
                    <Check />
                    Match Transaction
                  </Button>
                </div>
              </TabsContent>

              <TabsContent
                value="potential"
                className="mt-0 min-h-0 flex-1 overflow-y-auto p-5"
              >
                {candidates.length > 0 ? (
                  <div className="space-y-2">
                    {candidates.map((transaction) => (
                      <TransactionOption
                        key={transaction.id}
                        transaction={transaction}
                        onConfirm={() => commit([transaction])}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center">
                    <Search
                      className="size-6 text-muted-foreground"
                      aria-hidden
                    />
                    <p className="text-sm font-medium">
                      No Possible Matches Found
                    </p>
                    <p className="max-w-[44ch] text-sm text-muted-foreground">
                      No bank transactions found that could be matched with this
                      expense. Try adjusting the amount, or create a manual
                      transaction instead.
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** One feed row with a tick, for building a match out of several. */
function SelectableRow({
  transaction,
  checked,
  onToggle,
}: {
  transaction: Transaction;
  checked: boolean;
  onToggle: () => void;
}) {
  const id = `match-${transaction.id}`;

  return (
    /* The whole row is the label, so the description is part of the target
       rather than dead text beside a 16px box. */
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-[9px] border p-3",
        "motion-safe:transition-colors",
        checked
          ? "border-primary/30 bg-primary/[0.06]"
          : "border-border hover:bg-accent/60",
      )}
    >
      <Checkbox id={id} checked={checked} onCheckedChange={onToggle} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-medium">
          {transaction.description}
        </p>
        <p className="truncate text-xs text-muted-foreground tabular">
          {formatTransactionDate(transaction.date)} · {transaction.account} ·{" "}
          {transaction.reference}
        </p>
      </div>
      <span className="shrink-0 text-sm font-medium tabular">
        {invoiceMoney(transaction.amount)}
      </span>
    </label>
  );
}

/**
 * One suggested transaction, and the button that says it's the one.
 *
 * The invoice dialog's row, unchanged in shape: a suggestion is confirmed on
 * its own rather than ticked, because the feed has already done the choosing.
 */
function TransactionOption({
  transaction,
  onConfirm,
}: {
  transaction: Transaction;
  onConfirm: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-sm font-medium">
          {transaction.description}
        </p>
        <p className="truncate text-xs text-muted-foreground tabular">
          {formatTransactionDate(transaction.date)} · {transaction.account} ·{" "}
          {transaction.reference}
        </p>
        <Badge variant="secondary" className="mt-1">
          {transaction.suggestedMatch}
        </Badge>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm font-medium tabular">
          {invoiceMoney(transaction.amount)}
        </span>
        <Button size="sm" onClick={onConfirm}>
          <Check />
          Match
        </Button>
      </div>
    </div>
  );
}

/** Nothing to tick: either the search found none, or the feed is clear. */
function EmptyFeed({
  searching,
  icon: Icon,
}: {
  searching: boolean;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-8 text-center">
      <Icon className="size-5 text-muted-foreground" />
      <p className="text-sm font-medium">
        {searching
          ? "Nothing in the feed matches that"
          : "Nothing waiting to be reconciled"}
      </p>
      <p className="max-w-[38ch] text-sm text-muted-foreground">
        {searching
          ? "Only transactions still waiting to be reconciled show up here. Try the amount, or the name on the payment."
          : "Every transaction in the feed has already been matched."}
      </p>
    </div>
  );
}
