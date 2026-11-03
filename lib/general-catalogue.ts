/**
 * The General catalogue — GET /custom-product?active_tab=general, sole-ocr's
 * `services_all` table. A read-only starter list of the things a business in
 * the active business's industry typically bills for; the backend resolves
 * which industry from the business itself (not the user), so nothing here
 * needs to pass one in.
 *
 * Like NDIS this is reference data, not logic — swap `fetchGeneralCatalogue`
 * and nothing else needs to change. `services_all` has no per-industry
 * fallback of its own; an industry with nothing seeded for it just comes back
 * empty, which the screen already renders as an empty state.
 *
 * The prices are INDICATIVE starting points, not advice — see the note on
 * `salePrice` below. Nothing bills from them until the user has edited and
 * saved their own copy via "Add to my catalogue".
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import {
  priceFromApi,
  QTY_TYPE_TO_LABEL,
  transactionTypeFromTxnType,
  withGst,
  type ApiQtyType,
  type ApiTxnType,
  type ItemTransactionType,
  type ItemType,
  type QuantityType,
  type TaxRate,
} from "@/lib/inventory";

export type GeneralCatalogueEntry = {
  /** A readable, stable-per-fetch code — a display convenience, not a
   * registered SKU. services_all has no code/sku column of its own. */
  code: string;
  name: string;
  /** The active business's industry, as resolved server-side. */
  industry: string;
  type: ItemType;
  transactionType: ItemTransactionType;
  quantityType: QuantityType;
  /** Indicative, as stored — see the module note above. */
  salePrice: string;
  taxRate: TaxRate;
};

/** Three letters of the industry, so codes from different lists can't collide. */
function industryPrefix(industry: string): string {
  const words = industry
    .replace(/[^A-Za-z ]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const source =
    words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "GEN");
  return source.slice(0, 3).toUpperCase();
}

/** A readable, stable code — a suggestion, not a registered SKU. */
export function catalogueCode(
  industry: string,
  name: string,
  index: number,
): string {
  const stem = (name.match(/[A-Za-z]+/)?.[0] ?? "ITEM")
    .slice(0, 3)
    .toUpperCase();
  return `${industryPrefix(industry)}-${stem}${String(index + 1).padStart(2, "0")}`;
}

type ApiGeneralCatalogueEntry = {
  id: number | string;
  item_name: string;
  txn_type: ApiTxnType;
  type: ItemType | null;
  qty_type: ApiQtyType;
  gst: number | boolean | null;
  selling_price: number | string | null;
  industry?: { id: number | string; name: string } | null;
};

/**
 * `type` is a real column here (unlike custom_product_service, which derives
 * it from qty_type) — services_all's General rows include physical products
 * (retail stock, materials) alongside services, and qty_type alone can't
 * reliably tell those apart the way it can for a single user's own catalogue.
 * The `?? "Service"` is only a guard against a row nobody's backfilled yet.
 */
function mapApiGeneralEntry(
  raw: ApiGeneralCatalogueEntry,
  index: number,
): GeneralCatalogueEntry {
  const industry = raw.industry?.name ?? "General";
  return {
    code: catalogueCode(industry, raw.item_name, index),
    name: raw.item_name,
    industry,
    type: raw.type ?? "Service",
    transactionType: transactionTypeFromTxnType(raw.txn_type),
    quantityType: QTY_TYPE_TO_LABEL[raw.qty_type],
    salePrice: priceFromApi(raw.selling_price),
    // In the fallback (Australian) words — screens show it through
    // `taxRateOption`, so a business elsewhere sees its own.
    taxRate: withGst(Boolean(Number(raw.gst))),
  };
}

/**
 * Large enough to cover the whole catalogue in one request — this is a small,
 * hand-curated reference list (currently 76 rows across every industry, so
 * far fewer once scoped to just the active business's own), not something
 * that needs real pagination.
 */
const FETCH_ALL_LIMIT = 500;

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

/** The General catalogue for the active business's own industry. */
export async function fetchGeneralCatalogue(): Promise<GeneralCatalogueEntry[]> {
  const response = await api.get<ApiEnvelope<ApiGeneralCatalogueEntry[]>>(
    apiRoutes.customProduct.list,
    { params: { active_tab: "general", limit: FETCH_ALL_LIMIT } },
  );
  const raw = response.data?.data ?? [];
  return raw.map(mapApiGeneralEntry);
}

/** Matches the name or the suggested code. */
export function searchGeneralCatalogue(
  query: string,
  entries: GeneralCatalogueEntry[],
): GeneralCatalogueEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries;
  return entries.filter(
    (entry) =>
      entry.name.toLowerCase().includes(needle) ||
      entry.code.toLowerCase().includes(needle),
  );
}
