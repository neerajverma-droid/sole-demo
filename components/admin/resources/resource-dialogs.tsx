"use client";

import * as React from "react";

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
import { Label } from "@/components/ui/label";

/**
 * The two prompts the Resources manager needs: a name (new folder, rename)
 * and a yes/no (delete). The action runs inside the dialog so it can show
 * "Saving…" and stay open until the request finishes; failures are reported
 * by the action itself (as a toast), so the dialog just closes.
 */
export type ResourceDialogState =
  | {
      mode: "name";
      title: string;
      description?: string;
      label: string;
      initialValue?: string;
      confirmLabel: string;
      maxLength: number;
      onSubmit: (value: string) => Promise<void>;
    }
  | {
      mode: "confirm";
      title: string;
      description?: string;
      confirmLabel: string;
      onSubmit: () => Promise<void>;
    };

export function ResourceDialog({
  dialog,
  onClose,
}: {
  dialog: ResourceDialogState | null;
  onClose: () => void;
}) {
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (dialog?.mode === "name") setValue(dialog.initialValue ?? "");
    setBusy(false);
  }, [dialog]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      onClose();
    }
  };

  const close = (open: boolean) => {
    if (!open && !busy) onClose();
  };

  if (dialog?.mode === "confirm") {
    return (
      <AlertDialog open onOpenChange={close}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog.title}</AlertDialogTitle>
            {dialog.description && <AlertDialogDescription>{dialog.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void run(dialog.onSubmit);
              }}
            >
              {busy ? "Deleting…" : dialog.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  const trimmed = value.trim();
  const unchanged = dialog?.mode === "name" && trimmed === (dialog.initialValue ?? "").trim();

  return (
    <Dialog open={dialog?.mode === "name"} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        {dialog?.mode === "name" && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!trimmed || busy) return;
              if (unchanged) return onClose();
              void run(() => dialog.onSubmit(trimmed));
            }}
          >
            <DialogHeader>
              <DialogTitle>{dialog.title}</DialogTitle>
              {dialog.description && <DialogDescription>{dialog.description}</DialogDescription>}
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="resource-dialog-name">{dialog.label}</Label>
              <Input
                id="resource-dialog-name"
                autoFocus
                maxLength={dialog.maxLength}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                disabled={busy}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={!trimmed || busy}>
                {busy ? "Saving…" : dialog.confirmLabel}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
