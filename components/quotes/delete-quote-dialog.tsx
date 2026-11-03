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
import { deleteQuoteIdsAtom } from "@/lib/atoms";
import { formatDocumentMoney } from "@/lib/invoices";
import {
  deleteQuotesApi,
  quoteAmount,
  quoteDisplayStatus,
} from "@/lib/quotes";
import { useKnownQuotes } from "@/hooks/use-quotes-query";

/** How many of a selection to list before summarising the rest. */
const LISTED = 4;

/**
 * One confirmation for both ways of deleting a quote.
 *
 * A selection is named rather than counted — "delete 3 quotes" tells you the
 * number you already knew, where the references tell you whether it's the three
 * you meant.
 */
export function DeleteQuoteDialog() {
  const [deleteIds, setDeleteIds] = useAtom(deleteQuoteIdsAtom);
  const quotes = useKnownQuotes();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = React.useState(false);

  const doomed = quotes.filter((quote) => deleteIds.includes(quote.id));
  const many = doomed.length > 1;
  const shown = doomed.slice(0, LISTED);
  const rest = doomed.length - shown.length;

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteQuotesApi(deleteIds);
      await queryClient.invalidateQueries({ queryKey: ["quotes"] });
      setDeleteIds([]);
      toast.success(many ? `${doomed.length} quotes deleted` : "Quote deleted");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : many
            ? "Couldn't delete those quotes."
            : "Couldn't delete that quote.",
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
            {many ? `Delete ${doomed.length} quotes?` : "Delete quote?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes{" "}
            {many
              ? "these quotes and their line items"
              : "the quote and its line items"}
            . This action can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          {shown.map((quote) => (
            <div
              key={quote.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium tabular">
                  {quote.number}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {quote.clientName} · {quoteDisplayStatus(quote)}
                </p>
              </div>
              <span className="shrink-0 text-sm font-medium tabular">
                {formatDocumentMoney(quoteAmount(quote), quote.currency)}
              </span>
            </div>
          ))}
          {rest > 0 && (
            <p className="text-sm text-muted-foreground">
              and {rest} more {rest === 1 ? "quote" : "quotes"}
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
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
            {many ? `Delete ${doomed.length} quotes` : "Delete quote"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
