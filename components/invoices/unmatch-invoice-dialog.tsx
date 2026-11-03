"use client";

import { useAtom } from "jotai";
import { toast } from "sonner";

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
import { unmatchInvoiceIdAtom } from "@/lib/atoms";
import { invoiceMoney } from "@/lib/invoices";
import { formatTransactionDate, linkedTransaction } from "@/lib/transactions";
import { useInvoicesStore } from "@/stores/invoices";
import { useTransactionsStore } from "@/stores/transactions";

/**
 * Undoing a match, after the moment the toast covers.
 *
 * Confirmed rather than immediate, unlike the toast's Undo: by the time
 * someone comes back to a matched row, the match is the record — and taking a
 * transaction back out of a reconciled set is worth a sentence naming which
 * one it is.
 */
export function UnmatchInvoiceDialog() {
  const [unmatchId, setUnmatchId] = useAtom(unmatchInvoiceIdAtom);
  const invoices = useInvoicesStore((state) => state.invoices);
  const unmatchTransaction = useInvoicesStore(
    (state) => state.unmatchTransaction,
  );
  const transactions = useTransactionsStore((state) => state.transactions);
  const unreconcile = useTransactionsStore((state) => state.unreconcile);

  const invoice = invoices.find((entry) => entry.id === unmatchId);
  const transaction = invoice ? linkedTransaction(invoice, transactions) : null;

  return (
    <AlertDialog
      open={unmatchId !== null}
      onOpenChange={(open) => !open && setUnmatchId(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {transaction
              ? `Unmatch this invoice from transaction ${transaction.reference}?`
              : "Unmatch this invoice?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            The invoice keeps its current status and goes back to asking to be
            matched. The transaction returns to your review queue, where it can
            be reconciled against something else.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {invoice && transaction && (
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {transaction.description}
              </p>
              <p className="truncate text-xs text-muted-foreground tabular">
                {formatTransactionDate(transaction.date)} ·{" "}
                {transaction.reference} · {invoice.number}
              </p>
            </div>
            <span className="shrink-0 text-sm font-medium tabular">
              {invoiceMoney(transaction.amount)}
            </span>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!invoice) return;
              if (transaction) unreconcile(transaction.id);
              unmatchTransaction(invoice.id);
              setUnmatchId(null);
              toast(`${invoice.number} unmatched`, {
                description: transaction
                  ? `${transaction.reference} is back in your review queue.`
                  : undefined,
              });
            }}
          >
            Unmatch
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
