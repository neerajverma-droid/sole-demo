"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The "Today" sheet: everything on Quick Actions that isn't the card itself —
 * breakdowns, tiles, updates, the streak, Customise — opens here, so nothing
 * navigates away.
 *
 * A bottom sheet on a phone, a centred dialog from `sm` up, as the handoff
 * specifies. Radix's dialog underneath, so the scrim, the X and Esc all close
 * it, focus is trapped while it's open and returned when it closes.
 */
export function TodaySheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** The sheet's actions, pinned under the body. */
  footer?: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[6px]",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed z-50 flex max-h-[90dvh] w-full flex-col overflow-hidden bg-card/95 shadow-2xl outline-none backdrop-blur-xl",
            // Phone: pinned to the bottom, sliding up.
            "inset-x-0 bottom-0 rounded-t-2xl",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=open]:duration-300",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=closed]:duration-200",
            // Wider: a centred dialog that rises and settles.
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
            "sm:data-[state=open]:slide-in-from-bottom-4 sm:data-[state=open]:zoom-in-[0.98]",
            "sm:data-[state=closed]:slide-out-to-bottom-4 sm:data-[state=closed]:zoom-out-[0.98]",
          )}
        >
          <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-4 px-5 pb-1 pt-3 sm:pt-5">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-lg font-semibold leading-tight tracking-tight">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:none]">{children}</div>
          {footer ? <div className="grid gap-2 border-t border-border/60 px-5 py-4">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
