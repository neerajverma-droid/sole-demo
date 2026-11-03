"use client";

import { ExternalLink, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SOLE_COMMUNITY_URL } from "@/lib/partner-hubs";

/**
 * The Sole Community hand-off.
 *
 * The forum lives on its own site, not in the app, so this is a stop on the way
 * rather than a screen of its own — say where the link goes, then open it in a
 * new tab. Same shape as `SupportDialog` and `EducationDialog`, which made the
 * identical trade for their own hubs.
 *
 * Controlled by the caller, like the other menu dialogs beside it — whichever
 * menu offers Sole Community owns the open state.
 */
export function CommunityDialog({
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
            <Users className="size-6" aria-hidden />
          </span>
          <DialogTitle>Sole Community</DialogTitle>
          <DialogDescription>
            You&apos;ll be taken to Sole&apos;s Community — connect with other
            Sole users, share tips and stay up to date with what&apos;s new.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="sm:justify-center">
          <Button asChild onClick={() => onOpenChange(false)}>
            <a
              href={SOLE_COMMUNITY_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Continue to Sole Community
              <ExternalLink aria-hidden />
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
