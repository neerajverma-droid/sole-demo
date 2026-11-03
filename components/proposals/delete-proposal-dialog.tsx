"use client";

import * as React from "react";
import { useAtom } from "jotai";
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
import { deleteProposalAtom } from "@/lib/atoms";
import { apiErrorMessage } from "@/lib/api-error";
import { useDeleteProposalMutation } from "@/hooks/use-proposals-query";

/**
 * Confirms a delete. Used from the list (the row's own atom) and from the
 * builder, which passes its proposal in and leaves afterwards.
 */
export function DeleteProposalDialog({
  target,
  onClose,
  onDeleted,
}: {
  target?: { id: string; title: string } | null;
  onClose?: () => void;
  onDeleted?: () => void;
} = {}) {
  const [row, setRow] = useAtom(deleteProposalAtom);
  const controlled = target !== undefined;
  const proposal = controlled ? target : row;
  const close = controlled ? (onClose ?? (() => {})) : () => setRow(null);
  const deleteProposal = useDeleteProposalMutation();

  const confirm = async () => {
    if (!proposal) return;
    try {
      await deleteProposal.mutateAsync(proposal.id);
      toast.success("Proposal deleted successfully.");
      close();
      onDeleted?.();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't delete that proposal."));
    }
  };

  return (
    <AlertDialog open={proposal != null} onOpenChange={(open) => !open && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete proposal?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{proposal?.title || "Untitled Proposal"}&rdquo; and all its
            content will be permanently removed. This action can&apos;t be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteProposal.isPending}
            onClick={(event) => {
              event.preventDefault();
              confirm();
            }}
          >
            {deleteProposal.isPending && (
              <Loader2 className="animate-spin" aria-hidden />
            )}
            Delete proposal
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
