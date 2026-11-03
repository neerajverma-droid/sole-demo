/**
 * Line-item lookup for the invoice and quote editors.
 *
 * Two dictionaries sit behind this, exactly as sole-webapp uses them:
 *
 * - NDIS documents query `/services/autocomplete` — the published NDIS support
 *   catalogue, whose rows carry a support item number and a price *guide*
 *   rather than a price, followed by the business's own saved products.
 * - Everything else queries `/services/all/autocomplete` — the general
 *   services dictionary, again followed by the business's own products.
 *
 * Both endpoints answer with a bare JSON array rather than the usual
 * `{ success, data }` envelope, so the unwrapping here is deliberate.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { toQtyType, type InvoiceLineItem } from "@/lib/invoices";

/** One row as either endpoint returns it — the union of both shapes. */
type ApiItemSuggestion = {
  /** General dictionary and own products. */
  item_name?: string;
  /** NDIS catalogue: the support's name, and its catalogue number. */
  support_item_name?: string;
  support_item_number?: string;
  description?: string;
  category?: string;
  /**
   * Guidance text, not a figure — the NDIS catalogue publishes price limits
   * per region, so a support row has this and no `price`.
   */
  price_tooltip?: string;
  price?: number | string;
  qty_type?: string;
  gst?: boolean;
  /** Only the business's own products carry one; dictionary rows don't. */
  product_id?: number | string | null;
  inventory_flag?: number;
  inventory_count?: number;
};

export type ItemSuggestion = {
  /** Stable within one result set — the endpoints return no ids for dictionary rows. */
  key: string;
  /** Goes into the line's description / support item name. */
  name: string;
  /** The secondary line in the dropdown: a support number, category or blurb. */
  detail: string;
  /** Empty for an NDIS catalogue row, which publishes limits rather than a price. */
  price: string;
  /** Absent when the row doesn't say — the caller then falls back to its own default. */
  gst?: boolean;
  qtyType?: string;
  supportItemNumber?: string;
  /** Set only for one of the business's own products, so the line can be linked to it. */
  productId?: string;
  /** The catalogue's price guidance, shown under the row so it isn't mistaken for a price. */
  priceHint?: string;
};

function suggestionPrice(raw: ApiItemSuggestion): string {
  if (raw.price == null || raw.price === "") return "";
  const value = typeof raw.price === "number" ? raw.price : Number(raw.price);
  return Number.isFinite(value) && value > 0 ? String(value) : "";
}

function mapSuggestion(
  raw: ApiItemSuggestion,
  index: number,
  ndis: boolean,
): ItemSuggestion {
  const name = ndis
    ? raw.support_item_name || raw.item_name || raw.description || ""
    : raw.item_name || raw.support_item_name || "";

  const supportItemNumber = raw.support_item_number?.trim() || undefined;
  const detail = supportItemNumber
    ? `Support item ${supportItemNumber}`
    : raw.description?.trim() || raw.category?.trim() || "";

  return {
    // The dictionary rows have no id at all and a business can legitimately
    // save a product under a name the dictionary already uses, so the index
    // is what's guaranteed unique inside one result set.
    key: `${index}-${supportItemNumber ?? ""}-${name}`,
    name,
    detail,
    price: suggestionPrice(raw),
    gst: typeof raw.gst === "boolean" ? raw.gst : undefined,
    qtyType: raw.qty_type?.trim() || undefined,
    supportItemNumber,
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    priceHint: raw.price_tooltip?.trim() || undefined,
  };
}

/**
 * Matches on whatever has been typed. An empty query is sent through rather
 * than short-circuited — the endpoints answer it with the business's own
 * products, which is exactly what a freshly opened dropdown should offer.
 */
export async function searchInvoiceItems(
  query: string,
  ndis: boolean,
): Promise<ItemSuggestion[]> {
  const url = ndis
    ? apiRoutes.services.autocomplete
    : apiRoutes.servicesAll.autocomplete;

  const response = await api.get<
    ApiItemSuggestion[] | { data?: ApiItemSuggestion[] }
  >(url, { params: { query, page: 1, limit: 10, txnType: "Credit" } });

  const body = response.data;
  const rows = Array.isArray(body) ? body : (body?.data ?? []);
  return rows
    .map((row, index) => mapSuggestion(row, index, ndis))
    .filter((suggestion) => suggestion.name.trim().length > 0);
}

/**
 * The expense form's own description autocomplete — same general dictionary
 * endpoint as `searchInvoiceItems(query, false)`, but scoped the way
 * sole-webapp's own Add Expense form scopes it (`category=Expense`,
 * `txnType=Debit`, rather than the invoice side's `Credit`).
 *
 * Deliberately reads `raw.price` (via `suggestionPrice`, shared with the
 * invoice lookup above) rather than the reference frontend's own
 * `unit_price`/`cost_price` pair — `unit_price` doesn't exist anywhere in
 * this endpoint's real response (dead code on their side), and `cost_price`
 * is a product's cost, not what it sells for; `price` is the one field
 * that's both real and correct here.
 */
export async function searchExpenseDescriptions(
  query: string,
): Promise<ItemSuggestion[]> {
  const response = await api.get<
    ApiItemSuggestion[] | { data?: ApiItemSuggestion[] }
  >(apiRoutes.servicesAll.autocomplete, {
    params: { query, category: "Expense", txnType: "Debit" },
  });

  const body = response.data;
  const rows = Array.isArray(body) ? body : (body?.data ?? []);
  return rows
    .map((row, index) => mapSuggestion(row, index, false))
    .filter((suggestion) => suggestion.name.trim().length > 0);
}

/**
 * The patch a picked suggestion makes to a line.
 *
 * Two rules worth stating, both taken from the reference product:
 *
 * - NDIS supports are GST-free regardless of what the row says, since the
 *   dictionary is shared with general products that are not.
 * - The quantity is defaulted to 1 if the line hasn't got one yet, because a
 *   filled-in price with no quantity bills nothing and reads as broken.
 *
 * Claim type and the service date are deliberately left alone: they describe
 * how *this* support was delivered, which no catalogue row can know.
 */
export function lineItemPatchFromSuggestion(
  suggestion: ItemSuggestion,
  item: InvoiceLineItem,
  options: { ndis: boolean; gstDefault: boolean },
): Partial<InvoiceLineItem> {
  const quantity = Number.parseFloat(item.quantity);
  const hasQuantity = Number.isFinite(quantity) && quantity > 0;

  return {
    description: suggestion.name,
    price: suggestion.price || item.price,
    quantity: hasQuantity ? item.quantity : "1",
    qtyType: toQtyType(suggestion.qtyType ?? item.qtyType),
    gst: options.ndis ? false : (suggestion.gst ?? options.gstDefault),
    productId: suggestion.productId,
    priceHint: suggestion.priceHint,
    ...(options.ndis && suggestion.supportItemNumber
      ? { supportItemNumber: suggestion.supportItemNumber }
      : {}),
  };
}
