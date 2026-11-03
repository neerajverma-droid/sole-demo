"use client";

import Link from "next/link";
import { useAtom, useSetAtom } from "jotai";
import { FilePlus2, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ItemIdentity } from "@/components/products/item-tile";
import { useCountryContext } from "@/hooks/use-country-context";
import { productDialogAtom, viewProductIdAtom } from "@/lib/atoms";
import {
  formatItemPrice,
  marginPerUnit,
  stockLabel,
  stockStatus,
  stockStatusVariant,
} from "@/lib/inventory";
import { productTaxLabels, taxRateOption } from "@/lib/product-tax";
import { cn } from "@/lib/utils";
import { useInventoryStore } from "@/stores/inventory";

/**
 * Read-only detail. Worth having alongside Edit because it shows what the edit
 * dialog deliberately doesn't: the margin, and the cost and stock figures
 * Inventory owns.
 *
 * Shared with Inventory, which edits on its own page rather than in the sales
 * dialog — hence `editHref`, so one detail view serves both screens instead of
 * each growing its own copy.
 */
export function ProductDetailsDialog({
  editHref,
}: {
  /** Where Edit goes. Defaults to the sales product dialog. */
  editHref?: (id: string) => string;
} = {}) {
  const [viewId, setViewId] = useAtom(viewProductIdAtom);
  const items = useInventoryStore((state) => state.items);
  const setDialog = useSetAtom(productDialogAtom);
  const { country } = useCountryContext();

  const item = items.find((entry) => entry.id === viewId);
  const margin = item ? marginPerUnit(item.costPrice, item.salePrice) : null;

  return (
    <Dialog open={viewId !== null} onOpenChange={(open) => !open && setViewId(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Item details</DialogTitle>
        </DialogHeader>

        {item && (
          <div className="space-y-4">
            <ItemIdentity
              type={item.type}
              name={item.name}
              code={item.sku || null}
            >
              {item.saleDescription && (
                <p className="text-xs text-muted-foreground">
                  {item.saleDescription}
                </p>
              )}
            </ItemIdentity>

            <dl className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
              <Row label="Sale price" value={formatItemPrice(item.salePrice)} tabular />
              <Row label="Cost price" value={formatItemPrice(item.costPrice)} tabular />
              <Row
                label="Margin per unit"
                value={margin ? `${margin.amount} (${margin.percent}%)` : "—"}
                tabular
              />
              <Row
                label="Tax"
                value={taxRateOption(item.saleTax, productTaxLabels(country))}
              />
              <Row label="Quantity type" value={item.quantityType || "—"} />
              <Row label="Transaction type" value={item.transactionType} />
              <div className="space-y-1 sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Industry</dt>
                <dd className="text-sm">{item.industry}</dd>
              </div>
            </dl>

            {/* Stock is Inventory's, so it's reported here rather than edited. */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border surface-subtle p-3">
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">Stock</p>
                <p className="flex items-center gap-2 text-sm">
                  <Badge variant={stockStatusVariant(stockStatus(item))}>
                    {stockStatus(item) === "Service"
                      ? "Not tracked"
                      : stockStatus(item)}
                  </Badge>
                  <span className="tabular">{stockLabel(item)}</span>
                </p>
              </div>
              {!editHref && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/inventory/${item.id}`}>Manage in Inventory</Link>
                </Button>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {item && (
            <>
              {editHref ? (
                <Button variant="outline" asChild>
                  <Link href={editHref(item.id)}>
                    <Pencil />
                    Edit
                  </Link>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    setViewId(null);
                    setDialog({ open: true, editId: item.id });
                  }}
                >
                  <Pencil />
                  Edit
                </Button>
              )}
              <Button asChild>
                <Link
                  href={`/invoices/new/general?item=${encodeURIComponent(item.id)}`}
                >
                  <FilePlus2 />
                  Add to invoice
                </Link>
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  tabular,
}: {
  label: string;
  value: string;
  tabular?: boolean;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm", tabular && "tabular")}>{value}</dd>
    </div>
  );
}
