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
import { useDeleteClientRefundMutation } from "@/hooks/use-client-refunds-query";
import { deleteRefundIdAtom } from "@/lib/atoms";
import {
  formatRefundAmount,
  formatRefundDate,
  refundReasonLabel,
} from "@/lib/refunds";
import { useRefundsStore } from "@/stores/refunds";

export function DeleteRefundDialog() {
  const [deleteId, setDeleteId] = useAtom(deleteRefundIdAtom);
  const refunds = useRefundsStore((state) => state.refunds);
  const deleteMutation = useDeleteClientRefundMutation();

  const refund = refunds.find((entry) => entry.id === deleteId);

  return (
    <AlertDialog
      open={deleteId !== null}
      onOpenChange={(open) => !open && setDeleteId(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete refund?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the record of the refund from the client&apos;s account.
            This action can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {refund && (
          <div className="rounded-md border p-3 text-center">
            <p className="text-sm font-medium">
              {refund.reference} · {refund.clientName}
            </p>
            <p className="text-xs text-muted-foreground tabular">
              {formatRefundDate(refund.date)} · {refund.type} ·{" "}
              {formatRefundAmount(refund)} · {refundReasonLabel(refund)}
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (!deleteId) return;
              deleteMutation.mutate(deleteId, {
                onSuccess: () => {
                  setDeleteId(null);
                  toast.success("Refund deleted");
                },
                onError: (error: Error) =>
                  toast.error(error.message || "Failed to delete refund."),
              });
            }}
          >
            Delete refund
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
