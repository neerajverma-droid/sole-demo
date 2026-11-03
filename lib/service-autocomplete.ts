/**
 * Live search over `GET /services/all/autocomplete` — a hybrid of the shared
 * `services_all` reference catalogue and the caller's own custom
 * products/services (`custom_product_service`), the same endpoint
 * sole-webapp's Asset and Expense name fields call as you type.
 *
 * Bare-array response, not the `{success, data}` envelope the rest of this
 * app's endpoints use — confirmed against `servicesAll.js`/`customProductAndService.js`.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import {
  QTY_TYPE_TO_LABEL,
  priceFromApi,
  type ApiQtyType,
  type QuantityType,
} from "@/lib/inventory";

/** Only `custom_product_service` rows carry a price or stock figures. */
type ApiServiceAutocompleteEntry = {
  product_id?: number | string | null;
  item_name: string;
  description?: string | null;
  category?: string | null;
  qty_type?: ApiQtyType | null;
  price?: number | string | null;
  cost_price?: number | string | null;
  inventory_flag?: number | boolean | null;
  inventory_count?: number | string | null;
  low_stock_threshold?: number | string | null;
};

export type ServiceAutocompleteEntry = {
  name: string;
  description: string;
  /** The raw category text — matched against `ASSET_CATEGORIES` by the caller. */
  category: string;
  /** What it cost to buy, not what it sells for — `cost_price` over `price`. */
  costPrice: string;
  quantityType: QuantityType | "";
  tracked: boolean;
  openingStock: string;
  lowStockAlert: string;
  /**
   * The existing `custom_product_service` row this suggestion came from, or
   * `null` for a `services_all` reference-catalogue row with nothing of its
   * own to link to. Carrying this through is what lets picking an existing
   * tracked item link an asset to it instead of the backend creating a
   * second, duplicate product behind it.
   */
  productId: string | null;
};

function mapAutocompleteEntry(
  raw: ApiServiceAutocompleteEntry,
): ServiceAutocompleteEntry {
  const tracked = Boolean(Number(raw.inventory_flag));
  return {
    name: raw.item_name ?? "",
    description: raw.description ?? "",
    category: raw.category ?? "",
    costPrice: priceFromApi(raw.cost_price ?? raw.price ?? null),
    quantityType: raw.qty_type ? QTY_TYPE_TO_LABEL[raw.qty_type] : "",
    tracked,
    openingStock: tracked ? String(Number(raw.inventory_count) || 0) : "",
    lowStockAlert: tracked ? String(Number(raw.low_stock_threshold) || 0) : "",
    productId: raw.product_id != null ? String(raw.product_id) : null,
  };
}

/** Below this, the endpoint's own `services_all` half returns everything — too broad to be useful. */
export const AUTOCOMPLETE_MIN_LENGTH = 2;

/**
 * Matches on name as typed. `txnType` scopes the `custom_product_service`
 * half only — `services_all`'s own rows are all `Credit` and ignore it
 * (verified in `servicesAll.js`) — but every endpoint that reads this list is
 * recording a purchase, so `Debit` is the one value worth exposing.
 */
export async function fetchServiceAutocomplete(
  query: string,
): Promise<ServiceAutocompleteEntry[]> {
  const trimmed = query.trim();
  if (trimmed.length < AUTOCOMPLETE_MIN_LENGTH) return [];
  const response = await api.get<ApiServiceAutocompleteEntry[]>(
    apiRoutes.servicesAll.autocomplete,
    { params: { query: trimmed, txnType: "Debit" } },
  );
  return (response.data ?? []).map(mapAutocompleteEntry);
}
