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

// Imported after the mock so `lib/inventory.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  fetchInventoryItems,
  createInventoryItemApi,
  updateInventoryItemApi,
  deleteInventoryItemApi,
  adjustStockApi,
  fetchInventoryHistory,
  stockAdjustReasonLabel,
  itemIssues,
} = await import("@/lib/inventory");

/** A minimal, valid draft — individual fields overridden per test as needed. */
const BASE_DRAFT = {
  name: "Timber panel — oak",
  sku: "TMB-OAK",
  type: "Product" as const,
  quantityType: "Items" as const,
  transactionType: "Income" as const,
  industry: "Trades",
  costPrice: "42",
  salePrice: "89",
  purchaseTax: "GST (10%)" as const,
  saleTax: "GST (10%)" as const,
  assetCategory: "Inventory" as const,
  incomeAccount: "Sales income" as const,
  purchaseDescription: "Oak panel, 1200x600",
  saleDescription: "Oak panel",
  tracked: true,
  openingStock: "128",
  lowStockAlert: "20",
};

const ACCOUNT_CATEGORIES_RESPONSE = {
  success: true,
  data: {
    account_categories: [
      {
        account_category_id: 1,
        name: "Assets",
        account_subcategories: [
          { account_subcategory_id: 42, name: "Inventory" },
          { account_subcategory_id: 43, name: "Cash" },
        ],
      },
      { account_category_id: 2, name: "Income", account_subcategories: [] },
    ],
  },
};

/** Answers GET requests differently depending on which endpoint was hit. */
function mockGetByUrl(map: Record<string, unknown>) {
  apiMock.get.mockImplementation((url: string) => {
    const match = Object.keys(map).find((key) => url.startsWith(key));
    if (!match) return Promise.reject(new Error(`Unexpected GET ${url}`));
    return Promise.resolve({ data: map[match] });
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  // Every test that saves a tracked item needs the account list answered —
  // set it up by default so tests not focused on that resolution don't have
  // to repeat it. Tests that care about the resolution itself override this.
  mockGetByUrl({
    [apiRoutes.accountCategory.list]: ACCOUNT_CATEGORIES_RESPONSE,
  });
});

describe("fetching the list", () => {
  it("GETs with a large page size and maps every field", async () => {
    mockGetByUrl({
      [apiRoutes.customProduct.list]: {
        success: true,
        data: [
          {
            id: 501,
            item_name: "Timber panel — oak",
            sku: "TMB-OAK",
            txn_type: "Credit",
            qty_type: "items",
            cost_price: "42.00",
            selling_price: "89.00",
            purchase_tax_rate: "GST (10%)",
            sale_tax_rate: "GST (10%)",
            purchase_description: "Oak panel, 1200x600",
            sale_description: "Oak panel",
            inventory_flag: 1,
            inventory_count: 128,
            low_stock_threshold: 20,
            gst: 1,
            industry: { id: 3, name: "Trades" },
          },
        ],
      },
    });

    const items = await fetchInventoryItems();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.customProduct.list, {
      params: { limit: 500 },
    });
    expect(items).toEqual([
      expect.objectContaining({
        id: "501",
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
        tracked: true,
        openingStock: "128",
        lowStockAlert: "20",
      }),
    ]);
  });

  it("labels anything counted in something other than Items as a Service", async () => {
    mockGetByUrl({
      [apiRoutes.customProduct.list]: {
        success: true,
        data: [
          {
            id: 1,
            item_name: "Consulting hour",
            qty_type: "hours",
            txn_type: "Credit",
            inventory_flag: 0,
            gst: 1,
          },
          {
            id: 2,
            item_name: "Studio hire",
            qty_type: "days",
            txn_type: "Credit",
            inventory_flag: 0,
            gst: 0,
          },
          {
            id: 3,
            item_name: "Delivery",
            qty_type: "km",
            txn_type: "Debit",
            inventory_flag: 0,
            gst: 0,
          },
        ],
      },
    });

    const items = await fetchInventoryItems();
    expect(items.map((item) => item.type)).toEqual([
      "Service",
      "Service",
      "Service",
    ]);
    expect(items[2].transactionType).toBe("Expense");
  });

  it("falls back to the gst flag when the stored tax rate isn't one of the three known strings", async () => {
    mockGetByUrl({
      [apiRoutes.customProduct.list]: {
        success: true,
        data: [
          {
            id: 1,
            item_name: "Legacy row",
            qty_type: "items",
            txn_type: "Credit",
            purchase_tax_rate: null,
            sale_tax_rate: "some-old-value",
            inventory_flag: 0,
            gst: 1,
          },
        ],
      },
    });

    const [item] = await fetchInventoryItems();
    expect(item.purchaseTax).toBe("GST (10%)");
    expect(item.saleTax).toBe("GST (10%)");
  });

  it("keeps any country's taxed label, and lets the gst flag settle the sale rate", async () => {
    mockGetByUrl({
      [apiRoutes.customProduct.list]: {
        success: true,
        data: [
          {
            id: 1,
            item_name: "NZ row",
            qty_type: "items",
            txn_type: "Credit",
            purchase_tax_rate: "GST_10",
            sale_tax_rate: "GST (15%)",
            inventory_flag: 0,
            gst: 1,
          },
          {
            id: 2,
            item_name: "Flag says untaxed",
            qty_type: "items",
            txn_type: "Credit",
            purchase_tax_rate: "GST (10%)",
            sale_tax_rate: "GST_10",
            inventory_flag: 0,
            gst: 0,
          },
        ],
      },
    });

    const [nz, untaxed] = await fetchInventoryItems();
    expect(nz.purchaseTax).toBe("GST_10");
    expect(nz.saleTax).toBe("GST (15%)");
    // The flag is only ever sent for the sale rate, so purchase tax keeps its label.
    expect(untaxed.purchaseTax).toBe("GST (10%)");
    expect(untaxed.saleTax).toBe("— None —");
  });

  it("leaves an untracked item's stock fields blank regardless of what inventory_count holds", async () => {
    mockGetByUrl({
      [apiRoutes.customProduct.list]: {
        success: true,
        data: [
          {
            id: 1,
            item_name: "Consulting hour",
            qty_type: "hours",
            txn_type: "Credit",
            inventory_flag: 0,
            inventory_count: 0,
            low_stock_threshold: 5,
            gst: 0,
          },
        ],
      },
    });

    const [item] = await fetchInventoryItems();
    expect(item.tracked).toBe(false);
    expect(item.openingStock).toBe("");
    expect(item.lowStockAlert).toBe("");
  });

  it('shows a zero cost/sale price as blank, not "0"', async () => {
    mockGetByUrl({
      [apiRoutes.customProduct.list]: {
        success: true,
        data: [
          {
            id: 1,
            item_name: "Freebie",
            qty_type: "items",
            txn_type: "Credit",
            cost_price: 0,
            selling_price: 0,
            inventory_flag: 0,
            gst: 0,
          },
        ],
      },
    });

    const [item] = await fetchInventoryItems();
    expect(item.costPrice).toBe("");
    expect(item.salePrice).toBe("");
  });
});

describe("creating an item", () => {
  it("POSTs the mapped payload and returns the created item", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 900,
          item_name: "Timber panel — oak",
          sku: "TMB-OAK",
          txn_type: "Credit",
          qty_type: "items",
          cost_price: "42.00",
          selling_price: "89.00",
          inventory_flag: 1,
          inventory_count: 128,
          low_stock_threshold: 20,
          gst: 1,
        },
      },
    });

    const created = await createInventoryItemApi(BASE_DRAFT);

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.customProduct.create);
    expect(body).toMatchObject({
      item_name: "Timber panel — oak",
      sku: "TMB-OAK",
      txn_type: "Credit",
      qty_type: "items",
      cost_price: 42,
      selling_price: 89,
      purchase_tax_rate: "GST (10%)",
      sale_tax_rate: "GST (10%)",
      gst: 1,
      inventory_flag: 1,
      is_inventory: 1,
      inventory_count: 128,
      low_stock_threshold: 20,
      // The Inventory asset-account id, resolved silently — see below.
      purchase_account_id: 42,
      sale_account_id: 42,
    });
    expect(created.id).toBe("900");
  });

  it("maps Expense to Debit and trims name/sku", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 1,
          item_name: "x",
          qty_type: "items",
          txn_type: "Debit",
          inventory_flag: 0,
          gst: 0,
        },
      },
    });

    await createInventoryItemApi({
      ...BASE_DRAFT,
      name: "  Padded name  ",
      sku: "  PAD-1  ",
      transactionType: "Expense",
      tracked: false,
    });

    const [, body] = apiMock.post.mock.calls[0];
    expect(body).toMatchObject({
      item_name: "Padded name",
      sku: "PAD-1",
      txn_type: "Debit",
    });
  });

  it("omits inventory_count, low_stock_threshold and the account id for an untracked item", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 1,
          item_name: "x",
          qty_type: "hours",
          txn_type: "Credit",
          inventory_flag: 0,
          gst: 0,
        },
      },
    });

    await createInventoryItemApi({
      ...BASE_DRAFT,
      tracked: false,
      openingStock: "",
      lowStockAlert: "",
    });

    const [, body] = apiMock.post.mock.calls[0];
    expect(body.inventory_flag).toBe(0);
    expect(body.is_inventory).toBe(0);
    expect(body.inventory_count).toBe(0);
    expect(body.low_stock_threshold).toBe(5);
    expect(body).not.toHaveProperty("purchase_account_id");
    expect(body).not.toHaveProperty("sale_account_id");
    // An untracked item has no reason to look up the chart of accounts at all.
    expect(apiMock.get).not.toHaveBeenCalledWith(
      apiRoutes.accountCategory.list,
      expect.anything(),
    );
  });

  it("throws with the server's message when the save is rejected", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: false,
        message:
          "Product already exists for this user with same name, industry and transaction type.",
      },
    });

    await expect(createInventoryItemApi(BASE_DRAFT)).rejects.toThrow(
      "Product already exists for this user with same name, industry and transaction type.",
    );
  });
});

describe("resolving the inventory account id", () => {
  /** A clean module instance per test, so the cached id doesn't leak between them. */
  async function freshLib() {
    vi.resetModules();
    return import("@/lib/inventory");
  }

  it("is fetched once and reused across multiple tracked saves", async () => {
    const { createInventoryItemApi: createFresh } = await freshLib();
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 1,
          item_name: "x",
          qty_type: "items",
          txn_type: "Credit",
          inventory_flag: 1,
          gst: 0,
        },
      },
    });

    await createFresh(BASE_DRAFT);
    await createFresh(BASE_DRAFT);

    const accountListCalls = apiMock.get.mock.calls.filter(
      ([url]) => url === apiRoutes.accountCategory.list,
    );
    expect(accountListCalls).toHaveLength(1);
  });

  it("saves fine, without an account id, when the account list lookup fails", async () => {
    const { createInventoryItemApi: createFresh } = await freshLib();
    apiMock.get.mockRejectedValue(new Error("network down"));
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 1,
          item_name: "x",
          qty_type: "items",
          txn_type: "Credit",
          inventory_flag: 1,
          gst: 0,
        },
      },
    });

    await createFresh(BASE_DRAFT);

    const [, body] = apiMock.post.mock.calls[0];
    expect(body).not.toHaveProperty("purchase_account_id");
    expect(body).not.toHaveProperty("sale_account_id");
  });

  it("saves fine, without an account id, when the chart of accounts has no Assets/Inventory subcategory", async () => {
    const { createInventoryItemApi: createFresh } = await freshLib();
    mockGetByUrl({
      [apiRoutes.accountCategory.list]: {
        success: true,
        data: {
          account_categories: [
            {
              account_category_id: 1,
              name: "Assets",
              account_subcategories: [],
            },
          ],
        },
      },
    });
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 1,
          item_name: "x",
          qty_type: "items",
          txn_type: "Credit",
          inventory_flag: 1,
          gst: 0,
        },
      },
    });

    await createFresh(BASE_DRAFT);

    const [, body] = apiMock.post.mock.calls[0];
    expect(body).not.toHaveProperty("purchase_account_id");
  });
});

describe("updating an item", () => {
  it("PATCHes to update/:id with the mapped payload", async () => {
    apiMock.patch.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 501,
          item_name: "Renamed",
          qty_type: "items",
          txn_type: "Credit",
          inventory_flag: 1,
          gst: 1,
        },
      },
    });

    const updated = await updateInventoryItemApi("501", {
      ...BASE_DRAFT,
      name: "Renamed",
    });

    expect(apiMock.patch).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.patch.mock.calls[0];
    expect(url).toBe(`${apiRoutes.customProduct.update}/501`);
    expect(body).toMatchObject({ item_name: "Renamed" });
    expect(updated.name).toBe("Renamed");
  });

  it("throws with the server's message on failure", async () => {
    apiMock.patch.mockResolvedValue({
      data: { success: false, message: "Record not found" },
    });

    await expect(updateInventoryItemApi("999", BASE_DRAFT)).rejects.toThrow(
      "Record not found",
    );
  });
});

describe("deleting an item", () => {
  it("DELETEs to delete/:id", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });

    await deleteInventoryItemApi("501");

    expect(apiMock.delete).toHaveBeenCalledWith(
      `${apiRoutes.customProduct.delete}/501`,
    );
  });

  it("throws with the server's message when the item can't be deleted", async () => {
    apiMock.delete.mockResolvedValue({
      data: {
        success: false,
        message:
          "This item cannot be deleted because it has been used in one or more invoices. Please remove it from all invoices first.",
      },
    });

    await expect(deleteInventoryItemApi("501")).rejects.toThrow(
      /used in one or more invoices/,
    );
  });
});

describe("adjusting stock", () => {
  it("POSTs the signed quantity and reason, and returns the new count", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          product_id: 501,
          previous_count: 128,
          quantity_changed: -8,
          new_count: 120,
        },
      },
    });

    const result = await adjustStockApi("501", -8, "correction");

    expect(apiMock.post).toHaveBeenCalledWith(
      apiRoutes.customProduct.adjust("501"),
      {
        quantity: -8,
        reason: "correction",
      },
    );
    expect(result).toEqual({ newCount: 120, newCostPrice: undefined });
  });

  it("surfaces the new weighted-average cost when the server returns one", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { new_count: 20, new_cost_price: 6 } },
    });

    const result = await adjustStockApi("501", 10, "received");
    expect(result).toEqual({ newCount: 20, newCostPrice: 6 });
  });

  it("throws with the server's message when the adjustment is rejected", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: false,
        message:
          "Cannot reduce stock below zero. Current stock: 3, requested change: -8.",
      },
    });

    await expect(adjustStockApi("501", -8, "damaged")).rejects.toThrow(
      /below zero/,
    );
  });

  it("includes unit_cost and a trimmed note only when they're actually given", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { new_count: 20, new_cost_price: 6 } },
    });

    await adjustStockApi("501", 10, "received", {
      unitCost: 8,
      note: "  From supplier XYZ  ",
    });

    expect(apiMock.post).toHaveBeenCalledWith(
      apiRoutes.customProduct.adjust("501"),
      {
        quantity: 10,
        reason: "received",
        unit_cost: 8,
        note: "From supplier XYZ",
      },
    );
  });

  it("omits unit_cost and note entirely when neither is supplied", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { new_count: 20 } },
    });

    await adjustStockApi("501", -4, "damaged", { note: "   " });

    const [, body] = apiMock.post.mock.calls[0];
    expect(body).not.toHaveProperty("unit_cost");
    expect(body).not.toHaveProperty("note");
  });
});

describe("stock adjustment reason labels", () => {
  it("labels every known reason, including the system-only 'opening' one", () => {
    expect(stockAdjustReasonLabel("opening")).toBe("Opening stock");
    expect(stockAdjustReasonLabel("received")).toBe("Received stock");
    expect(stockAdjustReasonLabel("damaged")).toBe("Damaged / lost");
    expect(stockAdjustReasonLabel("returned")).toBe("Customer return");
    expect(stockAdjustReasonLabel("correction")).toBe("Stock correction");
    expect(stockAdjustReasonLabel("other")).toBe("Other");
  });

  it("falls back to the raw value for anything unrecognised", () => {
    expect(stockAdjustReasonLabel("invoice_sale")).toBe("invoice_sale");
  });
});

describe("fetching stock history", () => {
  it("GETs the history endpoint with the given page/limit and maps every adjustment", async () => {
    mockGetByUrl({
      [apiRoutes.customProduct.history("501")]: {
        success: true,
        data: {
          product: { id: 501, item_name: "Oak panel", current_stock: 120 },
          adjustments: [
            {
              id: 9001,
              quantity: -8,
              reason: "damaged",
              unit_cost: null,
              note: "Water damage",
              balance_after: 120,
              created_at: "2026-09-01T00:00:00.000Z",
            },
            {
              id: 9000,
              quantity: 128,
              reason: "opening",
              unit_cost: "42.00",
              note: null,
              balance_after: 128,
              created_at: "2026-08-01T00:00:00.000Z",
            },
          ],
        },
        pagination: { total: 12, page: 1, limit: 5, total_pages: 3 },
      },
    });

    const result = await fetchInventoryHistory("501", { page: 1, limit: 5 });

    expect(apiMock.get).toHaveBeenCalledWith(
      apiRoutes.customProduct.history("501"),
      {
        params: { page: 1, limit: 5 },
      },
    );
    expect(result).toEqual({
      total: 12,
      totalPages: 3,
      adjustments: [
        {
          id: "9001",
          quantity: -8,
          reason: "damaged",
          unitCost: null,
          note: "Water damage",
          balanceAfter: 120,
          createdAt: "2026-09-01T00:00:00.000Z",
        },
        {
          id: "9000",
          quantity: 128,
          reason: "opening",
          unitCost: 42,
          note: null,
          balanceAfter: 128,
          createdAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    });
  });

  it("defaults to page 1 / limit 5 when not given", async () => {
    mockGetByUrl({
      [apiRoutes.customProduct.history("501")]: {
        success: true,
        data: {
          product: { id: 501, item_name: "Oak panel", current_stock: 0 },
          adjustments: [],
        },
        pagination: { total: 0, page: 1, limit: 5, total_pages: 1 },
      },
    });

    await fetchInventoryHistory("501");

    expect(apiMock.get).toHaveBeenCalledWith(
      apiRoutes.customProduct.history("501"),
      {
        params: { page: 1, limit: 5 },
      },
    );
  });

  it("throws with the server's message when the lookup fails", async () => {
    mockGetByUrl({
      [apiRoutes.customProduct.history("501")]: {
        success: false,
        message: "Product not found.",
      },
    });

    await expect(fetchInventoryHistory("501")).rejects.toThrow(
      "Product not found.",
    );
  });
});

describe("required-field validation", () => {
  it("passes a fully filled draft with no issues", () => {
    expect(itemIssues(BASE_DRAFT)).toEqual([]);
  });

  it("requires a name", () => {
    const issues = itemIssues({ ...BASE_DRAFT, name: "T" });
    expect(issues).toContainEqual({
      key: "name",
      message: "Enter an item name.",
    });
  });

  it("requires a quantity type", () => {
    const issues = itemIssues({ ...BASE_DRAFT, quantityType: "" });
    expect(issues).toContainEqual({
      key: "quantityType",
      message: "Select a quantity type.",
    });
  });

  // Matches sole-webapp's own CustomProductSchema — cost_price and
  // selling_price are both nullable there, only checked for validity if given.
  it("does not require a sale price", () => {
    expect(itemIssues({ ...BASE_DRAFT, salePrice: "" })).toEqual([]);
  });

  it("does not require a cost price", () => {
    expect(itemIssues({ ...BASE_DRAFT, costPrice: "" })).toEqual([]);
  });

  it("still flags an invalid sale price, even though it's optional", () => {
    const issues = itemIssues({ ...BASE_DRAFT, salePrice: "-5" });
    expect(issues).toContainEqual({
      key: "salePrice",
      message: "Enter a valid price — no letters or negatives.",
    });
  });

  it("still flags an invalid cost price, even though it's optional", () => {
    const issues = itemIssues({ ...BASE_DRAFT, costPrice: "abc" });
    expect(issues).toContainEqual({
      key: "costPrice",
      message: "Enter a valid price — no letters or negatives.",
    });
  });

  it("requires opening stock and a low stock alert only when tracked", () => {
    expect(
      itemIssues({
        ...BASE_DRAFT,
        tracked: false,
        openingStock: "",
        lowStockAlert: "",
      }),
    ).toEqual([]);

    const issues = itemIssues({
      ...BASE_DRAFT,
      tracked: true,
      openingStock: "",
      lowStockAlert: "",
    });
    expect(issues).toContainEqual({
      key: "openingStock",
      message: "Enter an opening stock figure.",
    });
    expect(issues).toContainEqual({
      key: "lowStockAlert",
      message: "Enter a low stock alert level.",
    });
  });
});
