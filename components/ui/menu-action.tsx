"use client";

import Link from "next/link";

import {
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * One row-menu action.
 *
 * The platform rule is that an action which doesn't apply is disabled with the
 * reason on hover, never hidden — a menu whose contents shift between rows is
 * harder to learn than one where an entry is greyed out. That rule is here
 * rather than in each table so all six list screens state it the same way.
 */
export function MenuAction({
  icon,
  label,
  onSelect,
  href,
  disabledReason,
  hint,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onSelect?: () => void;
  /** Navigates instead of acting. Ignored while disabled. */
  href?: string;
  /** When set, the item is disabled and this explains why. */
  disabledReason?: string;
  /**
   * A short note on hover for an item that *is* enabled — what it will do when
   * the label alone can't say (e.g. why "Send again" is on offer). Ignored
   * while disabled, where `disabledReason` takes the tooltip.
   */
  hint?: string;
  destructive?: boolean;
}) {
  const className = cn(
    destructive && "text-destructive focus:text-destructive",
  );

  if (disabledReason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* The wrapper takes the hover: a disabled item fires no events. */}
          <div>
            <DropdownMenuItem disabled className={className}>
              {icon}
              {label}
            </DropdownMenuItem>
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-56">
          {disabledReason}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (href) {
    return (
      <DropdownMenuItem asChild className={className}>
        <Link href={href}>
          {icon}
          {label}
        </Link>
      </DropdownMenuItem>
    );
  }

  const item = (
    <DropdownMenuItem onSelect={onSelect} className={className}>
      {icon}
      {label}
    </DropdownMenuItem>
  );

  if (hint) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{item}</TooltipTrigger>
        <TooltipContent side="left" className="max-w-56">
          {hint}
        </TooltipContent>
      </Tooltip>
    );
  }

  return item;
}
