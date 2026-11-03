"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { Scissors, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import {
  AssignToMultipleTab,
  RefundTab,
} from "@/components/transactions/match-transaction-tabs";
import {
  editTransactionIdAtom,
  matchTransactionIdAtom,
  recategoriseTransactionIdAtom,
  splitTransactionIdAtom,
} from "@/lib/atoms";
import { amountError } from "@/lib/expenses";
import { type Expense } from "@/lib/expenses";
import { apiErrorMessage } from "@/lib/api-error";
import { invoiceMoney } from "@/lib/invoices";
import { fetchMatchCandidates } from "@/lib/transaction-match";
import { RULE_CATEGORIES } from "@/lib/rules";
import {
  formatTransactionDate,
  matchedAmount,
  type Transaction,
  type TransactionType,
} from "@/lib/transactions";
import { cn } from "@/lib/utils";
import { useTransactionsStore } from "@/stores/transactions";
import { activeCurrencySymbol } from "@/lib/country-context";

/** The categories a transaction can carry, shared with Matching rules. */
const CATEGORIES = [...RULE_CATEGORIES] as string[];

/** Every dialog here needs the transaction its atom points at. */
function useTransaction(id: string | null): Transaction | undefined {
  const transactions = useTransactionsStore((state) => state.transactions);
  return transactions.find((transaction) => transaction.id === id);
}

/* ------------------------------------------------------------------ *
 * Edit
 * ------------------------------------------------------------------ */

/**
 * The fields a bank line can sensibly be corrected on. Reference and status
 * aren't here: the reference identifies the line on the statement, and status is
 * the outcome of reconciling rather than something to type.
 */
export function EditTransactionDialog() {
  const [id, setId] = useAtom(editTransactionIdAtom);
  const transaction = useTransaction(id);
  const patchTransaction = useTransactionsStore(
    (state) => state.patchTransaction,
  );

  const [date, setDate] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState(CATEGORIES[0]);
  const [type, setType] = React.useState<TransactionType>("Debit");
  const [amount, setAmount] = React.useState("");

  // Reseeded whenever the dialog opens on a different transaction.
  React.useEffect(() => {
    if (!transaction) return;
    setDate(transaction.date);
    setDescription(transaction.description);
    setCategory(transaction.category);
    setType(transaction.type);
    setAmount(String(transaction.amount));
  }, [transaction]);

  const amountIssue =
    amountError(amount) ??
    (!amount.trim() || Number(amount) <= 0
      ? "Enter a valid amount."
      : undefined);
  const descriptionIssue =
    description.trim().length < 2 ? "Enter a description." : undefined;

  const onSave = () => {
    if (!transaction) return;
    patchTransaction(transaction.id, {
      date,
      description: description.trim(),
      category,
      type,
      amount: Number(amount),
    });
    toast.success("Transaction updated");
    setId(null);
  };

  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && setId(null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit transaction</DialogTitle>
          <DialogDescription className="tabular">
            {transaction?.reference}
          </DialogDescription>
        </DialogHeader>

        {transaction && (
          <div className="space-y-4">
            <Field label="Date" required>
              <DatePicker value={date} onChange={setDate} />
            </Field>

            <Field label="Description" required error={descriptionIssue}>
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                aria-invalid={!!descriptionIssue}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type">
                <Select
                  value={type}
                  onValueChange={(next) => setType(next as TransactionType)}
                >
                  <SelectTrigger aria-label="Type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Credit">Credit — money in</SelectItem>
                    <SelectItem value="Debit">Debit — money out</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Amount" required error={amountIssue}>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {activeCurrencySymbol()}
                  </span>
                  <Input
                    className={cn(
                      "pl-7 tabular",
                      amountIssue &&
                        "border-destructive focus-visible:ring-destructive",
                    )}
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    aria-label="Amount"
                    aria-invalid={!!amountIssue}
                  />
                </div>
              </Field>
            </div>

            <Field label="Category">
              <CategorySelect value={category} onChange={setCategory} />
            </Field>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setId(null)}>
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={!!amountIssue || !!descriptionIssue || !date}
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Recategorise
 * ------------------------------------------------------------------ */

/**
 * Category on its own. It duplicates a field in Edit deliberately: recategorising
 * is what you do to a run of bank lines, and it shouldn't mean walking past the
 * date, amount and description each time.
 */
export function RecategoriseDialog() {
  const [id, setId] = useAtom(recategoriseTransactionIdAtom);
  const transaction = useTransaction(id);
  const patchTransaction = useTransactionsStore(
    (state) => state.patchTransaction,
  );
  const [category, setCategory] = React.useState(CATEGORIES[0]);

  React.useEffect(() => {
    if (transaction) setCategory(transaction.category);
  }, [transaction]);

  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && setId(null)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Recategorise</DialogTitle>
          <DialogDescription>{transaction?.description}</DialogDescription>
        </DialogHeader>

        {transaction && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Currently{" "}
              <span className="font-medium text-foreground">
                {transaction.category}
              </span>
            </p>
            <Field label="New category">
              <CategorySelect value={category} onChange={setCategory} />
            </Field>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setId(null)}>
            Cancel
          </Button>
          <Button
            disabled={!transaction || category === transaction.category}
            onClick={() => {
              if (!transaction) return;
              patchTransaction(transaction.id, { category });
              toast.success(`Recategorised as ${category}`);
              setId(null);
            }}
          >
            Recategorise
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Match transaction
 * ------------------------------------------------------------------ */

/**
 * The AI treatment's ramp, as the expenses match dialog wears it.
 *
 * Same indigo-through-violet gradient, so the two reconciliation dialogs read
 * as one feature seen from either side of the same fact.
 */
const HEADER_GRADIENT =
  "bg-[linear-gradient(110deg,hsl(var(--primary)),#8B7CFF,hsl(var(--primary)))]";

/** Which half of the dialog is up. Creating leads, per the brief. */
type MatchTab = "multiple" | "refund";

/**
 * Reconciling a bank line against the rest of the books.
 *
 * The expenses dialog's twin, seen from the other side: there, an expense goes
 * looking for the transactions that cover it; here, a transaction goes looking
 * for what it was. Same shell — gradient header, summary strip, segmented tabs,
 * scrolling body — because they're one job approached from two screens, and a
 * second treatment would make them look like two features.
 *
 * Three tabs rather than two, because a transaction has one more answer
 * available to it: nothing on file matches, so record what it was. Their bodies
 * live in `match-transaction-tabs.tsx` — three tables and a form is more than
 * this file, which already holds four dialogs, should carry.
 */
export function MatchTransactionDialog() {
  const [id, setId] = useAtom(matchTransactionIdAtom);
  const transaction = useTransaction(id);

  const [tab, setTab] = React.useState<MatchTab>("multiple");
  /**
   * What the selection tabs have chosen so far, by id.
   *
   * Held here rather than in each tab because the summary strip above them
   * reports it — a total that lived inside a tab would be a total the header
   * couldn't see.
   */
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  /*
   * A dialog opened on a different transaction starts clean. Ticks especially:
   * they're about to be reconciled, and inheriting them would be the worst kind
   * of stale state.
   */
  React.useEffect(() => {
    setTab("multiple");
    setSelected(new Set());
  }, [id]);

  const total = transaction?.amount ?? 0;

  /**
   * Everything this line could be matched against, built here rather than in
   * the tab that lists it.
   *
   * The summary strip above the tabs reports what's ticked, so the amounts have
   * to be resolvable outside the tab doing the ticking — a total that lived
   * inside a tab would be a total the header couldn't see.
   */
  /*
   * What this line could be split across, from sole-webapp's own sources:
   * unmatched expenses and assets up to its amount for money out, open
   * invoices for money in. Fetched here so the strip above the tabs can total
   * what's ticked.
   */
  const candidatesQuery = useQuery({
    queryKey: [
      "match-candidates",
      transaction?.type ?? "",
      transaction?.amount ?? 0,
    ],
    queryFn: () =>
      fetchMatchCandidates(
        transaction?.type === "Credit" ? "Credit" : "Debit",
        transaction?.amount ?? 0,
      ),
    enabled: !!transaction,
  });
  const items = React.useMemo(
    () => candidatesQuery.data ?? [],
    [candidatesQuery.data],
  );
  const selectedTotal = items
    .filter((item) => selected.has(item.key))
    .reduce((sum, item) => sum + item.amount, 0);

  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  /** Never negative: overshooting covers the line, it doesn't owe back. */
  const remaining = Math.max(0, total - selectedTotal);
  /**
   * Nothing left to account for.
   *
   * Read off `remaining` rather than comparing the two totals again, so the
   * pill can't disagree with the figure beside it — and so overshooting counts
   * as covered, which is what the clamp above already decided.
   */
  const fullyMatched = remaining === 0;

  const moneyIn = transaction?.type === "Credit";

  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && setId(null)}>
      {/*
        `p-0` so the gradient can run to the edges, and the built-in close is
        recoloured for it — it's a direct child button of DialogContent, and on
        an indigo bar the default near-black X is invisible.

        Wider than the expenses dialog: these tabs hold tables rather than a
        list of rows.
      */}
      <DialogContent
        className={cn(
          "flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl",
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
                Match Transaction
              </DialogTitle>
              <DialogDescription className="text-white/80">
                Match this transaction to an invoice or expense.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {transaction && (
          <>
            {/* What we're covering, so the figures below can be read against
                something without going back to the list. */}
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-border p-5">
              <div className="min-w-0 space-y-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">
                    {transaction.description}
                  </p>
                  {/* The direction as a quiet chip rather than a colour on the
                      figure: which way the money went is a fact about the line,
                      not a judgement on it. */}
                  <Badge
                    variant="outline"
                    className="shrink-0 rounded-full border-transparent bg-muted px-2 py-0 text-[11px] font-medium text-muted-foreground"
                  >
                    {moneyIn ? "Money In" : "Money Out"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground tabular">
                  {formatTransactionDate(transaction.date)} · ID: #
                  {transaction.reference}
                </p>
              </div>

              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Selected total
                </p>
                <p className="text-sm font-semibold tabular">
                  {invoiceMoney(selectedTotal)}
                </p>
              </div>

              <div className="shrink-0 space-y-1 text-right">
                <p className="text-base font-semibold text-primary tabular">
                  {invoiceMoney(transaction.amount)}
                </p>
                {/* sole-webapp's "Available": what's still unaccounted for. */}
                <p className="text-xs text-muted-foreground tabular">
                  Available{" "}
                  {invoiceMoney(
                    Math.max(0, transaction.amount - matchedAmount(transaction)),
                  )}
                </p>
                {/*
                  Red while there's a gap, green once there isn't.

                  The pill used to be red unconditionally, which meant the one
                  moment worth reporting — the line is fully accounted for —
                  was drawn in the colour the product uses for a problem. And
                  "Remaining: $0.00" is a figure that has to be read and
                  subtracted before it means anything; "Fully matched" is the
                  same fact already worked out.

                  Tokens rather than literal colours, so both states follow the
                  theme the way every other status in the product does.
                */}
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full px-2 py-0 text-[11px] font-medium tabular",
                    fullyMatched
                      ? "border-success/20 bg-success/10 text-success"
                      : "border-destructive/20 bg-destructive/10 text-destructive",
                  )}
                >
                  {fullyMatched
                    ? "Fully matched"
                    : `Remaining: ${invoiceMoney(remaining)}`}
                </Badge>
              </div>
            </div>

            <Tabs
              value={tab}
              onValueChange={(next) => setTab(next as MatchTab)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="shrink-0 px-5 pt-4">
                <TabsList aria-label="How to match this transaction">
                  <TabsTrigger value="multiple">Assign to Multiple</TabsTrigger>
                  {/* Named for the direction: money coming back in is a supplier
                      returning yours, money going out is you returning a
                      client's. Same table behind both. */}
                  <TabsTrigger value="refund">
                    {moneyIn ? "Vendor Refund" : "Client Refund"}
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent
                value="multiple"
                className="mt-0 min-h-0 flex-1 overflow-y-auto p-5"
              >
                <AssignToMultipleTab
                  transaction={transaction}
                  candidates={items}
                  loading={candidatesQuery.isPending}
                  error={
                    candidatesQuery.isError
                      ? apiErrorMessage(
                          candidatesQuery.error,
                          "Couldn't load records to match.",
                        )
                      : null
                  }
                  selected={selected}
                  onToggle={toggle}
                  onClear={() => setSelected(new Set())}
                  onDone={() => setId(null)}
                />
              </TabsContent>

              <TabsContent
                value="refund"
                className="mt-0 min-h-0 flex-1 overflow-y-auto p-5"
              >
                <RefundTab transaction={transaction} onDone={() => setId(null)} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** An expense is available to match while nothing else claims it. */
export function unmatchedExpenses(expenses: Expense[]): Expense[] {
  return expenses.filter(
    (expense) => !expense.transactionRef && expense.status !== "Matched",
  );
}

/* ------------------------------------------------------------------ *
 * Split
 * ------------------------------------------------------------------ */

/**
 * Splits one bank line into two, for the payment that covered two things.
 *
 * The second amount is derived rather than typed: two free fields that must add
 * up to a fixed total is a sum the user shouldn't have to do, and one they can
 * get wrong.
 */
export function SplitTransactionDialog() {
  const [id, setId] = useAtom(splitTransactionIdAtom);
  const transaction = useTransaction(id);
  const splitTransaction = useTransactionsStore(
    (state) => state.splitTransaction,
  );

  const total = transaction?.amount ?? 0;
  const [first, setFirst] = React.useState("");
  const [firstCategory, setFirstCategory] = React.useState(CATEGORIES[0]);
  const [secondCategory, setSecondCategory] = React.useState(CATEGORIES[0]);

  React.useEffect(() => {
    if (!transaction) return;
    // Half each, rounded to the cent, as a starting point.
    setFirst((transaction.amount / 2).toFixed(2));
    setFirstCategory(transaction.category);
    setSecondCategory(transaction.category);
  }, [transaction]);

  const firstAmount = Number(first) || 0;
  const secondAmount = Math.round((total - firstAmount) * 100) / 100;
  const issue =
    amountError(first) ??
    (firstAmount <= 0 || secondAmount <= 0
      ? `Enter an amount between $0.01 and ${invoiceMoney(total - 0.01)}.`
      : undefined);

  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && setId(null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Split transaction</DialogTitle>
          <DialogDescription>
            {transaction
              ? `${transaction.description} · ${invoiceMoney(total)}`
              : null}
          </DialogDescription>
        </DialogHeader>

        {transaction && (
          <div className="space-y-4">
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                First part
              </p>
              <Field label="Amount" error={issue}>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {activeCurrencySymbol()}
                  </span>
                  <Input
                    className={cn(
                      "pl-7 tabular",
                      issue &&
                        "border-destructive focus-visible:ring-destructive",
                    )}
                    inputMode="decimal"
                    value={first}
                    onChange={(event) => setFirst(event.target.value)}
                    aria-label="First amount"
                    aria-invalid={!!issue}
                  />
                </div>
              </Field>
              <Field label="Category">
                <CategorySelect
                  value={firstCategory}
                  onChange={setFirstCategory}
                />
              </Field>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Second part
                </p>
                <p className="text-sm font-medium tabular">
                  {secondAmount > 0 ? invoiceMoney(secondAmount) : "—"}
                </p>
              </div>
              <Field label="Category">
                <CategorySelect
                  value={secondCategory}
                  onChange={setSecondCategory}
                />
              </Field>
            </div>

            <p className="text-xs text-muted-foreground">
              Both parts keep the {formatTransactionDate(transaction.date)} date
              and this account, and go back to Review so you can check them.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setId(null)}>
            Cancel
          </Button>
          <Button
            disabled={!!issue || !transaction}
            onClick={() => {
              if (!transaction) return;
              splitTransaction(transaction.id, [
                {
                  amount: firstAmount,
                  category: firstCategory,
                  description: `${transaction.description} (1 of 2)`,
                },
                {
                  amount: secondAmount,
                  category: secondCategory,
                  description: `${transaction.description} (2 of 2)`,
                },
              ]);
              toast.success("Transaction split in two");
              setId(null);
            }}
          >
            <Scissors />
            Split
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategorySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="Category">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CATEGORIES.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
