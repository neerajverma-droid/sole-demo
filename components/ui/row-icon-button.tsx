"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * One inline row action, as an icon.
 *
 * The ghost-icon treatment the list tables already use for actions that sit in a
 * row rather than in its menu — Expenses' unmatch button, the overflow trigger
 * itself — given a name so the next table doesn't have to reproduce the recipe
 * from memory. `size-8` matches the overflow trigger it sits beside, which is
 * what keeps an action cluster on one rhythm.
 *
 * It follows `MenuAction`'s rule rather than inventing its own: an action that
 * doesn't apply is disabled with the reason on hover, never hidden. A cluster
 * whose contents shift between rows is harder to learn than one where a button
 * is greyed out — and for an icon-only control that's doubly true, since its
 * position is the only thing naming it.
 *
 * Icon-only, so `label` is the accessible name rather than decoration. By
 * default it isn't shown on hover for an enabled button — a tooltip on every
 * icon in a row is a lot of chrome for a short cluster. A table whose whole
 * action set sits inline (Expenses) passes `tooltip` so each icon is named on
 * hover, since there's no menu left to read the names from.
 */
export function RowIconButton({
  icon,
  label,
  href,
  onClick,
  disabledReason,
  destructive,
  tooltip = false,
}: {
  icon: React.ReactNode;
  /** The accessible name — the button shows only its icon. */
  label: string;
  /** Navigates instead of acting. Ignored while disabled. */
  href?: string;
  onClick?: () => void;
  /** When set, the button is disabled and this explains why on hover. */
  disabledReason?: string;
  destructive?: boolean;
  /** Shows `label` on hover for an enabled button too. */
  tooltip?: boolean;
}) {
  const disabled = !!disabledReason;
  const asLink = !!href && !disabled;

  const button = (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "size-8 text-muted-foreground",
        destructive ? "hover:text-destructive" : "hover:text-foreground",
      )}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      // Only when it's actually a link: `asChild` hands every prop to the child,
      // and an anchor does nothing with `disabled` — it would stay clickable.
      asChild={asLink}
    >
      {asLink ? <Link href={href}>{icon}</Link> : icon}
    </Button>
  );

  if (!disabled && !tooltip) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled ? (
          // The wrapper takes the hover: a disabled button fires no events.
          <span className="inline-flex">{button}</span>
        ) : (
          button
        )}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-56">
        {/* With tooltips on, a disabled icon still says what it is. */}
        {!disabled ? label : tooltip ? `${label} — ${disabledReason}` : disabledReason}
      </TooltipContent>
    </Tooltip>
  );
}
