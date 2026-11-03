"use client";

import * as React from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/documents/field";
import { AuthError } from "@/components/auth/auth-states";
import { useDeleteUserMutation } from "@/hooks/use-admin-platform-users-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  MIN_DELETE_REASON,
  emailConfirmed,
  reasonShortfall,
  userDisplayName,
  type PlatformUser,
} from "@/lib/admin/users";

/**
 * Delete an account, deliberately.
 *
 * The backend won't take an id alone: it wants the account's email typed by
 * hand and a reason it records against the deletion. The dialog asks for both
 * the same way, and keeps the button off until they're right, so the request
 * it sends is one the backend will accept.
 *
 * Its own errors come back with a message meant for people — "The email
 * address you typed does not match this account" — so they're shown as-is,
 * inside the dialog, beside the field they're about.
 */
export function DeleteUserDialog({
  user,
  onClose,
}: {
  user: PlatformUser | null;
  onClose: () => void;
}) {
  const remove = useDeleteUserMutation();
  const [typedEmail, setTypedEmail] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [serverError, setServerError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user) return;
    setTypedEmail("");
    setReason("");
    setServerError(null);
    remove.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const confirmed = user ? emailConfirmed(typedEmail, user.email) : false;
  const shortfall = reasonShortfall(reason);
  const ready = confirmed && shortfall === 0;

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !ready || remove.isPending) return;

    remove.mutate(
      { userId: user.id, confirmEmail: typedEmail, reason },
      {
        onSuccess: ({ alreadyDeleted }) => {
          toast.success(
            alreadyDeleted ? `${user.email} was already deleted` : `${user.email} deleted`,
          );
          onClose();
        },
        onError: (error) =>
          setServerError(apiErrorMessage(error, "The account couldn't be deleted. Try again.")),
      },
    );
  };

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && !remove.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Delete {user ? userDisplayName(user) : "this account"}?</DialogTitle>
          <DialogDescription>
            The account is marked as deleted and the deletion is recorded with your name and reason.
          </DialogDescription>
        </DialogHeader>

        <form id="delete-user" onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <div className="space-y-1">
              <p className="font-medium">This can&apos;t be undone from the admin area.</p>
              <p className="text-muted-foreground">
                Their invoices, quotes and payments are kept, but there&apos;s no restore option
                here yet.
              </p>
            </div>
          </div>

          <AuthError message={serverError} />

          <Field
            label="Type the account's email to confirm"
            htmlFor="delete-confirm-email"
            hint={user ? `Type ${user.email}` : undefined}
          >
            <Input
              id="delete-confirm-email"
              type="email"
              autoComplete="off"
              spellCheck={false}
              value={typedEmail}
              onChange={(event) => {
                setTypedEmail(event.target.value);
                setServerError(null);
              }}
              placeholder={user?.email}
              aria-invalid={typedEmail.trim() !== "" && !confirmed}
            />
          </Field>

          <Field
            label="Why is this account being deleted?"
            htmlFor="delete-reason"
            hint={
              shortfall > 0
                ? `${shortfall} more character${shortfall === 1 ? "" : "s"} needed (at least ${MIN_DELETE_REASON}).`
                : "Recorded against the deletion in the audit log."
            }
          >
            <Textarea
              id="delete-reason"
              rows={3}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setServerError(null);
              }}
              placeholder="For example: the owner asked for their account to be closed."
            />
          </Field>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="delete-user"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={!ready || remove.isPending}
          >
            {remove.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {remove.isPending ? "Deleting…" : "Delete account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
