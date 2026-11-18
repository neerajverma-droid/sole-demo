"use client";

import * as React from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * What the Goals, Budget and Business planner lists share for their rows: a
 * line of text that is cut to what fits, with the whole of it on hover — the
 * way the Invoices list shows a description.
 */

/** Hover (or focus) shows the full text. The child is the element that's cut. */
export function FullTextTip({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-[20rem] whitespace-pre-line break-words">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The muted second line under a row's name — "Savings · Monthly", "Equipment ·
 * Cash". Cut to the column and complete on hover. Focusable, so the full text
 * is reachable without a mouse.
 */
export function RowSubtext({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <FullTextTip text={text}>
      <span
        tabIndex={0}
        className={cn(
          "block truncate text-xs text-muted-foreground outline-none focus-visible:underline",
          className,
        )}
      >
        {text}
      </span>
    </FullTextTip>
  );
}
