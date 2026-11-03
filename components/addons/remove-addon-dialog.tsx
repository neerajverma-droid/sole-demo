"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type Addon } from "@/lib/addons";

/**
 * Confirming that an add-on comes off the plan.
 *
 * Removing was a one-click local toggle when "added" meant a list in this
 * browser. It is a billing change now — it edits the Stripe subscription — and
 * it also takes the add-on's rows out of the rail, so an accidental press costs
 * someone their navigation as well as their feature.
 *
 * What it deliberately does NOT say is "you'll be refunded". The server removes
 * the item with proration switched off, so there is no credit for the rest of
 * the period: they keep paying to the end of it and stop after. Saying that
 * plainly is the whole reason this dialog has a body rather than just a title.
 */
export function RemoveAddonDialog({
  addon,
  busy,
  onConfirm,
  onCancel,
}: {
  /** The add-on awaiting confirmation, or null when nothing is. */
  addon: Addon | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={addon !== null}
      onOpenChange={(next) => {
        // Not while the change is in flight: closing wouldn't stop it, and the
        // next thing they'd see is a plan that changed after they backed out.
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Remove {addon?.name}?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">
              <p>
                It comes off your plan at the end of the current billing period
                — you keep it until then, and you won&apos;t be billed for it
                again.
              </p>
              <p>
                Its {addon?.pages?.length ? "pages leave" : "page leaves"} your
                sidebar straight away. Nothing you&apos;ve entered is deleted,
                and adding it back brings it all with it.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {busy ? "Removing…" : "Remove add-on"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
