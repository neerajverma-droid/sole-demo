"use client";

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
import { useSession } from "@/components/auth/session-provider";

/**
 * The logout confirmation.
 *
 * The standard confirmation, as for any action that can't be undone by clicking
 * again — signing back in is a whole form away. Extracted from the sidebar's
 * profile menu when the Businesses page grew a Log out of its own: two copies of
 * this would be two places for the wording, and for what logging out does, to
 * drift apart.
 *
 * Controlled by the caller rather than owning an atom, because it's opened by
 * whichever menu or button sits beside it and there's never more than one.
 */
export function LogoutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const { signOut } = useSession();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Log out of Sole?</AlertDialogTitle>
          <AlertDialogDescription>
            You&apos;ll need to sign in again to get back to your account.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            /*
             * No toast and no router.push here any more. `signOut` ends with a
             * hard navigation to `/login?error=signed_out` — which is what
             * guarantees nothing of the previous session survives in memory —
             * and the sign-in screen says "You've been signed out." off that
             * parameter. A toast fired a tick before a full page load is a
             * toast nobody reads.
             */
            onClick={async () => {
              onOpenChange(false);
              await signOut();
            }}
          >
            Log out
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
