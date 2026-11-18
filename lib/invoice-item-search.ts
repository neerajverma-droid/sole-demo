/**
 * Line-item lookup for the invoice and quote editors.
 *
 * Two dictionaries sit behind this, exactly as sole-webapp uses them:
 *
 * - NDIS documents query `/services/autocomplete` — the published NDIS support
 *   catalogue, whose rows carry a support item number, a unit and the Pricing
 *   Schedule's National / Remote / Very Remote prices, followed by the
 *   business's own NDIS products. The general dictionary and the business's
 *   general products are never offered there.
 * - Everything else queries `/services/all/autocomplete` — the general
 *   services dictionary, again followed by the business's own products.
 *
 * Both endpoints answer with a bare JSON array rather than the usual
 * `{ success, data }` envelope, so the unwrapping here is deliberate.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import {
  claimTypeFromCatalogue,
  toQtyType,
  type InvoiceLineItem,
  type NdisClaimType,
  type NdisPriceOptions,
} from "@/lib/invoices";

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
  /**
   * NDIS catalogue only — the Pricing Schedule's three published prices.
   * Null where the schedule gives none (quotable or unpriced supports).
   */
  price_national?: number | string | null;
  price_remote?: number | string | null;
  price_very_remote?: number | string | null;
  /** NDIS catalogue only — the schedule it comes from, e.g. `2026-27`. */
  price_schedule?: string | null;
  /** NDIS catalogue only — the last part of the support's name, e.g. `Cancellation`. */
  claim_type?: string | null;
  /** NDIS catalogue only — a legacy item can be claimed until this date (`YYYY-MM-DD`). */
  is_legacy?: boolean;
  end_date?: string | null;
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
  /**
   * What the line is priced at when picked. For an NDIS catalogue row that is the
   * schedule's National price; empty when the schedule publishes none.
   */
  price: string;
  /** Absent when the row doesn't say — the caller then falls back to its own default. */
  gst?: boolean;
  qtyType?: string;
  supportItemNumber?: string;
  /** NDIS catalogue only — "Legacy, until 31 Dec 2026" for an item on its way out. */
  legacyNote?: string;
  /** Set only for one of the business's own products, so the line can be linked to it. */
  productId?: string;
  /** The catalogue's price guidance, shown under the row so it isn't mistaken for a price. */
  priceHint?: string;
  /** NDIS catalogue only — the three published prices, for the Price tier dropdown. */
  priceOptions?: NdisPriceOptions;
  /** NDIS catalogue only — the schedule the prices come from, e.g. `2026-27`. */
  priceSchedule?: string;
  /** NDIS catalogue only — the claim type this support stands for, when its name says one. */
  claimType?: NdisClaimType;
};

/** A published price as the form's text, or undefined when the schedule gives none. */
function publishedPrice(value: number | string | null | undefined) {
  if (value == null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : undefined;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * `2027-06-30` → "30 Jun 2027". Built from the parts rather than through Intl,
 * so no timezone can shift the day and no locale can respell the month.
 */
function formatEndDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day || month > 12) return iso;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

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
  // A legacy support can still be claimed until its end date — say so in the
  // dropdown, so it isn't taken for a current one.
  const legacy =
    ndis && raw.is_legacy && raw.end_date
      ? `Legacy, until ${formatEndDate(raw.end_date)}`
      : undefined;
  const detail = supportItemNumber
    ? `Support item ${supportItemNumber}${legacy ? ` · ${legacy}` : ""}`
    : raw.description?.trim() || raw.category?.trim() || "";

  // The schedule's three prices — NDIS catalogue rows only. Each is optional: a
  // quotable support publishes none.
  const published: NdisPriceOptions | undefined = ndis
    ? {
        national: publishedPrice(raw.price_national),
        remote: publishedPrice(raw.price_remote),
        veryRemote: publishedPrice(raw.price_very_remote),
      }
    : undefined;
  const hasPublished =
    !!published && Object.values(published).some((price) => price !== undefined);

  return {
    // The dictionary rows have no id at all and a business can legitimately
    // save a product under a name the dictionary already uses, so the index
    // is what's guaranteed unique inside one result set.
    key: `${index}-${supportItemNumber ?? ""}-${name}`,
    name,
    detail,
    // A catalogue row defaults to the National price; one of the business's own
    // products carries its own `price`.
    price: hasPublished ? (published?.national ?? "") : suggestionPrice(raw),
    gst: typeof raw.gst === "boolean" ? raw.gst : undefined,
    qtyType: raw.qty_type?.trim() || undefined,
    supportItemNumber,
    legacyNote: legacy,
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    priceHint: raw.price_tooltip?.trim() || undefined,
    priceOptions: hasPublished ? published : undefined,
    priceSchedule:
      hasPublished && raw.price_schedule ? raw.price_schedule : undefined,
    claimType: ndis ? claimTypeFromCatalogue(raw.claim_type) : undefined,
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
  >(url, {
    params: {
      query,
      page: 1,
      limit: 10,
      txnType: "Credit",
      // A general document leaves the business's NDIS products out; the NDIS
      // endpoint already returns only those.
      ...(ndis ? {} : { exclude_ndis: 1 }),
    },
  });

  const body = response.data;
  const rows = Array.isArray(body) ? body : (body?.data ?? []);
  return rows
    .map((row, index) => mapSuggestion(row, index, ndis))
    .filter((suggestion) => suggestion.name.trim().length > 0);
}

/**
 * The NDIS support catalogue, searched by support item number.
 *
 * The same `/services/autocomplete` endpoint as the name lookup: the server
 * matches the query against a support's number as well as its name, and ranks an
 * exact number first. What differs is what's kept. A number belongs to a
 * catalogue row, so the business's own NDIS products — which have none and which
 * the endpoint appends to every result — are dropped, and nothing is asked until
 * something has been typed: an empty query would only return those products.
 */
export async function searchNdisSupportItemsByNumber(
  query: string,
): Promise<ItemSuggestion[]> {
  if (!query.trim()) return [];
  const suggestions = await searchInvoiceItems(query, true);
  return suggestions.filter((suggestion) => !!suggestion.supportItemNumber);
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
 * An NDIS catalogue pick also brings what the Pricing Schedule says about the
 * support: the National price (the default — the user can switch to Remote or
 * Very remote, or type their own), the unit, the schedule the prices are from,
 * and the claim type when the support's name states one ("… - Cancellation").
 * A name that states none (a rate band like "Weekday Daytime", or one of the
 * business's own products) leaves the line's claim type as it is, and the
 * service date is always left alone: it is when *this* support was delivered,
 * which no catalogue row can know.
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
    // Set (even to undefined) on every NDIS pick, so choosing a support the
    // schedule doesn't price can't leave the previous one's tiers on the line.
    ...(options.ndis
      ? {
          priceOptions: suggestion.priceOptions,
          priceSchedule: suggestion.priceSchedule,
        }
      : {}),
    ...(options.ndis && suggestion.claimType
      ? { claimType: suggestion.claimType }
      : {}),
  };
}
