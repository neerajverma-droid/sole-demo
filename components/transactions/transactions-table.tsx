"use client";

import * as React from "react";
import Link from "next/link";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  Link2,
  Loader2,
  Plus,
  Receipt,
  SearchX,
  Trash2,
  TriangleAlert,
  Unlink,
  Upload,
  User,
  X,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyActions,
  EmptyCue,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { Shimmer } from "@/components/ui/shimmer";
import {
  SkeletonCheckboxCell,
  SkeletonRows,
} from "@/components/ui/table-skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

import { Highlight } from "@/components/contacts/highlight";
import { SUGGESTION_ROW_ATTR } from "@/components/transactions/ai-suggestions-banner";
import { TransactionSplitRows } from "@/components/transactions/transaction-splits";
import {
  ContactPersonSelect,
  type ContactPick,
} from "@/components/transactions/contact-person-select";
import { CategorySearchSelect } from "@/components/transactions/category-search-select";
import {
  fetchManualAccounts,
  matchCategoryGroups,
  type CategoryGroup,
} from "@/lib/manual-transaction";
import {
  deleteTransactionIdAtom,
  matchTransactionIdAtom,
  unmatchTransactionIdAtom,
  markTransferIdAtom,
  transactionsFilterAtom,
  transactionsFiltersAtom,
  transactionsPeriodAtom,
  transactionsQueryAtom,
  viewTransactionIdAtom,
} from "@/lib/atoms";
import { invoiceMoney } from "@/lib/invoices";
import {
  approvalIssue,
  bulkDeleteIssue,
  bulkDeleteMessage,
  bulkDeleteSelection,
  financialYearChoices,
  tabForFilter,
} from "@/lib/bank-transactions";
import {
  accountForTransaction,
  bankLabels,
  type BankAccount,
} from "@/lib/bank-accounts";
import { useBankAccountsQuery } from "@/hooks/use-bank-accounts-query";
import { useCountryContext } from "@/hooks/use-country-context";
import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { documentTax } from "@/lib/country-context";
import { TransactionsFiltersPopover } from "@/components/transactions/transactions-filters";
import type { PageInfo } from "@/lib/products";
import {
  categoryTone,
  gstApplies,
  formatTransactionDate,
  matchedAmount,
  matchedTypeAddsInfo,
  matchedTypeOf,
  matchedTypeTone,
  signedAmount,
  type Transaction,
} from "@/lib/transactions";
import { cn } from "@/lib/utils";
import { BulkMatchDialog } from "@/components/transactions/bulk-match-dialog";
import { TypeMark, directionTone } from "@/components/transactions/type-mark";
import {
  useApproveTransaction,
  useBulkDelete,
  useBulkMark,
  useMarkTransaction,
  useUndoMarkTransaction,
} from "@/hooks/use-bank-transactions-query";

/**
 * The two things a row lets you change.
 *
 * Everything else on a transaction — its id, date, description, amount, source
 * and account — is the feed's word for what happened, and editing history isn't
 * what this screen is for. What's left is the coding: who it was with, and what
 * it counts as. Both stage rather than save, and Approve is what commits them.
 */
type StagedField = "category" | "supplier";

/**
 * The frozen columns.
 *
 * Fourteen columns don't fit, so the grid scrolls sideways and the first three
 * stay put — enough to know which row you're looking at once the coding columns
 * are in view.
 *
 * Three, not four. The brief asked for Description to freeze too, and it can't:
 * a sticky run has to be contiguous from the left edge, and Description sits
 * behind Source and Account. Freezing it would mean freezing those as well —
 * six columns, most of the width, leaving almost nothing to scroll. So the run
 * stops at the date.
 *
 * The offsets are the widths of what precedes them: `w-10` then `w-28`, so 40px
 * then 152px.
 */
/**
 * Every column's minimum width, in one place.
 *
 * Shared by the header and the cells, because a column is as wide as its widest
 * member and a min-width on only one of the two is a min-width the other can
 * undercut. These are what stop the squeeze: fourteen columns in a `w-full`
 * table were each being shrunk to fit, which is what truncated "Bank Feed" to
 * "Ba" and folded a date onto three lines.
 *
 * They sum to about 1880px, so the grid scrolls sideways on any normal screen —
 * which is the point. `Table` already wraps itself in an `overflow-auto` box.
 */
const COL = {
  /*
   * The frozen four are pinned rather than floored: `min-w` alone let an auto
   * table grow them past the widths the sticky offsets below were calculated
   * from, and once a column was wider than its offset assumed, every column
   * after it sat in the wrong place. That was the header "collision" — not
   * overlap, but offsets computed from minimums that the layout had outgrown.
   */
  /*
   * Just the box and its 8px of left padding, left-aligned — `!` because the
   * table-wide centring and tightened padding would otherwise win.
   */
  check: "w-[28px] min-w-[28px] max-w-[28px] !pl-2 !pr-0 !text-left",
  date: "w-[90px] min-w-[90px] max-w-[90px]",
  description: "w-[260px] min-w-[260px] max-w-[260px]",
  type: "min-w-[90px]",
  amount: "min-w-[130px]",
  matched: "min-w-[130px]",
  gst: "min-w-[70px]",
  supplier: "min-w-[170px]",
  // Room for the same 210px field as Client/Supplier, plus the split count.
  category: "min-w-[250px]",
  approve: "min-w-[48px]",
  // Up to four icon actions side by side.
  actions: "min-w-[124px]",
} as const;

/**
 * Where each frozen column comes to rest: the running total of the widths
 * before it. 0, then 28, then 118 — so the three sit flush with no gap and no
 * overlap, and the pane they form is 378px wide.
 */
const STICKY_LEFT = {
  check: "left-0",
  date: "left-[28px]",
  description: "left-[118px]",
} as const;

const STICKY = "sticky z-10";

/** The header's frozen cells sit above the body's, hence the higher z. */
/**
 * A frozen header cell.
 *
 * The tint has to be opaque. At 6% alpha the Source and Account headings slid
 * underneath and read straight through it, which is the other half of what
 * looked like a collision — so it's the colour plus a flat gradient of the
 * tint, the same composite the body's frozen cells and the reporting tables use.
 *
 * No `whitespace-nowrap`: a heading that doesn't fit should take a second line
 * rather than run into the next column.
 */
const HEAD_STICKY = cn(
  "sticky z-20 align-middle",
  "bg-card bg-[linear-gradient(hsl(var(--primary)/0.06),hsl(var(--primary)/0.06))]",
  "dark:bg-[linear-gradient(hsl(var(--primary)/0.10),hsl(var(--primary)/0.10))]",
);

/**
 * The right edge of the frozen pane, on its last column.
 *
 * A rule plus a short shadow falling to the right — the rule alone reads as
 * another column border, and the shadow is what says the columns beyond it are
 * passing underneath.
 *
 * The rule is an inset shadow, not a `border-r`: in a collapsed-border table a
 * cell's border belongs to the table's grid rather than the cell, so it scrolled
 * away with the grid while the sticky cell stayed put. A shadow is painted by
 * the cell itself and travels with it.
 */
const STICKY_EDGE =
  "shadow-[inset_-1px_0_0_hsl(var(--border)),6px_0_8px_-6px_rgba(0,0,0,0.12)] dark:shadow-[inset_-1px_0_0_hsl(var(--border)),6px_0_8px_-6px_rgba(0,0,0,0.55)]";

/**
 * What a frozen body cell is painted with.
 *
 * Opaque, and that's the whole difficulty: a sticky cell is lifted out of its
 * row's paint, so the row's tint scrolls away beneath it and rows slide through.
 * A colour plus a flat gradient of the tint composites the same value into one
 * opaque paint — the trick the reporting tables use for the same reason.
 */
const STICKY_PLAIN = "bg-card";

/**
 * The row hover, on a frozen cell.
 *
 * A frozen cell can't just inherit the row's `hover:bg-primary/5`: it needs its
 * own opaque paint or the columns scroll through it, and an opaque paint is
 * exactly what the row's hover can't tint. So the row names itself a group and
 * each frozen cell answers the hover itself, compositing the same 5% over the
 * card — the same value `TableRow` uses, so the two halves of a hovered row are
 * one colour.
 */
const STICKY_HOVER =
  "group-hover/row:bg-[linear-gradient(hsl(var(--primary)/0.05),hsl(var(--primary)/0.05))]";
const STICKY_STAGED =
  "bg-card bg-[linear-gradient(hsl(var(--warning)/0.06),hsl(var(--warning)/0.06))]";
const STICKY_SELECTED =
  "bg-card bg-[linear-gradient(hsl(var(--primary)/0.1),hsl(var(--primary)/0.1))]";

/** Per-row unsaved edits, keyed by transaction id. */
type Drafts = Record<string, Partial<Record<StagedField, string>>>;

export type TransactionsPaging = {
  page: PageInfo;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** While a page/size change's own fetch is still in flight — disables the
   *  nav so a second click can't fire a request on top of the first, and is
   *  the only sign a click registered at all when the old rows are still on
   *  screen (see `fetching` below for why they don't just disappear). */
  disabled?: boolean;
};

/**
 * One page of the active pile, as the server returned it — already narrowed
 * by financial year and search, so nothing is filtered again here.
 */
export function TransactionsTable({
  transactions,
  loading = false,
  fetching = false,
  error = null,
  onRetry,
  anyTransactions = transactions.length > 0,
  paging,
}: {
  transactions: Transaction[];
  /** First load, with nothing to show yet. */
  loading?: boolean;
  /**
   * A page/size/filter change's own request, still in flight, while the
   * previous page's rows stay on screen rather than flashing to a skeleton —
   * the only visible sign of that is this dimming the table and disabling
   * the pager, so a click (or a slow network) doesn't read as nothing
   * having happened.
   */
  fetching?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Whether either pile has rows, so an empty one reads as "none match". */
  anyTransactions?: boolean;
  paging?: TransactionsPaging;
}) {
  const [query] = useAtom(transactionsQueryAtom);
  const setViewId = useSetAtom(viewTransactionIdAtom);
  const setDeleteId = useSetAtom(deleteTransactionIdAtom);
  const setMatchId = useSetAtom(matchTransactionIdAtom);
  const setUnmatchId = useSetAtom(unmatchTransactionIdAtom);
  const markTransaction = useMarkTransaction();
  /** The row waiting on "Mark Personal?" — sole-webapp's confirmation. */
  const [personalRow, setPersonalRow] = React.useState<Transaction | null>(
    null,
  );
  const undoMark = useUndoMarkTransaction();
  const setTransferId = useSetAtom(markTransferIdAtom);
  const approve = useApproveTransaction();
  /*
   * Which connected account each bank-feed row came through, as its short
   * label ("Bank 1") — the account cards above show the same label against
   * the full name.
   */
  const bankAccountsQuery = useBankAccountsQuery();
  const bankAccounts = React.useMemo(
    () => bankAccountsQuery.data?.accounts ?? [],
    [bankAccountsQuery.data],
  );
  const bankLabelMap = React.useMemo(() => bankLabels(bankAccounts), [bankAccounts]);
  // "GST" in AU and NZ, "VAT" in ZA, or the business's own name for it.
  const { country } = useCountryContext();
  const taxName = documentTax(country).word;
  /** GST as switched on each row, before it's approved. */
  const [gstDrafts, setGstDrafts] = React.useState<Record<string, boolean>>({});
  const gstOf = (row: Transaction) => gstDrafts[row.id] ?? row.gst;

  /*
   * Who each row is with, as picked but not yet approved — both ids, since
   * the API stores the company and the person. The name also goes into
   * `drafts` so the row reads as changed.
   */
  const [contactDrafts, setContactDrafts] = React.useState<
    Record<string, ContactPick>
  >({});
  /** The account id behind each staged category, keyed by row. */
  const [categoryDrafts, setCategoryDrafts] = React.useState<
    Record<string, string>
  >({});

  /*
   * The chart of accounts, once — shared with the Add Transaction form — and
   * narrowed per direction to what sole-webapp's Match modal offers.
   */
  const accountsQuery = useQuery({
    queryKey: ["manual-transaction-accounts"],
    queryFn: fetchManualAccounts,
  });
  const categoryGroups = React.useMemo(
    () => ({
      Credit: matchCategoryGroups(accountsQuery.data ?? [], "Credit"),
      Debit: matchCategoryGroups(accountsQuery.data ?? [], "Debit"),
    }),
    [accountsQuery.data],
  );


  const [selected, setSelected] = React.useState<string[]>([]);
  // A new page or list starts a new selection. Keyed on the ids: while
  // loading the rows array is a fresh `[]` every render.
  const rowsKey = transactions.map((row) => row.id).join(",");
  React.useEffect(() => setSelected([]), [rowsKey]);

  /*
   * sole-webapp's bulk actions, offered once more than one row is ticked:
   * Bulk Personal, Bulk Transfer (each confirmed first) and Bulk Match, which
   * needs the selection to be all money in or all money out.
   */
  const bulkMark = useBulkMark();
  const [bulkKind, setBulkKind] = React.useState<"personal" | "transfer" | null>(null);
  const [bulkMatchOpen, setBulkMatchOpen] = React.useState(false);
  const selectedRows = transactions.filter((row) => selected.includes(row.id));
  const mixedSelection =
    new Set(selectedRows.map((row) => row.type)).size > 1;

  /*
   * sole-webapp's bulk delete. Bank feed rows belong to the feed and can't be
   * deleted here, so the selection is split and only the rest is sent.
   */
  const bulkDelete = useBulkDelete();
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
  const deleteSelection = bulkDeleteSelection(selectedRows);
  const openBulkDelete = () => {
    const issue = bulkDeleteIssue(deleteSelection);
    if (issue) {
      toast.error(issue);
      return;
    }
    setBulkDeleteOpen(true);
  };
  const [expanded, setExpanded] = React.useState<string[]>([]);
  /**
   * Coding chosen but not yet approved, by row.
   *
   * The same shape the inline editor used, doing the job it was already the
   * right shape for: a change held against a row until something commits it.
   * Which is why the unsaved-changes guard below still applies — leaving a row
   * with coding nobody approved is exactly what it was written to catch.
   */
  const [drafts, setDrafts] = React.useState<Drafts>({});
  /**
   * What the person was trying to do when the confirmation interrupted them.
   *
   * Held rather than discarded so Save and Discard both continue to wherever
   * they were going — being asked a question shouldn't cost you the click that
   * prompted it.
   */
  const [pending, setPending] = React.useState<(() => void) | null>(null);
  const [confirmRow, setConfirmRow] = React.useState<string | null>(null);

  const rows = transactions;
  const byId = React.useMemo(
    () => new Map(transactions.map((entry) => [entry.id, entry])),
    [transactions],
  );

  /* ---------------------------------------------------------------- *
   * Inline editing
   * ---------------------------------------------------------------- */

  /** The value a dropdown should show: staged, else suggested, else current. */
  const valueOf = (row: Transaction, field: StagedField): string => {
    const staged = drafts[row.id]?.[field];
    if (staged !== undefined) return staged;
    if (field === "supplier") return row.supplier;
    return row.suggestedCategory?.category ?? row.category;
  };

  /**
   * Whether anything has been chosen on this row and not yet approved.
   *
   * Presence rather than a value comparison: picking the category a row already
   * had is still a deliberate act of coding it, and a row that quietly refused
   * to offer Approve afterwards would look broken.
   */
  const hasStaged = (rowId: string): boolean =>
    Object.keys(drafts[rowId] ?? {}).length > 0;

  const isDirty = (rowId: string): boolean => hasStaged(rowId);

  /**
   * Whether the row is asking for a decision — a pending guess, or a choice
   * someone has made and not confirmed. This is what puts Approve on the row.
   *
   * Never on a matched row. Matching *is* the decision, so a row that has been
   * reconciled has nothing left to approve — and its coding cells are read-only
   * for the same reason, which means there is nothing there to stage either.
   */
  const needsApproval = (row: Transaction): boolean =>
    row.status !== "Matched";

  /** What Approve would send for this row, from what's on screen. */
  const approvalFor = (row: Transaction) => ({
    transactionId: row.id,
    categoryId: categoryIdOf(row),
    clientId: contactDrafts[row.id]?.clientId ?? "",
    gstIncluded: gstOf(row),
  });

  /**
   * Approve: sole-webapp's inline match. Refused with its own messages until
   * both a category and a client/supplier are chosen; on success the row
   * leaves this list for Matched.
   */
  const commit = (rowId: string): boolean => {
    const row = byId.get(rowId);
    if (!row) return false;
    const input = approvalFor(row);
    const issue = approvalIssue(input);
    if (issue) {
      toast.error(issue);
      return false;
    }
    approve.mutate(input, { onSuccess: () => discard(rowId) });
    return true;
  };

  const discard = (rowId: string) => {
    setDrafts((current) => {
      const next = { ...current };
      delete next[rowId];
      return next;
    });
    setContactDrafts((current) => {
      const next = { ...current };
      delete next[rowId];
      return next;
    });
    setCategoryDrafts((current) => {
      const next = { ...current };
      delete next[rowId];
      return next;
    });
    setGstDrafts((current) => {
      const next = { ...current };
      delete next[rowId];
      return next;
    });
  };

  /** The account id the category field points at: staged, suggested, or looked up by name. */
  const categoryIdOf = (row: Transaction): string => {
    const staged = categoryDrafts[row.id];
    if (staged) return staged;
    if (row.suggestedCategoryId) return row.suggestedCategoryId;
    const name = row.category.trim().toLowerCase();
    if (!name) return "";
    for (const group of categoryGroups[row.type]) {
      const found = group.options.find(
        (option) => option.name.toLowerCase() === name,
      );
      if (found) return found.id;
    }
    return "";
  };

  const guard = (action: () => void, exceptRow?: string) => {
    const dirtyRow = Object.keys(drafts).find(
      (rowId) => rowId !== exceptRow && isDirty(rowId),
    );
    if (!dirtyRow) {
      action();
      return;
    }
    setConfirmRow(dirtyRow);
    setPending(() => action);
  };

  const setDraft = (rowId: string, field: StagedField, value: string) =>
    setDrafts((current) => ({
      ...current,
      [rowId]: { ...current[rowId], [field]: value },
    }));

  const resolveConfirm = (save: boolean) => {
    if (confirmRow) {
      // A row that can't be approved yet keeps the question open.
      if (save && !commit(confirmRow)) return;
      if (!save) discard(confirmRow);
    }
    setConfirmRow(null);
    const next = pending;
    setPending(null);
    next?.();
  };

  /* ---------------------------------------------------------------- *
   * Render
   * ---------------------------------------------------------------- */

  const allSelected = rows.length > 0 && selected.length === rows.length;
  // There's no unfiltered view, so an empty pile with transactions elsewhere
  // is "none match here", not "none yet".
  const narrowed = query.trim().length > 0 || anyTransactions;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-3">
        <TransactionsToolbar
          selectedCount={selected.length}
          actions={
            selected.length > 1 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={bulkMark.isPending}
                  onClick={() => setBulkKind("personal")}
                >
                  Bulk Personal
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={bulkMark.isPending}
                  onClick={() => setBulkKind("transfer")}
                >
                  Bulk Transfer
                </Button>
                {mixedSelection ? (
                  // A disabled button takes no pointer events, so the reason
                  // hangs on a wrapper.
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex" tabIndex={0}>
                        <Button variant="outline" size="sm" disabled>
                          Bulk Match
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      Please select credit or debit only for bulk match
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkMatchOpen(true)}
                  >
                    Bulk Match
                  </Button>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Bulk delete selected transactions"
                      disabled={bulkDelete.isPending}
                      onClick={openBulkDelete}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {bulkDelete.isPending
                      ? "Deleting..."
                      : "Bulk delete (bank feed transactions can't be deleted)"}
                  </TooltipContent>
                </Tooltip>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  aria-label="Clear selection"
                  onClick={() => setSelected([])}
                >
                  <X className="size-4" />
                </Button>
              </>
            )
          }
        />

        {/* Table --------------------------------------------------------- */}
        {loading ? (
          <TableSkeleton
            columns={[
              "TXN date",
              "Description",
              "Type",
              "TXN Amt",
              "Matched Amt",
              taxName,
              "Client / Supplier",
              "Suggested category",
              "Approve",
            ]}
          />
        ) : error ? (
          <Empty>
            <EmptyMedia className="bg-destructive/10 text-destructive">
              <TriangleAlert aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Couldn&apos;t load transactions</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
            {onRetry && (
              <EmptyActions>
                <Button variant="outline" onClick={onRetry}>
                  Try again
                </Button>
              </EmptyActions>
            )}
          </Empty>
        ) : rows.length === 0 ? (
          <EmptyState narrowed={narrowed} />
        ) : (
          <Table
            containerClassName={cn(
              "rounded-lg border border-border bg-card shadow-sm transition-opacity",
              fetching && "opacity-60",
            )}
            // Every heading and cell centred, overriding the per-column
            // alignment the cells set themselves — and one text size for the
            // whole body, chips and dropdowns included.
            className="[&_td]:px-1 [&_td]:text-center [&_td]:text-xs [&_th]:text-center [&_th]:text-xs"
          >
            {/* Nowrap is set per heading, not across the row: the scrolling
                columns hold one line, and the frozen ones are allowed a second
                rather than running into the column beside them. */}
            <TableHeader>
              <TableRow>
                {/*
                The first three freeze so a row can still be identified once the
                coding columns are scrolled into view. Contiguous from the left,
                which is the only arrangement sticky can hold — see `STICKY`.
              */}
                <TableHead
                  className={cn(HEAD_STICKY, STICKY_LEFT.check, COL.check)}
                >
                  <Checkbox
                    className="h-3.5 w-3.5 [&_svg]:h-3 [&_svg]:w-3"
                    checked={allSelected}
                    aria-label="Select all transactions"
                    onCheckedChange={(checked) =>
                      setSelected(checked ? rows.map((row) => row.id) : [])
                    }
                  />
                </TableHead>
                <TableHead
                  className={cn(HEAD_STICKY, STICKY_LEFT.date, COL.date)}
                >
                  TXN date
                </TableHead>
                {/*
                Description sits fourth so the four frozen columns are
                contiguous from the left edge, which is the only arrangement
                `position: sticky` can hold. Behind Source and Account it could
                never have frozen without freezing those two as well — six
                columns and most of the width. It's also the better context to
                keep: what the transaction was beats where it came from.

                Reference number has no column of its own; it's the meta line
                underneath, with the thing it references.
              */}
                <TableHead
                  className={cn(
                    HEAD_STICKY,
                    STICKY_LEFT.description,
                    COL.description,
                    STICKY_EDGE,
                  )}
                >
                  Description
                </TableHead>
                <TableHead className={cn(COL.type, "whitespace-nowrap")}>
                  Type
                </TableHead>
                <TableHead
                  className={cn(COL.amount, "whitespace-nowrap text-right")}
                >
                  TXN Amt
                </TableHead>
                <TableHead
                  className={cn(COL.matched, "whitespace-nowrap text-right")}
                >
                  Matched Amt
                </TableHead>
                {/* The four that do something, together at the end — reading a row
                  left to right is now "what happened" then "what to do about
                  it". */}
                <TableHead
                  className={cn(COL.gst, "whitespace-nowrap text-center")}
                >
                  {taxName}
                </TableHead>
                <TableHead className={cn(COL.supplier, "whitespace-nowrap")}>
                  Client / Supplier
                </TableHead>
                <TableHead className={cn(COL.category, "whitespace-nowrap")}>
                  Suggested category
                </TableHead>
                <TableHead className={cn(COL.approve, "whitespace-nowrap")}>
                  Approve
                </TableHead>
                <TableHead
                  className={cn(COL.actions, "whitespace-nowrap text-right")}
                >
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const open = expanded.includes(row.id);
                const dirty = isDirty(row.id);
                const chosen = selected.includes(row.id);
                /*
                 * The frozen cells carry the row's own tint, composited opaque —
                 * without it they'd be three white cells beside a tinted row, and
                 * rows would read through them as the grid scrolls sideways.
                 */
                const stickyBg = dirty
                  ? STICKY_STAGED
                  : chosen
                    ? STICKY_SELECTED
                    : STICKY_PLAIN;

                return (
                  <React.Fragment key={row.id}>
                    <TableRow
                      data-state={dirty ? "dirty" : undefined}
                      // What the banner scrolls to. Only where a guess is
                      // outstanding — a row someone has already chosen for is
                      // no longer the one to be taken to.
                      {...(row.suggestedCategory
                        ? { [SUGGESTION_ROW_ATTR]: "true" }
                        : {})}
                      className={cn(
                        // Named, so each frozen cell can answer this row's
                        // hover with its own opaque paint — see STICKY_HOVER.
                        "group/row cursor-pointer",
                        dirty && "bg-warning/[0.06]",
                        // Dimmed, not hidden: the money did move, it just isn't
                        // the business's. Still readable, still editable.
                        (row.personal || row.transfer) && "opacity-60",
                      )}
                      onClick={() => guard(() => setViewId(row.id))}
                    >
                      <TableCell
                        className={cn(
                          STICKY,
                          STICKY_LEFT.check,
                          COL.check,
                          stickyBg,
                          STICKY_HOVER,
                        )}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          className="h-3.5 w-3.5 [&_svg]:h-3 [&_svg]:w-3"
                          checked={selected.includes(row.id)}
                          aria-label={`Select ${row.reference}`}
                          onCheckedChange={(checked) =>
                            setSelected((current) =>
                              checked
                                ? [...current, row.id]
                                : current.filter((id) => id !== row.id),
                            )
                          }
                        />
                      </TableCell>

                      <TableCell
                        className={cn(
                          STICKY,
                          STICKY_LEFT.date,
                          COL.date,
                          // Dates never wrap, whatever the heading above does.
                          "whitespace-nowrap tabular",
                          stickyBg,
                          STICKY_HOVER,
                        )}
                      >
                        {formatTransactionDate(row.date)}
                      </TableCell>

                      <TableCell
                        className={cn(
                          STICKY,
                          STICKY_LEFT.description,
                          COL.description,
                          STICKY_EDGE,
                          "font-medium",
                          stickyBg,
                          STICKY_HOVER,
                        )}
                      >
                        <Truncated
                          tooltip={`${row.description} · ${row.reference} · ${row.source}`}
                        >
                          <Highlight text={row.description} query={query} />
                        </Truncated>
                        {/* The reference and where the row came from, beneath
                          the thing they describe rather than in columns of
                          their own. */}
                        <span className="block truncate text-xs font-normal text-muted-foreground tabular">
                          Ref: <Highlight text={row.reference} query={query} />
                          <span className="mx-1.5" aria-hidden>
                            |
                          </span>
                          <span className="sr-only">Source: </span>
                          {row.source}
                          <BankLabel row={row} accounts={bankAccounts} labels={bankLabelMap} />
                        </span>
                      </TableCell>

                      <TableCell className={cn(COL.type, "whitespace-nowrap")}>
                        <span className="flex items-center justify-center gap-1">
                          <TypeMark row={row} />
                          {/* Beside the type rather than instead of it: a
                            personal debit is still a debit, and a transfer
                            still has a direction. */}
                          {row.personal && (
                            <Badge
                              variant="outline"
                              className="rounded-full px-2 py-0 text-xs font-medium"
                            >
                              Personal
                            </Badge>
                          )}
                          {row.transfer && (
                            <Badge
                              variant="outline"
                              className="rounded-full px-2 py-0 text-xs font-medium"
                            >
                              Transfer
                            </Badge>
                          )}
                        </span>
                      </TableCell>

                      <TableCell
                        className={cn(
                          COL.amount,
                          // Coloured like its CR/DR marker: green in, red out.
                          "whitespace-nowrap text-right text-xs font-medium tabular",
                          directionTone(row),
                        )}
                      >
                        {signedAmount(row)}
                      </TableCell>

                      <TableCell
                        className={cn(
                          COL.matched,
                          "whitespace-nowrap text-right text-xs tabular",
                        )}
                      >
                        <span
                          className={cn(
                            matchedAmount(row) === 0 && "text-muted-foreground",
                          )}
                        >
                          {invoiceMoney(matchedAmount(row))}
                        </span>
                        {/* Under the figure rather than beside it: this column
                            is already the narrowest it can be, and a chip in
                            the same line would push the table wider for every
                            row including the ones that never show it. */}
                        <MatchShapeChip
                          row={row}
                          open={open}
                          onToggle={() =>
                            setExpanded((current) =>
                              current.includes(row.id)
                                ? current.filter((id) => id !== row.id)
                                : [...current, row.id],
                            )
                          }
                        />
                      </TableCell>

                      <GstCell
                        row={row}
                        className={COL.gst}
                        taxName={taxName}
                        checked={gstOf(row)}
                        onToggle={() =>
                          setGstDrafts((current) => ({
                            ...current,
                            [row.id]: !gstOf(row),
                          }))
                        }
                      />

                      <SupplierCell
                        row={row}
                        className={COL.supplier}
                        value={valueOf(row, "supplier")}
                        staged={drafts[row.id]?.supplier !== undefined}
                        contactId={contactDrafts[row.id]?.contactId ?? ""}
                        onChange={(pick) => {
                          setContactDrafts((current) => ({
                            ...current,
                            [row.id]: pick,
                          }));
                          setDraft(row.id, "supplier", pick.name);
                        }}
                      />

                      <CategoryCell
                        row={row}
                        className={COL.category}
                        value={valueOf(row, "category")}
                        categoryId={categoryIdOf(row)}
                        groups={categoryGroups[row.type]}
                        loading={accountsQuery.isLoading}
                        staged={drafts[row.id]?.category !== undefined}
                        open={open}
                        onChange={(account) => {
                          setCategoryDrafts((current) => ({
                            ...current,
                            [row.id]: account.id,
                          }));
                          setDraft(row.id, "category", account.name);
                        }}
                        onToggle={() =>
                          setExpanded((current) =>
                            current.includes(row.id)
                              ? current.filter((id) => id !== row.id)
                              : [...current, row.id],
                          )
                        }
                      />

                      <TableCell
                        className={COL.approve}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {/* Empty rather than a dash when there's nothing to
                          confirm: a dash is a value, and there is no value here
                          — there's just no decision outstanding. */}
                        {needsApproval(row) &&
                          (() => {
                            const issue = approvalIssue(approvalFor(row));
                            const busy =
                              approve.isPending &&
                              approve.variables?.transactionId === row.id;
                            // A tick rather than a word, so the column stays
                            // narrow; the tooltip says what it does — or, while
                            // it's off, what's missing.
                            const button = (
                              <Button
                                size="icon"
                                variant="outline"
                                className={cn(
                                  "size-6 rounded-full border-success/30 bg-success/20 text-success shadow-none",
                                  "hover:border-success hover:bg-success hover:text-white",
                                  // Off: still on the light green, paler, so a
                                  // column of them reads as "not yet".
                                  "disabled:border-success/20 disabled:bg-success/10 disabled:text-success/60 disabled:opacity-100",
                                )}
                                disabled={!!issue || approve.isPending}
                                onClick={() => commit(row.id)}
                                aria-label={issue ?? `Approve ${row.reference}`}
                              >
                                {busy ? (
                                  <Loader2 className="size-3 animate-spin" aria-hidden />
                                ) : (
                                  <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                                )}
                              </Button>
                            );
                            // A disabled button gets no pointer events, so its
                            // tooltip hangs on a wrapper.
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex" tabIndex={issue ? 0 : -1}>
                                    {button}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  {issue ?? "Approve"}
                                </TooltipContent>
                              </Tooltip>
                            );
                          })()}
                      </TableCell>

                      <TableCell
                        className={cn(COL.actions, "text-right")}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <RowActions
                          row={row}
                          selectionActive={selected.length > 1}
                          onTogglePersonal={() =>
                            guard(() =>
                              row.personal
                                ? undoMark.mutate({ row, kind: "personal" })
                                : // Asked first, as in sole-webapp.
                                  setPersonalRow(row),
                            )
                          }
                          onToggleTransfer={() =>
                            guard(() =>
                              row.transfer
                                ? undoMark.mutate({ row, kind: "transfer" })
                                : setTransferId(row.id),
                            )
                          }
                          onMatch={() => guard(() => setMatchId(row.id))}
                          onUndo={() => guard(() => setUnmatchId(row.id))}
                          onDelete={() => guard(() => setDeleteId(row.id))}
                        />
                      </TableCell>
                    </TableRow>

                    {open && row.splits.length > 0 && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={11} className="bg-muted/30 p-0">
                          <TransactionSplitRows transaction={row} />
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}

        {paging && !loading && !error && paging.page.total > 0 && (
          <NumberedPagination
            page={paging.page}
            pageSize={paging.pageSize}
            onPageChange={paging.onPageChange}
            onPageSizeChange={paging.onPageSizeChange}
            itemLabel="transaction"
            navLabel="Transactions pages"
            disabled={paging.disabled}
          />
        )}

        {/* Bulk Personal / Bulk Transfer — sole-webapp's confirmation. */}
        <AlertDialog
          open={bulkKind !== null}
          onOpenChange={(open) => !open && !bulkMark.isPending && setBulkKind(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {bulkKind === "transfer" ? "Mark as Transfer?" : "Mark Personal?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {bulkKind === "transfer"
                  ? `This will mark ${selected.length} transactions as transfers and ignore them for accounting purposes. This can later be found and undone in Matched transactions.`
                  : `This will mark ${selected.length} transactions as personal. They leave your business figures, and can be undone from Matched transactions.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={bulkMark.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={bulkMark.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  if (!bulkKind) return;
                  bulkMark.mutate(
                    { ids: selected, kind: bulkKind },
                    {
                      onSuccess: () => setSelected([]),
                      onSettled: () => setBulkKind(null),
                    },
                  );
                }}
              >
                {bulkMark.isPending
                  ? "Processing..."
                  : bulkKind === "transfer"
                    ? "Mark as transfer"
                    : "Mark as personal"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk delete — sole-webapp's confirmation, naming any bank feed
            rows that will be left behind. */}
        <AlertDialog
          open={bulkDeleteOpen}
          onOpenChange={(open) =>
            !open && !bulkDelete.isPending && setBulkDeleteOpen(false)
          }
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Transactions?</AlertDialogTitle>
              <AlertDialogDescription>
                {bulkDeleteMessage(deleteSelection)}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={bulkDelete.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={bulkDelete.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  const ids = deleteSelection.deletableIds;
                  if (!ids.length) return;
                  bulkDelete.mutate(ids, {
                    onSuccess: () => setSelected([]),
                    onSettled: () => setBulkDeleteOpen(false),
                  });
                }}
              >
                {bulkDelete.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <BulkMatchDialog
          rows={selectedRows}
          open={bulkMatchOpen}
          onOpenChange={setBulkMatchOpen}
          onMatched={() => setSelected([])}
        />

        {/* sole-webapp's "Mark Personal?" — asked before the row leaves
            Unmatched, in this app's alert dialog. */}
        <AlertDialog
          open={personalRow !== null}
          onOpenChange={(open) =>
            !open && !markTransaction.isPending && setPersonalRow(null)
          }
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <span
                  className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary"
                  aria-hidden
                >
                  <User className="size-3.5" />
                </span>
                Mark Personal?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will mark your transaction as personal. It leaves your
                business income, expense and tax figures, and can be undone
                from Matched transactions.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {personalRow && (
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {personalRow.description}
                  </p>
                  <p className="truncate text-xs text-muted-foreground tabular">
                    {formatTransactionDate(personalRow.date)} · Ref{" "}
                    {personalRow.reference}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium tabular">
                  {signedAmount(personalRow)}
                </span>
              </div>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={markTransaction.isPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={markTransaction.isPending || !personalRow}
                onClick={(event) => {
                  // Stays open until the server answers.
                  event.preventDefault();
                  if (!personalRow) return;
                  markTransaction.mutate(
                    { row: personalRow, kind: "personal" },
                    { onSettled: () => setPersonalRow(null) },
                  );
                }}
              >
                {markTransaction.isPending ? "Marking…" : "Mark as personal"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* The confirmation the CTO asked for: leaving a cell mid-edit is a
          question, not a silent save and not a silent loss. */}
        <Dialog
          open={confirmRow !== null}
          onOpenChange={(open) => !open && resolveConfirm(false)}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Do you want to save your changes?</DialogTitle>
              <DialogDescription>
                {confirmRow
                  ? `${byId.get(confirmRow)?.reference ?? "This transaction"} has edits you haven't saved.`
                  : null}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => resolveConfirm(false)}>
                Discard
              </Button>
              <Button onClick={() => resolveConfirm(true)}>Save changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

/* ------------------------------------------------------------------ *
 * Cells
 * ------------------------------------------------------------------ */

/**
 * One line that fits, or is cut with the whole of it on hover.
 *
 * The rule the brief sets: nothing wraps, so anything that can outgrow its
 * column is truncated — and a truncation that hides text without offering it
 * back is data the table has simply lost. One helper rather than a Tooltip
 * written out per cell, so no truncating cell can be added without one.
 */
function Truncated({
  tooltip,
  className,
  children,
}: {
  /** The full text, for the hover. */
  tooltip: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("block truncate", className)}>{children}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-80">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Whether a matched row was one-to-one or spread across lines.
 *
 * Only on matched rows. On anything still in review the splits are a working
 * draft — the `+N` chevron in the category cell is what opens those, and it
 * means something different: lines someone is building, not lines a match
 * landed in.
 *
 * "Split · N" is the same disclosure the chevron drives, so a row has one
 * expanded state however it was opened.
 */
function MatchShapeChip({
  row,
  open,
  onToggle,
}: {
  row: Transaction;
  open: boolean;
  onToggle: () => void;
}) {
  if (row.status !== "Matched") return null;

  const lines = row.splits.length;

  if (lines < 2) {
    return (
      <span className="mt-1 flex justify-center">
        <Badge
          variant="outline"
          className="rounded-full border-transparent bg-muted px-2 py-0 text-xs font-medium text-muted-foreground"
        >
          Single
        </Badge>
      </span>
    );
  }

  return (
    <span className="mt-1 flex justify-center">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        aria-expanded={open}
        aria-label={`${open ? "Hide" : "Show"} the ${lines} lines ${row.reference} was matched across`}
        className="inline-flex items-center gap-0.5 rounded-full border border-border px-2 py-0 text-xs font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        Split · {lines}
        <ChevronDown
          className={cn(
            "size-3 motion-safe:transition-transform motion-safe:duration-150",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
    </span>
  );
}

/**
 * Whether GST applies, where the question makes sense.
 *
 * A dash where it doesn't. `gstApplies` is what decides — personal spending,
 * transfers and the GST-free categories aren't supplies, and an off switch on
 * one of those invites a click that would be wrong.
 */
function GstCell({
  row,
  className,
  taxName,
  checked,
  onToggle,
}: {
  row: Transaction;
  className?: string;
  /** "GST", "VAT" — the business's word for it. */
  taxName: string;
  /** As switched on this row, before it's approved. */
  checked: boolean;
  onToggle: () => void;
}) {
  const applies = gstApplies(row);

  return (
    <TableCell
      className={cn("text-center", className)}
      onClick={(event) => event.stopPropagation()}
    >
      {applies ? (
        <Switch
          checked={checked}
          onCheckedChange={onToggle}
          aria-label={`${taxName} applies to ${row.reference}`}
          // Scaled as a whole so the thumb keeps its proportions.
          className="scale-75"
        />
      ) : (
        <span className="text-muted-foreground" aria-hidden>
          —
        </span>
      )}
    </TableCell>
  );
}

/**
 * Who the row was with.
 *
 * A dash where a supplier is meaningless — a transfer between the owner's own
 * accounts has no counterparty, and personal spending isn't the business's to
 * record one against.
 *
 * Coded rows show the name as text; the whole cell reopens the picker, so
 * changing it later is one click rather than a hunt for a control.
 */
function SupplierCell({
  row,
  className,
  value,
  staged,
  contactId,
  onChange,
}: {
  row: Transaction;
  className?: string;
  value: string;
  /** Chosen but not approved — worth saying so, since Approve is what saves it. */
  staged: boolean;
  /** The picked person's `contact_id`, where one was picked here. */
  contactId: string;
  onChange: (pick: ContactPick) => void;
}) {
  const applies = !row.transfer && !row.personal;

  if (!applies) {
    return (
      <TableCell
        className={className}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="text-muted-foreground" aria-hidden>
          —
        </span>
      </TableCell>
    );
  }

  /*
   * A matched row shows the name rather than a field holding it.
   *
   * Not a cosmetic choice: Approve is what commits a change made in this cell,
   * and a matched row doesn't offer Approve. Leaving the dropdown live would
   * let someone stage a supplier they had no way to save — a control that
   * accepts input and then loses it is worse than one that isn't there.
   */
  if (row.status === "Matched") {
    return (
      <TableCell
        className={className}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="block truncate text-xs font-medium">
          {value || <span className="text-muted-foreground">—</span>}
        </span>
      </TableCell>
    );
  }

  /*
   * The transaction screens' own picker, compact: clients for money in,
   * suppliers for money out, as in sole-webapp — and a new one can be added
   * from the dropdown itself.
   */
  return (
    <TableCell
      className={className}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className={cn(
          // The one field width both coding dropdowns share.
          "mx-auto w-[160px] rounded-md text-left",
          staged && "ring-1 ring-warning/60",
        )}
      >
        <ContactPersonSelect
          compact
          type={row.type === "Credit" ? "Client" : "Supplier"}
          contactId={contactId}
          name={value}
          onSelect={onChange}
        />
      </div>
    </TableCell>
  );
}

/**
 * The coding, and the matcher's opinion of it.
 *
 * Three states in one cell. A pending suggestion shows the guess in the
 * dropdown with its confidence beside it, muted rather than in the category's
 * colour — the colour is what says "coded", and wearing it before approval
 * would make a guess look like a decision. An uncoded row shows the same
 * dropdown, empty. A coded row shows the pill, and clicking it reopens the
 * dropdown so a correction doesn't need a different screen.
 *
 * The split count keeps its chevron here, since the splits are the category
 * broken down and this is where the category lives.
 */
function CategoryCell({
  row,
  className,
  value,
  categoryId,
  groups,
  loading,
  staged,
  open,
  onChange,
  onToggle,
}: {
  row: Transaction;
  className?: string;
  /** The name the field shows: staged, else suggested, else current. */
  value: string;
  /** The account id behind `value`, where known. */
  categoryId: string;
  groups: CategoryGroup[];
  loading: boolean;
  staged: boolean;
  open: boolean;
  onChange: (account: { id: string; name: string }) => void;
  onToggle: () => void;
}) {
  const suggestion = row.suggestedCategory;
  const extra = row.splits.length;
  const settled = !suggestion && !staged;

  /*
   * A matched row reports rather than asks.
   *
   * Same column, different job: on an unmatched row this is where the matcher
   * proposes a category and someone approves it, so it's a dropdown with a
   * confidence chip. On a matched row the question has been answered, so it's
   * the category it landed in — and no control, for the same reason the
   * supplier cell has none.
   *
   * A split match gets no tag here at all. The lines are the answer, they're
   * one tap away behind the Split chip, and each carries its own tag down
   * there. The parent used to say "Mixed", which named a property of the data
   * rather than telling anyone anything: it appeared exactly when the useful
   * detail existed and then declined to show it.
   *
   * A single match gets a tag only where it adds something the category name
   * doesn't already carry — see `matchedTypeAddsInfo`. "Sales" beside "Income"
   * is one fact printed twice.
   */
  if (row.status === "Matched") {
    const type =
      row.splits.length >= 2 ? null : matchedTypeOf(row.category, row.type);
    const tag =
      type && matchedTypeAddsInfo(type, row.category, row.type) ? type : null;

    return (
      <TableCell
        data-tour="transaction-category"
        className={className}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="flex items-center justify-center gap-1.5">
          <span
            className={cn(
              "min-w-0 truncate rounded-md border px-1.5 py-0.5 text-xs font-medium",
              categoryTone(row.category),
            )}
          >
            {row.category}
          </span>
          {tag && (
            <Badge
              variant="outline"
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-1.5 py-0 text-xs font-semibold",
                matchedTypeTone(tag),
              )}
            >
              {tag}
            </Badge>
          )}
        </span>
      </TableCell>
    );
  }

  return (
    <TableCell
      data-tour="transaction-category"
      className={className}
      onClick={(event) => event.stopPropagation()}
    >
      {/*
        One line, always. `flex` without `flex-wrap` is the fix: the badges were
        dropping under the field, which made those rows taller than the rest and
        broke the rhythm down the table. The field is `min-w-0 flex-1` and the
        badges are `shrink-0`, so when the three don't fit it's the category name
        that gives — which is the right thing to lose, since the badge is the
        part someone hasn't already read.
      */}
      <span className="flex items-center justify-center gap-1.5">
        {/*
          sole-webapp's Match-modal list for this direction — Income and its
          Capital account for money in; Expenses, Assets and theirs for money
          out — searchable, and pick-only. Dashed while it's a guess or an
          unapproved choice, solid once it's the row's coding.
        */}
        <div
          className={cn(
            // Fixed rather than filling the cell, so it's exactly the
            // Client/Supplier field's size whatever sits beside it.
            "w-[210px] shrink-0 rounded-md text-left",
            staged && "ring-1 ring-warning/60",
          )}
        >
          <CategorySearchSelect
            groups={groups}
            loading={loading}
            value={categoryId}
            label={value}
            ariaLabel={`Category for ${row.reference}`}
            className={settled ? "border-solid" : "border-dashed"}
            // The confidence sits inside the field, as in sole-webapp.
            ai={row.aiSuggestions}
            onSelect={onChange}
          />
        </div>

        {extra > 0 && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} ${extra} split ${extra === 1 ? "line" : "lines"} for ${row.reference}`}
            className="inline-flex shrink-0 items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-xs font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            +{extra}
            <ChevronDown
              className={cn(
                "size-3 motion-safe:transition-transform motion-safe:duration-150",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        )}
      </span>
    </TableCell>
  );
}

/**
 * The row's actions — sole-webapp's inline Personal | Transfer | Match |
 * Delete, as icons, each with sole-webapp's own explanation on hover.
 * Delete only where sole-webapp offers it: a row that didn't come from the
 * bank feed. A matched row (personal or transfer) gets Undo.
 *
 * With several rows ticked they're greyed out, as sole-webapp greys its
 * links: the bulk actions above are what act on a selection.
 */
function RowActions({
  row,
  selectionActive,
  onTogglePersonal,
  onToggleTransfer,
  onMatch,
  onUndo,
  onDelete,
}: {
  row: Transaction;
  /** More than one row ticked. */
  selectionActive: boolean;
  onTogglePersonal: () => void;
  onToggleTransfer: () => void;
  onMatch: () => void;
  onUndo: () => void;
  onDelete: () => void;
}) {
  const off = selectionActive
    ? "Several rows are selected — use the bulk actions above."
    : undefined;

  if (row.status === "Matched") {
    return (
      <span className="inline-flex items-center justify-center">
        <ActionIcon label="Undo" tooltip="Undo" disabledReason={off} onClick={onUndo}>
          <Unlink className="size-3.5" />
        </ActionIcon>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center justify-center gap-0.5">
      <ActionIcon
        label="Personal"
        tooltip="For personal transactions to be excluded from your business operations."
        disabledReason={off}
        onClick={onTogglePersonal}
      >
        <User className="size-3.5" />
      </ActionIcon>
      <ActionIcon
        label="Transfer"
        tooltip="For transfers between your accounts to be excluded for accounting purposes."
        disabledReason={off}
        onClick={onToggleTransfer}
      >
        <ArrowLeftRight className="size-3.5" />
      </ActionIcon>
      <ActionIcon
        label="Match"
        tooltip="Record this transaction for accounting purposes against income/expense categories."
        disabledReason={off}
        onClick={onMatch}
      >
        <Link2 className="size-3.5" />
      </ActionIcon>
      {row.deletable !== false && (
        <ActionIcon
          label="Delete"
          tooltip="Delete this unmatched transaction permanently."
          disabledReason={off}
          onClick={onDelete}
          destructive
        >
          <Trash2 className="size-3.5" />
        </ActionIcon>
      )}
    </span>
  );
}

/**
 * One icon action with its explanation always on hover — or, while it's off,
 * why. A disabled button takes no pointer events, so the tooltip hangs on a
 * wrapper around it.
 */
function ActionIcon({
  label,
  tooltip,
  disabledReason,
  destructive,
  onClick,
  children,
}: {
  label: string;
  tooltip: string;
  disabledReason?: string;
  destructive?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex" tabIndex={disabledReason ? 0 : -1}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            disabled={!!disabledReason}
            onClick={onClick}
            className={cn(
              "size-7 text-muted-foreground",
              destructive
                ? "hover:bg-destructive/10 hover:text-destructive"
                : "hover:bg-primary/10 hover:text-primary",
            )}
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64">
        <span className="font-semibold">{label}</span>
        {" — "}
        {disabledReason ?? tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

/** The table's shape while the first page loads, so nothing jumps when it lands. */
/**
 * The table's own headings over shimmer rows — the expenses table's loading
 * state — so the layout doesn't jump when the rows arrive. `columns` are the
 * headings between the checkbox and Actions columns.
 */
export function TableSkeleton({
  columns,
  minWidth = "min-w-[1360px]",
}: {
  columns: string[];
  minWidth?: string;
}) {
  return (
    <Table
      containerClassName="rounded-lg border border-border bg-card shadow-sm"
      className={cn(minWidth, "[&_th]:text-center [&_th]:text-xs")}
    >
      <TableHeader>
        <TableRow>
          <TableHead className={COL.check} />
          {columns.map((column) => (
            <TableHead key={column} className="whitespace-nowrap">
              {column}
            </TableHead>
          ))}
          <TableHead className="whitespace-nowrap">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody aria-hidden>
        <SkeletonRows
          count={6}
          render={() => (
            <>
              <SkeletonCheckboxCell className={COL.check} />
              {columns.map((column) => (
                <TableCell key={column} className="text-center">
                  <Shimmer className="mx-auto h-4 w-20" />
                </TableCell>
              ))}
              <TableCell>
                <Shimmer className="mx-auto size-7 rounded-full" />
              </TableCell>
            </>
          )}
        />
      </TableBody>
    </Table>
  );
}

export function EmptyState({ narrowed }: { narrowed: boolean }) {
  return (
    <Empty>
      <EmptyMedia>
        {narrowed ? <SearchX aria-hidden /> : <Receipt aria-hidden />}
      </EmptyMedia>
      <div className="space-y-1">
        <EmptyTitle>
          {narrowed ? "No transactions match" : "No transactions yet"}
        </EmptyTitle>
        <EmptyDescription>
          {narrowed
            ? "Try a different period, filter or search term."
            : "Connect a bank feed and your transactions will import themselves, or add one by hand."}
        </EmptyDescription>
      </div>
      {!narrowed && (
        <EmptyActions>
          <div className="relative">
            <Button asChild>
              <Link href="/transactions/new">Add New Transaction</Link>
            </Button>
            <EmptyCue label="Start here" />
          </div>
        </EmptyActions>
      )}
    </Empty>
  );
}

/**
 * The lists' shared toolbar: financial year, status, and the two ways to add
 * transactions by hand. Both tabs' tables render it, so it can't drift.
 * `actions` is the tab's own selection controls, ahead of the add buttons.
 */
export function TransactionsToolbar({
  selectedCount = 0,
  actions,
}: {
  selectedCount?: number;
  actions?: React.ReactNode;
}) {
  // The tabs above the table choose Unmatched or Matched; the toolbar only
  // needs to know which, for its Filters.
  const filter = useAtomValue(transactionsFilterAtom);
  const [period, setPeriod] = useAtom(transactionsPeriodAtom);
  const [filterDrafts, setFilterDrafts] = useAtom(transactionsFiltersAtom);
  // The business's financial years — "FY 26/27" starts 1 April 2026 in New Zealand.
  const fiscalYearStart = useFiscalYearStart();
  const periods = React.useMemo(
    () => financialYearChoices(new Date(), fiscalYearStart),
    [fiscalYearStart],
  );
  const tab = tabForFilter(filter);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={period} onValueChange={setPeriod}>
        <SelectTrigger aria-label="Financial year" className="h-9 w-[11rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {periods.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <TransactionsFiltersPopover
        tab={tab}
        value={filterDrafts[tab]}
        onChange={(next) =>
          setFilterDrafts((current) => ({ ...current, [tab]: next }))
        }
      />

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {selectedCount > 0 && (
          <span className="text-xs text-muted-foreground tabular">
            {selectedCount} selected
          </span>
        )}
        {actions}
        <Button variant="outline" size="sm" asChild>
          <Link href="/transactions/bulk">
            <Upload />
            Bulk Upload
          </Link>
        </Button>
        <Button size="sm" asChild>
          <Link href="/transactions/new">
            <Plus />
            Add New Transaction
          </Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * " - Bank 1" after a bank-feed row's source, with the account's full name on
 * hover. A row from an account that has since been disconnected still names
 * it: " - Disconnected", with the name it was imported under on hover — it
 * has no card above to give it a number. Nothing on rows not from the feed.
 */
function BankLabel({
  row,
  accounts,
  labels,
}: {
  row: Transaction;
  accounts: BankAccount[];
  labels: Map<string, string>;
}) {
  if (row.source !== "Bank Feed") return null;
  const account = accountForTransaction(accounts, {
    bankAccountId: row.bankAccountId,
    bankName: row.account,
  });
  const label = account ? labels.get(account.id) : undefined;

  if (!account || !label) {
    // The feed's own name for it, where the row carries one.
    const importedAs = row.account && row.account !== "—" ? row.account : "";
    if (!importedAs) return null;
    return (
      <>
        {" - "}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help underline decoration-dotted underline-offset-2">
              Disconnected
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            {importedAs} · no longer connected
          </TooltipContent>
        </Tooltip>
      </>
    );
  }

  return (
    <>
      {" - "}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help underline decoration-dotted underline-offset-2">
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          {account.name}
          {account.accountNumber ? ` · ${account.accountNumber}` : ""}
        </TooltipContent>
      </Tooltip>
    </>
  );
}
