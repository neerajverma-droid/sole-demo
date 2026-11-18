"use client";

import * as React from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * What the Invoices and Quotes lists share for their row actions: the icon
 * buttons that stand in the Actions column, the tick or cross of the Sent
 * column, and the rule for a click on the row itself.
 */

/** Dark by default, the primary colour on hover — the same on every row icon. */
export const ROW_ICON_CLASS =
  "size-8 text-secondary-foreground hover:bg-primary/10 hover:text-primary";

/** For a row's delete: red at rest and on hover, with a red wash behind it. */
export const ROW_ICON_DESTRUCTIVE_CLASS =
  "size-8 text-destructive hover:bg-destructive/10 hover:text-destructive";

/**
 * An icon-only action on the row, named on hover. A disabled one says why in
 * the same tooltip, the rule the action menu follows too.
 */
export function RowIconAction({
  icon,
  label,
  onClick,
  href,
  disabledReason,
  destructive = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  /** Navigates instead of acting. Ignored while disabled. */
  href?: string;
  disabledReason?: string;
  /** A delete: drawn in red rather than the usual dark-to-primary. */
  destructive?: boolean;
}) {
  const disabled = !!disabledReason;
  const iconClass = destructive ? ROW_ICON_DESTRUCTIVE_CLASS : ROW_ICON_CLASS;
  const button =
    href && !disabled ? (
      <Button variant="ghost" size="icon" className={iconClass} asChild>
        <Link href={href} aria-label={label}>
          {icon}
        </Link>
      </Button>
    ) : (
      <Button
        variant="ghost"
        size="icon"
        className={iconClass}
        disabled={disabled}
        onClick={onClick}
        aria-label={label}
      >
        {icon}
      </Button>
    );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* The wrapper takes the hover: a disabled button fires no events. */}
        {disabled ? <span>{button}</span> : button}
      </TooltipTrigger>
      <TooltipContent className="max-w-56">
        {disabledReason ?? label}
      </TooltipContent>
    </Tooltip>
  );
}

/** Sent or not, as a tick or a cross; the detail is on hover. */
export function SentMark({
  sent,
  summary,
  hint,
}: {
  sent: boolean;
  /** When it went out, or why it hasn't. */
  summary: string;
  /** A second, muted line — what to do about an unsent document. */
  hint?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "inline-flex outline-none focus-visible:ring-2 focus-visible:ring-ring",
            sent ? "text-success" : "text-muted-foreground",
          )}
        >
          {sent ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <X className="size-4" aria-hidden />
          )}
          <span className="sr-only">{sent ? "Sent" : "Not sent"}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[16rem] space-y-0.5">
        <p className="tabular">{summary}</p>
        {hint && <p className="text-muted-foreground">{hint}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * A click on the row's own background opens it. Controls inside the row keep
 * their own behaviour, and events that bubble up from a portal (the action
 * menu, a tooltip) aren't inside the row's DOM at all.
 */
export function openRowOnClick(
  event: React.MouseEvent<HTMLElement>,
  open: () => void,
) {
  const target = event.target as HTMLElement;
  if (!event.currentTarget.contains(target)) return;
  if (
    target.closest(
      "button, a, input, label, [role='checkbox'], [role='menuitem']",
    )
  )
    return;
  open();
}
