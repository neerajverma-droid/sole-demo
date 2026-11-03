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
// lib/invoice-item-search.test.ts covers the expense-side lookup; this file
// covers the invoice/NDIS line-item lookup and the patch a pick makes.
const { lineItemPatchFromSuggestion, searchInvoiceItems } = await import(
  "@/lib/invoice-item-search"
);
const { newLineItem, newNdisLineItem } = await import("@/lib/invoices");

type ItemSuggestion = Awaited<ReturnType<typeof searchInvoiceItems>>[number];

function suggestion(over: Partial<ItemSuggestion> = {}): ItemSuggestion {
  return { key: "0--Labour", name: "Labour", detail: "", price: "90", ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchInvoiceItems — which dictionary", () => {
  it("queries the general services dictionary for an ordinary invoice", async () => {
    apiMock.get.mockResolvedValue({ data: [] });

    await searchInvoiceItems("tap", false);

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.servicesAll.autocomplete, {
      params: { query: "tap", page: 1, limit: 10, txnType: "Credit" },
    });
  });

  it("queries the NDIS support catalogue for a claim", async () => {
    apiMock.get.mockResolvedValue({ data: [] });

    await searchInvoiceItems("self care", true);

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.services.autocomplete, {
      params: { query: "self care", page: 1, limit: 10, txnType: "Credit" },
    });
  });

  it("sends an empty query through rather than short-circuiting it", async () => {
    apiMock.get.mockResolvedValue({ data: [] });

    await searchInvoiceItems("", false);

    expect(apiMock.get).toHaveBeenCalledTimes(1);
    expect(apiMock.get.mock.calls[0][1].params.query).toBe("");
  });
});

describe("searchInvoiceItems — mapping", () => {
  it("maps a general product, accepting the { data: [] } wrapper too", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: [
          {
            item_name: "Tap install",
            description: " Mixer tap ",
            price: "180",
            gst: true,
            qty_type: " hours ",
            product_id: 77,
          },
        ],
      },
    });

    expect(await searchInvoiceItems("tap", false)).toEqual([
      {
        key: "0--Tap install",
        name: "Tap install",
        detail: "Mixer tap",
        price: "180",
        gst: true,
        qtyType: "hours",
        supportItemNumber: undefined,
        productId: "77",
        priceHint: undefined,
      },
    ]);
  });

  it("names an NDIS row support_item_name → item_name → description, detailing its support number", async () => {
    apiMock.get.mockResolvedValue({
      data: [
        {
          support_item_name: "Assistance with self-care",
          item_name: "ignored",
          support_item_number: " 01_011_0107_1_1 ",
          price_tooltip: " Up to $67.56/hr ",
        },
        { item_name: "Own product", description: "x" },
        { description: "Only a description" },
      ],
    });

    const rows = await searchInvoiceItems("care", true);

    expect(rows.map((row) => row.name)).toEqual([
      "Assistance with self-care",
      "Own product",
      "Only a description",
    ]);
    expect(rows[0]).toMatchObject({
      detail: "Support item 01_011_0107_1_1",
      supportItemNumber: "01_011_0107_1_1",
      price: "",
      priceHint: "Up to $67.56/hr",
      key: "0-01_011_0107_1_1-Assistance with self-care",
    });
  });

  it("doesn't fall back to the description for a general row's name", async () => {
    apiMock.get.mockResolvedValue({
      data: [{ description: "No name" }, { support_item_name: "Support name" }],
    });

    expect((await searchInvoiceItems("x", false)).map((row) => row.name)).toEqual([
      "Support name",
    ]);
  });

  it("blanks a non-positive or unreadable price, and a non-boolean gst", async () => {
    apiMock.get.mockResolvedValue({
      data: [
        { item_name: "A", price: 0 },
        { item_name: "B", price: "-5" },
        { item_name: "C", price: "abc" },
        { item_name: "D", price: 12.5, gst: 1, category: "Parts" },
      ],
    });

    const rows = await searchInvoiceItems("x", false);
    expect(rows.map((row) => row.price)).toEqual(["", "", "", "12.5"]);
    expect(rows[3]).toMatchObject({ gst: undefined, detail: "Parts" });
  });
});

describe("lineItemPatchFromSuggestion", () => {
  it("fills description and price, and defaults a missing quantity to 1", () => {
    const patch = lineItemPatchFromSuggestion(
      suggestion({ productId: "77", priceHint: "hint" }),
      { ...newLineItem(), quantity: "" },
      { ndis: false, gstDefault: true },
    );
    expect(patch).toEqual({
      description: "Labour",
      price: "90",
      quantity: "1",
      qtyType: "items",
      gst: true,
      productId: "77",
      priceHint: "hint",
    });
  });

  it("keeps a quantity already typed, and the line's own price when the suggestion has none", () => {
    const patch = lineItemPatchFromSuggestion(
      suggestion({ price: "" }),
      { ...newLineItem(), quantity: "3", price: "55" },
      { ndis: false, gstDefault: false },
    );
    expect(patch).toMatchObject({ quantity: "3", price: "55" });
  });

  it("replaces a zero quantity with 1", () => {
    const patch = lineItemPatchFromSuggestion(
      suggestion(),
      { ...newLineItem(), quantity: "0" },
      { ndis: false, gstDefault: false },
    );
    expect(patch.quantity).toBe("1");
  });

  it("takes the suggestion's GST, falling back to the business default", () => {
    const item = newLineItem();
    expect(
      lineItemPatchFromSuggestion(suggestion({ gst: false }), item, { ndis: false, gstDefault: true }).gst,
    ).toBe(false);
    expect(
      lineItemPatchFromSuggestion(suggestion(), item, { ndis: false, gstDefault: true }).gst,
    ).toBe(true);
  });

  it("makes an NDIS line GST-free whatever the row says", () => {
    expect(
      lineItemPatchFromSuggestion(suggestion({ gst: true }), newNdisLineItem(), {
        ndis: true,
        gstDefault: true,
      }).gst,
    ).toBe(false);
  });

  it("sets the support number only on an NDIS line, and never touches claim type or date", () => {
    const withNumber = suggestion({ supportItemNumber: "01_011_0107_1_1" });

    const ndisPatch = lineItemPatchFromSuggestion(withNumber, newNdisLineItem(), {
      ndis: true,
      gstDefault: false,
    });
    expect(ndisPatch.supportItemNumber).toBe("01_011_0107_1_1");
    expect(ndisPatch).not.toHaveProperty("claimType");
    expect(ndisPatch).not.toHaveProperty("date");

    const generalPatch = lineItemPatchFromSuggestion(withNumber, newLineItem(), {
      ndis: false,
      gstDefault: false,
    });
    expect(generalPatch).not.toHaveProperty("supportItemNumber");
  });

  it("normalises the quantity type, keeping the line's own when the row has none", () => {
    const item = { ...newLineItem(), qtyType: "km" as const };
    expect(
      lineItemPatchFromSuggestion(suggestion({ qtyType: "days" }), item, { ndis: false, gstDefault: false })
        .qtyType,
    ).toBe("days");
    expect(
      lineItemPatchFromSuggestion(suggestion(), item, { ndis: false, gstDefault: false }).qtyType,
    ).toBe("km");
    expect(
      lineItemPatchFromSuggestion(suggestion({ qtyType: "Per visit" }), item, {
        ndis: false,
        gstDefault: false,
      }).qtyType,
    ).toBe("items");
  });
});
