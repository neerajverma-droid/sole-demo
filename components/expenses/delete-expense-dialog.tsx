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
import { deleteExpenseAtom } from "@/lib/atoms";
import {
  bulkDeleteExpensesApi,
  formatExpenseAmount,
  formatExpenseDate,
} from "@/lib/expenses";
import { useExpensesStore } from "@/stores/expenses";

/**
 * The row menu's own Delete — the real `POST /v2/expense/bulk-delete`, the
 * same endpoint (and function) the bulk action bar's Delete uses, just with
 * a single id. The backend protects a reconciled expense from deletion, so
 * this can genuinely fail rather than always succeeding.
 */
export function DeleteExpenseDialog() {
  const [expense, setDeleteExpense] = useAtom(deleteExpenseAtom);
  const removeExpense = useExpensesStore((state) => state.removeExpense);
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = React.useState(false);

  return (
    <AlertDialog
      open={expense !== null}
      onOpenChange={(open) => !open && !deleting && setDeleteExpense(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete expense?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the expense and any attached receipt. This action
            can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {expense && (
          <div className="rounded-md border p-3 text-center">
            <p className="text-sm font-medium">{expense.description}</p>
            <p className="text-xs text-muted-foreground tabular">
              {formatExpenseDate(expense.date)} · {expense.supplierName} ·{" "}
              {formatExpenseAmount(expense)}
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={async (event) => {
              // Radix closes the dialog on click by default — held open here
              // so the spinner has somewhere to show while the call is out.
              event.preventDefault();
              if (!expense || deleting) return;
              setDeleting(true);
              try {
                const { message } = await bulkDeleteExpensesApi([expense.id]);
                removeExpense(expense.id);
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: ["expenses"] }),
                  queryClient.invalidateQueries({
                    queryKey: ["expenses-page"],
                  }),
                  queryClient.invalidateQueries({
                    queryKey: ["expense-summary"],
                  }),
                ]);
                toast.success(message);
                setDeleteExpense(null);
              } catch (error) {
                toast.error(
                  apiErrorMessage(error, "Couldn't delete that expense. Try again."),
                );
              } finally {
                setDeleting(false);
              }
            }}
          >
            {deleting && <Loader2 className="animate-spin" aria-hidden />}
            {deleting ? "Deleting…" : "Delete expense"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
