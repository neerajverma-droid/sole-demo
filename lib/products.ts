/**
 * Products & services — three catalogues behind one screen.
 *
 * General and NDIS are read-only reference data, each in its own module
 * (`lib/general-catalogue.ts`, `lib/ndis-support-items.ts`) so either can be
 * swapped wholesale. Custom is the only editable tab and is still a view over
 * `useInventoryStore`: `InventoryItem` carries every field it needs, and a second
 * store would let the same item exist twice with independently editable prices.
 * Stock stays Inventory's concern and isn't surfaced here.
 */
import {
  emptyItemDraft,
  itemIncludesGst,
  priceError,
  typeFromQuantityLabel,
  withGst,
  type InventoryItem,
  type ItemDraft,
  type ItemTransactionType,
  type ItemType,
  type QuantityType,
} from "@/lib/inventory";
import type { GeneralCatalogueEntry } from "@/lib/general-catalogue";
import { invoiceMoney } from "@/lib/invoices";
import {
  DEFAULT_PRODUCT_TAX_LABELS,
  isTaxedRate,
  taxRateOption,
  type ProductTaxLabels,
} from "@/lib/product-tax";
import {
  quantityTypeFromPricingType,
  type NdisSupportItem,
} from "@/lib/ndis-support-items";

export const PRODUCT_TABS = ["General", "NDIS", "Custom"] as const;
export type ProductTab = (typeof PRODUCT_TABS)[number];

/** Each tab searches different columns, so each says so. */
export const TAB_SEARCH_PLACEHOLDER: Record<ProductTab, string> = {
  General: "Search the general catalogue",
  NDIS: "Search by support item name or number",
  Custom: "Search your items",
};

/* ------------------------------------------------------------------ *
 * Filtering — a set per tab, because the rows aren't the same shape
 * ------------------------------------------------------------------ */

/**
 * The General catalogue's rows carry a tax rate as well as a type, a direction
 * and a unit — income lines get GST, expense lines are left unset because the
 * tax comes off the supplier's own invoice. So the same GST switch the Custom
 * tab has earns its place here too.
 */
export type GeneralFilters = {
  gstEnabled: boolean;
  type: "All" | ItemType;
  transactionType: "All" | ItemTransactionType;
  quantityType: "All" | QuantityType;
};

export const EMPTY_GENERAL_FILTERS: GeneralFilters = {
  gstEnabled: false,
  type: "All",
  transactionType: "All",
  quantityType: "All",
};

export function activeGeneralFilters(filters: GeneralFilters): number {
  return (
    (filters.gstEnabled ? 1 : 0) +
    (filters.type === "All" ? 0 : 1) +
    (filters.transactionType === "All" ? 0 : 1) +
    (filters.quantityType === "All" ? 0 : 1)
  );
}

export function filterGeneralCatalogue(
  entries: GeneralCatalogueEntry[],
  filters: GeneralFilters,
): GeneralCatalogueEntry[] {
  return entries.filter((entry) => {
    // `isTaxedRate` rather than a literal, so the one place that decides
    // what "carries GST" looks like stays in lib/product-tax.
    if (filters.gstEnabled && !isTaxedRate(entry.taxRate)) return false;
    if (filters.type !== "All" && entry.type !== filters.type) return false;
    if (
      filters.transactionType !== "All" &&
      entry.transactionType !== filters.transactionType
    ) {
      return false;
    }
    if (
      filters.quantityType !== "All" &&
      entry.quantityType !== filters.quantityType
    ) {
      return false;
    }
    return true;
  });
}

/**
 * The NDIS reference is organised by registration group and support category,
 * which is how a provider looks for anything in it — and neither exists on the
 * other two tabs.
 */
export type NdisFilters = {
  registrationGroup: string;
  supportCategory: string;
};

export const EMPTY_NDIS_FILTERS: NdisFilters = {
  registrationGroup: "All",
  supportCategory: "All",
};

export function activeNdisFilters(filters: NdisFilters): number {
  return (
    (filters.registrationGroup === "All" ? 0 : 1) +
    (filters.supportCategory === "All" ? 0 : 1)
  );
}

/** The groups and categories actually present, for the two selects. */
export function ndisFilterOptions(items: NdisSupportItem[]): {
  registrationGroups: string[];
  supportCategories: string[];
} {
  const groups = new Set<string>();
  const categories = new Set<string>();
  for (const item of items) {
    if (item.registrationGroupName) groups.add(item.registrationGroupName);
    if (item.supportCategoryNumber) categories.add(item.supportCategoryNumber);
  }
  return {
    registrationGroups: [...groups].sort(),
    supportCategories: [...categories].sort(),
  };
}

/* ------------------------------------------------------------------ *
 * Custom tab: filtering
 * ------------------------------------------------------------------ */

export type ProductFilters = {
  /** True shows only items that carry GST. */
  gstEnabled: boolean;
  transactionType: "All" | ItemTransactionType;
  quantityType: "All" | QuantityType;
};

export const EMPTY_PRODUCT_FILTERS: ProductFilters = {
  gstEnabled: false,
  transactionType: "All",
  quantityType: "All",
};

/** How many of the three are actually narrowing, for the Filter button's badge. */
export function activeProductFilters(filters: ProductFilters): number {
  return (
    (filters.gstEnabled ? 1 : 0) +
    (filters.transactionType === "All" ? 0 : 1) +
    (filters.quantityType === "All" ? 0 : 1)
  );
}

export function filterCustomProducts(
  items: InventoryItem[],
  query: string,
  filters: ProductFilters,
): InventoryItem[] {
  const needle = query.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.gstEnabled && !itemIncludesGst(item)) return false;
    if (
      filters.transactionType !== "All" &&
      item.transactionType !== filters.transactionType
    ) {
      return false;
    }
    if (
      filters.quantityType !== "All" &&
      item.quantityType !== filters.quantityType
    ) {
      return false;
    }
    if (!needle) return true;

    // Wider than Inventory's name-only search: a catalogue gets looked up by code.
    return [item.name, item.sku, item.saleDescription].some((field) =>
      field.toLowerCase().includes(needle),
    );
  });
}

export function customNarrowed(
  query: string,
  filters: ProductFilters,
): boolean {
  return !!query.trim() || activeProductFilters(filters) > 0;
}

/* ------------------------------------------------------------------ *
 * Pagination — shared by all three tabs
 * ------------------------------------------------------------------ */

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

/** Just the counters, for the pagination bar — it never touches the rows. */
export type PageInfo = {
  /** 1-based, clamped into range so a filter can't leave you on a dead page. */
  page: number;
  pageCount: number;
  total: number;
  /** 1-based inclusive bounds for the "1–10 of 42" label; both 0 when empty. */
  from: number;
  to: number;
};

export type Page<T> = PageInfo & { rows: T[] };

export function paginate<T>(
  rows: T[],
  page: number,
  pageSize: number,
): Page<T> {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;

  return {
    rows: rows.slice(start, start + pageSize),
    page: current,
    pageCount,
    total,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
  };
}

/* ------------------------------------------------------------------ *
 * Summary strips — a compact row of figures, not a wall of cards
 * ------------------------------------------------------------------ */

export type CatalogueStat = { label: string; value: string; hint?: string };

/**
 * `null` when there's nothing priced to average — the caller drops the stat
 * rather than printing a dash. "Average price —" is a figure that looks
 * broken rather than one that reads as "no prices yet", and the General
 * catalogue genuinely ships with every `selling_price` at 0.00, so that dash
 * was permanent rather than a passing empty state.
 */
function averagePrice(prices: string[]): string | null {
  const figures = prices
    .map((price) => Number.parseFloat(price))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (figures.length === 0) return null;
  const mean = figures.reduce((sum, value) => sum + value, 0) / figures.length;
  return invoiceMoney(mean);
}

/** Products vs services, written the way you'd say it. */
function typeSplit(types: ItemType[]): string {
  const products = types.filter((type) => type === "Product").length;
  return `${products} / ${types.length - products}`;
}

export function generalStats(
  entries: GeneralCatalogueEntry[],
): CatalogueStat[] {
  const average = averagePrice(entries.map((entry) => entry.salePrice));
  return [
    { label: "Suggested items", value: String(entries.length) },
    {
      label: "Products / services",
      value: typeSplit(entries.map((entry) => entry.type)),
    },
    // Only once something here actually carries a price. The hint is said out
    // loud, because an indicative figure shouldn't look authoritative.
    ...(average
      ? [{ label: "Average price", value: average, hint: "indicative" }]
      : []),
  ];
}

export function ndisStats(items: NdisSupportItem[]): CatalogueStat[] {
  const groups = new Set(items.map((item) => item.registrationGroupNumber));
  const categories = new Set(items.map((item) => item.supportCategoryNumber));
  return [
    { label: "Support items", value: String(items.length) },
    { label: "Registration groups", value: String(groups.size) },
    { label: "Support categories", value: String(categories.size) },
  ];
}

export function customStats(items: InventoryItem[]): CatalogueStat[] {
  const average = averagePrice(items.map((item) => item.salePrice));
  return [
    { label: "Total items", value: String(items.length) },
    {
      label: "Products / services",
      value: typeSplit(items.map((item) => item.type)),
    },
    // Same as General: an item with no price yet shouldn't drag the strip
    // down to a dash.
    ...(average
      ? [{ label: "Average sale price", value: average }]
      : []),
  ];
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export type ProductIssue = { key: string; message: string };

/**
 * Only the fields the dialog shows. Deliberately narrower than `itemIssues`: a
 * dialog that blocked submit on a stock error it can't display would strand the
 * user with no way to fix it.
 */
export function productIssues(draft: ItemDraft): ProductIssue[] {
  const issues: ProductIssue[] = [];

  if (draft.name.trim().length < 2) {
    issues.push({ key: "name", message: "Enter a name." });
  }
  if (!draft.quantityType) {
    issues.push({ key: "quantityType", message: "Select a quantity type." });
  }
  if (!draft.transactionType) {
    issues.push({
      key: "transactionType",
      message: "Choose a transaction type.",
    });
  }

  // Both prices are optional here, but neither may be nonsense.
  const cost = priceError(draft.costPrice);
  if (cost) issues.push({ key: "costPrice", message: cost });
  const sale = priceError(draft.salePrice);
  if (sale) issues.push({ key: "salePrice", message: sale });

  return issues;
}

/* ------------------------------------------------------------------ *
 * Drafts
 * ------------------------------------------------------------------ */

/**
 * A new custom item. Untracked on purpose — something added here isn't being
 * stock-counted until someone opts into that in Inventory, and `emptyItemDraft`
 * defaults to tracked with a blank opening stock, which this dialog has no field
 * to complete.
 */
export function emptyCustomItemDraft(
  industry: ItemDraft["industry"],
): ItemDraft {
  return {
    ...emptyItemDraft(),
    industry,
    tracked: false,
    openingStock: "",
    lowStockAlert: "",
  };
}

/**
 * A copy, ready to edit. The SKU is suffixed rather than reused — two entries
 * sharing a code is the thing a duplicate most easily gets wrong.
 */
export function duplicateItemDraft(item: InventoryItem): ItemDraft {
  const { id: _id, ...rest } = item;
  void _id;
  return {
    ...rest,
    name: `${item.name} (copy)`,
    sku: item.sku.trim() ? `${item.sku}-COPY` : "",
  };
}

/** A General row, ready to become the user's own item, in the business's tax words. */
export function draftFromCatalogueEntry(
  entry: GeneralCatalogueEntry,
  labels: ProductTaxLabels = DEFAULT_PRODUCT_TAX_LABELS,
): ItemDraft {
  return {
    ...emptyCustomItemDraft(entry.industry),
    name: entry.name,
    sku: entry.code,
    type: entry.type,
    transactionType: entry.transactionType,
    quantityType: entry.quantityType,
    salePrice: entry.salePrice === "0" ? "" : entry.salePrice,
    saleTax: taxRateOption(entry.taxRate, labels),
  };
}

/** An NDIS support item, ready to become the user's own item. */
export function draftFromSupportItem(
  item: NdisSupportItem,
  industry: ItemDraft["industry"],
  labels: ProductTaxLabels = DEFAULT_PRODUCT_TAX_LABELS,
): ItemDraft {
  const quantityType = quantityTypeFromPricingType(item.pricingType);
  return {
    ...emptyCustomItemDraft(industry),
    name: item.supportItemName,
    sku: item.supportItemNumber,
    type: typeFromQuantityLabel(quantityType),
    transactionType: "Income",
    quantityType,
    // NDIS supports are GST-free; the price comes from the current price guide.
    saleTax: labels.free,
  };
}

/* ------------------------------------------------------------------ *
 * Bulk import
 * ------------------------------------------------------------------ */

/** The columns the importer understands, and which of them must be present. */
export const PRODUCT_IMPORT_FIELDS = [
  { name: "Item name", desc: "What you're selling", required: true },
  { name: "Type", desc: "Product or Service", required: true },
  { name: "Quantity type", desc: "Items, Hours, Days or Km", required: true },
  { name: "Description", desc: "Shown on the invoice line", required: false },
  { name: "Cost price", desc: "Number, no currency symbol", required: false },
  {
    name: "Selling price",
    desc: "Number, no currency symbol",
    required: false,
  },
  { name: "GST", desc: "Yes or No", required: false },
  { name: "Track inventory", desc: "Yes or No", required: false },
  { name: "Inventory count", desc: "Whole number", required: false },
] as const;

export const PRODUCT_IMPORT_TEMPLATE_HEADERS = PRODUCT_IMPORT_FIELDS.map(
  (field) => field.name,
);

/** Quotes a field only when it needs it, per RFC 4180. */
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** A CSV the user can fill in — headers plus two illustrative rows. */
export function productImportTemplateCsv(): string {
  const rows = [
    [
      "Consulting hour",
      "Service",
      "Hours",
      "Consulting, billed hourly",
      "",
      "180",
      "Yes",
      "No",
      "",
    ],
    [
      "Timber panel — oak",
      "Product",
      "Items",
      "Oak panel 1200x600",
      "42",
      "89",
      "Yes",
      "Yes",
      "128",
    ],
  ];
  return [PRODUCT_IMPORT_TEMPLATE_HEADERS, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}

export type ParsedProductRow = {
  name: string;
  type: string;
  quantityType: string;
  description: string;
  costPrice: string;
  salePrice: string;
  gst: string;
  tracked: string;
  inventoryCount: string;
  /** Empty means the row will import. */
  issues: string[];
};

const YES = new Set(["yes", "y", "true", "1"]);

export function isYes(value: string): boolean {
  return YES.has(value.trim().toLowerCase());
}

/** Row-level problems, in the order the columns appear. */
export function productRowIssues(
  row: Omit<ParsedProductRow, "issues">,
): string[] {
  const issues: string[] = [];
  if (!row.name.trim()) issues.push("Item name is required");
  if (!["product", "service"].includes(row.type.trim().toLowerCase())) {
    issues.push("Type must be Product or Service");
  }
  if (
    !(["items", "hours", "days", "km"] as string[]).includes(
      row.quantityType.trim().toLowerCase(),
    )
  ) {
    issues.push("Quantity type must be Items, Hours, Days or Km");
  }
  if (priceError(row.costPrice)) issues.push("Cost price isn't a valid number");
  if (priceError(row.salePrice)) {
    issues.push("Selling price isn't a valid number");
  }
  return issues;
}

/**
 * Splits one CSV line, honouring quoted fields. Splitting on every comma looked
 * fine until a description contained one — which the template's own sample row
 * does — and every column after it shifted by one.
 */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        // A doubled quote is an escaped quote, not the end of the field.
        if (line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

/** Splits a CSV into rows, tolerating quoted fields and a trailing newline. */
export function parseProductsCsv(text: string): ParsedProductRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const cell = splitCsvLine;

  return lines.slice(1).map((line) => {
    const c = cell(line);
    const row = {
      name: c[0] ?? "",
      type: c[1] ?? "",
      quantityType: c[2] ?? "",
      description: c[3] ?? "",
      costPrice: c[4] ?? "",
      salePrice: c[5] ?? "",
      gst: c[6] ?? "",
      tracked: c[7] ?? "",
      inventoryCount: c[8] ?? "",
    };
    return { ...row, issues: productRowIssues(row) };
  });
}

/** Canonicalises a valid row into a draft the store will accept. */
export function draftFromImportRow(
  row: ParsedProductRow,
  industry: ItemDraft["industry"],
  labels: ProductTaxLabels = DEFAULT_PRODUCT_TAX_LABELS,
): ItemDraft {
  const titled = (value: string) =>
    value.trim().charAt(0).toUpperCase() + value.trim().slice(1).toLowerCase();
  const tracked = isYes(row.tracked);

  return {
    ...emptyCustomItemDraft(industry),
    name: row.name.trim(),
    type: titled(row.type) === "Service" ? "Service" : "Product",
    quantityType: titled(row.quantityType) as QuantityType,
    saleDescription: row.description.trim(),
    costPrice: row.costPrice.trim(),
    salePrice: row.salePrice.trim(),
    saleTax: withGst(isYes(row.gst), labels),
    tracked,
    // Inventory requires both figures once tracking is on.
    openingStock: tracked ? row.inventoryCount.trim() || "0" : "",
    lowStockAlert: tracked ? "5" : "",
  };
}
