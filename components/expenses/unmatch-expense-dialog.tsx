"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import { apiErrorMessage } from "@/lib/api-error";
import { undoMatchTransaction } from "@/lib/bank-match";
import { unmatchExpenseAtom } from "@/lib/atoms";
import { formatExpenseAmount, formatExpenseDate } from "@/lib/expenses";

/**
 * Undoing a match from the expense's side of it — the same real
 * `undo-match-transaction` endpoint and "Undo Match?" confirmation
 * sole-webapp's own Expenses list uses (`ConfirmationDialog`), not a local
 * status flip. There's no "undo the undo" here either, same as the
 * reference: reversing this for real means running the match again from
 * scratch, not something a single follow-up call can do.
 */
export function UnmatchExpenseDialog() {
  const [expense, setUnmatchExpense] = useAtom(unmatchExpenseAtom);
  const queryClient = useQueryClient();
  const [unmatching, setUnmatching] = React.useState(false);

  const reference = expense?.transactionRef ?? null;

  return (
    <AlertDialog
      open={expense !== null}
      onOpenChange={(open) => !open && !unmatching && setUnmatchExpense(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Undo match?</AlertDialogTitle>
          <AlertDialogDescription>
            This undoes the matched transaction for this expense. It goes back
            to offering a match, and the transaction returns to your review
            queue.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {expense && (
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {expense.description}
              </p>
              <p className="truncate text-xs text-muted-foreground tabular">
                {formatExpenseDate(expense.date)} · {expense.supplierName}
                {reference && ` · ${reference}`}
              </p>
            </div>
            <span className="shrink-0 text-sm font-medium tabular">
              {formatExpenseAmount(expense)}
            </span>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={unmatching}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={unmatching}
            onClick={async (event) => {
              // Radix closes the dialog on click by default — held open here
              // so the spinner has somewhere to show while the call is out.
              event.preventDefault();
              if (!expense || unmatching) return;
              setUnmatching(true);
              try {
                await undoMatchTransaction(
                  "expense",
                  expense.id,
                  expense.journalEntryId,
                );
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: ["expenses"] }),
                  queryClient.invalidateQueries({
                    queryKey: ["expenses-page"],
                  }),
                  queryClient.invalidateQueries({
                    queryKey: ["expense-summary"],
                  }),
                ]);
                toast.success("Match undone", {
                  description: `${expense.description} is no longer reconciled.`,
                });
                setUnmatchExpense(null);
              } catch (error) {
                toast.error(
                  apiErrorMessage(error, "Couldn't undo that match. Try again."),
                );
              } finally {
                setUnmatching(false);
              }
            }}
          >
            {unmatching && <Loader2 className="animate-spin" aria-hidden />}
            {unmatching ? "Undoing…" : "Undo match"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
