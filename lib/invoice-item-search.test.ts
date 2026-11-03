import { describe, expect, it, vi, beforeEach } from "vitest";

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

// Imported after the mock so `lib/invoice-item-search.ts`'s own `import api
// from "@/utils/axiosInstance"` resolves to the mocked module above.
const { searchExpenseDescriptions } = await import("@/lib/invoice-item-search");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchExpenseDescriptions", () => {
  it("hits the general dictionary scoped to category=Expense, txnType=Debit — sole-webapp's own Add Expense scoping", async () => {
    apiMock.get.mockResolvedValue({ data: [] });

    await searchExpenseDescriptions("coffee");

    expect(apiMock.get).toHaveBeenCalledTimes(1);
    const [url, config] = apiMock.get.mock.calls[0];
    expect(url).toBe(apiRoutes.servicesAll.autocomplete);
    expect(config.params).toEqual({
      query: "coffee",
      category: "Expense",
      txnType: "Debit",
    });
  });

  it("maps a catalogue row (no price/gst of its own)", async () => {
    apiMock.get.mockResolvedValue({
      data: [
        {
          item_name: "Coffee beans",
          description: "Wholesale supplies",
          category: "General",
          price_tooltip: "Varies by supplier",
        },
      ],
    });

    const [suggestion] = await searchExpenseDescriptions("coffee");
    expect(suggestion.name).toBe("Coffee beans");
    expect(suggestion.detail).toBe("Wholesale supplies");
    expect(suggestion.price).toBe("");
    expect(suggestion.gst).toBeUndefined();
    expect(suggestion.priceHint).toBe("Varies by supplier");
  });

  it("reads the real `price` field for one of the business's own products — not `unit_price`/`cost_price`, which the reference frontend reads but the endpoint never actually returns", async () => {
    apiMock.get.mockResolvedValue({
      data: [
        {
          product_id: 501,
          item_name: "Office chair",
          description: "",
          category: "Office Expenses",
          gst: true,
          price: "249.00",
          cost_price: "180.00",
        },
      ],
    });

    const [suggestion] = await searchExpenseDescriptions("chair");
    expect(suggestion.price).toBe("249");
    expect(suggestion.gst).toBe(true);
    expect(suggestion.productId).toBe("501");
  });

  it("unwraps a bare array or a {data: []} envelope alike", async () => {
    apiMock.get.mockResolvedValue({
      data: { data: [{ item_name: "Wrapped item" }] },
    });
    const [suggestion] = await searchExpenseDescriptions("wrap");
    expect(suggestion.name).toBe("Wrapped item");
  });

  it("drops rows with no usable name", async () => {
    apiMock.get.mockResolvedValue({
      data: [{ item_name: "", description: "" }, { item_name: "Real one" }],
    });
    const suggestions = await searchExpenseDescriptions("x");
    expect(suggestions.map((s) => s.name)).toEqual(["Real one"]);
  });
});
