"use client";

import { ExternalLink, GraduationCap } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EDUCATION_HUB_URL } from "@/lib/partner-hubs";

/**
 * The Education Hub hand-off.
 *
 * Courses live on their own site, not in the app, so this is a stop on the way
 * rather than a screen of its own — say where the link goes, then open it in a
 * new tab. Same shape as `SupportDialog`, which made the identical trade for
 * the Support Hub.
 *
 * Controlled by the caller, like the other menu dialogs beside it — whichever
 * menu offers Education owns the open state.
 */
export function EducationDialog({
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
            <GraduationCap className="size-6" aria-hidden />
          </span>
          <DialogTitle>Education Hub</DialogTitle>
          <DialogDescription>
            You&apos;ll be taken to Sole&apos;s Education Hub — courses and
            tutorials on accounting fundamentals and getting the most out of
            Sole.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="sm:justify-center">
          <Button asChild onClick={() => onOpenChange(false)}>
            <a
              href={EDUCATION_HUB_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Continue to the Education Hub
              <ExternalLink aria-hidden />
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
