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
const { catalogueCode, fetchGeneralCatalogue, searchGeneralCatalogue } =
  await import("@/lib/general-catalogue");

type Entry = Awaited<ReturnType<typeof fetchGeneralCatalogue>>[number];

/** A services_all row as the backend sends it, scoped to a Finance business. */
function apiRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    item_name: "Financial planning session",
    txn_type: "Credit",
    type: "Service",
    qty_type: "hours",
    gst: 1,
    selling_price: "0.00",
    industry: { id: 6, name: "Finance" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchGeneralCatalogue", () => {
  it("GETs the shared list route with active_tab=general and no industry param", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });

    await fetchGeneralCatalogue();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.customProduct.list, {
      params: { active_tab: "general", limit: 500 },
    });
    // The backend resolves industry from req.businessId — nothing about the
    // business or industry is sent from here.
    const [, config] = apiMock.get.mock.calls[0];
    expect(Object.keys(config.params)).toEqual(["active_tab", "limit"]);
  });

  it("maps every field of a services_all row", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [apiRow()] },
    });

    const [entry] = await fetchGeneralCatalogue();

    expect(entry).toEqual<Entry>({
      code: "FIN-FIN01",
      name: "Financial planning session",
      industry: "Finance",
      type: "Service",
      transactionType: "Income",
      quantityType: "Hours",
      // Every real row is seeded at 0.00 — shown as blank, never "0".
      salePrice: "",
      taxRate: "GST (10%)",
    });
  });

  it("reads type from its own column rather than deriving it from qty_type", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          // A product counted in hours would read as a Service if type were derived.
          apiRow({ type: "Product", qty_type: "hours" }),
          apiRow({ type: "Service", qty_type: "items" }),
        ],
      },
    });

    const entries = await fetchGeneralCatalogue();

    expect(entries.map((e) => e.type)).toEqual(["Product", "Service"]);
    expect(entries.map((e) => e.quantityType)).toEqual(["Hours", "Items"]);
  });

  it("falls back to Service for a row nobody has backfilled a type on", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [apiRow({ type: null })] },
    });

    const [entry] = await fetchGeneralCatalogue();
    expect(entry.type).toBe("Service");
  });

  it("maps Debit to Expense, a falsy gst to GST Free, and keeps a real price", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [apiRow({ txn_type: "Debit", gst: 0, selling_price: "45.5" })],
      },
    });

    const [entry] = await fetchGeneralCatalogue();

    expect(entry.transactionType).toBe("Expense");
    expect(entry.taxRate).toBe("GST Free");
    expect(entry.salePrice).toBe("45.5");
  });

  it('labels a row with no joined industry "General", coded GEN-', async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [apiRow({ industry: null })] },
    });

    const [entry] = await fetchGeneralCatalogue();

    expect(entry.industry).toBe("General");
    expect(entry.code).toBe("GEN-FIN01");
  });

  it("numbers codes by position in the response", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [apiRow(), apiRow({ id: 12, item_name: "Tax return" })],
      },
    });

    const entries = await fetchGeneralCatalogue();
    expect(entries.map((e) => e.code)).toEqual(["FIN-FIN01", "FIN-TAX02"]);
  });

  it("returns an empty list when the industry has nothing seeded", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });
    expect(await fetchGeneralCatalogue()).toEqual([]);
  });
});

describe("catalogueCode", () => {
  it("builds the readable FIN-FIN01 style code the doc describes", () => {
    expect(catalogueCode("Finance", "Financial advice", 0)).toBe("FIN-FIN01");
  });

  it("uses initials for a multi-word industry", () => {
    expect(catalogueCode("Health and Social Care", "Support work", 2)).toBe(
      "HAS-SUP03",
    );
  });

  it("ignores digits and punctuation, and falls back to ITEM for a name with no letters", () => {
    expect(catalogueCode("IT & Tech", "123", 9)).toBe("IT-ITE10");
  });

  it("falls back to GEN when the industry has no letters at all", () => {
    expect(catalogueCode("", "Widget", 0)).toBe("GEN-WID01");
  });
});

describe("searchGeneralCatalogue", () => {
  const entries: Entry[] = [
    {
      code: "FIN-FIN01",
      name: "Financial planning",
      industry: "Finance",
      type: "Service",
      transactionType: "Income",
      quantityType: "Hours",
      salePrice: "",
      taxRate: "GST (10%)",
    },
    {
      code: "FIN-TAX02",
      name: "Tax return",
      industry: "Finance",
      type: "Service",
      transactionType: "Income",
      quantityType: "Items",
      salePrice: "",
      taxRate: "GST (10%)",
    },
  ];

  it("returns everything for a blank query", () => {
    expect(searchGeneralCatalogue("   ", entries)).toBe(entries);
  });

  it("matches by name, case-insensitively", () => {
    expect(searchGeneralCatalogue("TAX", entries).map((e) => e.code)).toEqual([
      "FIN-TAX02",
    ]);
  });

  it("matches by the synthetic code", () => {
    expect(
      searchGeneralCatalogue(" fin-fin01 ", entries).map((e) => e.name),
    ).toEqual(["Financial planning"]);
  });
});
