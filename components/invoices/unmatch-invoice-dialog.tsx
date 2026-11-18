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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiErrorMessage } from "@/lib/api-error";
import { undoMatchTransaction } from "@/lib/bank-match";
import { unmatchInvoiceAtom } from "@/lib/atoms";
import {
  formatInvoiceDate,
  invoiceMoney,
  type InvoiceMatchedEntry,
} from "@/lib/invoices";

/**
 * Taking a bank match back off an invoice — for real, against the server.
 *
 * What it shows depends on what is matched, the way the old list did:
 *
 * - One matched transaction on an invoice that is **Paid**: a plain
 *   confirmation naming it.
 * - Several matched transactions, or a **Partially paid** invoice: a list with
 *   an Undo on each, because the payments are separate and each one is undone
 *   on its own. The invoice's status follows what is left matched.
 *
 * Each undo reverses one journal entry (the match's posting and its
 * reconciliation), and the invoice and its transactions are refetched after.
 */
export function UnmatchInvoiceDialog() {
  // The invoice as the row showed it when Undo was pressed. Each undo takes its
  // own entry off this copy straight away, so the list is right before the
  // refetch lands.
  const [invoice, setInvoice] = useAtom(unmatchInvoiceAtom);
  const queryClient = useQueryClient();
  /** The journal entry being undone right now, so only its button spins. */
  const [undoing, setUndoing] = React.useState<string | null>(null);

  const entries = invoice?.matchedEntries ?? [];
  /** Decided when it opens: a single match on a paid invoice is a plain confirmation. */
  const [confirmOne, setConfirmOne] = React.useState(false);
  const openedFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!invoice) {
      openedFor.current = null;
      return;
    }
    if (openedFor.current === invoice.id) return;
    openedFor.current = invoice.id;
    setConfirmOne(
      (invoice.matchedEntries?.length ?? 0) === 1 && invoice.status === "Paid",
    );
  }, [invoice]);

  const close = () => setInvoice(null);

  const undo = async (entry: InvoiceMatchedEntry) => {
    if (!invoice || undoing) return;
    setUndoing(entry.journalEntryId);
    try {
      await undoMatchTransaction("invoice", invoice.id, entry.journalEntryId);
      const remaining = entries.filter(
        (other) => other.journalEntryId !== entry.journalEntryId,
      );
      // Nothing left matched: done. Otherwise the list carries on with the rest.
      if (remaining.length === 0) close();
      else setInvoice({ ...invoice, matchedEntries: remaining });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["bank-transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      ]);
      toast.success(`Match undone on ${invoice.number}`, {
        description: entry.description
          ? `${entry.description} is no longer reconciled.`
          : undefined,
      });
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't undo that match. Try again."));
    } finally {
      setUndoing(null);
    }
  };

  // `entries[0]` is gone the moment the dialog closes (the invoice is cleared),
  // so the confirmation only renders while there is a match to name.
  if (confirmOne && entries[0]) {
    const entry = entries[0];
    return (
      <AlertDialog
        open={invoice !== null}
        onOpenChange={(open) => !open && close()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo match?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the matched transaction from {invoice?.number}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <MatchedRow entry={entry} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!undoing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!undoing}
              onClick={(event) => {
                // Radix closes on click by default; held open so the spinner
                // has somewhere to show while the call is out.
                event.preventDefault();
                void undo(entry);
              }}
            >
              {undoing && <Loader2 className="animate-spin" aria-hidden />}
              {undoing ? "Undoing…" : "Undo match"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Dialog open={invoice !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Undo matched transaction</DialogTitle>
          <DialogDescription className="tabular">
            {invoice?.number}
            {entries.length > 1 &&
              " · each payment is undone on its own"}
          </DialogDescription>
        </DialogHeader>

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No matched transaction found for this invoice.
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li key={entry.journalEntryId}>
                <MatchedRow
                  entry={entry}
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!undoing}
                      onClick={() => void undo(entry)}
                      aria-label={`Undo ${entry.description ?? "matched transaction"}`}
                    >
                      {undoing === entry.journalEntryId && (
                        <Loader2 className="animate-spin" aria-hidden />
                      )}
                      {undoing === entry.journalEntryId ? "Undoing…" : "Undo"}
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={!!undoing}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One matched transaction: what the bank called it, when, and how much of the invoice it covered. */
function MatchedRow({
  entry,
  action,
}: {
  entry: InvoiceMatchedEntry;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {entry.description ?? "Bank transaction"}
        </p>
        {entry.matchedAt && (
          <p className="truncate text-xs text-muted-foreground tabular">
            Matched {formatInvoiceDate(entry.matchedAt)}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm font-medium tabular">
          {invoiceMoney(entry.amount)}
        </span>
        {action}
      </div>
    </div>
  );
}
