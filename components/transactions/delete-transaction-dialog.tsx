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
import { deleteTransactionIdAtom } from "@/lib/atoms";
import {
  amountClass,
  formatTransactionDate,
  signedAmount,
} from "@/lib/transactions";
import { cn } from "@/lib/utils";
import { useTransactionsStore } from "@/stores/transactions";
import { useDeleteTransaction } from "@/hooks/use-bank-transactions-query";

export function DeleteTransactionDialog() {
  const [deleteId, setDeleteId] = useAtom(deleteTransactionIdAtom);
  const transactions = useTransactionsStore((state) => state.transactions);
  const remove = useDeleteTransaction();

  const transaction = transactions.find((entry) => entry.id === deleteId);

  return (
    <AlertDialog
      open={deleteId !== null}
      onOpenChange={(open) => !open && !remove.isPending && setDeleteId(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the transaction from your books. It will reappear if
            your bank feed imports it again. This action can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {transaction && (
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {transaction.description}
              </p>
              <p className="truncate text-xs text-muted-foreground tabular">
                {formatTransactionDate(transaction.date)} ·{" "}
                {transaction.reference}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 text-sm font-medium tabular",
                amountClass(transaction),
              )}
            >
              {signedAmount(transaction)}
            </span>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={remove.isPending}
            onClick={(event) => {
              event.preventDefault();
              if (!transaction) return;
              remove.mutate(transaction, {
                onSettled: () => setDeleteId(null),
              });
            }}
          >
            {remove.isPending ? "Deleting…" : "Delete transaction"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
