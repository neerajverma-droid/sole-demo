"use client";

import * as React from "react";
import Link from "next/link";
import { useAtom, useSetAtom } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  ChevronDown,
  Copy,
  Eye,
  FilePlus2,
  Layers,
  MoreHorizontal,
  Pencil,
  Search,
  SearchX,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyActions,
  EmptyCue,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FilterPills } from "@/components/ui/filter-pills";
import {
  SkeletonActionCell,
  SkeletonBadgeCell,
  SkeletonIdentityCell,
  SkeletonRows,
  SkeletonTextCell,
} from "@/components/ui/table-skeleton";
import { Input } from "@/components/ui/input";
import { MenuAction } from "@/components/ui/menu-action";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Highlight } from "@/components/contacts/highlight";
import {
  adjustStockIdAtom,
  deleteItemIdAtom,
  inventoryFilterAtom,
  inventoryQueryAtom,
  viewProductIdAtom,
} from "@/lib/atoms";
import { apiErrorMessage } from "@/lib/api-error";
import {
  INVENTORY_FILTERS,
  createInventoryItemApi,
  filterItems,
  formatItemPrice,
  itemInitials,
  stockLabel,
  stockStatus,
  stockStatusVariant,
  type InventoryFilter,
  type InventoryItem,
} from "@/lib/inventory";
import { duplicateItemDraft } from "@/lib/products";
import { cn } from "@/lib/utils";
import { StockHistoryRows } from "@/components/inventory/stock-history-rows";

/** Table columns a row spans when its history is expanded underneath it. */
const COLUMN_COUNT = 6;

export function InventoryTable({
  items,
  loading,
  isEmpty,
}: {
  items: InventoryItem[];
  /** The list hasn't landed yet — a skeleton rather than "No products yet",
   *  which reads as a real answer when it's only a slow one. */
  loading?: boolean;
  /** No items at all (loaded, not failed) — just the "No products yet" card,
   *  without stock filters and a search over nothing. */
  isEmpty?: boolean;
}) {
  const [filter, setFilter] = useAtom(inventoryFilterAtom);
  const [query, setQuery] = useAtom(inventoryQueryAtom);
  const setDeleteId = useSetAtom(deleteItemIdAtom);
  const setViewId = useSetAtom(viewProductIdAtom);
  const setAdjustId = useSetAtom(adjustStockIdAtom);
  const queryClient = useQueryClient();
  /** Which rows have their stock history open — same pattern the bank
   * transactions table uses for its "+N splits" expansion. */
  const [expandedIds, setExpandedIds] = React.useState<string[]>([]);
  const toggleHistory = (id: string) =>
    setExpandedIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );

  const rows = filterItems(items, filter, query);

  const counts = INVENTORY_FILTERS.reduce<
    Partial<Record<InventoryFilter, number>>
  >((acc, option) => {
    acc[option] = filterItems(items, option, "").length;
    return acc;
  }, {});

  const narrowed = !!query.trim() || filter !== "All";

  if (isEmpty) {
    return (
      <Empty>
        <EmptyMedia>
          <Boxes aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>No products yet</EmptyTitle>
          <EmptyDescription>
            Add your first product or service to start tracking inventory.
          </EmptyDescription>
        </div>
        <EmptyCue label="Start here" />
        <EmptyActions>
          <Button size="sm" asChild>
            <Link href="/inventory/new">Add item</Link>
          </Button>
        </EmptyActions>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills
          tourId="inventory-stock-filters"
          label="Filter items by stock level"
          options={INVENTORY_FILTERS}
          value={filter}
          onChange={setFilter}
          counts={counts}
        />

        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search items"
            aria-label="Search items"
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <InventoryTableSkeleton />
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyMedia>
            {narrowed ? <SearchX aria-hidden /> : <Boxes aria-hidden />}
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>
              {narrowed ? "No items match" : "No products yet"}
            </EmptyTitle>
            <EmptyDescription>
              {narrowed
                ? "Try a different name, or clear the filters to see everything."
                : "Add your first product or service to start tracking inventory."}
            </EmptyDescription>
          </div>
          {!narrowed && <EmptyCue label="Start here" />}
          <EmptyActions>
            {narrowed ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setFilter("All");
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button size="sm" asChild>
                <Link href="/inventory/new">Add item</Link>
              </Button>
            )}
          </EmptyActions>
        </Empty>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Avg cost</TableHead>
                  <TableHead className="text-right">Avg sell</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="w-[88px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    query={query}
                    historyOpen={expandedIds.includes(item.id)}
                    onToggleHistory={() => toggleHistory(item.id)}
                    onView={() => setViewId(item.id)}
                    onDuplicate={() => {
                      createInventoryItemApi(duplicateItemDraft(item))
                        .then((copy) =>
                          queryClient
                            .invalidateQueries({
                              queryKey: ["inventory-items"],
                            })
                            .then(() => toast.success(`${copy.name} added`)),
                        )
                        .catch((error) =>
                          toast.error(
                            apiErrorMessage(
                              error,
                              "Couldn't duplicate that item",
                            ),
                          ),
                        );
                    }}
                    onAdjustStock={() => setAdjustId(item.id)}
                    onDelete={() => setDeleteId(item.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Rows per page:{" "}
              <span className="font-medium text-foreground">50</span>
            </span>
            <span className="tabular">
              1–{rows.length} of {rows.length}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function ItemRow({
  item,
  query,
  historyOpen,
  onToggleHistory,
  onView,
  onDuplicate,
  onAdjustStock,
  onDelete,
}: {
  item: InventoryItem;
  query: string;
  historyOpen: boolean;
  onToggleHistory: () => void;
  onView: () => void;
  onDuplicate: () => void;
  onAdjustStock: () => void;
  onDelete: () => void;
}) {
  const status = stockStatus(item);
  /** Services and untracked products have no count to adjust, and no stock
   * ledger to show history from either. */
  const untracked = status === "Service";

  return (
    <React.Fragment>
      <TableRow>
        <TableCell>
          <div className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
              {itemInitials(item.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">
                <Highlight text={item.name} query={query} />
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {item.type}
                {item.sku && ` · ${item.sku}`}
              </p>
            </div>
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground">
          {item.quantityType || "—"}
        </TableCell>
        <TableCell className="text-right text-muted-foreground tabular">
          {formatItemPrice(item.costPrice)}
        </TableCell>
        <TableCell className="text-right font-medium tabular">
          {formatItemPrice(item.salePrice)}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <span className="tabular">{stockLabel(item)}</span>
            <Badge variant={stockStatusVariant(status)}>{status}</Badge>
            {!untracked && (
              <button
                type="button"
                onClick={onToggleHistory}
                aria-expanded={historyOpen}
                aria-label={`${historyOpen ? "Hide" : "Show"} stock history for ${item.name}`}
                className="inline-flex shrink-0 items-center rounded p-0.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronDown
                  className={cn(
                    "size-3.5 motion-safe:transition-transform motion-safe:duration-150",
                    historyOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
            )}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Actions for ${item.name}`}
                >
                  <MoreHorizontal className="size-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              {/* View actions, then edit actions, then Delete on its own. */}
              <DropdownMenuContent align="end" className="w-52">
                <MenuAction icon={<Eye />} label="View" onSelect={onView} />
                <DropdownMenuSeparator />
                <MenuAction
                  icon={<Pencil />}
                  label="Edit"
                  href={`/inventory/${item.id}`}
                />
                <MenuAction
                  icon={<Copy />}
                  label="Duplicate"
                  onSelect={onDuplicate}
                />
                <MenuAction
                  icon={<FilePlus2 />}
                  label="Add to invoice"
                  href={`/invoices/new/general?item=${encodeURIComponent(item.id)}`}
                />
                <MenuAction
                  icon={<Layers />}
                  label="Adjust stock"
                  onSelect={onAdjustStock}
                  disabledReason={
                    untracked
                      ? item.type === "Service"
                        ? "A service has no stock to count"
                        : "Stock isn't tracked for this item"
                      : undefined
                  }
                />
                <DropdownMenuSeparator />
                <MenuAction
                  icon={<Trash2 />}
                  label="Delete"
                  onSelect={onDelete}
                  destructive
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      </TableRow>

      {historyOpen && !untracked && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={COLUMN_COUNT} className="bg-muted/30 p-0">
            <StockHistoryRows item={item} />
          </TableCell>
        </TableRow>
      )}
    </React.Fragment>
  );
}

/**
 * Stands in for the table while the list is still loading — same columns and
 * row height, so the real rows land where the placeholders already were
 * rather than shifting the page under a reader.
 */
function InventoryTableSkeleton() {
  return (
    <div
      className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm"
      aria-hidden
    >
      <Table className="min-w-[860px]">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead className="text-right">Avg cost</TableHead>
            <TableHead className="text-right">Avg sell</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead className="w-[88px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <SkeletonRows
            render={() => (
              <>
                <SkeletonIdentityCell nameWidth="w-32" subtextWidth="w-20" />
                <SkeletonTextCell width="w-14" />
                <SkeletonTextCell width="w-16" align="right" />
                <SkeletonTextCell width="w-16" align="right" />
                <SkeletonBadgeCell width="w-24" />
                <SkeletonActionCell />
              </>
            )}
          />
        </TableBody>
      </Table>
    </div>
  );
}
