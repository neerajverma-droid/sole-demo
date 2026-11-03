import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// Imported after the mock so the module's own `import api from
// "@/utils/axiosInstance"` resolves to the mock above.
const {
  fetchNdisSupportItems,
  fetchNdisSupportItemsPage,
  quantityTypeFromPricingType,
} = await import("@/lib/ndis-support-items");

/** A services_ndis row as the backend sends it (numbers stored as plain ints). */
function apiRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 501,
    support_item_number: "01_011_0107_1_1",
    support_item_name: "Assistance With Self-Care Activities",
    registration_group_number: 107,
    registration_group_name: "Daily Personal Activities",
    support_category_number: 1,
    support_category_name: "Assistance with Daily Life",
    type: "Price Limited Supports",
    ...overrides,
  };
}

const PAGE_PARAMS = {
  search: "",
  page: 1,
  limit: 20,
  registrationGroup: "All",
  supportCategory: "All",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("quantityTypeFromPricingType", () => {
  it("bills Price Limited Supports by the hour", () => {
    expect(quantityTypeFromPricingType("Price Limited Supports")).toBe("Hours");
  });

  it("bills any other non-empty pricing type as Items", () => {
    expect(quantityTypeFromPricingType("Quotable Supports")).toBe("Items");
    expect(quantityTypeFromPricingType("Unit Price = $1")).toBe("Items");
  });

  it("treats a blank pricing type as Items, not an hourly assumption", () => {
    expect(quantityTypeFromPricingType("")).toBe("Items");
  });
});

describe("fetchNdisSupportItems (fetch-all, for filter options and the badge count)", () => {
  it("GETs active_tab=ndis with the fetch-all limit and nothing else", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });

    await fetchNdisSupportItems();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.customProduct.list, {
      params: { active_tab: "ndis", limit: 1000 },
    });
  });

  it("maps a row, zero-padding the group (4) and category (2) numbers", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [apiRow()] },
    });

    const [item] = await fetchNdisSupportItems();

    expect(item).toEqual({
      id: "501",
      supportItemNumber: "01_011_0107_1_1",
      supportItemName: "Assistance With Self-Care Activities",
      registrationGroupNumber: "0107",
      registrationGroupName: "Daily Personal Activities",
      supportCategoryNumber: "01",
      pricingType: "Price Limited Supports",
    });
  });

  it("leaves null group/category numbers, names and pricing type blank rather than padding them", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          apiRow({
            registration_group_number: null,
            registration_group_name: null,
            support_category_number: "",
            type: null,
          }),
        ],
      },
    });

    const [item] = await fetchNdisSupportItems();

    expect(item.registrationGroupNumber).toBe("");
    expect(item.registrationGroupName).toBe("");
    expect(item.supportCategoryNumber).toBe("");
    expect(item.pricingType).toBe("");
  });

  it("returns [] when the envelope carries no data", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });
    expect(await fetchNdisSupportItems()).toEqual([]);
  });
});

describe("fetchNdisSupportItemsPage (the real server-paginated table fetch)", () => {
  it("sends page and limit, and omits search and both 'All' filters", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [], pagination: { total: 0, total_pages: 0 } },
    });

    await fetchNdisSupportItemsPage({ ...PAGE_PARAMS, page: 3 });

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.customProduct.list, {
      params: {
        active_tab: "ndis",
        search_query: undefined,
        page: 3,
        limit: 20,
        registration_group: undefined,
        support_category: undefined,
      },
    });
  });

  it("sends a trimmed search and the two facet filters when set", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });

    await fetchNdisSupportItemsPage({
      search: "  wheelchair ",
      page: 1,
      limit: 20,
      registrationGroup: "Assistive Products For Personal Care And Safety",
      supportCategory: "05",
    });

    const [, config] = apiMock.get.mock.calls[0];
    expect(config.params).toMatchObject({
      active_tab: "ndis",
      search_query: "wheelchair",
      // Filtered by group NAME server-side, category by number.
      registration_group: "Assistive Products For Personal Care And Safety",
      support_category: "05",
    });
  });

  it("does not send the fetch-all limit — the page's own limit wins", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });

    await fetchNdisSupportItemsPage({ ...PAGE_PARAMS, limit: 50 });

    const [, config] = apiMock.get.mock.calls[0];
    expect(config.params.limit).toBe(50);
  });

  it("reads total and totalPages from the server's pagination block", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [apiRow(), apiRow({ id: 502 })],
        pagination: { total: 653, total_pages: 33 },
      },
    });

    const page = await fetchNdisSupportItemsPage(PAGE_PARAMS);

    expect(page.items.map((i) => i.id)).toEqual(["501", "502"]);
    expect(page.total).toBe(653);
    expect(page.totalPages).toBe(33);
  });

  it("falls back to the row count and a single page with no pagination block", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [apiRow(), apiRow({ id: 502 })] },
    });

    const page = await fetchNdisSupportItemsPage(PAGE_PARAMS);

    expect(page.total).toBe(2);
    expect(page.totalPages).toBe(1);
  });

  it("returns an empty page when the envelope carries no data", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });

    expect(await fetchNdisSupportItemsPage(PAGE_PARAMS)).toEqual({
      items: [],
      total: 0,
      totalPages: 1,
    });
  });
});
