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
import { deleteItemIdAtom } from "@/lib/atoms";
import { apiErrorMessage } from "@/lib/api-error";
import { deleteInventoryItemApi } from "@/lib/inventory";
import { useInventoryStore } from "@/stores/inventory";

export function DeleteItemDialog() {
  const [deleteId, setDeleteId] = useAtom(deleteItemIdAtom);
  const queryClient = useQueryClient();
  const items = useInventoryStore((state) => state.items);
  const [deleting, setDeleting] = React.useState(false);

  const item = items.find((entry) => entry.id === deleteId);

  return (
    <AlertDialog
      open={deleteId !== null}
      // Mirrors the Cancel/Delete buttons' disabled={deleting} below: Escape
      // and an overlay click both come through here too, and without this a
      // close mid-delete doesn't cancel the request — it closes the dialog
      // while the delete is still in flight, and the eventual success
      // handler's setDeleteId(null) then closes whatever's been reopened
      // since, possibly a different item, before it's been confirmed.
      onOpenChange={(open) => !open && !deleting && setDeleteId(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete item?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the item from your inventory. This action
            can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Name plus a Type · Unit subtext line, as the design has it. */}
        {item && (
          <div className="rounded-md border p-3 text-center">
            <p className="text-sm font-medium">{item.name}</p>
            <p className="text-xs text-muted-foreground">
              {item.type}
              {item.quantityType && ` · ${item.quantityType}`}
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleting}
            onClick={(event) => {
              // Closing is driven by `setDeleteId(null)` below, not by the
              // default Radix behaviour — a failed delete (used in an
              // invoice, say) needs the dialog to stay open on the error.
              event.preventDefault();
              if (!deleteId) return;
              setDeleting(true);
              deleteInventoryItemApi(deleteId)
                .then(() =>
                  queryClient.invalidateQueries({ queryKey: ["inventory-items"] }),
                )
                .then(() => {
                  toast.success("Item deleted");
                  setDeleteId(null);
                })
                .catch((error) => {
                  toast.error(apiErrorMessage(error, "Couldn't delete that item"));
                })
                .finally(() => setDeleting(false));
            }}
          >
            {deleting && <Loader2 className="animate-spin" aria-hidden />}
            Delete item
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
