import { describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = { get: vi.fn() };

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

const { fetchServiceAutocomplete } = await import("@/lib/service-autocomplete");

describe("fetchServiceAutocomplete", () => {
  it("doesn't call the API below the minimum query length", async () => {
    const results = await fetchServiceAutocomplete("m");
    expect(results).toEqual([]);
    expect(apiMock.get).not.toHaveBeenCalled();
  });

  it("GETs with the trimmed query and a Debit txnType, and maps the bare-array response", async () => {
    apiMock.get.mockResolvedValue({
      data: [
        {
          item_name: "DeWalt mitre saw",
          description: "18V cordless mitre saw",
          category: "Tools",
          cost_price: "1249.00",
          qty_type: "items",
          inventory_flag: 0,
        },
        {
          product_id: 42,
          item_name: "Timber panel stock",
          category: "Inventory",
          price: "26.00",
          qty_type: "items",
          inventory_flag: 1,
          inventory_count: 128,
          low_stock_threshold: 20,
        },
      ],
    });

    const results = await fetchServiceAutocomplete("  saw  ");

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.servicesAll.autocomplete, {
      params: { query: "saw", txnType: "Debit" },
    });
    expect(results).toEqual([
      {
        name: "DeWalt mitre saw",
        description: "18V cordless mitre saw",
        category: "Tools",
        costPrice: "1249",
        quantityType: "Items",
        tracked: false,
        openingStock: "",
        lowStockAlert: "",
        // No product_id on a plain services_all row — nothing to link to.
        productId: null,
      },
      {
        name: "Timber panel stock",
        description: "",
        category: "Inventory",
        // No cost_price on this row — falls back to price.
        costPrice: "26",
        quantityType: "Items",
        tracked: true,
        openingStock: "128",
        lowStockAlert: "20",
        productId: "42",
      },
    ]);
  });

  it("returns an empty list rather than throwing when the response body is empty", async () => {
    apiMock.get.mockResolvedValue({ data: null });
    await expect(fetchServiceAutocomplete("saw")).resolves.toEqual([]);
  });
});
