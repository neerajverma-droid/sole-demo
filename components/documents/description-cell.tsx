"use client";

import { TableCell } from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/*
 * A fixed, narrow width so a long description can never push the table wider
 * than the page: it's cut to one line with an ellipsis, and the full text is on
 * hover. The text element carries the width too — browsers ignore max-width on
 * a cell in an auto-layout table, so the cell alone wouldn't stop it growing.
 * Hidden below `lg`, where the columns that act on the row matter more than a
 * summary the document itself already carries.
 *
 * Put it on the column's header as well as its cells, so the two hide together.
 */
export const DESCRIPTION_COLUMN = "hidden w-[200px] max-w-[200px] lg:table-cell";

/**
 * A document's description (invoice, quote) for a list row: cut to one line,
 * with the whole of it in a tooltip, or a muted dash when there is none.
 */
export function DescriptionCell({ description }: { description?: string | null }) {
  const text = (description ?? "").trim();
  if (!text) {
    return (
      <TableCell className={DESCRIPTION_COLUMN}>
        <span className="text-muted-foreground" aria-label="No description">
          —
        </span>
      </TableCell>
    );
  }
  return (
    <TableCell className={DESCRIPTION_COLUMN}>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Focusable, so the full text is reachable without a mouse too. */}
            <p
              tabIndex={0}
              className="max-w-[200px] truncate text-sm text-muted-foreground outline-none focus-visible:underline"
            >
              {text}
            </p>
          </TooltipTrigger>
          <TooltipContent className="max-w-[20rem] whitespace-pre-line break-words">
            {text}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </TableCell>
  );
}
