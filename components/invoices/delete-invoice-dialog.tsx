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
import { deleteInvoiceIdsAtom } from "@/lib/atoms";
import {
  deleteInvoicesApi,
  formatDocumentMoney,
  invoiceDocumentAmount,
} from "@/lib/invoices";
import { useInvoicesStore } from "@/stores/invoices";

/** How many of a selection to list before summarising the rest. */
const LISTED = 4;

/**
 * One confirmation for both ways of deleting an invoice.
 *
 * A selection is named rather than counted — "delete 3 invoices" tells you the
 * number you already knew, where the references tell you whether it's the three
 * you meant.
 */
export function DeleteInvoiceDialog() {
  const [deleteIds, setDeleteIds] = useAtom(deleteInvoiceIdsAtom);
  const invoices = useInvoicesStore((state) => state.invoices);
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = React.useState(false);

  const doomed = invoices.filter((entry) => deleteIds.includes(entry.id));
  const many = doomed.length > 1;
  const shown = doomed.slice(0, LISTED);
  const rest = doomed.length - shown.length;

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteInvoicesApi(deleteIds);
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setDeleteIds([]);
      toast.success(
        many ? `${doomed.length} invoices deleted` : "Invoice deleted",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : many
            ? "Couldn't delete those invoices."
            : "Couldn't delete that invoice.",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog
      open={deleteIds.length > 0}
      onOpenChange={(open) => !open && setDeleteIds([])}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {many ? `Delete ${doomed.length} invoices?` : "Delete invoice?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes{" "}
            {many
              ? "these invoices and their line items"
              : "the invoice and its line items"}
            . This action can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          {shown.map((invoice) => (
            <div
              key={invoice.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium tabular">
                  {invoice.number}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {invoice.clientName} · {invoice.status}
                </p>
              </div>
              <span className="shrink-0 text-sm font-medium tabular">
                {formatDocumentMoney(
                  invoiceDocumentAmount(invoice),
                  invoice.currency,
                )}
              </span>
            </div>
          ))}
          {rest > 0 && (
            <p className="text-sm text-muted-foreground">
              and {rest} more {rest === 1 ? "invoice" : "invoices"}
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleting}
            onClick={(event) => {
              // Radix closes the dialog on click by default — held open here
              // so the spinner has somewhere to show while the call is out.
              event.preventDefault();
              confirmDelete();
            }}
          >
            {deleting && <Loader2 className="animate-spin" aria-hidden />}
            {many ? `Delete ${doomed.length} invoices` : "Delete invoice"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
