import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The row both Quick Actions tabs are built from.
 *
 * Extracted rather than copied. The Data tab's queue had this anatomy first —
 * tinted icon square, title, one meta line, then fixed lanes at the right edge
 * — and the New tab has to be the same design rather than a second one that
 * looks similar today and drifts by the next change. Neither tab owns it now,
 * so a change to the shape is one change.
 *
 * Presentational only, and deliberately so. What the lanes *contain* is the
 * difference between the two tabs: Data puts an amount, a clear button and an
 * overflow menu in them, New puts a CTA that navigates and nothing else. Trying
 * to model both sets of contents here would mean a prop for every one of them
 * and a component that knows about invoices.
 */

/* ------------------------------------------------------------------ *
 * The fixed right-hand lanes
 * ------------------------------------------------------------------ */

/**
 * The three lanes at the end of every row.
 *
 * Fixed widths, declared together, because the point of them is that they agree:
 * the amount, the action and the menu have to land in the same three places down
 * the whole list, and three widths set at three call sites is three chances for
 * one of them to drift.
 *
 * Everything to their left is `flex-1`, so the lanes are measured from the right
 * edge inwards — which is what makes the menu sit at the row's own padding on
 * every row without any of them knowing what the others contain.
 */

/**
 * Right-aligned in a fixed lane, so $900 and $4,488 share a right edge.
 *
 * `tabular` is the load-bearing half of that: proportional digits are different
 * widths, so a column of them is ragged even when every box is the same size.
 * `w-24` fits a seven-figure amount at this size and `whitespace-nowrap` keeps
 * one from folding onto a second line rather than overflowing where it can be
 * seen.
 */
export const ROW_AMOUNT = "w-24 shrink-0 whitespace-nowrap text-right tabular";

/**
 * One width for every label. "Pay" is three characters and "Follow up" is nine,
 * and a column of buttons that each hugged its own text would put the row's
 * primary action somewhere new on every line.
 *
 * A minimum rather than a fixed width: the longest label the catalogue holds is
 * comfortably inside it, so this reads as a fixed column — but a longer CTA
 * added later grows the button instead of truncating the word.
 */
export const ROW_ACTION = "min-w-[100px] shrink-0";

/** Last in the row, so the row's own padding is its distance from the edge. */
export const ROW_MENU = "size-8 shrink-0";

/**
 * The tinted CTA: indigo at rest, solid once the row is hovered or focused.
 *
 * The urgent five wear it because five solid indigo buttons in a column is five
 * primaries, which is none — and the New tab's secondaries wear it for the same
 * reason, under a primary that is solid. Hover and focus are on the *group* so
 * the whole row is the target, which is why every list using this puts `group`
 * on the row.
 */
export const ROW_ACTION_TINTED =
  "rounded-[9px] border-0 bg-primary/10 text-primary shadow-none hover:bg-primary hover:text-primary-foreground group-hover:bg-primary group-hover:text-primary-foreground group-focus-within:bg-primary group-focus-within:text-primary-foreground";

/* ------------------------------------------------------------------ *
 * The row
 * ------------------------------------------------------------------ */

export function ActionRowShell({
  icon: Icon,
  iconTone,
  title,
  meta,
  flush = false,
  amount,
  action,
  overflow,
}: {
  icon: LucideIcon;
  /** The icon square's tint — a `STAT_TONES` entry, or muted. */
  iconTone: string;
  title: string;
  /** The line under the title: a badge, then a phrase. Laid out here. */
  meta: React.ReactNode;
  /**
   * Inside a card that already has padding.
   *
   * The urgent five sit in a `p-6` card, so a row with its own padding would
   * be inset from the heading above it.
   */
  flush?: boolean;
  /** The money lane. Absent where a row isn't about an amount. */
  amount?: React.ReactNode;
  /** The row's one primary control. */
  action?: React.ReactNode;
  /** The menu, where there's more than one thing to do. */
  overflow?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-3", flush ? "py-3" : "p-3 sm:px-4")}>
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg [&_svg]:size-4",
          iconTone,
        )}
        aria-hidden
      >
        <Icon />
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium leading-snug tabular">
          {title}
        </p>
        {/*
          A div rather than a p: Badge renders a div, and nesting one inside a
          paragraph is invalid markup React refuses to hydrate.
        */}
        <div className="flex min-w-0 items-center gap-1.5">{meta}</div>
      </div>

      {amount}
      {action}
      {overflow}
    </div>
  );
}
