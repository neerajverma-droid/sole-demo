"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

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

/**
 * Guards a dirty form against being abandoned.
 *
 * Built as a hook because four forms need it — expenses, invoices, quotes and
 * refunds — and each leaves by a different door: a Cancel button, a back link, or
 * closing the tab. `guard` wraps an in-app navigation so it asks first;
 * `beforeunload` covers the browser's own exit, which JavaScript can't intercept
 * beyond asking the browser to prompt.
 */
export function useUnsavedChanges(dirty: boolean) {
  const router = useRouter();
  const [pending, setPending] = React.useState<null | (() => void)>(null);

  // The browser's own dialog for a tab close or reload. Its wording isn't ours to
  // choose — every browser shows its own — but without this the work vanishes.
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy browsers need a return value to show the prompt at all.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  /** Wraps an action so a dirty form asks before losing it. */
  const guard = React.useCallback(
    (action: () => void) => () => {
      if (!dirty) {
        action();
        return;
      }
      setPending(() => action);
    },
    [dirty],
  );

  /** Convenience for the commonest case: leaving for another route. */
  const guardNavigate = React.useCallback(
    (href: string) => guard(() => router.push(href)),
    [guard, router],
  );

  const dialog = (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => !open && setPending(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
          <AlertDialogDescription>
            This form has edits that haven&apos;t been saved. Leaving now loses
            them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              const action = pending;
              setPending(null);
              action?.();
            }}
          >
            Discard changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { guard, guardNavigate, dialog };
}
