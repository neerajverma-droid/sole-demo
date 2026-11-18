"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

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
import { MatchableList, SelectableList } from "@/components/expenses/match-dialog";
import { useInvalidateBills } from "@/hooks/use-bills-query";
import { apiErrorMessage } from "@/lib/api-error";
import { filterMatchCandidates, matchSelectionTotals, type MatchCandidate } from "@/lib/bank-match";
import { billPossibleMatchesQuery, matchBillApi, type Bill } from "@/lib/bills";
import { formatInvoiceDate, invoiceMoney } from "@/lib/invoices";
import { cn } from "@/lib/utils";

type MatchTab = "potential" | "multiple";

/**
 * Paying a bill straight from the bank feed — the expense match dialog's own
 * two tabs and lists, pointed at the bill. Matching a saved bill converts it
 * to its expense and matches that in one step on the server, so there's no
 * separate "convert, then go to Expenses and match" trip. A converted bill
 * that's unpaid or part paid matches the rest of its expense the same way.
 */
export function BillMatchDialog({ bill, onClose }: { bill: Bill | null; onClose: () => void }) {
  return (
    <Dialog open={bill !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {/* Keyed on the bill, so a different one starts with nothing ticked. */}
        {bill && <BillMatchBody key={bill.id} bill={bill} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

/** The dialog's contents — exported so it can be rendered on its own in tests. */
export function BillMatchBody({ bill, onClose }: { bill: Bill; onClose: () => void }) {
  const invalidateBills = useInvalidateBills();
  const [tab, setTab] = React.useState<MatchTab>("potential");
  const [chosen, setChosen] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState("");
  const [matchingId, setMatchingId] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  const query = useQuery(billPossibleMatchesQuery(bill.id, tab === "multiple"));
  const candidates = query.data?.candidates ?? [];
  // The bill's own figure until the server's lands, so it never flashes $0 ("all paid").
  const remainingAmount = query.data?.remainingAmount ?? bill.amountDue;
  const selected = candidates.filter((entry) => chosen.includes(entry.id));
  const totals = matchSelectionTotals(remainingAmount, selected);
  const alreadyMatched = Math.max(0, bill.total - remainingAmount);
  const limitReached = totals.remaining <= 0;
  const converting = bill.status === "draft";

  const changeTab = (next: string) => {
    setTab(next as MatchTab);
    setChosen([]);
    setSearch("");
  };

  const toggle = (id: string) =>
    setChosen((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));

  const match = async (transactionIds: string[]) => {
    const result = await matchBillApi(bill.id, transactionIds);
    invalidateBills({ expenses: true });
    const paid = result.paymentStatus === "paid";
    toast.success(paid ? "Bill paid" : "Payment matched", {
      description: [
        result.createdExpense ? "Added to your expenses and matched to the bank." : null,
        paid ? null : `${invoiceMoney(result.amountDue)} still to pay.`,
      ]
        .filter(Boolean)
        .join(" ") || undefined,
    });
    onClose();
  };

  const matchOne = async (candidate: MatchCandidate) => {
    if (matchingId) return;
    setMatchingId(candidate.id);
    try {
      await match([candidate.id]);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't match that transaction. Try again."));
    } finally {
      setMatchingId(null);
    }
  };

  const confirmMultiple = async () => {
    if (selected.length === 0 || confirming) return;
    setConfirming(true);
    try {
      await match(selected.map((entry) => entry.id));
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't match those transactions. Try again."));
    } finally {
      setConfirming(false);
    }
  };

  const description = [bill.supplierName || "Bill", bill.billNo, bill.dueDate ? `due ${formatInvoiceDate(bill.dueDate)}` : null, invoiceMoney(bill.total)]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <DialogHeader className="space-y-3 border-b border-border p-6">
        <div className="space-y-1">
          <DialogTitle>Match payment</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          {converting && (
            <p className="text-xs text-muted-foreground">
              Matching adds this bill to your expenses on its bill date, then ties it to the payment.
            </p>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border surface-subtle p-3" data-usertour="bill-match-summary">
          <div className="space-y-1">
            <dt className="text-xs text-muted-foreground">Selected total</dt>
            <dd className="text-lg font-semibold leading-none tabular">{invoiceMoney(alreadyMatched + totals.selectedTotal)}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs text-muted-foreground">Remaining</dt>
            <dd className={cn("text-lg font-semibold leading-none tabular", totals.settled ? "text-success" : "text-destructive")}>
              {invoiceMoney(totals.remaining)}
            </dd>
          </div>
        </dl>
      </DialogHeader>

      <Tabs value={tab} onValueChange={changeTab} className="flex min-h-0 flex-col">
        <div className="px-6 pt-4">
          <TabsList aria-label="How to match" data-usertour="bill-match-tabs">
            <TabsTrigger value="potential">Potential transactions</TabsTrigger>
            <TabsTrigger value="multiple">Assign to multiple</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="potential" className="min-h-0 overflow-y-auto px-6 py-4">
          {query.isError ? (
            <QueryError message={query.error?.message} onRetry={() => void query.refetch()} />
          ) : (
            <MatchableList
              loading={query.isLoading}
              candidates={candidates}
              matchingId={matchingId}
              onMatch={(candidate) => void matchOne(candidate)}
              hint="Sized to what's still owed on this bill."
              emptyTitle="No likely payments"
              emptyBody="Nothing in your bank feed is close to this bill's amount. It may not have cleared yet — or try Assign to multiple."
            />
          )}
        </TabsContent>

        <TabsContent value="multiple" className="min-h-0 overflow-y-auto px-6 py-4">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Every debit from the last few months. Tick each payment this bill was paid with — instalments clear as several — and the
              totals above update as you go.
            </p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search transactions"
                aria-label="Search transactions"
                className="pl-9"
              />
            </div>
            {query.isError ? (
              <QueryError message={query.error?.message} onRetry={() => void query.refetch()} />
            ) : (
              <SelectableList
                loading={query.isLoading}
                candidates={filterMatchCandidates(candidates, search)}
                chosen={chosen}
                onToggle={toggle}
                limitReached={limitReached}
                emptyTitle="No eligible transactions"
                emptyBody="Nothing in your bank feed could pay this bill. It may not have cleared yet, or it's already matched to something else."
              />
            )}
          </div>
        </TabsContent>
      </Tabs>

      <DialogFooter className="items-center gap-3 border-t border-border p-6">
        {tab === "multiple" && selected.length > 0 && (
          <p className="mr-auto text-xs text-muted-foreground">
            {totals.settled
              ? "Pays the bill in full."
              : `Leaves ${invoiceMoney(totals.remaining)} to pay — the bill shows as part paid until the rest is matched.`}
          </p>
        )}
        <Button variant="outline" onClick={onClose} disabled={confirming || !!matchingId}>
          Cancel
        </Button>
        {tab === "multiple" && (
          <Button onClick={() => void confirmMultiple()} disabled={selected.length === 0 || confirming}>
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

function QueryError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center">
      <p className="text-sm font-medium">Couldn&apos;t look for matching transactions</p>
      {message && <p className="mt-1 text-sm text-muted-foreground">{message}</p>}
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
