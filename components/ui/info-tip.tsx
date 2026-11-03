"use client";

import * as React from "react";
import { Info } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The small info affordance used beside labels, titles and stat cards.
 *
 * It lives here rather than beside the invoice settings block that first needed
 * it, so a screen can explain a figure without importing the invoice editor's
 * dependencies.
 *
 * The trigger is a focusable `<span>`, not a `<button>`: this sits inside stat
 * cards, table cells and clickable rows, and a button nested in a button is
 * invalid HTML that the browser reparses — which showed up as a hydration
 * mismatch. A span with `role="button"` and `tabIndex={0}` keeps it reachable by
 * keyboard and announced correctly while nesting safely anywhere.
 */
export function InfoTip({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-label="More information"
          // Radix opens on hover and focus; these make the keyboard equivalents
          // of a click work too, since a span has no native activation.
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpen((current) => !current);
            }
            if (event.key === "Escape") setOpen(false);
          }}
          // Inside a clickable row, opening the tip shouldn't also open the row.
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen((current) => !current);
          }}
          className={cn(
            "grid size-4 shrink-0 cursor-default place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <Info className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{text}</TooltipContent>
    </Tooltip>
  );
}
