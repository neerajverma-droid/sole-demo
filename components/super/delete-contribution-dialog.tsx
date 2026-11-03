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
import { deleteContributionIdAtom } from "@/lib/atoms";
import { invoiceMoney } from "@/lib/invoices";
import {
  contributionAmount,
  contributionStatus,
  deleteContributionApi,
  formatContributionDate,
} from "@/lib/super";
import { useSuperStore } from "@/stores/super";

export function DeleteContributionDialog({
  onDeleted,
}: {
  /** The form passes a route change when the record it was editing is gone. */
  onDeleted?: () => void;
}) {
  const [deleteId, setDeleteId] = useAtom(deleteContributionIdAtom);
  const contributions = useSuperStore((state) => state.contributions);
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = React.useState(false);

  const contribution = contributions.find((entry) => entry.id === deleteId);

  return (
    <AlertDialog
      open={deleteId !== null}
      onOpenChange={(open) => !open && !deleting && setDeleteId(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete contribution?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the contribution and releases any bank transactions
            matched to it, so they can be matched elsewhere. The transactions
            themselves aren&apos;t affected. This action can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {contribution && (
          <div className="rounded-md border p-3 text-center">
            <p className="text-sm font-medium">{contribution.fundName}</p>
            <p className="text-xs text-muted-foreground tabular">
              {formatContributionDate(contribution.date)} ·{" "}
              {invoiceMoney(contributionAmount(contribution))} ·{" "}
              {contributionStatus(contribution)}
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleting}
            onClick={async (event) => {
              // Radix closes the dialog on click by default — held open here
              // so the spinner has somewhere to show while the call is out.
              event.preventDefault();
              if (!deleteId || deleting) return;
              setDeleting(true);
              try {
                await deleteContributionApi(deleteId);
                await Promise.all([
                  queryClient.invalidateQueries({
                    queryKey: ["super-contributions"],
                  }),
                  queryClient.invalidateQueries({
                    queryKey: ["super-contribution-matrix"],
                  }),
                ]);
                toast.success("Contribution deleted");
                setDeleteId(null);
                onDeleted?.();
              } catch (error) {
                toast.error(
                  apiErrorMessage(
                    error,
                    "Couldn't delete that contribution. Try again.",
                  ),
                );
              } finally {
                setDeleting(false);
              }
            }}
          >
            {deleting && <Loader2 className="animate-spin" aria-hidden />}
            {deleting ? "Deleting…" : "Delete contribution"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
