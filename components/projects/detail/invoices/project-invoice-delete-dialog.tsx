"use client";

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
import { useDeleteProjectInvoiceMutation } from "@/hooks/use-project-invoices-query";
import { apiErrorMessage } from "@/lib/api-error";
import type { ProjectInvoice } from "@/lib/project-invoices";

/**
 * The old tab's "Remove Invoice?" confirmation, with its two messages: one
 * matched to a bank transaction warns that deleting it also undoes the
 * reconciliation. Kept open until the request lands.
 */
export function ProjectInvoiceDeleteDialog({
  projectId,
  invoice,
  onOpenChange,
}: {
  projectId: string;
  invoice: ProjectInvoice | null;
  onOpenChange: (open: boolean) => void;
}) {
  const remove = useDeleteProjectInvoiceMutation(projectId);

  const confirm = () => {
    if (!invoice) return;
    remove.mutate(invoice.id, {
      onSuccess: () => {
        toast.success("Invoice deleted");
        onOpenChange(false);
      },
      onError: (error) => toast.error(apiErrorMessage(error, "Failed to delete invoice")),
    });
  };

  return (
    <AlertDialog
      open={invoice !== null}
      onOpenChange={(open) => !open && !remove.isPending && onOpenChange(false)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove invoice?</AlertDialogTitle>
          <AlertDialogDescription>
            {invoice?.reconciled
              ? `${invoice.number || "This invoice"} is already reconciled. Deleting it also undoes the reconciliation.`
              : `${invoice?.number || "This invoice"} will be permanently deleted.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={remove.isPending}
            onClick={(event) => {
              // Held open so the spinner has somewhere to show while the call is out.
              event.preventDefault();
              confirm();
            }}
          >
            {remove.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Delete invoice
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
