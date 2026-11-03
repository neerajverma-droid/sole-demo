import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A column that hugs its content instead of taking a share of the leftover
 * width.
 *
 * A `w-full` table lays out `auto`, which hands every spare pixel to the
 * columns in proportion to how wide their content could be — so a date, a
 * mostly-empty deposit and a right-aligned action cluster each collect space
 * they have nothing to do with. Right-aligned columns show it worst: the slack
 * lands to the left of the content, and the gap opens between two columns
 * rather than at the edge of one.
 *
 * `w-px` is narrower than any real content, so the layout clamps the column
 * back up to its widest cell and stops treating it as somewhere to put space.
 * `nowrap` is what makes that width a sensible one — measured for wrapping,
 * "12 Jul 2026" is as narrow as "2026", and the column would collapse to a
 * three-line date.
 *
 * Goes on the header *and* every cell in the column: a column is as wide as its
 * widest member, so one cell left off undoes it. For dates, single figures,
 * badges and action clusters — never for text meant to truncate, which would
 * size its column to the longest string in the list instead of cutting it off.
 */
export const HUG_COLUMN = "w-px whitespace-nowrap"

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & {
    /**
     * Goes on the scroll container rather than the table. A sticky header only
     * sticks inside an ancestor that actually scrolls, and this div — already
     * `overflow-auto` — is that ancestor: give it a max height here and the
     * header stays put while the body moves under it.
     */
    containerClassName?: string
  }
>(({ className, containerClassName, ...props }, ref) => (
  <div className={cn("relative w-full overflow-auto", containerClassName)}>
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      // A light indigo wash rather than grey: it ties the header to the brand
      // without tinting a single body row, which stay white under it. A touch
      // stronger in dark, where 6% of anything disappears.
      "bg-primary/[0.06] dark:bg-primary/[0.10]",
      // The label colour is `--primary-heading`, not `--primary`: the brand
      // indigo manages 3.9:1 on the dark surface and fails AA for text.
      "[&_th]:text-primary-heading",
      // Header rows must not pick up the body row's hover fill. Stacked
      // variants, not [&_tr:hover]: — a colon inside an arbitrary variant
      // doesn't compile.
      "[&_tr]:border-b [&_tr]:hover:bg-transparent",
      className
    )}
    {...props}
  />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "surface-subtle border-t font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b transition-colors hover:bg-primary/5 data-[state=selected]:bg-primary/10",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
