"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_SIZES, type PageInfo } from "@/lib/products";
import { cn } from "@/lib/utils";

/**
 * One page control, whatever it does.
 *
 * A single square for the arrows, the numbers and the ellipses alike: the
 * group's rhythm is the point, and a "10" wider than a "9" or an ellipsis
 * narrower than both would make the row shuffle as you move through it.
 * `tabular` is the load-bearing half of that — proportional digits are
 * different widths, so "11" and "17" wouldn't agree even inside a fixed box.
 */
const PAGE_CONTROL = "size-9 shrink-0 rounded-[9px] text-sm tabular";

/**
 * Space to leave above the table when scrolling it back into view: the sticky
 * top bar (h-14, 56px) plus a little air.
 */
const STICKY_TOP_OFFSET = 72;

/**
 * Keeps the table on screen across a page change.
 *
 * A pager sits under its table, so it's clicked from the bottom of a long page.
 * The next page loads behind a shimmer that is rarely as tall as the rows it
 * replaces, the document shortens, and the browser clamps the scroll position
 * to the shorter page — which, once the rows land and the page grows back, is
 * left somewhere in the middle of the list. Bringing the table's top back to
 * the top of the screen first means there is nothing left to clamp, and
 * whoever changed page lands at the start of the new one, which is where a
 * pager is expected to leave them.
 *
 * Only scrolls when the top of the table is already above the viewport; a
 * table that's fully in view stays exactly where it is.
 */
function keepTableInView(pager: HTMLElement | null) {
  const table = pager?.previousElementSibling;
  if (!table) return;
  const top = table.getBoundingClientRect().top;
  if (top < STICKY_TOP_OFFSET) {
    window.scrollBy({ top: top - STICKY_TOP_OFFSET });
  }
}

/**
 * The pages to show, and where the runs are broken.
 *
 * A number is a page; a string is a gap. Built from a set so the overlaps near
 * the ends collapse on their own — on page two, "one either side" and "always
 * show page one" are the same button, and there's nothing to special-case.
 *
 * The gap key carries the page it follows, which makes it unique without an
 * index: two gaps in one row can never sit after the same page.
 */
function pageSlots(current: number, count: number): (number | string)[] {
  if (count <= 1) return [1];

  const wanted = new Set([1, count, current - 1, current, current + 1]);
  const shown = [...wanted]
    .filter((page) => page >= 1 && page <= count)
    .sort((a, b) => a - b);

  const slots: (number | string)[] = [];
  let previous = 0;
  for (const page of shown) {
    if (previous > 0 && page - previous > 1) slots.push(`gap-${previous}`);
    slots.push(page);
    previous = page;
  }
  return slots;
}

/**
 * A rows-per-page control, a range read-out and a numbered pager, sitting
 * under a table. Takes the page counters rather than the rows, so the label
 * can't disagree with what's rendered — and so one bar serves tables of
 * different row types, the way `TablePagination` does for the tables that
 * only need a rows-per-page control and a plain "page / pageCount" read-out
 * rather than numbered pages of their own.
 *
 * Nothing here animates in. It's a control strip that's simply present once
 * there are rows, and the only movement is the colour change under the cursor.
 */
export function NumberedPagination({
  page,
  pageSize,
  pageSizes,
  onPageChange,
  onPageSizeChange,
  itemLabel,
  itemLabelPlural,
  navLabel,
  disabled = false,
  keepScrollPosition = false,
}: {
  page: PageInfo;
  pageSize: number;
  pageSizes?: readonly number[];
  onPageChange: (next: number) => void;
  /** Omit for a list whose page size is fixed — the rows-per-page control is then left out. */
  onPageSizeChange?: (next: number) => void;
  /** Singular noun for the range label — pluralised with a trailing "s". */
  itemLabel: string;
  itemLabelPlural?: string;
  /** aria-label for the page nav, e.g. "Invoices pages". */
  navLabel: string;
  /** Whether controls are disabled (e.g. while data is fetching). */
  disabled?: boolean;
  /**
   * Don't scroll the table's top back into view when the page changes. For a
   * list whose own screen keeps the reader at the pager instead, so that going
   * to the next page and back doesn't drop them at the top of the list.
   */
  keepScrollPosition?: boolean;
}) {
  const rowsPerPageId = React.useId();
  const slots = pageSlots(page.page, page.pageCount);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const goToPage = (next: number) => {
    if (!keepScrollPosition) keepTableInView(rootRef.current);
    onPageChange(next);
  };

  const availableSizes = React.useMemo(() => {
    const base = pageSizes ? [...pageSizes] : [...PAGE_SIZES];
    if (!base.includes(pageSize)) {
      base.push(pageSize);
      base.sort((a, b) => a - b);
    }
    return base;
  }, [pageSizes, pageSize]);

  return (
    <div
      ref={rootRef}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3"
    >
      <p className="text-sm text-muted-foreground tabular">
        {page.from}–{page.to} of {page.total}{" "}
        {page.total === 1 ? itemLabel : (itemLabelPlural ?? `${itemLabel}s`)}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span id={rowsPerPageId} className="text-sm text-muted-foreground">
              Rows per page
            </span>
            <Select
              disabled={disabled}
              value={String(pageSize)}
              onValueChange={(value) => {
                keepTableInView(rootRef.current);
                onPageSizeChange(Number(value));
              }}
            >
              <SelectTrigger
                aria-labelledby={rowsPerPageId}
                className="h-9 w-[76px] rounded-[9px] tabular"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableSizes.map((size) => (
                  <SelectItem
                    key={size}
                    value={String(size)}
                    className="tabular"
                  >
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <nav aria-label={navLabel} className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous page"
            disabled={disabled || page.page <= 1}
            onClick={() => goToPage(page.page - 1)}
            className={cn(
              PAGE_CONTROL,
              "text-muted-foreground hover:bg-muted hover:text-foreground",
              "focus-visible:ring-2 disabled:opacity-40",
            )}
          >
            <ChevronLeft />
          </Button>

          {/*
            Sized to the slots actually shown, so the arrows sit right beside
            the numbers. Padding it to the widest possible run left a wide
            empty band either side on long lists ("‹   1 2 … 24   ›").
          */}
          <div className="flex items-center justify-center gap-1">
            {slots.map((slot) =>
              typeof slot === "number" ? (
                <Button
                  key={slot}
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  aria-current={slot === page.page ? "page" : undefined}
                  aria-label={`Page ${slot}`}
                  onClick={() => goToPage(slot)}
                  className={cn(
                    PAGE_CONTROL,
                    "font-medium focus-visible:ring-2",
                    slot === page.page
                      ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {slot}
                </Button>
              ) : (
                <span
                  key={slot}
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center text-sm text-muted-foreground"
                >
                  …
                </span>
              ),
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Next page"
            disabled={disabled || page.page >= page.pageCount}
            onClick={() => goToPage(page.page + 1)}
            className={cn(
              PAGE_CONTROL,
              "text-muted-foreground hover:bg-muted hover:text-foreground",
              "focus-visible:ring-2 disabled:opacity-40",
            )}
          >
            <ChevronRight />
          </Button>
        </nav>
      </div>
    </div>
  );
}
