"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, ListOrdered } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CELL,
  HEAD_TINT,
  RULE,
  TOTAL_RULE,
} from "@/components/reports/report-table-tokens";
import { reportMoney } from "@/lib/report-periods";
import { categoryTone } from "@/lib/transactions";
import {
  listingDate,
  type ListedTransaction,
  type ListingGroup,
  type TransactionListing,
} from "@/lib/transaction-listing";
import { cn } from "@/lib/utils";

/** The three money columns, which is where the ex/GST/inc split gets checked. */
const MONEY_COLUMNS = 3;

/**
 * The ledger.
 *
 * Grouped by the category each transaction was coded to, most recent first inside
 * each group, with the group's own subtotal closing it. That's the order an
 * accountant reads a listing in: category by category, because the question is
 * usually about one of them rather than about the period as a whole.
 *
 * Read-only throughout. There are no row actions and no menus — a coding gets
 * changed on the Transactions screen, and offering it here would make a report
 * you can accidentally edit while checking it.
 */
export function TransactionListingTable({
  listing,
  empty = false,
}: {
  listing: TransactionListing;
  empty?: boolean;
}) {
  /**
   * Which categories are folded away, by name. Only the closed ones are tracked,
   * so a period that brings a new category in opens it rather than inheriting a
   * state that has never heard of it.
   */
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  const allCollapsed =
    listing.groups.length > 0 &&
    listing.groups.every((group) => collapsed[group.category]);

  const toggle = (category: string) =>
    setCollapsed((current) => ({ ...current, [category]: !current[category] }));

  const toggleAll = () =>
    setCollapsed(
      allCollapsed
        ? {}
        : Object.fromEntries(
            listing.groups.map((group) => [group.category, true]),
          ),
    );

  if (empty || listing.groups.length === 0) {
    return (
      <Empty>
        <EmptyMedia>
          <ListOrdered aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>No transactions in this period</EmptyTitle>
          <EmptyDescription>
            Check the date range above — nothing was coded between{" "}
            {listing.rangeLabel}. Anything you record or import will be grouped
            here by the category it&apos;s coded to.
          </EmptyDescription>
        </div>
        <EmptyActions>
          <Button size="sm" asChild>
            <Link href="/transactions">Go to Transactions</Link>
          </Button>
        </EmptyActions>
      </Empty>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Transactions by category</h2>
          <p className="text-xs text-muted-foreground tabular">
            {listing.rangeLabel} · {listing.groups.length} categories
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={toggleAll}>
          {allCollapsed ? "Expand all" : "Collapse all"}
        </Button>
      </div>

      {/* A bounded scroll container is what a sticky header sticks inside —
          `position: sticky` needs a scrolling ancestor, and Table's own wrapper
          is it. See the note on `containerClassName`. */}
      <Table containerClassName="max-h-[38rem]">
        <TableHeader className="sticky top-0 z-20">
          {/* Every cell carries its own opaque paint, so the row needs none —
              and `TableHeader`'s own `[&_tr]:hover:bg-transparent` can't undo it
              on hover, which is what a background on the row would have fought. */}
          <TableRow>
            <TableHead className={cn(HEAD_TINT, HUG_COLUMN, "px-4")}>
              Date
            </TableHead>
            <TableHead className={cn(HEAD_TINT, RULE, "px-4")}>
              Description
            </TableHead>
            <TableHead className={cn(HEAD_TINT, RULE, "px-4")}>
              Client / Supplier
            </TableHead>
            <TableHead className={cn(HEAD_TINT, RULE, HUG_COLUMN, "px-4")}>
              Reference
            </TableHead>
            <TableHead
              className={cn(
                HEAD_TINT,
                TOTAL_RULE,
                HUG_COLUMN,
                "px-4 text-right",
              )}
            >
              Amount (ex GST)
            </TableHead>
            <TableHead
              className={cn(HEAD_TINT, RULE, HUG_COLUMN, "px-4 text-right")}
            >
              GST
            </TableHead>
            <TableHead
              className={cn(HEAD_TINT, RULE, HUG_COLUMN, "px-4 text-right")}
            >
              Amount (inc GST)
            </TableHead>
            <TableHead
              className={cn(HEAD_TINT, TOTAL_RULE, HUG_COLUMN, "px-4")}
            >
              Reconciled
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {listing.groups.map((group) => (
            <React.Fragment key={group.category}>
              <CategoryHeaderRow
                group={group}
                open={!collapsed[group.category]}
                onToggle={() => toggle(group.category)}
              />

              {!collapsed[group.category] &&
                group.rows.map((row) => <LedgerRow key={row.id} row={row} />)}

              <SubtotalRow group={group} />
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

/**
 * A category heading, and the control that folds it.
 *
 * One cell spanning the row with a full-width button inside it, so the whole
 * heading is the target rather than just the chevron — and it's a real button,
 * which is what makes it reachable by keyboard and announced with its state.
 *
 * No amount on it: the group's total is its own row, and printing it twice would
 * leave two places for it to be wrong. The category takes the same pill colour
 * it has in the transactions table, from `categoryTone`.
 */
function CategoryHeaderRow({
  group,
  open,
  onToggle,
}: {
  group: ListingGroup;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <TableRow className="border-y border-border hover:bg-transparent">
      <TableCell colSpan={4 + MONEY_COLUMNS + 1} className="p-0">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={cn(
            "flex w-full items-center gap-2 bg-muted px-4 py-3 text-left outline-none",
            "motion-safe:transition-colors hover:bg-primary/5",
            "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          )}
        >
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150",
              !open && "-rotate-90",
            )}
            aria-hidden
          />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.category}
          </span>
          {group.type && (
            <Badge
              variant="outline"
              className={cn(
                "rounded-full px-2 py-0 text-[11px] font-medium",
                categoryTone(group.category),
              )}
            >
              {group.type}
            </Badge>
          )}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular">
            {group.rows.length}{" "}
            {group.rows.length === 1 ? "transaction" : "transactions"}
          </span>
        </button>
      </TableCell>
    </TableRow>
  );
}

function LedgerRow({ row }: { row: ListedTransaction }) {
  return (
    <TableRow className="border-b-border/70 hover:bg-transparent">
      <TableCell className={cn(CELL, HUG_COLUMN, "tabular")}>
        {listingDate(row.date)}
      </TableCell>
      {/* The two text columns are the only ones allowed to truncate — every
          other column is a figure or a status, and a cut-off amount is worse
          than a wide table. */}
      <TableCell className={cn(CELL, RULE, "max-w-[16rem] truncate")}>
        {row.description}
      </TableCell>
      <TableCell
        className={cn(
          CELL,
          RULE,
          "max-w-[14rem] truncate text-muted-foreground",
        )}
      >
        {row.party}
      </TableCell>
      <TableCell
        className={cn(CELL, RULE, HUG_COLUMN, "text-muted-foreground tabular")}
      >
        {row.reference}
      </TableCell>
      <Money value={row.net} row={row} first />
      <Money value={row.gst} row={row} muted />
      <Money value={row.gross} row={row} />
      <TableCell className={cn(CELL, TOTAL_RULE, HUG_COLUMN)}>
        <ReconciledBadge reconciled={row.reconciled} />
      </TableCell>
    </TableRow>
  );
}

/**
 * The row that closes a category.
 *
 * Ruled off above and bold, the same treatment the P&L gives a subtotal — and it
 * stays put when the category is folded, which is the whole point of folding it.
 */
function SubtotalRow({ group }: { group: ListingGroup }) {
  return (
    <TableRow className="border-t border-border bg-muted font-semibold hover:bg-transparent">
      <TableCell className={cn(CELL, HUG_COLUMN)} colSpan={4}>
        Total {group.category.toLowerCase()}
      </TableCell>
      <TableCell
        className={cn(CELL, TOTAL_RULE, HUG_COLUMN, "text-right tabular")}
      >
        {signed(group.totals.net, group.direction)}
      </TableCell>
      <TableCell className={cn(CELL, RULE, HUG_COLUMN, "text-right tabular")}>
        {reportMoney(group.totals.gst)}
      </TableCell>
      <TableCell className={cn(CELL, RULE, HUG_COLUMN, "text-right tabular")}>
        {signed(group.totals.gross, group.direction)}
      </TableCell>
      <TableCell
        className={cn(
          CELL,
          TOTAL_RULE,
          HUG_COLUMN,
          "text-xs font-medium text-muted-foreground tabular",
        )}
      >
        {group.reconciled} of {group.rows.length}
      </TableCell>
    </TableRow>
  );
}

/**
 * Money out reads as a negative, money in as a positive.
 *
 * The sign rather than a colour: a listing is read down a column, and a column
 * of green and orange figures is harder to scan than a column where the minus
 * signs line up. GST is unsigned — it's the tax on the line either way, not a
 * direction of its own.
 */
function signed(value: number, direction: "in" | "out"): string {
  return reportMoney(direction === "out" ? -value : value);
}

function Money({
  value,
  row,
  muted = false,
  first = false,
}: {
  value: number;
  row: ListedTransaction;
  muted?: boolean;
  /** The first money column detaches from the text columns with a firmer rule. */
  first?: boolean;
}) {
  return (
    <TableCell
      className={cn(
        CELL,
        first ? TOTAL_RULE : RULE,
        HUG_COLUMN,
        "text-right tabular",
        muted && "text-muted-foreground",
      )}
    >
      {muted ? reportMoney(value) : signed(value, row.direction)}
    </TableCell>
  );
}

/**
 * Reconciled or not.
 *
 * Amber rather than red for unreconciled: it's work still to do, not a mistake —
 * and a listing full of red would read as a broken report rather than as a tidy
 * one with a few loose ends.
 */
function ReconciledBadge({ reconciled }: { reconciled: boolean }) {
  return reconciled ? (
    <Badge
      variant="success"
      className="gap-1 rounded-full px-2 py-0 text-[11px] font-medium"
    >
      <Check className="size-2.5" aria-hidden />
      Reconciled
    </Badge>
  ) : (
    <Badge
      variant="warning"
      className="rounded-full px-2 py-0 text-[11px] font-medium"
    >
      Unreconciled
    </Badge>
  );
}
