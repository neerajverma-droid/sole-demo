"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, SearchX } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  fetchPossibleMatches,
  filterMatchCandidates,
  matchMultipleTransactions,
  matchSelectionTotals,
  matchSingleTransaction,
  type MatchCandidate,
} from "@/lib/bank-match";
import { apiErrorMessage } from "@/lib/api-error";
import { matchExpenseAtom } from "@/lib/atoms";
import {
  expenseTotal,
  formatExpenseDate,
  type Expense,
} from "@/lib/expenses";
import { invoiceMoney } from "@/lib/invoices";
import { cn } from "@/lib/utils";

type MatchTab = "potential" | "multiple";

/**
 * Same real bank-matching flow as super-contributions' own dialog — an
 * expense already *is* the "expense" side of `lib/bank-match.ts`, not a
 * stand-in for one, so nothing here needed a new endpoint.
 */
export function MatchDialog() {
  const [expense, setMatchExpense] = useAtom(matchExpenseAtom);
  const queryClient = useQueryClient();

  return (
    <Dialog
      open={expense !== null}
      onOpenChange={(open) => {
        if (open) return;
        setMatchExpense(null);
        // Refreshes the list and the cards on every close, not only a
        // successful match — a cancelled attempt can still follow a match
        // made moments earlier, and closing shouldn't leave stale figures on
        // screen once the dialog's out of the way.
        queryClient.invalidateQueries({ queryKey: ["expenses"] });
        queryClient.invalidateQueries({ queryKey: ["expenses-page"] });
        queryClient.invalidateQueries({ queryKey: ["expense-summary"] });
      }}
    >
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {expense && (
          // Keyed on the expense, so opening a different row resets the
          // selection and the tab rather than carrying the last one over.
          <MatchBody
            key={expense.id}
            expense={expense}
            onClose={() => setMatchExpense(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MatchBody({
  expense,
  onClose,
}: {
  expense: Expense;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = React.useState<MatchTab>("potential");
  const [chosen, setChosen] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState("");
  const [matchingId, setMatchingId] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  /**
   * Not a client-side view of one fetched list — "Assign to multiple" is a
   * genuinely different server query (every debit in the last 260 days,
   * rather than ones sized to what's still owing), so switching tabs
   * refetches rather than re-filtering.
   */
  const query = useQuery({
    queryKey: ["possible-matches", "expense", expense.id, tab === "multiple"],
    queryFn: () =>
      fetchPossibleMatches("expense", expense.id, {
        multiple: tab === "multiple",
      }),
  });

  const candidates = query.data?.candidates ?? [];
  const remainingAmount = query.data?.remainingAmount ?? 0;

  // Selection and search are cleared on a tab switch — the two tabs query
  // different candidate pools, so a ticked id or a typed search from one has
  // nothing to mean on the other.
  const changeTab = (next: string) => {
    setTab(next as MatchTab);
    setChosen([]);
    setSearch("");
  };

  const visibleCandidates = filterMatchCandidates(candidates, search);
  // Selection stays against the full list, not the search-narrowed view — a
  // ticked row still counts once the search box hides it, it just can't be
  // seen to untick without clearing the search first.
  const selected = candidates.filter((entry) => chosen.includes(entry.id));
  const totals = matchSelectionTotals(remainingAmount, selected);
  const alreadyMatched = Math.max(0, expenseTotal(expense) - remainingAmount);
  /** Sole-webapp's own rule: once the ticked total covers what's owing, an
   *  unticked row can no longer be added — it only stops you adding more,
   *  it doesn't cap a total that's already over. */
  const limitReached = totals.remaining <= 0;

  const toggle = (id: string) =>
    setChosen((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );

  const afterMatch = async (count: number) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["expenses"] }),
      queryClient.invalidateQueries({ queryKey: ["expenses-page"] }),
      queryClient.invalidateQueries({ queryKey: ["expense-summary"] }),
    ]);
    toast.success(totals.settled ? "Expense fully matched" : "Expense matched", {
      description: `${count} ${count === 1 ? "transaction" : "transactions"} assigned to ${expense.description}.`,
    });
    onClose();
  };

  /** Potential transactions tab: one click, one match — no selection step. */
  const matchOne = async (candidate: MatchCandidate) => {
    if (matchingId) return;
    setMatchingId(candidate.id);
    try {
      await matchSingleTransaction("expense", expense.id, candidate.id);
      await afterMatch(1);
    } catch (error) {
      toast.error(
        apiErrorMessage(error, "Couldn't match that transaction. Try again."),
      );
    } finally {
      setMatchingId(null);
    }
  };

  /** Assign to multiple tab: tick several, then confirm them all at once. */
  const confirmMultiple = async () => {
    if (selected.length === 0 || confirming) return;
    setConfirming(true);
    try {
      // Always the multi-match endpoint from this tab, even for a single
      // tick — sole-webapp's own "Assign to multiple" never collapses to
      // the single-match shape (`transaction_ids`/`entry_id`/`type`, not
      // `bank_transaction_id`/`expenses[]`), regardless of how many rows
      // ended up selected.
      await matchMultipleTransactions(
        "expense",
        expense.id,
        selected.map((entry) => entry.id),
      );
      await afterMatch(selected.length);
    } catch (error) {
      toast.error(
        apiErrorMessage(error, "Couldn't match those transactions. Try again."),
      );
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      <DialogHeader className="space-y-3 border-b border-border p-6">
        <div className="space-y-1">
          <DialogTitle>Match transaction</DialogTitle>
          <DialogDescription>
            {expense.description} · {formatExpenseDate(expense.date)} ·{" "}
            {invoiceMoney(expenseTotal(expense))}
          </DialogDescription>
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border surface-subtle p-3">
          <div className="space-y-1">
            <dt className="text-xs text-muted-foreground">Selected total</dt>
            <dd className="text-lg font-semibold leading-none tabular">
              {invoiceMoney(alreadyMatched + totals.selectedTotal)}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs text-muted-foreground">Remaining</dt>
            {/* Danger until it's covered, success once it is — the one place a
                figure carries colour on this screen, because it's the thing the
                dialog exists to drive to zero. */}
            <dd
              className={cn(
                "text-lg font-semibold leading-none tabular",
                totals.settled ? "text-success" : "text-destructive",
              )}
            >
              {invoiceMoney(totals.remaining)}
            </dd>
          </div>
        </dl>
      </DialogHeader>

      <Tabs
        value={tab}
        onValueChange={changeTab}
        className="flex min-h-0 flex-col"
      >
        <div className="px-6 pt-4">
          <TabsList aria-label="How to match">
            <TabsTrigger value="potential">Potential transactions</TabsTrigger>
            <TabsTrigger value="multiple">Assign to multiple</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="potential"
          className="min-h-0 overflow-y-auto px-6 py-4"
        >
          <MatchableList
            loading={query.isLoading}
            candidates={candidates}
            matchingId={matchingId}
            onMatch={matchOne}
            hint="Sized to what's still owing on this expense."
            emptyTitle="No likely payments"
            emptyBody="Nothing in your bank feed is close enough to this expense. It may not have cleared yet, or it may already be matched elsewhere."
          />
        </TabsContent>

        <TabsContent
          value="multiple"
          className="min-h-0 overflow-y-auto px-6 py-4"
        >
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Every debit from the last few months, whether or not it&apos;s
              sized to fit. Tick each transaction this expense was paid as —
              a split purchase often clears as several — and the totals above
              update as you go.
            </p>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search transactions"
                aria-label="Search transactions"
                className="pl-9"
              />
            </div>
            <SelectableList
              loading={query.isLoading}
              candidates={visibleCandidates}
              chosen={chosen}
              onToggle={toggle}
              limitReached={limitReached}
              emptyTitle="No eligible transactions"
              emptyBody="Nothing in your bank feed is close enough to this expense. It may not have cleared yet, or it may already be matched to something else."
            />
          </div>
        </TabsContent>
      </Tabs>

      <DialogFooter className="items-center gap-3 border-t border-border p-6">
        {tab === "multiple" && selected.length > 0 && (
          <p className="mr-auto text-xs text-muted-foreground">
            {totals.settled
              ? "Covers the full expense."
              : `Leaves ${invoiceMoney(totals.remaining)} unmatched — that's fine, you can match the rest later.`}
          </p>
        )}
        <Button
          variant="outline"
          onClick={onClose}
          disabled={confirming || !!matchingId}
        >
          Cancel
        </Button>
        {tab === "multiple" && (
          <Button
            onClick={confirmMultiple}
            disabled={selected.length === 0 || confirming}
          >
            {confirming && <Loader2 className="animate-spin" />}
            {selected.length === 0
              ? "Confirm match"
              : `Match ${selected.length} ${selected.length === 1 ? "transaction" : "transactions"}`}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

/** Loading and empty states shared by both tabs' lists. */
function CandidateListShell({
  loading,
  empty,
  emptyTitle,
  emptyBody,
  hint,
  children,
}: {
  loading: boolean;
  empty: boolean;
  emptyTitle: string;
  emptyBody: string;
  hint?: string;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div
        className="flex flex-col items-center gap-3 py-10 text-center"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Looking for matching transactions…
        </p>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span
          className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground"
          aria-hidden
        >
          <SearchX className="size-5" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium">{emptyTitle}</p>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {emptyBody}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

function CandidateMeta({ candidate }: { candidate: MatchCandidate }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium">
        {candidate.description}
      </span>
      <span className="block text-xs text-muted-foreground tabular">
        {formatExpenseDate(candidate.date)}
        {candidate.reference && ` · ${candidate.reference}`}
      </span>
    </span>
  );
}

/**
 * Potential transactions — one "Match" per row, matching sole-webapp: no
 * selection step, clicking Match confirms that transaction immediately.
 */
function MatchableList({
  loading,
  candidates,
  matchingId,
  onMatch,
  hint,
  emptyTitle,
  emptyBody,
}: {
  loading: boolean;
  candidates: MatchCandidate[];
  matchingId: string | null;
  onMatch: (candidate: MatchCandidate) => void;
  hint?: string;
  emptyTitle: string;
  emptyBody: string;
}) {
  return (
    <CandidateListShell
      loading={loading}
      empty={candidates.length === 0}
      emptyTitle={emptyTitle}
      emptyBody={emptyBody}
      hint={hint}
    >
      <ul className="divide-y divide-border rounded-lg border border-border">
        {candidates.map((candidate) => (
          <li key={candidate.id} className="flex items-center gap-3 p-3">
            <CandidateMeta candidate={candidate} />
            <span className="shrink-0 text-sm font-medium tabular">
              {invoiceMoney(candidate.amount)}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              disabled={!!matchingId}
              onClick={() => onMatch(candidate)}
            >
              {matchingId === candidate.id && (
                <Loader2 className="animate-spin" />
              )}
              Match
            </Button>
          </li>
        ))}
      </ul>
    </CandidateListShell>
  );
}

/**
 * Assign to multiple — checkbox selection against a shared cap: once the
 * ticked total covers what's owing, an unticked row can't be added (an
 * already-ticked one can still be removed). Matches sole-webapp's own
 * `isDisabled = !isChecked && isLimitReached`.
 */
function SelectableList({
  loading,
  candidates,
  chosen,
  onToggle,
  limitReached,
  hint,
  emptyTitle,
  emptyBody,
}: {
  loading: boolean;
  candidates: MatchCandidate[];
  chosen: string[];
  onToggle: (id: string) => void;
  limitReached: boolean;
  hint?: string;
  emptyTitle: string;
  emptyBody: string;
}) {
  return (
    <CandidateListShell
      loading={loading}
      empty={candidates.length === 0}
      emptyTitle={emptyTitle}
      emptyBody={emptyBody}
      hint={hint}
    >
      <ul className="divide-y divide-border rounded-lg border border-border">
        {candidates.map((candidate) => {
          const checked = chosen.includes(candidate.id);
          const disabled = !checked && limitReached;
          return (
            <li key={candidate.id}>
              <label
                className={cn(
                  "flex items-center gap-3 p-3 transition-colors",
                  disabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:bg-primary/5",
                  checked && "bg-primary/5",
                )}
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={() => onToggle(candidate.id)}
                  aria-label={`${candidate.description}, ${invoiceMoney(candidate.amount)}`}
                />
                <CandidateMeta candidate={candidate} />
                <span className="shrink-0 text-sm font-medium tabular">
                  {invoiceMoney(candidate.amount)}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </CandidateListShell>
  );
}
