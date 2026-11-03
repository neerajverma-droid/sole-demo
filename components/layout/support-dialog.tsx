"use client";

import { ExternalLink, LifeBuoy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SUPPORT_HUB_URL } from "@/lib/support";

/**
 * The Support Hub hand-off.
 *
 * Tickets live in Sole's service desk, not in the app, so this is a stop on the
 * way rather than a screen: say where the link goes, then open it in a new tab.
 * The old app's one-click sign-in to the desk was already switched off there,
 * so this is the plain link it actually shipped with.
 *
 * Controlled by the caller, like the logout confirmation beside it — whichever
 * menu offers Support owns the open state.
 */
export function SupportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center sm:text-center">
          <span className="mb-1 inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LifeBuoy className="size-6" aria-hidden />
          </span>
          <DialogTitle>Support Hub</DialogTitle>
          <DialogDescription>
            You&apos;ll be taken to Sole&apos;s Support Hub, where you can
            raise a ticket and follow up on existing ones.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="sm:justify-center">
          <Button asChild onClick={() => onOpenChange(false)}>
            <a href={SUPPORT_HUB_URL} target="_blank" rel="noopener noreferrer">
              Continue to the Support Hub
              <ExternalLink aria-hidden />
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
