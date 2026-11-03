"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { AdjustStockDialog } from "@/components/inventory/adjust-stock-dialog";
import { DeleteItemDialog } from "@/components/inventory/delete-item-dialog";
import { InventoryHistoryDrawer } from "@/components/inventory/inventory-history-drawer";
import { InventorySummary } from "@/components/inventory/inventory-summary";
import { InventoryTable } from "@/components/inventory/inventory-table";
import { ProductDetailsDialog } from "@/components/products/product-details-dialog";
import { useInventoryQuery } from "@/hooks/use-inventory-query";
import { useCreateIntent } from "@/lib/use-create-intent";
import { useInventoryStore } from "@/stores/inventory";

export function InventoryScreen() {
  const router = useRouter();
  const itemsQuery = useInventoryQuery();
  const stored = useInventoryStore((state) => state.items);
  const createIntent = useCreateIntent();

  // Inventory and the Custom tab share one store, but not one audience: a
  // custom product/service the user never turned "Track inventory" on for
  // isn't a stock item, so it has no place here (matches sole-webapp's own
  // Inventory list, which fetches with is_inventory=1).
  const items = stored.filter((item) => item.tracked);
  /*
   * Only a genuinely first load — a background refetch keeps the rows it
   * already has on screen rather than flashing the skeleton back over them.
   * `stored` is the shared store, so it can already be populated by another
   * screen's fetch even while this query is pending.
   */
  const loading = itemsQuery.isLoading && stored.length === 0;
  /*
   * Nothing tracked at all — not a search or stock-level filter coming up
   * short, since those narrow `items` inside the table rather than the list
   * itself. Only once the fetch has actually answered: a pending or failed
   * one isn't "no items", so it keeps the screen as it was.
   */
  const isEmpty = itemsQuery.isSuccess && items.length === 0;

  // Deep-linked from an "Add item" entry point: open the form directly.
  React.useEffect(() => {
    if (createIntent) router.replace("/inventory/new");
  }, [createIntent, router]);

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={Boxes}
        title="Inventory"
        description="Manage your products, services and stock levels."
      >
        <Button asChild data-tour="inventory-items">
          <Link href="/inventory/new">
            <Plus />
            Add item
          </Link>
        </Button>
      </PageHeader>

      {/* Stock counts of nothing say nothing — with no items yet, the header's
          "Add item" and the table's own empty state are the whole page. */}
      {!isEmpty && <InventorySummary items={items} loading={loading} />}
      <InventoryTable items={items} loading={loading} isEmpty={isEmpty} />

      {/* The same detail view Products & services uses, editing on this side's
          own page rather than in the sales dialog. */}
      <ProductDetailsDialog editHref={(id) => `/inventory/${id}`} />
      <AdjustStockDialog />
      <DeleteItemDialog />
      <InventoryHistoryDrawer />
    </div>
  );
}
