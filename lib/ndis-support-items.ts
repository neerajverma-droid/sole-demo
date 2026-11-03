/**
 * NDIS support-item reference data — GET /custom-product?active_tab=ndis,
 * sole-ocr's `services_ndis` table (the published NDIS Support Catalogue).
 *
 * Read-only, same as General: nothing here is ever written back, it's only
 * ever copied into a custom item via `draftFromSupportItem`.
 */

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import type { QuantityType } from "@/lib/inventory";

export type NdisSupportItem = {
  id: string;
  /** The catalogue number, e.g. `01_011_0107_1_1`. */
  supportItemNumber: string;
  supportItemName: string;
  registrationGroupNumber: string;
  registrationGroupName: string;
  /** The two-digit support category the item sits under. */
  supportCategoryNumber: string;
  /**
   * The NDIS's own pricing arrangement for this item — `Price Limited
   * Supports`, `Quotable Supports`, `Unit Price = $1`, or blank. Not shown as
   * a column anywhere; it's the only real signal this catalogue carries for
   * how an item is actually billed, so `draftFromSupportItem` reads it to
   * pick a quantity type instead of assuming every support is hourly.
   */
  pricingType: string;
};

/**
 * Whether a support is billed as a flat unit or an hourly rate — the only
 * distinction this catalogue's data can actually support. `Price Limited
 * Supports` is overwhelmingly hourly labour (self-care, therapy, support
 * work); `Unit Price = $1` and `Quotable Supports` are flat per-item charges
 * (consumables, equipment, one-off quoted supports); items with no pricing
 * type in the source data are, in practice, almost all physical equipment
 * (wheelchairs, beds, orthotics), so they default to Items rather than
 * inheriting an hourly assumption that doesn't fit them.
 */
export function quantityTypeFromPricingType(pricingType: string): QuantityType {
  return pricingType === "Price Limited Supports" ? "Hours" : "Items";
}

type ApiNdisSupportItem = {
  id: number | string;
  support_item_number: string;
  support_item_name: string;
  registration_group_number: number | string | null;
  registration_group_name: string | null;
  support_category_number: number | string | null;
  support_category_name: string | null;
  type: string | null;
};

/**
 * Restores the leading zeros the NDIA's own numbering uses (registration
 * groups are 4 digits, support categories 2) — `services_ndis` stores both as
 * plain integers, so `107` and `1` need padding back to `0107` and `01` to
 * read as the codes providers actually recognise.
 */
function padCode(value: number | string | null, width: number): string {
  if (value === null || value === "") return "";
  return String(value).padStart(width, "0");
}

function mapApiNdisItem(raw: ApiNdisSupportItem): NdisSupportItem {
  return {
    id: String(raw.id),
    supportItemNumber: raw.support_item_number ?? "",
    supportItemName: raw.support_item_name ?? "",
    registrationGroupNumber: padCode(raw.registration_group_number, 4),
    registrationGroupName: raw.registration_group_name ?? "",
    supportCategoryNumber: padCode(raw.support_category_number, 2),
    pricingType: raw.type ?? "",
  };
}

/**
 * Large enough to cover the whole catalogue (684 rows today, ~650 once legacy
 * codes are excluded) in one request. Used only to build the filter dialog's
 * registration-group/support-category option lists and the tab's unfiltered
 * count — the table itself is paginated server-side via
 * `fetchNdisSupportItemsPage`, since fetching all 650+ rows on every page
 * flip is exactly the "no real pagination" problem that approach had.
 */
const FETCH_ALL_LIMIT = 1000;

type ApiEnvelope<T> = {
  success: boolean;
  message?: string;
  data?: T;
  pagination?: { total: number; total_pages: number };
};

/**
 * The whole NDIS support-item reference, unpaginated — for the filter
 * dialog's option lists and the tab badge's total count, neither of which a
 * single page of results could answer correctly.
 */
export async function fetchNdisSupportItems(): Promise<NdisSupportItem[]> {
  const response = await api.get<ApiEnvelope<ApiNdisSupportItem[]>>(
    apiRoutes.customProduct.list,
    { params: { active_tab: "ndis", limit: FETCH_ALL_LIMIT } },
  );
  const raw = response.data?.data ?? [];
  return raw.map(mapApiNdisItem);
}

export type NdisPageParams = {
  search: string;
  page: number;
  limit: number;
  /** "All" (from EMPTY_NDIS_FILTERS) means no filter — never sent to the API. */
  registrationGroup: string;
  supportCategory: string;
};

export type NdisPage = {
  items: NdisSupportItem[];
  total: number;
  totalPages: number;
};

/**
 * One real page of the NDIS catalogue — search, the two facet filters, and
 * pagination all happen server-side, so "page 2" is actually a different 20
 * rows fetched from the database rather than a client-side slice of
 * everything already downloaded.
 */
export async function fetchNdisSupportItemsPage(
  params: NdisPageParams,
): Promise<NdisPage> {
  const response = await api.get<ApiEnvelope<ApiNdisSupportItem[]>>(
    apiRoutes.customProduct.list,
    {
      params: {
        active_tab: "ndis",
        search_query: params.search.trim() || undefined,
        page: params.page,
        limit: params.limit,
        registration_group:
          params.registrationGroup === "All"
            ? undefined
            : params.registrationGroup,
        support_category:
          params.supportCategory === "All"
            ? undefined
            : params.supportCategory,
      },
    },
  );
  const raw = response.data?.data ?? [];
  return {
    items: raw.map(mapApiNdisItem),
    total: response.data?.pagination?.total ?? raw.length,
    totalPages: response.data?.pagination?.total_pages ?? 1,
  };
}
