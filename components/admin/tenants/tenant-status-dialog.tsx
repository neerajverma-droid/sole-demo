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
import { useSetTenantStatusMutation } from "@/hooks/use-admin-tenants-query";
import { apiErrorMessage } from "@/lib/api-error";
import { formatCount } from "@/lib/admin/format";
import type { Tenant } from "@/lib/admin/tenants";

export type TenantStatusChange = {
  tenant: Tenant;
  next: "active" | "suspended";
};

/**
 * Confirm a suspension or a reactivation.
 *
 * The old admin did both on a single click. Suspending signs every member out
 * on the spot — the backend logs out their devices — so it's confirmed, and
 * the confirmation says so. Reactivating is confirmed too, with lighter copy,
 * because it lets people back in who may have been locked out for a reason.
 */
export function TenantStatusDialog({
  change,
  onClose,
}: {
  change: TenantStatusChange | null;
  onClose: () => void;
}) {
  const setStatus = useSetTenantStatusMutation();
  const suspending = change?.next === "suspended";
  const name = change?.tenant.name ?? "this tenant";
  const members = change?.tenant.memberCount ?? 0;

  return (
    <AlertDialog
      open={change !== null}
      onOpenChange={(open) => !open && !setStatus.isPending && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {suspending ? `Suspend ${name}?` : `Reactivate ${name}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {suspending
              ? `${members === 1 ? "Its 1 active member is" : `All ${formatCount(members)} active members are`} signed out straight away and can't sign back in until the tenant is reactivated. Their data is kept.`
              : "Members can sign in again straight away."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={setStatus.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={
              suspending
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
            disabled={setStatus.isPending}
            onClick={(event) => {
              // Kept open until the request settles, so a failure is reported
              // beside the thing that failed rather than after it's gone.
              event.preventDefault();
              if (!change) return;
              setStatus.mutate(
                { id: change.tenant.id, status: change.next },
                {
                  onSuccess: () => {
                    toast.success(suspending ? `${name} suspended` : `${name} reactivated`);
                    onClose();
                  },
                  onError: (error) =>
                    toast.error(
                      apiErrorMessage(
                        error,
                        suspending ? "The tenant couldn't be suspended." : "The tenant couldn't be reactivated.",
                      ),
                    ),
                },
              );
            }}
          >
            {setStatus.isPending
              ? suspending
                ? "Suspending…"
                : "Reactivating…"
              : suspending
                ? "Suspend tenant"
                : "Reactivate tenant"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
