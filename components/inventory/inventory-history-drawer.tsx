"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { fetchInventoryHistory, stockAdjustReasonLabel } from "@/lib/inventory";
import { cn } from "@/lib/utils";
import { useInventoryStore } from "@/stores/inventory";

/** Matches sole-webapp's `InventoryHistoryDrawer` page size. */
const HISTORY_PAGE_SIZE = 10;

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
 * The full, paginated stock ledger for one item — what "View all history"
 * in the inline preview opens. Same drawer treatment as `ContactDrawer`,
 * and the same page-through-ten-at-a-time shape sole-webapp's own
 * `InventoryHistoryDrawer` uses, rather than reinventing the pagination.
 */
export function InventoryHistoryDrawer() {
  const [id, setId] = useAtom(inventoryHistoryIdAtom);
  const items = useInventoryStore((state) => state.items);
  const item = items.find((entry) => entry.id === id);
  const [page, setPage] = React.useState(1);

  // Always open to the first page for whichever item was clicked.
  React.useEffect(() => {
    if (id) setPage(1);
  }, [id]);

  const query = useQuery({
    queryKey: ["inventory-history", id, page, HISTORY_PAGE_SIZE],
    queryFn: () =>
      fetchInventoryHistory(id as string, { page, limit: HISTORY_PAGE_SIZE }),
    enabled: !!id,
  });

  const close = () => setId(null);
  const adjustments = query.data?.adjustments ?? [];
  const totalPages = query.data?.totalPages ?? 1;

  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && close()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="space-y-1 border-b p-6 text-left">
          <SheetTitle>Stock history</SheetTitle>
          <SheetDescription>
            {item ? `${item.name} · ${item.openingStock} on hand` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {query.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading stock history…
            </div>
          ) : query.isError ? (
            <p className="py-8 text-sm text-destructive">
              Couldn&apos;t load stock history for {item?.name ?? "this item"}.
            </p>
          ) : adjustments.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">
              No stock movements recorded yet.
            </p>
          ) : (
            <Table containerClassName="rounded-md border border-border">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Unit cost</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="tabular">
                      {formatAdjustmentDate(entry.createdAt)}
                    </TableCell>
                    <TableCell>
                      {stockAdjustReasonLabel(entry.reason)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular",
                        entry.quantity > 0
                          ? "text-success"
                          : "text-destructive",
                      )}
                    >
                      {entry.quantity > 0 ? "+" : ""}
                      {entry.quantity}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular">
                      {entry.unitCost !== null
                        ? invoiceMoney(entry.unitCost)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.note || "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular">
                      {entry.balanceAfter}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t p-4 text-sm text-muted-foreground">
            <span>
              Page {page} of {totalPages} · {query.data?.total} entries
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => current - 1)}
                disabled={page <= 1 || query.isFetching}
              >
                <ChevronLeft />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => current + 1)}
                disabled={page >= totalPages || query.isFetching}
              >
                Next
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
