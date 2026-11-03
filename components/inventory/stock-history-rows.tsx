"use client";

import { useSetAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { inventoryHistoryIdAtom } from "@/lib/atoms";
import { invoiceMoney } from "@/lib/invoices";
import {
  fetchInventoryHistory,
  stockAdjustReasonLabel,
  type InventoryItem,
} from "@/lib/inventory";
import { cn } from "@/lib/utils";

/** Just enough of a preview to be useful — the rest is a click away in
 * `InventoryHistoryDrawer`, same split sole-webapp uses. */
const HISTORY_PAGE_SIZE = 2;

/** "10 Sep 2026", matching how the rest of the app renders a plain date. */
function formatAdjustmentDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * The most recent stock movements for one item, expanded under its row.
 *
 * Same shape as `TransactionSplitRows` — a small table inside a padded div —
 * since this is the same kind of thing: a few extra lines a row's own columns
 * have no room for, shown in place rather than behind a second dialog.
 */
export function StockHistoryRows({ item }: { item: InventoryItem }) {
  const setHistoryId = useSetAtom(inventoryHistoryIdAtom);
  const query = useQuery({
    queryKey: ["inventory-history", item.id],
    queryFn: () => fetchInventoryHistory(item.id, { limit: HISTORY_PAGE_SIZE }),
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Loading stock history…
      </div>
    );
  }

  if (query.isError) {
    return (
      <p className="p-3 text-xs text-destructive">
        Couldn&apos;t load stock history for {item.name}.
      </p>
    );
  }

  const adjustments = query.data?.adjustments ?? [];
  if (adjustments.length === 0) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        No stock movements recorded yet.
      </p>
    );
  }

  return (
    <div className="p-3">
      <Table containerClassName="rounded-md border border-border bg-card">
        <TableHeader>
          <TableRow>
            <TableHead className="h-9 text-xs">Date</TableHead>
            <TableHead className="h-9 text-xs">Reason</TableHead>
            <TableHead className="h-9 text-right text-xs">Quantity</TableHead>
            <TableHead className="h-9 text-right text-xs">Unit cost</TableHead>
            <TableHead className="h-9 text-xs">Note</TableHead>
            <TableHead className="h-9 text-right text-xs">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {adjustments.map((entry) => (
            <TableRow key={entry.id} className="text-xs">
              <TableCell className="py-2 tabular">
                {formatAdjustmentDate(entry.createdAt)}
              </TableCell>
              <TableCell className="py-2">
                {stockAdjustReasonLabel(entry.reason)}
              </TableCell>
              <TableCell
                className={cn(
                  "py-2 text-right font-medium tabular",
                  entry.quantity > 0 ? "text-success" : "text-destructive",
                )}
              >
                {entry.quantity > 0 ? "+" : ""}
                {entry.quantity}
              </TableCell>
              <TableCell className="py-2 text-right text-muted-foreground tabular">
                {entry.unitCost !== null ? invoiceMoney(entry.unitCost) : "—"}
              </TableCell>
              <TableCell className="py-2 text-muted-foreground">
                {entry.note || "—"}
              </TableCell>
              <TableCell className="py-2 text-right font-medium tabular">
                {entry.balanceAfter}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {(query.data?.totalPages ?? 1) > 1 && (
        <div className="mt-2 flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            Showing the {adjustments.length} most recent movements of{" "}
            {query.data?.total}.
          </p>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => setHistoryId(item.id)}
          >
            View all history
          </Button>
        </div>
      )}
    </div>
  );
}
