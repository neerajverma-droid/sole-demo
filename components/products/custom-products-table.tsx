"use client";

import { useRouter } from "next/navigation";
import { useSetAtom } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Eye,
  FilePlus2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Highlight } from "@/components/contacts/highlight";
import { ItemIdentity } from "@/components/products/item-tile";
import { useCountryContext } from "@/hooks/use-country-context";
import {
  deleteItemIdAtom,
  productDialogAtom,
  viewProductIdAtom,
} from "@/lib/atoms";
import { apiErrorMessage } from "@/lib/api-error";
import {
  createInventoryItemApi,
  formatItemPrice,
  type InventoryItem,
} from "@/lib/inventory";
import { productTaxLabels, taxRateOption } from "@/lib/product-tax";
import { duplicateItemDraft } from "@/lib/products";

/**
 * The only editable catalogue. Industry *is* a column here — a custom item can
 * belong to any industry, unlike the General tab where every row shares one.
 */
export function CustomProductsTable({
  rows,
  query,
}: {
  rows: InventoryItem[];
  query: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setDialog = useSetAtom(productDialogAtom);
  const setViewId = useSetAtom(viewProductIdAtom);
  const setDeleteId = useSetAtom(deleteItemIdAtom);
  const taxLabels = productTaxLabels(useCountryContext().country);

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
      <Table className="min-w-[1120px]">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Industry</TableHead>
            <TableHead>Quantity type</TableHead>
            <TableHead className="text-right">Cost price</TableHead>
            <TableHead className="text-right">Sale price</TableHead>
            <TableHead>Tax rate</TableHead>
            <TableHead>Transaction type</TableHead>
            <TableHead className="w-[60px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <ItemIdentity
                  type={item.type}
                  name={<Highlight text={item.name} query={query} />}
                  code={
                    item.sku ? <Highlight text={item.sku} query={query} /> : null
                  }
                >
                  {item.saleDescription && (
                    <p className="max-w-[240px] truncate text-xs text-muted-foreground">
                      <Highlight text={item.saleDescription} query={query} />
                    </p>
                  )}
                </ItemIdentity>
              </TableCell>
              <TableCell className="max-w-[160px] text-muted-foreground">
                <span className="block truncate">{item.industry}</span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {item.quantityType || "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right tabular text-muted-foreground">
                {formatItemPrice(item.costPrice)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right font-medium tabular">
                {formatItemPrice(item.salePrice)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {taxRateOption(item.saleTax, taxLabels)}
              </TableCell>
              <TableCell>
                {/* Income vs Expense is a direction, not a status — neutral. */}
                <Badge variant="secondary">{item.transactionType}</Badge>
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
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setViewId(item.id)}>
                        <Eye />
                        View details
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          setDialog({ open: true, editId: item.id })
                        }
                      >
                        <Pencil />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          createInventoryItemApi(duplicateItemDraft(item))
                            .then((copy) =>
                              queryClient
                                .invalidateQueries({ queryKey: ["inventory-items"] })
                                .then(() => toast.success(`${copy.name} added`)),
                            )
                            .catch((error) =>
                              toast.error(apiErrorMessage(error, "Couldn't duplicate that item")),
                            );
                        }}
                      >
                        <Copy />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() =>
                          router.push(
                            `/invoices/new/general?item=${encodeURIComponent(item.id)}`,
                          )
                        }
                      >
                        <FilePlus2 />
                        Add to invoice
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => setDeleteId(item.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
