"use client";

import { Undo2 } from "lucide-react";
import { toast } from "sonner";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { invoiceMoney } from "@/lib/invoices";
import {
  categoryTone,
  formatTransactionDate,
  matchedTypeOf,
  matchedTypeTone,
  splitTotal,
  splitsBalance,
  type Transaction,
} from "@/lib/transactions";
import { cn } from "@/lib/utils";
import { useTransactionsStore } from "@/stores/transactions";

/**
 * The lines a transaction was split into.
 *
 * One component for both places they appear — expanded under the row, and inside
 * the details modal — because they're the same rows saying the same thing, and
 * two copies would eventually disagree about a column.
 *
 * The footer states whether the lines add up. A split that doesn't balance is
 * the whole reason to look at this table, so it says so rather than leaving the
 * arithmetic to the reader.
 */
export function TransactionSplitRows({
  transaction,
}: {
  transaction: Transaction;
}) {
  const removeSplit = useTransactionsStore((state) => state.removeSplit);
  const total = splitTotal(transaction);
  const balanced = splitsBalance(transaction);
  /*
   * Type tags only once the row is matched. On a row still in review these
   * lines are a draft someone is building, and tagging a draft line as an
   * Expense would be reporting an outcome that hasn't happened.
   */
  const matched = transaction.status === "Matched";

  if (transaction.splits.length === 0) return null;

  return (
    <div className="p-3">
      <Table containerClassName="rounded-md border border-border bg-card">
        <TableHeader>
          <TableRow>
            <TableHead className="h-9 text-xs">TXN ID</TableHead>
            <TableHead className="h-9 text-xs">TXN date</TableHead>
            <TableHead className="h-9 text-xs">Category</TableHead>
            <TableHead className="h-9 text-xs">Reference number</TableHead>
            <TableHead className="h-9 text-xs">Reference type</TableHead>
            <TableHead className="h-9 text-xs">Client name</TableHead>
            <TableHead className="h-9 text-right text-xs">Amount</TableHead>
            <TableHead className="h-9 w-[72px] text-right text-xs">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Position as well as id: matched lines can share a journal entry. */}
          {transaction.splits.map((split, index) => (
            <TableRow key={`${split.id}-${index}`} className="text-xs">
              <TableCell className="py-2 font-medium tabular">
                {split.id.toUpperCase()}
              </TableCell>
              <TableCell className="py-2 tabular">
                {formatTransactionDate(split.date)}
              </TableCell>
              <TableCell className="py-2">
                {/*
                  The category, and what this line made the money.

                  Beside the pill rather than in a column of its own: a ninth
                  column would widen the breakdown, and the tag is a property of
                  the category next to it rather than an independent fact.

                  On every line, not only mixed ones. A split whose lines all
                  landed in the same place shows its tag on the parent row too,
                  and repeating it here costs nothing — where a line disagrees
                  with its siblings, this is the only place that says so.
                */}
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "inline-flex shrink-0 rounded-md border px-2 py-0.5 font-medium",
                      categoryTone(split.category),
                    )}
                  >
                    {split.category}
                  </span>
                  {matched && (
                    <span
                      className={cn(
                        "inline-flex shrink-0 whitespace-nowrap rounded-full border px-1.5 py-0 text-xs font-semibold",
                        matchedTypeTone(
                          matchedTypeOf(
                            split.category,
                            transaction.type,
                            split.referenceType,
                          ),
                        ),
                      )}
                    >
                      {matchedTypeOf(
                        split.category,
                        transaction.type,
                        split.referenceType,
                      )}
                    </span>
                  )}
                </span>
              </TableCell>
              <TableCell className="py-2 text-muted-foreground tabular">
                {split.reference}
              </TableCell>
              <TableCell className="py-2 text-muted-foreground">
                {split.referenceType}
              </TableCell>
              <TableCell className="py-2">{split.clientName}</TableCell>
              <TableCell className="py-2 text-right font-medium tabular">
                {invoiceMoney(split.amount)}
              </TableCell>
              <TableCell className="py-2 text-right">
                {/* Undo, not Delete: this line was created by splitting, and
                    taking it back returns that much to the unsplit remainder. */}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeSplit(transaction.id, split.id);
                    toast(`Split line removed`, {
                      description: `${invoiceMoney(split.amount)} returned to ${transaction.reference}.`,
                    });
                  }}
                  className="inline-flex items-center gap-1 rounded font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Undo2 className="size-3" aria-hidden />
                  Undo
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <p className="mt-2 px-1 text-xs text-muted-foreground tabular">
        {transaction.splits.length}{" "}
        {transaction.splits.length === 1 ? "line" : "lines"} ·{" "}
        {invoiceMoney(total)} of {invoiceMoney(transaction.amount)}
        {!balanced && (
          <span className="ml-1.5 font-medium text-warning">
            — {invoiceMoney(Math.abs(transaction.amount - total))} unallocated
          </span>
        )}
      </p>
    </div>
  );
}
