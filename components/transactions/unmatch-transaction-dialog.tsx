"use client";

import { useAtom } from "jotai";

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
import { unmatchTransactionIdAtom } from "@/lib/atoms";
import { invoiceMoney } from "@/lib/invoices";
import { formatTransactionDate } from "@/lib/transactions";
import { useTransactionsStore } from "@/stores/transactions";
import {
  useUndoMarkTransaction,
  useUndoMatchEntry,
  useUnmatchTransaction,
} from "@/hooks/use-bank-transactions-query";

/**
 * A matched row's Undo — sole-webapp's flow, step for step.
 *
 * It asks first ("Undo Match?"), then undoes whichever kind of decision the
 * row carries:
 *
 * - a personal mark → `undo-mark-transaction` (type personal)
 * - a transfer mark → `undo-mark-transaction` (type transfer)
 * - a match → `undo-match-transaction` with the match's journal entry, as
 *   sole-webapp's row Undo sends it
 *
 * A row with no entry id to point at falls back to undoing the whole
 * transaction's match. On success the row returns to Unmatched.
 */
export function UnmatchTransactionDialog({
  editFirst = false,
  onUnmatched,
}: {
  /**
   * Opened because the user chose to edit a matched transaction (from the BAS
   * review): it can't be edited while matched, so the dialog says that first.
   */
  editFirst?: boolean;
  /** Called once the undo has gone through. */
  onUnmatched?: () => void;
} = {}) {
  const [unmatchId, setUnmatchId] = useAtom(unmatchTransactionIdAtom);
  const transactions = useTransactionsStore((state) => state.transactions);
  const undoMark = useUndoMarkTransaction();
  const undoEntry = useUndoMatchEntry();
  const unmatch = useUnmatchTransaction();
  const pending = undoMark.isPending || undoEntry.isPending || unmatch.isPending;

  const transaction = transactions.find((entry) => entry.id === unmatchId);
  const marked = transaction?.personal
    ? "personal"
    : transaction?.transfer
      ? "transfer"
      : null;

  const close = () => setUnmatchId(null);

  const confirm = () => {
    if (!transaction) return;
    const done = { onSettled: close, onSuccess: () => onUnmatched?.() };
    if (marked) {
      undoMark.mutate({ row: transaction, kind: marked }, done);
    } else if (transaction.entryId) {
      undoEntry.mutate(
        { entryId: transaction.entryId, label: transaction.reference },
        done,
      );
    } else {
      unmatch.mutate(transaction, done);
    }
  };

  return (
    <AlertDialog
      open={unmatchId !== null}
      onOpenChange={(open) => !open && !pending && close()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {editFirst ? "Undo Match to edit?" : "Undo Match?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {marked
              ? `This will undo the ${marked} mark on this transaction. It goes back to your unmatched transactions.`
              : editFirst
                ? "A matched transaction can't be edited — undo the match first. It goes back to your unmatched transactions, where you can change its category, client and GST. Anything created by matching it is removed, so your BAS figures will change."
                : "This will undo your previously matched transaction. It goes back to your unmatched transactions, and anything created by matching it is removed."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {transaction && (
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {transaction.description}
              </p>
              <p className="truncate text-xs text-muted-foreground tabular">
                {formatTransactionDate(transaction.date)} · Ref{" "}
                {transaction.reference}
                {transaction.category ? ` · ${transaction.category}` : ""}
              </p>
            </div>
            <span className="shrink-0 text-sm font-medium tabular">
              {invoiceMoney(transaction.amount)}
            </span>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending || !transaction}
            onClick={(event) => {
              // Stays open until the server answers.
              event.preventDefault();
              confirm();
            }}
          >
            {pending ? "Undoing…" : editFirst ? "Undo and edit" : "Undo"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
