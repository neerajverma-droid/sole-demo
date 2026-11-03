"use client";

import * as React from "react";
import { useAtom, useSetAtom } from "jotai";
import {
  ChevronDown,
  TriangleAlert,
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Highlight } from "@/components/contacts/highlight";
import { TypeMark, directionTone } from "@/components/transactions/type-mark";
import {
  EmptyState,
  TableSkeleton,
  TransactionsToolbar,
  type TransactionsPaging,
} from "@/components/transactions/transactions-table";
import {
  transactionsQueryAtom,
  unmatchTransactionIdAtom,
  viewTransactionIdAtom,
} from "@/lib/atoms";
import { invoiceMoney } from "@/lib/invoices";
import {
  formatTransactionDate,
  matchedAmount,
  signedAmount,
  type Transaction,
  type TransactionSplit,
} from "@/lib/transactions";
import { cn } from "@/lib/utils";
import {
  useBulkUnmatch,
  useUndoMatchEntry,
} from "@/hooks/use-bank-transactions-query";

/** A real journal entry id — the per-line Undo needs one to point at. */
function isEntryId(id: string): boolean {
  return /^\d+$/.test(id);
}

/**
 * The Matched tab — sole-webapp's matched `TransactionList`, with its own
 * columns rather than the unmatched table's: what each line was reconciled
 * against matters here, and coding controls don't.
 *
 * Columns: ☐ · Txn Date · Category · Reference Number · Description · Type ·
 * TXN Amt · Matched Amt · Actions. A transaction matched across several
 * accounts shows the first category with "+N", which opens an accordion of
 * its lines, each with its own Undo — as in sole-webapp, such a row has no
 * Undo of its own. Selected rows can be unmatched together.
 */
export function MatchedTransactionsTable({
  transactions,
  loading = false,
  fetching = false,
  error = null,
  onRetry,
  anyTransactions = transactions.length > 0,
  paging,
}: {
  transactions: Transaction[];
  loading?: boolean;
  /** A page/size/filter change's own request, still in flight, while the
   *  previous page's rows stay on screen — dims the table and disables the
   *  pager, the only sign a click (or a slow network) actually did something. */
  fetching?: boolean;
  error?: string | null;
  onRetry?: () => void;
  anyTransactions?: boolean;
  paging?: TransactionsPaging;
}) {
  const [query] = useAtom(transactionsQueryAtom);
  const setViewId = useSetAtom(viewTransactionIdAtom);
  const setUnmatchId = useSetAtom(unmatchTransactionIdAtom);
  const bulkUnmatch = useBulkUnmatch();
  const undoLine = useUndoMatchEntry();

  const [selected, setSelected] = React.useState<string[]>([]);
  const [expanded, setExpanded] = React.useState<string[]>([]);
  const [confirmBulk, setConfirmBulk] = React.useState(false);
  const [lineToUndo, setLineToUndo] = React.useState<{
    row: Transaction;
    line: TransactionSplit;
  } | null>(null);

  // A new page or list is a new selection. Keyed on the ids, not the array:
  // while loading the array is a fresh `[]` every render.
  const rowsKey = transactions.map((row) => row.id).join(",");
  React.useEffect(() => {
    setSelected([]);
    setExpanded([]);
  }, [rowsKey]);

  const allSelected =
    transactions.length > 0 && selected.length === transactions.length;
  const narrowed = query.trim().length > 0 || anyTransactions;

  const toggleExpanded = (id: string) =>
    setExpanded((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-3">
        <TransactionsToolbar
          selectedCount={selected.length}
          actions={
            selected.length > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={bulkUnmatch.isPending}
                  onClick={() => setConfirmBulk(true)}
                >
                  {bulkUnmatch.isPending ? "Undoing…" : "Bulk Undo Match"}
                </Button>
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

        {loading ? (
          <TableSkeleton
            minWidth="min-w-[960px]"
            columns={[
              "Txn Date",
              "Category",
              "Reference Number",
              "Description",
              "Type",
              "TXN Amt",
              "Matched Amt",
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
        ) : transactions.length === 0 ? (
          <EmptyState narrowed={narrowed} />
        ) : (
          <Table
            containerClassName={cn(
              "rounded-lg border border-border bg-card shadow-sm transition-opacity",
              fetching && "opacity-60",
            )}
            // Same body as the unmatched table: centred, one text size,
            // tighter sides.
            className="[&_td]:px-1 [&_td]:text-center [&_td]:text-xs [&_th]:text-center [&_th]:text-xs"
          >
            <TableHeader>
              <TableRow>
                <TableHead className="w-[28px] !pl-2 !pr-0 !text-left">
                  <Checkbox
                    className="h-3.5 w-3.5 [&_svg]:h-3 [&_svg]:w-3"
                    checked={allSelected}
                    aria-label="Select all matched transactions"
                    onCheckedChange={(checked) =>
                      setSelected(
                        checked ? transactions.map((row) => row.id) : [],
                      )
                    }
                  />
                </TableHead>
                <TableHead className="whitespace-nowrap">Txn Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="whitespace-nowrap">
                  Reference Number
                </TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="whitespace-nowrap">TXN Amt</TableHead>
                <TableHead className="whitespace-nowrap">
                  Matched Amt
                </TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((row) => {
                const open = expanded.includes(row.id);
                const chosen = selected.includes(row.id);
                const lines = row.splits.length;
                const marked = row.personal || !!row.transfer;

                return (
                  <React.Fragment key={row.id}>
                    <TableRow
                      data-state={chosen ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={() => setViewId(row.id)}
                    >
                      <TableCell
                        className="w-[28px] !pl-2 !pr-0 !text-left"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          className="h-3.5 w-3.5 [&_svg]:h-3 [&_svg]:w-3"
                          checked={chosen}
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

                      <TableCell className="whitespace-nowrap tabular">
                        {formatTransactionDate(row.date)}
                      </TableCell>

                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <span className="flex items-center justify-center gap-1">
                          {row.category && (
                            <CategoryChip row={row} name={row.category} />
                          )}
                          {lines > 1 && (
                            <button
                              type="button"
                              onClick={() => toggleExpanded(row.id)}
                              aria-expanded={open}
                              aria-label={`${open ? "Hide" : "Show"} the ${lines} lines ${row.reference} was matched across`}
                              className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              +{lines - 1}
                              <ChevronDown
                                className={cn(
                                  "size-3.5 motion-safe:transition-transform",
                                  open && "rotate-180",
                                )}
                                aria-hidden
                              />
                            </button>
                          )}
                        </span>
                      </TableCell>

                      <TableCell className="tabular">
                        {row.matchReference || "--"}
                      </TableCell>

                      <TableCell className="max-w-[16rem]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block truncate font-medium">
                              <Highlight text={row.description} query={query} />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-80">
                            {row.description}
                          </TooltipContent>
                        </Tooltip>
                        {/* No "Ref" line here: the Reference Number column
                            already says what it was matched against. The
                            source only shows when the feed names one. */}
                        {row.source !== "Unknown" && (
                          <span className="block truncate text-muted-foreground">
                            {row.source}
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        <TypeMark row={row} />
                      </TableCell>

                      <TableCell
                        className={cn(
                          "whitespace-nowrap font-medium tabular",
                          directionTone(row),
                        )}
                      >
                        {signedAmount(row)}
                      </TableCell>

                      <TableCell className="whitespace-nowrap tabular">
                        {invoiceMoney(matchedAmount(row))}
                      </TableCell>

                      <TableCell onClick={(event) => event.stopPropagation()}>
                        {/* sole-webapp: a mark or a single-line match undoes
                            from the row; a multi-line one undoes line by line
                            in its accordion. */}
                        {marked || lines <= 1 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs font-medium text-primary hover:bg-primary/10 hover:text-primary"
                            onClick={() => setUnmatchId(row.id)}
                          >
                            Undo
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </TableCell>
                    </TableRow>

                    {open && lines > 1 && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={9} className="bg-muted/30 !p-2">
                          <MatchLines
                            row={row}
                            onUndo={(line) => setLineToUndo({ row, line })}
                          />
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
            navLabel="Matched transactions pages"
            disabled={paging.disabled}
          />
        )}

        {/* sole-webapp's bulk-undo confirmation, word for word. */}
        <AlertDialog
          open={confirmBulk}
          onOpenChange={(next) => !bulkUnmatch.isPending && setConfirmBulk(next)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Bulk Undo Match?</AlertDialogTitle>
              <AlertDialogDescription>
                This will undo the match for {selected.length} selected
                transaction(s). Any invoices or expenses created through
                matching will also be removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={bulkUnmatch.isPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={bulkUnmatch.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  bulkUnmatch.mutate(selected, {
                    onSuccess: () => setSelected([]),
                    onSettled: () => setConfirmBulk(false),
                  });
                }}
              >
                {bulkUnmatch.isPending ? "Undoing…" : "Undo matches"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* One line of a multi-line match. */}
        <AlertDialog
          open={lineToUndo !== null}
          onOpenChange={(next) =>
            !next && !undoLine.isPending && setLineToUndo(null)
          }
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Undo Match?</AlertDialogTitle>
              <AlertDialogDescription>
                This will undo your previously matched transaction
                {lineToUndo
                  ? ` — the ${invoiceMoney(lineToUndo.line.amount)} matched to ${lineToUndo.line.category}`
                  : ""}
                .
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={undoLine.isPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={undoLine.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  if (!lineToUndo) return;
                  undoLine.mutate(
                    {
                      entryId: lineToUndo.line.id,
                      label: lineToUndo.line.category || lineToUndo.row.reference,
                    },
                    { onSettled: () => setLineToUndo(null) },
                  );
                }}
              >
                {undoLine.isPending ? "Undoing…" : "Undo"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

/**
 * The category, ringed by direction as in sole-webapp: green for money in,
 * red for money out, grey for a personal or transfer mark.
 */
function CategoryChip({ row, name }: { row: Transaction; name: string }) {
  const tone =
    row.personal || row.transfer
      ? "border-border"
      : row.type === "Credit"
        ? "border-success"
        : "border-destructive";
  return (
    <span
      className={cn(
        "inline-flex max-w-[12rem] items-center truncate whitespace-nowrap rounded-full border bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground",
        tone,
      )}
    >
      {name}
    </span>
  );
}

/** The accordion: every line the transaction was matched across. */
function MatchLines({
  row,
  onUndo,
}: {
  row: Transaction;
  onUndo: (line: TransactionSplit) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted/60 text-muted-foreground">
          <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-center [&>th]:font-medium [&>th]:uppercase">
            <th>Txn ID</th>
            <th>Txn Date</th>
            <th>Category</th>
            <th>Reference Number</th>
            <th>Reference Type</th>
            <th>Client Name</th>
            <th>Amount</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {/* Keyed by position too: a sale and its GST line can share one
              journal entry, so the entry id alone repeats. */}
          {row.splits.map((line, index) => (
            <tr key={`${line.id}-${index}`} className="[&>td]:px-3 [&>td]:py-2">
              <td className="tabular">{row.reference}</td>
              <td className="whitespace-nowrap tabular">
                {formatTransactionDate(line.date)}
              </td>
              <td>{line.category || "--"}</td>
              <td className="tabular">{line.reference || "--"}</td>
              <td className="capitalize">
                {line.referenceType?.replace(/_/g, " ") || "--"}
              </td>
              <td>{line.clientName || "--"}</td>
              <td className="whitespace-nowrap font-medium tabular">
                {invoiceMoney(line.amount)}
              </td>
              <td>
                {isEntryId(line.id) ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs font-medium text-primary hover:bg-primary/10 hover:text-primary"
                    onClick={() => onUndo(line)}
                  >
                    Undo
                  </Button>
                ) : (
                  <span className="text-muted-foreground">--</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
