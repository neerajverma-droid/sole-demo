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
import { useDeleteContactMutation } from "@/hooks/use-contacts-query";
import { apiErrorMessage } from "@/lib/api-error";
import { deleteContactIdAtom } from "@/lib/atoms";
import { contactDisplayName, contactInitials } from "@/lib/contacts";
import { useContactsStore } from "@/stores/contacts";

export function DeleteContactDialog() {
  const [deleteId, setDeleteId] = useAtom(deleteContactIdAtom);
  const contacts = useContactsStore((state) => state.contacts);
  const deleteContact = useDeleteContactMutation();

  const contact = contacts.find((entry) => entry.id === deleteId);
  const displayName = contact ? contactDisplayName(contact) : "this contact";

  return (
    <AlertDialog
      open={deleteId !== null}
      onOpenChange={(open) => {
        if (!open && !deleteContact.isPending) setDeleteId(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete contact?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the contact and all their details. This
            action can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {contact && (
          <div className="flex items-center gap-3 rounded-md border p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              {contactInitials(contact.personName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {contact.type} · {contact.personName}
              </p>
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteContact.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteContact.isPending}
            onClick={(event) => {
              // Radix closes the dialog on action click; keep it open until the delete settles.
              event.preventDefault();
              if (!deleteId || deleteContact.isPending) return;
              deleteContact.mutate(deleteId, {
                onSuccess: () => {
                  setDeleteId(null);
                  toast.success("Contact removed");
                },
                onError: (error) => {
                  toast.error(apiErrorMessage(error, "Failed to delete contact."));
                },
              });
            }}
          >
            {deleteContact.isPending ? "Deleting…" : "Delete contact"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
