"use client";

import * as React from "react";
import { useAtom, useSetAtom } from "jotai";
import { Undo2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { unmatchTransactionIdAtom, viewTransactionIdAtom } from "@/lib/atoms";
import { documentTax } from "@/lib/country-context";
import { invoiceMoney } from "@/lib/invoices";
import {
  amountClass,
  formatTransactionDate,
  matchedAmount,
  signedAmount,
  transactionStatusVariant,
  undoModeFor,
  type TransactionSplit,
} from "@/lib/transactions";
import { TransactionSplitRows } from "@/components/transactions/transaction-splits";
import { useCountryContext } from "@/hooks/use-country-context";
import { useUndoMatchEntry } from "@/hooks/use-bank-transactions-query";
import { cn } from "@/lib/utils";
import { useTransactionsStore } from "@/stores/transactions";

export function TransactionDetailsDialog() {
  const [viewId, setViewId] = useAtom(viewTransactionIdAtom);
  const transactions = useTransactionsStore((state) => state.transactions);
  // "GST" in AU and NZ, "VAT" in ZA, or the business's own name for it.
  const { country } = useCountryContext();
  const taxName = documentTax(country).word;

  const transaction = transactions.find((entry) => entry.id === viewId);
  const unmatched = transaction?.status === "Review";
  const hasSplits = (transaction?.splits.length ?? 0) > 0;

  /*
   * Undo, as the Matched list does it. A mark or a single-line match undoes
   * the whole transaction through the shared "Undo Match?" dialog; a
   * multi-line match undoes line by line, each against its journal entry.
   */
  const setUnmatchId = useSetAtom(unmatchTransactionIdAtom);
  const undoLine = useUndoMatchEntry();
  const [lineToUndo, setLineToUndo] = React.useState<TransactionSplit | null>(
    null,
  );
  const undoMode = transaction ? undoModeFor(transaction) : null;
  const wholeUndo = undoMode === "whole";
  const lineUndo = undoMode === "line";
  const undoWhole = () => {
    if (!transaction) return;
    // Hand over to the shared confirmation; this modal would otherwise sit on
    // top of it, showing a row that's about to leave the list.
    setViewId(null);
    setUnmatchId(transaction.id);
  };

  return (
    <Dialog
      open={viewId !== null}
      onOpenChange={(open) => !open && setViewId(null)}
    >
      {/* Wide enough for the split table's eight columns without squeezing
          them, and scrollable: a transaction with six lines is taller than a
          phone. */}
      <DialogContent
        className={cn(
          "max-h-[90svh] overflow-y-auto",
          hasSplits ? "sm:max-w-4xl" : "sm:max-w-2xl",
        )}
      >
        <DialogHeader>
          <DialogTitle>Transaction details</DialogTitle>
          {transaction && (
            <DialogDescription>
              {transaction.type === "Credit" ? "Money in" : "Money out"}
              {transaction.source !== "Unknown" && ` · ${transaction.source}`}
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

            {/* An unmatched line has no category yet, so it shows what its
                row in the Unmatched list shows instead: the suggestion, where
                it came from, and how much of it is matched so far. */}
            <dl className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
              {unmatched ? (
                <Row
                  label="Suggested category"
                  value={
                    transaction.suggestedCategory
                      ? `${transaction.suggestedCategory.category} (${transaction.suggestedCategory.confidence}% confidence)`
                      : "—"
                  }
                />
              ) : (
                <Row label="Category" value={transaction.category || "—"} />
              )}
              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant={transactionStatusVariant(transaction.status)}>
                    {transaction.status}
                  </Badge>
                </dd>
              </div>
              <Row label="Account" value={transaction.account || "—"} />
              <Row label="Reference" value={transaction.reference} tabular />
              {unmatched && (
                <>
                  <Row label="Source" value={transaction.source} />
                  <Row
                    label={taxName}
                    value={transaction.gst ? "Included" : "Not included"}
                  />
                  <Row
                    label="TXN amount"
                    value={invoiceMoney(transaction.amount)}
                    tabular
                  />
                  <Row
                    label="Matched amount"
                    value={invoiceMoney(matchedAmount(transaction))}
                    tabular
                  />
                </>
              )}
            </dl>

            {/* The same lines the row expands to show, in the same component —
                a split is a fact about the transaction, so the place you go to
                read about it should have it. */}
            {hasSplits && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Split lines</p>
                <div className="-mx-3 rounded-lg border border-border bg-muted/30">
                  <TransactionSplitRows
                    transaction={transaction}
                    onUndo={
                      lineUndo
                        ? setLineToUndo
                        : wholeUndo
                          ? undoWhole
                          : undefined
                    }
                  />
                </div>
              </div>
            )}

            {wholeUndo && (
              <div className="flex justify-end border-t pt-4">
                <Button variant="outline" onClick={undoWhole}>
                  <Undo2 />
                  Undo match
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>

      {/* One line of a multi-line match — the Matched list's own confirmation. */}
      <AlertDialog
        open={lineToUndo !== null}
        onOpenChange={(next) =>
          !next && !undoLine.isPending && setLineToUndo(null)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo Match?</AlertDialogTitle>
            <AlertDialogDescription>
              This will undo your previously matched transaction
              {lineToUndo
                ? ` — the ${invoiceMoney(lineToUndo.amount)} matched to ${lineToUndo.category}`
                : ""}
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={undoLine.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={undoLine.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!lineToUndo || !transaction) return;
                undoLine.mutate(
                  {
                    entryId: lineToUndo.id,
                    label: lineToUndo.category || transaction.reference,
                  },
                  {
                    // The list refetches; the lines shown here are stale, so
                    // the details close with the confirmation.
                    onSuccess: () => setViewId(null),
                    onSettled: () => setLineToUndo(null),
                  },
                );
              }}
            >
              {undoLine.isPending ? "Undoing…" : "Undo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
