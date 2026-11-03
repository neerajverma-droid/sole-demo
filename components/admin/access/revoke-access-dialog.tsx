"use client";

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
import { useRevokeAllAccessMutation } from "@/hooks/use-admin-users-query";
import { apiErrorMessage } from "@/lib/api-error";
import { adminDisplayName, type AdminUser } from "@/lib/admin/admin-users";

/**
 * Confirm removing every section from an admin.
 *
 * Worded for what the backend actually does: the grants go, the account
 * stays. Calling it "delete admin" would promise something that doesn't
 * happen, and leave someone surprised when the person can still sign in.
 */
export function RevokeAccessDialog({
  admin,
  onClose,
}: {
  admin: AdminUser | null;
  onClose: () => void;
}) {
  const revoke = useRevokeAllAccessMutation();
  const name = admin ? adminDisplayName(admin) : "this admin";

  return (
    <AlertDialog open={admin !== null} onOpenChange={(open) => !open && !revoke.isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove all access for {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Every section they were granted is removed. Their account stays, so they can still sign
            in, but they&apos;ll see no admin sections until you grant one again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={revoke.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={revoke.isPending}
            onClick={(event) => {
              event.preventDefault();
              if (!admin) return;
              revoke.mutate(admin.id, {
                onSuccess: () => {
                  toast.success(`All access removed for ${name}`);
                  onClose();
                },
                onError: (error) =>
                  toast.error(apiErrorMessage(error, "Access couldn't be removed. Try again.")),
              });
            }}
          >
            {revoke.isPending ? "Removing…" : "Remove all access"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
