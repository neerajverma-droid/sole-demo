/**
 * The pure stock/price half of lib/inventory.ts — `inventory.test.ts` covers
 * the API wiring, reason labels and `itemIssues`. This file covers the derived
 * stock status every Inventory screen reads, plus the small mapping helpers
 * General's catalogue shares.
 */
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

const {
  ADJUST_REASONS,
  emptyItemDraft,
  fetchInventoryItems,
  filterItems,
  formatItemPrice,
  inventorySummary,
  itemIncludesGst,
  itemInitials,
  marginPerUnit,
  priceError,
  priceFromApi,
  stockLabel,
  stockStatus,
  stockStatusVariant,
  transactionTypeFromTxnType,
  typeFromQuantityLabel,
  wholeNumberError,
  withGst,
} = await import("@/lib/inventory");

type Item = Parameters<typeof stockStatus>[0];

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: "1",
    name: "Timber panel — oak",
    sku: "TMB-OAK",
    type: "Product",
    quantityType: "Items",
    transactionType: "Income",
    industry: "Trades",
    costPrice: "42",
    salePrice: "89",
    purchaseTax: "GST (10%)",
    saleTax: "GST (10%)",
    assetCategory: "Inventory",
    incomeAccount: "Sales income",
    purchaseDescription: "",
    saleDescription: "",
    tracked: true,
    openingStock: "20",
    lowStockAlert: "5",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchInventoryItems request", () => {
  it("GETs the plain list with limit=500 and no active_tab — every item, tracked or not", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });

    await fetchInventoryItems();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.customProduct.list, {
      params: { limit: 500 },
    });
  });
});

describe("stockStatus", () => {
  it("is Service for anything untracked, whatever its stock figure", () => {
    expect(stockStatus(item({ tracked: false, openingStock: "0" }))).toBe("Service");
  });

  it("is Service for a tracked Service", () => {
    expect(stockStatus(item({ type: "Service" }))).toBe("Service");
  });

  it("is Out of stock at zero, or with an unreadable stock figure", () => {
    expect(stockStatus(item({ openingStock: "0" }))).toBe("Out of stock");
    expect(stockStatus(item({ openingStock: "" }))).toBe("Out of stock");
  });

  it("is Low stock at and below the item's own alert level", () => {
    expect(stockStatus(item({ openingStock: "5", lowStockAlert: "5" }))).toBe("Low stock");
    expect(stockStatus(item({ openingStock: "3", lowStockAlert: "5" }))).toBe("Low stock");
  });

  it("is In stock above the alert level", () => {
    expect(stockStatus(item({ openingStock: "6", lowStockAlert: "5" }))).toBe("In stock");
  });

  it("maps each status to its badge variant", () => {
    expect(stockStatusVariant("In stock")).toBe("success");
    expect(stockStatusVariant("Low stock")).toBe("warning");
    expect(stockStatusVariant("Out of stock")).toBe("danger");
    expect(stockStatusVariant("Service")).toBe("secondary");
  });
});

describe("stockLabel", () => {
  it("shows the count with its unit, or a dash for a service", () => {
    expect(stockLabel(item({ openingStock: "20" }))).toBe("20 Items");
    expect(stockLabel(item({ tracked: false }))).toBe("—");
  });

  it("drops the unit when none is chosen", () => {
    expect(stockLabel(item({ openingStock: "3", quantityType: "" }))).toBe("3");
  });
});

describe("inventorySummary and filterItems", () => {
  const items = [
    item({ id: "in", name: "Oak panel", openingStock: "20" }),
    item({ id: "low", name: "Pine panel", openingStock: "2" }),
    item({ id: "out", name: "Ash panel", openingStock: "0" }),
    item({ id: "svc", name: "Install", type: "Service", tracked: false }),
  ];

  it("counts by status, services in the total only", () => {
    expect(inventorySummary(items)).toEqual({
      total: 4,
      inStock: 1,
      lowStock: 1,
      outOfStock: 1,
    });
  });

  it("groups services with In Stock on the filter tabs", () => {
    const ids = (filter: Parameters<typeof filterItems>[1], query = "") =>
      filterItems(items, filter, query).map((i) => i.id);

    expect(ids("All")).toEqual(["in", "low", "out", "svc"]);
    expect(ids("In Stock")).toEqual(["in", "svc"]);
    expect(ids("Low Stock")).toEqual(["low"]);
    expect(ids("Out of Stock")).toEqual(["out"]);
  });

  it("searches by name only, not SKU", () => {
    expect(filterItems(items, "All", " PANEL ").map((i) => i.id)).toEqual(["in", "low", "out"]);
    expect(filterItems(items, "All", "tmb-oak")).toEqual([]);
  });
});

describe("ADJUST_REASONS", () => {
  it("offers every manual reason but never the system-only 'opening'", () => {
    const values = ADJUST_REASONS.map((r) => r.value);
    expect(values).toEqual(["received", "damaged", "returned", "correction", "other"]);
    expect(values).not.toContain("opening");
  });
});

describe("emptyItemDraft", () => {
  it("starts tracked with a blank opening stock and an alert of 5 — the opposite of the Custom dialog", () => {
    expect(emptyItemDraft()).toMatchObject({
      tracked: true,
      openingStock: "",
      lowStockAlert: "5",
      quantityType: "",
      type: "Product",
      transactionType: "Income",
    });
  });
});

describe("price and number helpers", () => {
  it("accepts blank or up to two decimal places, refuses negatives and letters", () => {
    expect(priceError("")).toBeUndefined();
    expect(priceError(" 12.5 ")).toBeUndefined();
    expect(priceError("12.345")).toBeDefined();
    expect(priceError("-1")).toBeDefined();
    expect(priceError("$5")).toBeDefined();
  });

  it("accepts blank or a whole number only", () => {
    expect(wholeNumberError("")).toBeUndefined();
    expect(wholeNumberError("0")).toBeUndefined();
    expect(wholeNumberError("1.5")).toBeDefined();
    expect(wholeNumberError("-2")).toBeDefined();
  });

  it("formats a price as money, or a dash when zero or blank", () => {
    expect(formatItemPrice("89")).toBe("$89.00");
    expect(formatItemPrice("0")).toBe("—");
    expect(formatItemPrice("")).toBe("—");
  });

  it("reads a nullable decimal from the API as a string, blank for zero/null/garbage", () => {
    expect(priceFromApi("42.00")).toBe("42");
    expect(priceFromApi(10.4)).toBe("10.4");
    expect(priceFromApi("0.00")).toBe("");
    expect(priceFromApi(null)).toBe("");
    expect(priceFromApi("n/a")).toBe("");
  });

  it("returns a margin only once both prices are positive", () => {
    expect(marginPerUnit("42", "89")).toEqual({ amount: "$47.00", percent: 53 });
    expect(marginPerUnit("", "89")).toBeNull();
    expect(marginPerUnit("42", "0")).toBeNull();
  });
});

describe("mapping helpers", () => {
  it("derives Product only from Items (or nothing chosen yet), else Service", () => {
    expect(typeFromQuantityLabel("Items")).toBe("Product");
    expect(typeFromQuantityLabel("")).toBe("Product");
    expect(typeFromQuantityLabel("Hours")).toBe("Service");
    expect(typeFromQuantityLabel("Km")).toBe("Service");
  });

  it("maps Debit to Expense and Credit to Income", () => {
    expect(transactionTypeFromTxnType("Debit")).toBe("Expense");
    expect(transactionTypeFromTxnType("Credit")).toBe("Income");
  });

  it("keeps GST as a single tax-rate value", () => {
    expect(withGst(true)).toBe("GST (10%)");
    expect(withGst(false)).toBe("GST Free");
    expect(itemIncludesGst({ saleTax: "GST (10%)" })).toBe(true);
    expect(itemIncludesGst({ saleTax: "— None —" })).toBe(false);
  });

  it("counts any country's taxed label, and a legacy code, as carrying GST", () => {
    expect(itemIncludesGst({ saleTax: "GST (15%)" })).toBe(true);
    expect(itemIncludesGst({ saleTax: "VAT (15%)" })).toBe(true);
    expect(itemIncludesGst({ saleTax: "GST_10" })).toBe(true);
    expect(itemIncludesGst({ saleTax: "GST Free" })).toBe(false);
    expect(
      withGst(true, { none: "— None —", taxed: "GST (15%)", free: "GST Free" }),
    ).toBe("GST (15%)");
  });

  it("takes up to two initials, or ? for a blank name", () => {
    expect(itemInitials("timber oak panel")).toBe("TO");
    expect(itemInitials("   ")).toBe("?");
  });
});
