import { Shimmer } from "@/components/ui/shimmer"
import { TableCell, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

/**
 * The handful of cell shapes every `*TableSkeleton` in the app repeats —
 * an icon-plus-name identity, a plain text line, a status pill, a trailing
 * action button — each previously hand-rolled per table (assets, inventory,
 * the products catalogue, and already contacts/invoices/quotes before this
 * file existed). One source for the shimmer markup itself; each table still
 * owns its own column count, widths and row count, since those genuinely do
 * differ and gluing them together would only trade one coupling for another.
 */

/** A leading icon tile over a name line and a subtext line — the shape
 *  `ItemIdentity`-style rows and asset tiles both open with. */
export function SkeletonIdentityCell({
  className,
  nameWidth = "w-32",
  subtextWidth = "w-20",
}: {
  className?: string
  nameWidth?: string
  subtextWidth?: string
}) {
  return (
    <TableCell className={className}>
      <div className="flex items-center gap-3">
        <Shimmer className="size-9 shrink-0 rounded-md" />
        <div className="min-w-0">
          <Shimmer className={cn("h-4", nameWidth)} />
          <Shimmer className={cn("mt-1.5 h-3", subtextWidth)} />
        </div>
      </div>
    </TableCell>
  )
}

/** A single line of placeholder text — most columns are just this. */
export function SkeletonTextCell({
  className,
  width = "w-16",
  align,
}: {
  className?: string
  width?: string
  align?: "right"
}) {
  return (
    <TableCell className={className}>
      <Shimmer className={cn("h-4", width, align === "right" && "ml-auto")} />
    </TableCell>
  )
}

/** A pill, standing in for a badge or status column. */
export function SkeletonBadgeCell({
  className,
  width = "w-24",
}: {
  className?: string
  width?: string
}) {
  return (
    <TableCell className={className}>
      <Shimmer className={cn("h-5 rounded-full", width)} />
    </TableCell>
  )
}

/** A bare square — a checkbox column before the list it selects has loaded. */
export function SkeletonCheckboxCell({ className }: { className?: string }) {
  return (
    <TableCell className={className}>
      <Shimmer className="size-4 rounded-sm" />
    </TableCell>
  )
}

/** The trailing icon-button cluster almost every row ends with. */
export function SkeletonActionCell({ className }: { className?: string }) {
  return (
    <TableCell className={className}>
      <Shimmer className="ml-auto size-8 rounded-full" />
    </TableCell>
  )
}

/**
 * `count` placeholder rows, each built by `render`. The one piece every
 * skeleton table repeats verbatim — `Array.from({length}).map(...)` keyed by
 * index — factored out so a table only has to say what its own row looks
 * like, not how to repeat it six times.
 */
export function SkeletonRows({
  count = 6,
  render,
}: {
  count?: number
  render: (index: number) => React.ReactNode
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <TableRow key={`skeleton-${index}`}>{render(index)}</TableRow>
      ))}
    </>
  )
}
