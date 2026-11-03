"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Pin, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type NavTone = "default" | "teal" | "red";

/** The pinned state of the row, and the way to flip it. */
export type NavPin = {
  pinned: boolean;
  onToggle: () => void;
  /**
   * Before the first pin, the icon sits faintly on every row rather than
   * waiting for a hover — there's no discovering a control you can only see
   * once you've found it. Reverts to hover-only afterwards.
   */
  alwaysVisible?: boolean;
};

/**
 * The one row used by every nav entry — leaf links, non-navigating
 * "coming soon" items, collapsible group triggers and child items alike.
 * Renders an <a> when given an href, otherwise a <button>; the ref and any
 * extra props go to that element, so it can be handed to CollapsibleTrigger
 * via asChild and still be the thing that toggles.
 *
 * The pin is required rather than optional, because "every row that has one has
 * one" is the whole point: an optional pin is one call site away from being
 * left out of a row that should have had it. Which row shouldn't is decided
 * here and nowhere else — see `hasChildren` below.
 */
type NavRowProps = React.HTMLAttributes<HTMLElement> & {
  label: string;
  icon?: LucideIcon;
  href?: string;
  active?: boolean;
  hasChildren?: boolean;
  expanded?: boolean;
  tone?: NavTone;
  /** 1 indents a child so its label lines up under the parent's label. */
  depth?: 0 | 1;
  pin: NavPin;
  type?: "button";
};

const ROW_BASE =
  "relative flex w-full text-xs font-semibold items-center gap-3 rounded-md py-1.5 pl-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The pin's lane, kept clear on a row that has a pin so a long label truncates
 * rather than running under it. Only on those rows: a group reserving space for
 * a button it never shows would park its chevron short of the right edge, with
 * nothing in the gap.
 */
const ROW_PIN_LANE = "pr-9";
const ROW_NO_PIN_LANE = "pr-3";

const TONE: Record<NavTone, string> = {
  default: "hover:bg-accent",
  teal: "text-teal-600 hover:bg-accent dark:text-teal-400",
  red: "text-red-600 hover:bg-accent dark:text-red-400",
};

/** Active: light indigo fill, brand indigo text/icon, 3px bar on the right. */
const ROW_ACTIVE =
  "bg-indigo-50 text-primary hover:bg-indigo-100 dark:bg-primary/15 dark:hover:bg-primary/20";

export const NavRow = React.forwardRef<HTMLElement, NavRowProps>(
  function NavRow(
    {
      label,
      icon: Icon,
      href,
      active = false,
      hasChildren = false,
      expanded = false,
      tone = "default",
      depth = 0,
      pin,
      className,
      ...props
    },
    ref,
  ) {
    /**
     * A group row carries no pin.
     *
     * It isn't a destination — it opens the list beneath it and goes nowhere
     * itself — so a shortcut to it would save nobody the step it claimed to.
     * Decided from `hasChildren` here rather than by each call site passing or
     * withholding a pin, which is the version that drifts: `lib/nav.ts` keeps
     * the same rule for what a stored id is allowed to resolve to.
     */
    const pinnable = !hasChildren;

    const classes = cn(
      ROW_BASE,
      pinnable ? ROW_PIN_LANE : ROW_NO_PIN_LANE,
      active ? ROW_ACTIVE : TONE[tone],
      depth === 1 && "pl-10",
      className,
    );

    const content = (
      <>
        {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
        <span className="truncate text-sm">{label}</span>
        {hasChildren ? (
          <ChevronRight
            className={cn(
              "ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-150",
              expanded && "rotate-90",
            )}
            aria-hidden
          />
        ) : null}
        {active ? (
          <span
            className="absolute right-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-l-full bg-primary"
            aria-hidden
          />
        ) : null}
      </>
    );

    /**
     * The pin is a sibling of the row laid over its right edge, not a child of
     * it: a button inside an anchor is invalid, and nesting the two would make
     * every pin click a navigation to argue with.
     */
    return (
      <div className="group/row relative">
        {href ? (
          <Link
            ref={ref as React.Ref<HTMLAnchorElement>}
            href={href}
            aria-current={active ? "page" : undefined}
            className={classes}
            // A link drags itself as a URL by default, which would fight the
            // reorder drag the PINNED section puts on the row around it.
            draggable={false}
            {...props}
          >
            {content}
          </Link>
        ) : (
          <button
            ref={ref as React.Ref<HTMLButtonElement>}
            type="button"
            className={classes}
            {...props}
          >
            {content}
          </button>
        )}

        {/* Static label with aria-pressed rather than a label that flips to
            "Unpin": the state is the button's, and saying it twice reads as two
            different controls. */}
        {pinnable ? (
          <button
            type="button"
            onClick={(event) => {
              // Overlaying means the click never reaches the row's own link. What
              // it can still reach is whatever wraps the row — a collapsible
              // trigger, the PINNED section's drag handlers — and pinning is not
              // a request to navigate anywhere or open anything.
              event.preventDefault();
              event.stopPropagation();
              pin.onToggle();
            }}
            aria-pressed={pin.pinned}
            aria-label={`Pin ${label}`}
            className={cn(
              "absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded outline-none transition-opacity",
              pin.alwaysVisible ? "opacity-40" : "opacity-0",
              "focus-visible:opacity-100 group-hover/row:opacity-100",
              "hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring",
              pin.pinned
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Pin
              className={cn("size-3.5", pin.pinned && "fill-current")}
              aria-hidden
            />
          </button>
        ) : null}
      </div>
    );
  },
);

/** FINANCES / OPERATIONS / … section heading. */
export function NavGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-2 pt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}
