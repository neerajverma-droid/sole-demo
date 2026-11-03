/**
 * Inventory domain. Services carry no stock, so stock state is derived rather
 * than stored — an item is only ever "Low stock" relative to its own alert.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { invoiceMoney } from "@/lib/invoices";
import { UNSPECIFIED_INDUSTRY } from "@/lib/onboarding";
import {
  DEFAULT_PRODUCT_TAX_LABELS,
  LEGACY_TAXED_RATE,
  NO_TAX_RATE,
  isTaxFreeRate,
  isTaxedRate,
  type ProductTaxLabels,
} from "@/lib/product-tax";
import {
  INCOME_ACCOUNTS,
  type IncomeAccount,
} from "@/lib/settings";

export const INVENTORY_FILTERS = [
  "All",
  "In Stock",
  "Low Stock",
  "Out of Stock",
] as const;
export type InventoryFilter = (typeof INVENTORY_FILTERS)[number];

export const ITEM_TYPES = ["Product", "Service"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/** How the thing is counted. Was "unit" — renamed to match the real platform. */
export const QUANTITY_TYPES = ["Items", "Hours", "Days", "Km"] as const;
export type QuantityType = (typeof QUANTITY_TYPES)[number];

/** Whether selling this brings money in or sends it out. */
export const ITEM_TRANSACTION_TYPES = ["Income", "Expense"] as const;
export type ItemTransactionType = (typeof ITEM_TRANSACTION_TYPES)[number];

/**
 * A tax select's label, as stored — the options themselves come from the
 * business's country (`taxRateOptions` in lib/product-tax), so this is any
 * label that country, or an older row, ever used.
 */
export type TaxRate = string;

/**
 * The only asset account a tracked item can ever post to — sole-webapp's own
 * form shows this as a disabled field for the same reason: there's no other
 * account to choose, so there's nothing to pick.
 */
export type AssetCategory = "Inventory";

/**
 * Where a sale of this item posts. Defined in lib/settings so an item and the
 * sales-wide default share one list, and re-exported here for the item form.
 * Kept separate from `assetCategory`, which is an asset and cost list — posting
 * sales revenue to "Cost of goods sold" would be wrong.
 */
export { INCOME_ACCOUNTS, type IncomeAccount };

/** Stock state, derived from the item's own low-stock threshold. */
export type StockStatus = "In stock" | "Low stock" | "Out of stock" | "Service";

export type InventoryItem = {
  id: string;
  name: string;
  sku: string;
  type: ItemType;
  /** Blank until chosen, which is what makes it a required field. */
  quantityType: QuantityType | "";
  transactionType: ItemTransactionType;
  /** Which industry's catalogue this belongs to. */
  /**
   * The profile's industry, which can be one the platform ships or one someone
   * typed on the profile step — so a string, not the preset union.
   */
  industry: string;
  /** Numeric fields hold typed text so an invalid value can be shown. */
  costPrice: string;
  salePrice: string;
  purchaseTax: TaxRate;
  saleTax: TaxRate;
  assetCategory: AssetCategory;
  /** Sales-facing: the revenue account a sale of this item posts to. */
  incomeAccount: IncomeAccount;
  purchaseDescription: string;
  saleDescription: string;
  /** Services and untracked products have no stock figures. */
  tracked: boolean;
  openingStock: string;
  lowStockAlert: string;
};

export type ItemDraft = Omit<InventoryItem, "id">;

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function stockStatus(item: InventoryItem): StockStatus {
  if (!item.tracked || item.type === "Service") return "Service";
  const stock = toNumber(item.openingStock);
  if (stock <= 0) return "Out of stock";
  return stock <= toNumber(item.lowStockAlert) ? "Low stock" : "In stock";
}

export function stockStatusVariant(
  status: StockStatus,
): "success" | "warning" | "danger" | "secondary" {
  if (status === "In stock") return "success";
  if (status === "Low stock") return "warning";
  if (status === "Out of stock") return "danger";
  return "secondary";
}

/** What the Stock column shows — services have no number to show. */
export function stockLabel(item: InventoryItem): string {
  const status = stockStatus(item);
  if (status === "Service") return "—";
  return `${toNumber(item.openingStock)} ${item.quantityType || ""}`.trim();
}

export function itemInitials(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
  return initials.toUpperCase() || "?";
}

/* ------------------------------------------------------------------ *
 * Margin
 * ------------------------------------------------------------------ */

/** Per-unit margin, once both prices are valid and non-zero. */
export function marginPerUnit(
  costPrice: string,
  salePrice: string,
): { amount: string; percent: number } | null {
  const cost = toNumber(costPrice);
  const sale = toNumber(salePrice);
  if (sale <= 0 || cost <= 0) return null;
  return {
    amount: invoiceMoney(sale - cost),
    percent: Math.round(((sale - cost) / sale) * 100),
  };
}

/** The Custom tab's GST column and the dialog's toggle both read this. */
export function itemIncludesGst(item: Pick<InventoryItem, "saleTax">): boolean {
  return isTaxedRate(item.saleTax);
}

/** Keeps GST as one value rather than adding a boolean beside the tax rate. */
export function withGst(
  includes: boolean,
  labels: ProductTaxLabels = DEFAULT_PRODUCT_TAX_LABELS,
): TaxRate {
  return includes ? labels.taxed : labels.free;
}

export function formatItemPrice(value: string): string {
  const parsed = toNumber(value);
  return parsed > 0 ? invoiceMoney(parsed) : "—";
}

/* ------------------------------------------------------------------ *
 * Derived summary
 * ------------------------------------------------------------------ */

export function inventorySummary(items: InventoryItem[]) {
  const counts = items.reduce(
    (acc, item) => {
      const status = stockStatus(item);
      if (status === "In stock") acc.inStock += 1;
      if (status === "Low stock") acc.lowStock += 1;
      if (status === "Out of stock") acc.outOfStock += 1;
      return acc;
    },
    { inStock: 0, lowStock: 0, outOfStock: 0 },
  );

  return { total: items.length, ...counts };
}

export function filterItems(
  items: InventoryItem[],
  filter: InventoryFilter,
  query: string,
): InventoryItem[] {
  const needle = query.trim().toLowerCase();

  return items.filter((item) => {
    const status = stockStatus(item);
    const matchesFilter =
      filter === "All" ||
      (filter === "In Stock" &&
        (status === "In stock" || status === "Service")) ||
      (filter === "Low Stock" && status === "Low stock") ||
      (filter === "Out of Stock" && status === "Out of stock");

    if (!matchesFilter) return false;
    // Search matches the item name only, per the handoff.
    return !needle || item.name.toLowerCase().includes(needle);
  });
}

/* ------------------------------------------------------------------ *
 * Validation — live inline errors, keystrokes never blocked
 * ------------------------------------------------------------------ */

export function priceError(value: string): string | undefined {
  if (!value.trim()) return undefined;
  return /^\d+(\.\d{1,2})?$/.test(value.trim())
    ? undefined
    : "Enter a valid price — no letters or negatives.";
}

export function wholeNumberError(value: string): string | undefined {
  if (!value.trim()) return undefined;
  return /^\d+$/.test(value.trim())
    ? undefined
    : "Enter a whole number (0 or more).";
}

export type ItemIssue = { key: string; message: string };

/** Required-field issues in on-screen order. */
export function itemIssues(draft: ItemDraft): ItemIssue[] {
  const issues: ItemIssue[] = [];

  if (draft.name.trim().length < 2) {
    issues.push({ key: "name", message: "Enter an item name." });
  }
  if (!draft.quantityType) {
    issues.push({ key: "quantityType", message: "Select a quantity type." });
  }

  // Neither price is required — sole-webapp's own schema only checks these
  // are valid, non-negative numbers if one is entered at all.
  const sale = priceError(draft.salePrice);
  if (sale) issues.push({ key: "salePrice", message: sale });

  const cost = priceError(draft.costPrice);
  if (cost) issues.push({ key: "costPrice", message: cost });

  if (draft.tracked) {
    const stock = wholeNumberError(draft.openingStock);
    if (stock || !draft.openingStock.trim()) {
      issues.push({
        key: "openingStock",
        message: stock ?? "Enter an opening stock figure.",
      });
    }
    const low = wholeNumberError(draft.lowStockAlert);
    if (low || !draft.lowStockAlert.trim()) {
      issues.push({
        key: "lowStockAlert",
        message: low ?? "Enter a low stock alert level.",
      });
    }
  }

  return issues;
}

export function emptyItemDraft(): ItemDraft {
  return {
    name: "",
    sku: "",
    type: "Product",
    quantityType: "",
    transactionType: "Income",
    industry: UNSPECIFIED_INDUSTRY,
    costPrice: "",
    salePrice: "",
    purchaseTax: NO_TAX_RATE,
    saleTax: NO_TAX_RATE,
    assetCategory: "Inventory",
    incomeAccount: "Sales income",
    purchaseDescription: "",
    saleDescription: "",
    tracked: true,
    openingStock: "",
    lowStockAlert: "5",
  };
}

export function draftFromItem(item: InventoryItem): ItemDraft {
  const { id: _id, ...draft } = item;
  void _id;
  return { ...draft };
}

/* ------------------------------------------------------------------ *
 * Backend wiring — sole-ocr's /custom-product resource
 *
 * There's no separate "inventory" table: a custom item, a tracked stock item
 * and a service are all the same `custom_product_service` row, told apart by
 * a couple of flags. The mapping below is what that row can actually carry —
 * a few things this form has (asset account, income account, the fine-grained
 * industry picker) have no column to round-trip through yet, so they're left
 * at their form defaults on read rather than invented from nothing.
 * ------------------------------------------------------------------ */

/** The wire vocabulary custom_product_service and services_all both share. */
export type ApiQtyType = "items" | "hours" | "days" | "km";
export type ApiTxnType = "Credit" | "Debit";

type ApiCustomProduct = {
  id: number | string;
  item_name: string;
  sku: string | null;
  txn_type: ApiTxnType;
  qty_type: ApiQtyType;
  cost_price: number | string | null;
  selling_price: number | string | null;
  purchase_tax_rate: string | null;
  sale_tax_rate: string | null;
  purchase_description: string | null;
  sale_description: string | null;
  inventory_flag: number | boolean | null;
  inventory_count: number | null;
  low_stock_threshold: number | null;
  gst: number | boolean | null;
  industry?: { id: number | string; name: string } | null;
};

/**
 * The backend has no Product/Service column — every custom item is told apart
 * only by its unit. "Items" is the one unit a service can't bill in, so that's
 * the split: every seed/sample row this app ships already pairs the two the
 * same way (a service is always Hours/Days/Km, a product is always Items).
 */
function typeFromQtyType(qtyType: ApiCustomProduct["qty_type"]): ItemType {
  return qtyType === "items" ? "Product" : "Service";
}

/**
 * Same split as `typeFromQtyType`, off the form's own quantity-type label
 * rather than the backend's raw string — what the (read-only) "Type" field
 * shows while an item is being created or edited, before it's ever saved.
 */
export function typeFromQuantityLabel(
  quantityType: QuantityType | "",
): ItemType {
  return quantityType === "Items" || quantityType === ""
    ? "Product"
    : "Service";
}

/** Shared with general-catalogue.ts — services_all uses the same qty_type vocabulary. */
export const QTY_TYPE_TO_LABEL: Record<ApiQtyType, QuantityType> = {
  items: "Items",
  hours: "Hours",
  days: "Days",
  km: "Km",
};

const LABEL_TO_QTY_TYPE: Record<
  Exclude<QuantityType, "">,
  ApiCustomProduct["qty_type"]
> = {
  Items: "items",
  Hours: "hours",
  Days: "days",
  Km: "km",
};

/**
 * Credit is money coming in, Debit is money going out — Income/Expense by
 * another name. Shared with general-catalogue.ts — services_all's txn_type
 * is the same Credit/Debit vocabulary.
 */
export function transactionTypeFromTxnType(
  txnType: ApiTxnType,
): ItemTransactionType {
  return txnType === "Debit" ? "Expense" : "Income";
}

function txnTypeFromTransactionType(
  transactionType: ItemTransactionType,
): ApiCustomProduct["txn_type"] {
  return transactionType === "Expense" ? "Debit" : "Credit";
}

/**
 * A stored label this app could have written — none, taxed or tax-free, from
 * any country — is a round trip; anything else falls back to the gst flag.
 * `flagDecides` is for the sale rate, which the flag is sent alongside: when
 * the two disagree, the flag wins.
 */
function taxRateFromApi(
  rate: string | null | undefined,
  gst: boolean | null,
  flagDecides = false,
): TaxRate {
  const stored = rate?.trim() ?? "";
  const taxed = isTaxedRate(stored);
  const known = stored === NO_TAX_RATE || taxed || isTaxFreeRate(stored);
  if (known && !(flagDecides && gst !== null && taxed !== gst)) return stored;
  return gst ? LEGACY_TAXED_RATE : NO_TAX_RATE;
}

/** Shared with general-catalogue.ts — both tables store price as a nullable decimal. */
export function priceFromApi(value: number | string | null): string {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : "";
}

/** A backend row, as the `InventoryItem` every screen in this module reads. */
function mapApiProductToItem(raw: ApiCustomProduct): InventoryItem {
  const gst = raw.gst == null ? null : Boolean(Number(raw.gst));
  const tracked = Boolean(Number(raw.inventory_flag));
  return {
    id: String(raw.id),
    name: raw.item_name ?? "",
    sku: raw.sku ?? "",
    type: typeFromQtyType(raw.qty_type),
    quantityType: QTY_TYPE_TO_LABEL[raw.qty_type] ?? "",
    transactionType: transactionTypeFromTxnType(raw.txn_type),
    industry: raw.industry?.name ?? UNSPECIFIED_INDUSTRY,
    costPrice: priceFromApi(raw.cost_price),
    salePrice: priceFromApi(raw.selling_price),
    purchaseTax: taxRateFromApi(raw.purchase_tax_rate, gst),
    saleTax: taxRateFromApi(raw.sale_tax_rate, gst, true),
    assetCategory: "Inventory",
    incomeAccount: "Sales income",
    purchaseDescription: raw.purchase_description ?? "",
    saleDescription: raw.sale_description ?? "",
    tracked,
    openingStock: tracked ? String(Number(raw.inventory_count) || 0) : "",
    lowStockAlert: tracked ? String(Number(raw.low_stock_threshold) || 5) : "",
  };
}

/**
 * What `POST /custom-product` and `PATCH /custom-product/:id` accept, built
 * from this form's draft.
 *
 * `is_inventory` and `inventory_flag` are two independent flags server-side
 * (one marks a row as an inventory item, the other turns stock counting on)
 * but this form only ever has the one "I track this item" checkbox, so both
 * move together — there's no UI for the row where they'd disagree.
 *
 * No `industry_id`: this form has no industry picker to source one from.
 *
 * `purchase_account_id`/`sale_account_id` — resolved below, not chosen here —
 * are the one exception: a tracked item always posts to the same "Assets →
 * Inventory" account, the same account sole-webapp's own Inventory form
 * silently attaches without ever offering a choice, so there's nothing this
 * form needs a picker for either.
 */
async function draftToApiPayload(
  draft: ItemDraft,
): Promise<Record<string, unknown>> {
  const tracked = draft.tracked;
  const inventoryAccountId = tracked ? await resolveInventoryAccountId() : null;
  return {
    item_name: draft.name.trim(),
    sku: draft.sku.trim() || null,
    txn_type: txnTypeFromTransactionType(draft.transactionType),
    qty_type: draft.quantityType
      ? LABEL_TO_QTY_TYPE[draft.quantityType]
      : "items",
    cost_price: toNumber(draft.costPrice),
    selling_price: toNumber(draft.salePrice),
    purchase_tax_rate: draft.purchaseTax,
    sale_tax_rate: draft.saleTax,
    purchase_description: draft.purchaseDescription,
    sale_description: draft.saleDescription,
    gst: itemIncludesGst({ saleTax: draft.saleTax }) ? 1 : 0,
    inventory_flag: tracked ? 1 : 0,
    is_inventory: tracked ? 1 : 0,
    inventory_count: tracked ? toNumber(draft.openingStock || "0") : 0,
    low_stock_threshold: tracked ? toNumber(draft.lowStockAlert || "5") : 5,
    ...(inventoryAccountId
      ? {
          purchase_account_id: inventoryAccountId,
          sale_account_id: inventoryAccountId,
        }
      : {}),
  };
}

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

type ApiAccountSubcategory = {
  account_subcategory_id: number;
  name: string;
};

type ApiAccountCategory = {
  account_category_id: number;
  name: string;
  account_subcategories?: ApiAccountSubcategory[];
};

/**
 * Resolved once per page load and cached — the chart of accounts is fixed
 * platform data, not something that changes mid-session, so there's no
 * reason to look it up again on every save. `null` means either the lookup
 * failed or the account genuinely doesn't exist; either way the item still
 * saves fine without it, just without the asset-account link.
 */
let cachedInventoryAccountId: number | null | undefined;

/**
 * The one account subcategory a tracked item's cost posts to — same lookup
 * sole-webapp's Inventory form does (fetch the chart of accounts, find
 * "Assets → Inventory"), since that's the only account an inventory item is
 * ever meant to use, not a real per-item choice.
 *
 * Exported: a tracked (Inventory-category) asset posts to this same account,
 * so `lib/assets.ts` reuses this lookup rather than resolving it twice.
 */
export async function resolveInventoryAccountId(): Promise<number | null> {
  if (cachedInventoryAccountId !== undefined) return cachedInventoryAccountId;
  try {
    const response = await api.get<
      ApiEnvelope<{ account_categories: ApiAccountCategory[] }>
    >(apiRoutes.accountCategory.list);
    const categories = response.data?.data?.account_categories ?? [];
    const assets = categories.find((c) => c.name?.toLowerCase() === "assets");
    const inventory = assets?.account_subcategories?.find(
      (s) => s.name?.toLowerCase() === "inventory",
    );
    cachedInventoryAccountId = inventory?.account_subcategory_id ?? null;
  } catch {
    cachedInventoryAccountId = null;
  }
  return cachedInventoryAccountId;
}

/**
 * Large enough to cover the accounts this screen actually sees without a real
 * "load more" — the table below has no pagination controls of its own yet, so
 * a page-sized fetch would silently hide everything past the first page.
 */
const FETCH_ALL_LIMIT = 500;

/**
 * Every custom product/service on the account — Inventory and the Products &
 * Services "Custom" tab are both just filtered views over this one list, same
 * as the mock store they replace.
 */
export async function fetchInventoryItems(): Promise<InventoryItem[]> {
  const response = await api.get<ApiEnvelope<ApiCustomProduct[]>>(
    apiRoutes.customProduct.list,
    { params: { limit: FETCH_ALL_LIMIT } },
  );
  const raw = response.data?.data ?? [];
  return raw.map(mapApiProductToItem);
}

export async function createInventoryItemApi(
  draft: ItemDraft,
): Promise<InventoryItem> {
  const response = await api.post<ApiEnvelope<ApiCustomProduct>>(
    apiRoutes.customProduct.create,
    await draftToApiPayload(draft),
  );
  if (!response.data?.success || !response.data.data) {
    throw new Error(response.data?.message || "Failed to create item");
  }
  track(EVENTS.INVENTORY_ITEM_CREATED);
  return mapApiProductToItem(response.data.data);
}

export async function updateInventoryItemApi(
  id: string,
  draft: ItemDraft,
): Promise<InventoryItem> {
  const response = await api.patch<ApiEnvelope<ApiCustomProduct>>(
    `${apiRoutes.customProduct.update}/${id}`,
    await draftToApiPayload(draft),
  );
  if (!response.data?.success || !response.data.data) {
    throw new Error(response.data?.message || "Failed to update item");
  }
  return mapApiProductToItem(response.data.data);
}

export async function deleteInventoryItemApi(id: string): Promise<void> {
  const response = await api.delete<{ success: boolean; message?: string }>(
    `${apiRoutes.customProduct.delete}/${id}`,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to delete item");
  }
}

export type StockAdjustReason =
  "opening" | "received" | "damaged" | "returned" | "correction" | "other";

/**
 * The reasons a person can actually pick when adjusting stock by hand —
 * "opening" is excluded on purpose, same as sole-webapp's own adjust form:
 * it's the system's own label for the count a tracked item started with,
 * set once on create/enable, never something a person chooses afterwards.
 */
export const ADJUST_REASONS: {
  value: Exclude<StockAdjustReason, "opening">;
  label: string;
}[] = [
  { value: "received", label: "Received stock" },
  { value: "damaged", label: "Damaged / lost" },
  { value: "returned", label: "Customer return" },
  { value: "correction", label: "Stock correction" },
  { value: "other", label: "Other" },
];

const REASON_LABELS: Record<StockAdjustReason, string> = {
  opening: "Opening stock",
  received: "Received stock",
  damaged: "Damaged / lost",
  returned: "Customer return",
  correction: "Stock correction",
  other: "Other",
};

/** A history row's reason, in words — falls back to the raw value for anything unrecognised. */
export function stockAdjustReasonLabel(reason: string): string {
  return REASON_LABELS[reason as StockAdjustReason] ?? reason;
}

/**
 * Adjusts stock by a signed delta, the only thing the backend's ledger
 * accepts — a positive delta is stock in, negative is stock out. `unitCost`
 * only ever affects anything when the delta is positive — a decrement never
 * recalculates the weighted-average cost, no matter what's passed here.
 */
export async function adjustStockApi(
  id: string,
  quantityChange: number,
  reason: StockAdjustReason,
  options: { unitCost?: number; note?: string } = {},
): Promise<{ newCount: number; newCostPrice?: number }> {
  const response = await api.post<
    ApiEnvelope<{ new_count: number; new_cost_price?: number }>
  >(apiRoutes.customProduct.adjust(id), {
    quantity: quantityChange,
    reason,
    ...(options.unitCost !== undefined ? { unit_cost: options.unitCost } : {}),
    ...(options.note?.trim() ? { note: options.note.trim() } : {}),
  });
  if (!response.data?.success || !response.data.data) {
    throw new Error(response.data?.message || "Failed to adjust stock");
  }
  return {
    newCount: response.data.data.new_count,
    newCostPrice: response.data.data.new_cost_price,
  };
}

/* ------------------------------------------------------------------ *
 * Adjustment history — GET /custom-product/:id/history
 * ------------------------------------------------------------------ */

export type InventoryAdjustmentEntry = {
  id: string;
  /** Signed: positive is stock in, negative is stock out. */
  quantity: number;
  reason: StockAdjustReason;
  unitCost: number | null;
  note: string | null;
  balanceAfter: number;
  createdAt: string;
};

type ApiInventoryAdjustment = {
  id: number | string;
  quantity: number;
  reason: string;
  unit_cost: number | string | null;
  note: string | null;
  balance_after: number;
  created_at: string;
};

type ApiHistoryEnvelope = {
  success: boolean;
  message?: string;
  data?: {
    product: { id: number | string; item_name: string; current_stock: number };
    adjustments: ApiInventoryAdjustment[];
  };
  pagination?: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
};

function mapApiAdjustment(
  raw: ApiInventoryAdjustment,
): InventoryAdjustmentEntry {
  const unitCost =
    raw.unit_cost === null || raw.unit_cost === undefined
      ? null
      : Number(raw.unit_cost);
  return {
    id: String(raw.id),
    quantity: Number(raw.quantity),
    reason: (raw.reason as StockAdjustReason) ?? "other",
    unitCost: unitCost !== null && Number.isFinite(unitCost) ? unitCost : null,
    note: raw.note ?? null,
    balanceAfter: Number(raw.balance_after),
    createdAt: raw.created_at,
  };
}

/** The most recent adjustments for one item, newest first — what the expanded row shows. */
export async function fetchInventoryHistory(
  id: string,
  options: { page?: number; limit?: number } = {},
): Promise<{
  adjustments: InventoryAdjustmentEntry[];
  total: number;
  totalPages: number;
}> {
  const response = await api.get<ApiHistoryEnvelope>(
    apiRoutes.customProduct.history(id),
    { params: { page: options.page ?? 1, limit: options.limit ?? 5 } },
  );
  if (!response.data?.success || !response.data.data) {
    throw new Error(response.data?.message || "Failed to load stock history");
  }
  return {
    adjustments: response.data.data.adjustments.map(mapApiAdjustment),
    total:
      response.data.pagination?.total ?? response.data.data.adjustments.length,
    totalPages: response.data.pagination?.total_pages ?? 1,
  };
}
