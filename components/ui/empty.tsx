import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Shared empty state: a muted icon medallion, a one-line title, a supporting
 * sentence and one action. Used wherever a list or card has nothing to show,
 * so every empty surface on the platform reads the same way.
 */
const Empty = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-14 text-center shadow-sm",
      className
    )}
    {...props}
  />
))
Empty.displayName = "Empty"

/** The icon medallion — brand indigo at 10%, never a saturated chip. */
const EmptyMedia = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "grid size-12 place-items-center rounded-full bg-primary/10 text-primary [&_svg]:size-5",
      className
    )}
    {...props}
  />
))
EmptyMedia.displayName = "EmptyMedia"

const EmptyTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("font-semibold", className)} {...props} />
))
EmptyTitle.displayName = "EmptyTitle"

const EmptyDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      "mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground",
      className
    )}
    {...props}
  />
))
EmptyDescription.displayName = "EmptyDescription"

/** Wraps the action row so the gap above it is consistent. */
const EmptyActions = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("mt-1 flex flex-wrap items-center justify-center gap-2", className)}
    {...props}
  />
))
EmptyActions.displayName = "EmptyActions"

/**
 * The nudge from the empty state to the button that ends it.
 *
 * A first-run screen is a wall of nothing with one thing worth doing on it, and
 * the button doesn't always win the eye — so the arrow points at it and drifts,
 * once, towards where it wants you to go.
 *
 * Decorative, so `aria-hidden`: the button beside it already says what it does,
 * and a screen reader announcing an arrow adds nothing. `motion-safe` gates the
 * drift rather than the arrow, so a reader who has asked for less motion still
 * gets the cue, just still.
 */
const EmptyCue = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { label?: string }
>(({ className, label, ...props }, ref) => (
  <div
    ref={ref}
    aria-hidden
    className={cn(
      "mt-1 flex flex-col items-center gap-1 text-primary",
      className
    )}
    {...props}
  >
    <svg
      viewBox="0 0 40 44"
      className="h-9 w-8 motion-safe:animate-nudge"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* A hand-drawn hook rather than a straight arrow: it reads as an aside
          pointing at the button, not as another piece of chrome. */}
      <path d="M8 4c10 2 18 10 18 22" strokeDasharray="3 4" />
      <path d="M20 22l6 4 2-7" />
    </svg>
    {label && <span className="text-xs font-medium">{label}</span>}
  </div>
))
EmptyCue.displayName = "EmptyCue"

export {
  Empty,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyActions,
  EmptyCue,
}
