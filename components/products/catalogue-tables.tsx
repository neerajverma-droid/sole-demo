"use client";

import { useSetAtom } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { productDialogAtom } from "@/lib/atoms";
import { apiErrorMessage } from "@/lib/api-error";
import type { GeneralCatalogueEntry } from "@/lib/general-catalogue";
import {
  createInventoryItemApi,
  formatItemPrice,
  typeFromQuantityLabel,
} from "@/lib/inventory";
import {
  quantityTypeFromPricingType,
  type NdisSupportItem,
} from "@/lib/ndis-support-items";
import {
  draftFromCatalogueEntry,
  draftFromSupportItem,
} from "@/lib/products";
import { productTaxLabels, taxRateOption } from "@/lib/product-tax";
import { useActiveBusinessIndustry } from "@/hooks/use-active-business-industry";
import { useCountryContext } from "@/hooks/use-country-context";

function CatalogueShell({
  minWidth,
  headers,
  children,
}: {
  minWidth: string;
  headers: readonly { label: string; className?: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
      <Table className={minWidth}>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header.label} className={header.className}>
                {header.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}

/**
 * Reference rows can't be edited — the NDIA and the industry list own that data.
 * What they can do is become the user's own item, which is what makes them
 * actionable without being mutable.
 */
function ReferenceActions({
  label,
  onAdd,
  onCopy,
}: {
  label: string;
  onAdd: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Actions for ${label}`}
          >
            <MoreHorizontal className="size-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onAdd}>
            <Plus />
            Add to my catalogue
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onCopy}>
            <Copy />
            Copy item code
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

async function copyCode(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${value} copied`);
  } catch {
    // Clipboard access can be refused; saying so beats appearing to do nothing.
    toast.error("Couldn't copy — your browser blocked clipboard access");
  }
}

/**
 * The General catalogue. Industry is deliberately not a column: every row shares
 * the profile's industry, so it's stated once in the header as context instead.
 */
export function GeneralCatalogueTable({
  rows,
  query,
}: {
  rows: GeneralCatalogueEntry[];
  query: string;
}) {
  const queryClient = useQueryClient();
  const setDialog = useSetAtom(productDialogAtom);
  const taxLabels = productTaxLabels(useCountryContext().country);

  return (
    <CatalogueShell
      minWidth="min-w-[880px]"
      headers={[
        { label: "Name" },
        { label: "Quantity type" },
        { label: "Typical price", className: "text-right" },
        { label: "Tax rate" },
        { label: "Transaction type" },
        { label: "Actions", className: "w-[60px] text-right" },
      ]}
    >
      {rows.map((row) => (
        <TableRow key={row.code}>
          <TableCell>
            <ItemIdentity
              type={row.type}
              name={<Highlight text={row.name} query={query} />}
              code={<Highlight text={row.code} query={query} />}
            />
          </TableCell>
          <TableCell className="text-muted-foreground">
            {row.quantityType}
          </TableCell>
          {/* Indicative, so it stays neutral rather than reading as a real price. */}
          <TableCell className="whitespace-nowrap text-right tabular text-muted-foreground">
            {formatItemPrice(row.salePrice)}
          </TableCell>
          <TableCell className="whitespace-nowrap text-muted-foreground">
            {taxRateOption(row.taxRate, taxLabels)}
          </TableCell>
          <TableCell>
            <Badge variant="secondary">{row.transactionType}</Badge>
          </TableCell>
          <TableCell>
            <ReferenceActions
              label={row.name}
              onCopy={() => void copyCode(row.code)}
              onAdd={() => {
                createInventoryItemApi(draftFromCatalogueEntry(row, taxLabels))
                  .then((created) =>
                    queryClient
                      .invalidateQueries({ queryKey: ["inventory-items"] })
                      .then(() => {
                        setDialog({ open: true, editId: created.id });
                        toast.success(`${created.name} added — set your price`);
                      }),
                  )
                  .catch((error) =>
                    toast.error(apiErrorMessage(error, "Couldn't add that item")),
                  );
              }}
            />
          </TableCell>
        </TableRow>
      ))}
    </CatalogueShell>
  );
}

/** The NDIS support-item reference. Read-only; the NDIA owns this data. */
export function NdisCatalogueTable({
  rows,
  query,
}: {
  rows: NdisSupportItem[];
  query: string;
}) {
  const queryClient = useQueryClient();
  const industry = useActiveBusinessIndustry();
  const setDialog = useSetAtom(productDialogAtom);
  const taxLabels = productTaxLabels(useCountryContext().country);

  return (
    <CatalogueShell
      minWidth="min-w-[1140px]"
      headers={[
        { label: "Support item name" },
        { label: "Registration group number" },
        { label: "Registration group name" },
        { label: "Support category number" },
        { label: "Actions", className: "w-[60px] text-right" },
      ]}
    >
      {rows.map((row) => (
        // Not row.supportItemNumber: services_ndis carries legacy/current
        // pairs that share the same catalogue number (see is_legacy), so only
        // the row's own id is guaranteed unique.
        <TableRow key={row.id}>
          <TableCell className="max-w-[360px]">
            {/* Most supports are services, but the catalogue also lists
                equipment and consumables — inferred from the NDIS's own
                pricing arrangement rather than assumed uniformly. */}
            <ItemIdentity
              type={typeFromQuantityLabel(
                quantityTypeFromPricingType(row.pricingType),
              )}
              name={<Highlight text={row.supportItemName} query={query} />}
              code={<Highlight text={row.supportItemNumber} query={query} />}
            />
          </TableCell>
          <TableCell className="text-muted-foreground tabular">
            {row.registrationGroupNumber}
          </TableCell>
          <TableCell className="max-w-[280px] text-muted-foreground">
            <span className="block truncate">{row.registrationGroupName}</span>
          </TableCell>
          <TableCell className="text-muted-foreground tabular">
            {row.supportCategoryNumber}
          </TableCell>
          <TableCell>
            <ReferenceActions
              label={row.supportItemName}
              onCopy={() => void copyCode(row.supportItemNumber)}
              onAdd={() => {
                createInventoryItemApi(
                  draftFromSupportItem(row, industry, taxLabels),
                )
                  .then((created) =>
                    queryClient
                      .invalidateQueries({ queryKey: ["inventory-items"] })
                      .then(() => {
                        setDialog({ open: true, editId: created.id });
                        toast.success(`${created.name} added — set your price`);
                      }),
                  )
                  .catch((error) =>
                    toast.error(apiErrorMessage(error, "Couldn't add that item")),
                  );
              }}
            />
          </TableCell>
        </TableRow>
      ))}
    </CatalogueShell>
  );
}
