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
import { stopRecurringInvoiceIdAtom } from "@/lib/atoms";
import { apiErrorMessage } from "@/lib/api-error";
import { stopRecurringInvoiceApi } from "@/lib/invoices";

/**
 * Stopping a recurring invoice's schedule. One-directional and confirmed —
 * unlike most row actions this can't be undone from here, since turning
 * recurrence back on means raising a new one with its own frequency.
 */
export function StopRecurringInvoiceDialog() {
  const [invoice, setInvoice] = useAtom(stopRecurringInvoiceIdAtom);
  const queryClient = useQueryClient();
  const [stopping, setStopping] = React.useState(false);

  const confirmStop = async () => {
    if (!invoice || stopping) return;
    setStopping(true);
    try {
      await stopRecurringInvoiceApi(invoice.id);
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(`${invoice.number || "The invoice"} will no longer repeat`);
      setInvoice(null);
    } catch (error) {
      toast.error(
        apiErrorMessage(error, "Couldn't stop that recurring invoice."),
      );
    } finally {
      setStopping(false);
    }
  };

  return (
    <AlertDialog
      open={invoice !== null}
      onOpenChange={(open) => !open && !stopping && setInvoice(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop this recurring invoice?</AlertDialogTitle>
          <AlertDialogDescription>
            {invoice?.number || "This invoice"} will stop generating new
            copies on its schedule. Copies already raised aren&apos;t affected.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={stopping}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={stopping}
            onClick={(event) => {
              event.preventDefault();
              confirmStop();
            }}
          >
            {stopping && <Loader2 className="animate-spin" aria-hidden />}
            Stop recurring
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
