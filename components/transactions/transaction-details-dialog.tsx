"use client";

import { useAtom } from "jotai";
import { Link2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { viewTransactionIdAtom } from "@/lib/atoms";
import {
  amountClass,
  formatTransactionDate,
  signedAmount,
  transactionStatusVariant,
} from "@/lib/transactions";
import { TransactionSplitRows } from "@/components/transactions/transaction-splits";
import { cn } from "@/lib/utils";
import { useTransactionsStore } from "@/stores/transactions";

export function TransactionDetailsDialog() {
  const [viewId, setViewId] = useAtom(viewTransactionIdAtom);
  const transactions = useTransactionsStore((state) => state.transactions);
  const reconcile = useTransactionsStore((state) => state.reconcile);
  const unreconcile = useTransactionsStore((state) => state.unreconcile);

  const transaction = transactions.find((entry) => entry.id === viewId);

  return (
    <Dialog
      open={viewId !== null}
      onOpenChange={(open) => !open && setViewId(null)}
    >
      {/* Wide enough for the split table, and scrollable: a transaction with
          six lines is taller than a phone. */}
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Transaction details</DialogTitle>
          {transaction && (
            <DialogDescription>
              {transaction.type === "Credit" ? "Money in" : "Money out"} —{" "}
              {transaction.suggestedMatch.split(" · ").at(-1) ??
                transaction.description}
            </DialogDescription>
          )}
        </DialogHeader>

        {transaction && (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="font-medium">{transaction.description}</p>
              <p className="text-sm text-muted-foreground tabular">
                {formatTransactionDate(transaction.date)} · {transaction.type}
              </p>
              <p
                className={cn(
                  "text-2xl font-semibold tracking-tight tabular",
                  amountClass(transaction),
                )}
              >
                {signedAmount(transaction)}
              </p>
            </div>

            <dl className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
              <Row label="Category" value={transaction.category} />
              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant={transactionStatusVariant(transaction.status)}>
                    {transaction.status}
                  </Badge>
                </dd>
              </div>
              <Row label="Account" value={transaction.account} tabular />
              <Row label="Reference" value={transaction.reference} tabular />
            </dl>

            {/* The same lines the row expands to show, in the same component —
                a split is a fact about the transaction, so the place you go to
                read about it should have it. */}
            {transaction.splits.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Split lines</p>
                <div className="-mx-3 rounded-lg border border-border bg-muted/30">
                  <TransactionSplitRows transaction={transaction} />
                </div>
              </div>
            )}

            {transaction.status === "Review" && (
              <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Needs reconciling</p>
                  <p className="text-xs text-muted-foreground">
                    Suggested match:{" "}
                    <span className="font-medium text-foreground">
                      {transaction.suggestedMatch}
                    </span>
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    reconcile(transaction.id);
                    setViewId(null);
                    // Confirming a suggestion writes nothing but the status, so
                    // undoing it is the one write back.
                    toast.success(`Matched to ${transaction.suggestedMatch}`, {
                      duration: 8000,
                      description: `${transaction.reference} reconciled.`,
                      action: {
                        label: "Undo",
                        onClick: () => {
                          unreconcile(transaction.id);
                          toast(`${transaction.reference} unmatched`, {
                            description: "It's back in your review queue.",
                          });
                        },
                      },
                    });
                  }}
                >
                  <Link2 />
                  Confirm match
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  tabular,
}: {
  label: string;
  value: string;
  tabular?: boolean;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm", tabular && "tabular")}>{value}</dd>
    </div>
  );
}
