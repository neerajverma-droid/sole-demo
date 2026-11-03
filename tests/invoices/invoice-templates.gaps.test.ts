import { describe, expect, it, vi, beforeEach } from "vitest";

import apiRoutes from "@/config/api-routes";
import { NDIS_INDUSTRY } from "@/lib/settings";
import { decryptPayload } from "@/utils/encrypt";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

// The saving payloads, PUT-on-update and the shared-default rules are in
// lib/invoice-templates.test.ts. This file covers the rest of the module: the
// gallery list, its filters, opening a template into a draft, and the save
// calls' failure paths.
const {
  accentForId,
  createInvoiceDefaultApi,
  draftFromInvoiceDefault,
  fetchInvoiceDefaultDetail,
  fetchInvoiceDefaults,
  filterTemplates,
  filtersForTemplates,
  isNdisTemplate,
  templateHref,
  templateIndustryTag,
  templateItemPayload,
  templateSaveIssue,
  toggleInvoiceDefaultFavouriteApi,
  updateInvoiceDefaultApi,
  withoutBlanks,
} = await import("@/lib/invoice-templates");
const { emptyInvoiceDraft, newLineItem } = await import("@/lib/invoices");

type InvoiceTemplate = Awaited<
  ReturnType<typeof fetchInvoiceDefaults>
>["templates"][number];

function template(over: Partial<InvoiceTemplate> = {}): InvoiceTemplate {
  return {
    id: "1",
    name: "Bathroom reno",
    category: "Trades",
    industry: "General",
    accent: "indigo",
    summary: "",
    description: "",
    items: [],
    paymentTermsDays: 7,
    ...over,
  };
}

const SAVE_INPUT = {
  draft: emptyInvoiceDraft("INV-1", "2026-10-07"),
  category: "Intake",
  ndis: false,
  industryId: 3,
  gstPercent: 10,
  gstEnabled: true,
  renderTemplateId: "1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ *
 * The gallery list
 * ------------------------------------------------------------------ */

describe("fetchInvoiceDefaults", () => {
  it("asks for invoice templates under the business's industry", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { invoices: [] } } });

    await fetchInvoiceDefaults(9);

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.invoice.default, {
      params: { module: "invoice", page_size: 100, industry_id: 9 },
    });
  });

  it("leaves industry_id out entirely when the business has none", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { invoices: [] } } });

    await fetchInvoiceDefaults(null);

    expect(apiMock.get.mock.calls[0][1]).toEqual({
      params: { module: "invoice", page_size: 100 },
    });
  });

  it("maps each row into a card, with blank placeholder lines sized by item_count", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          invoices: [
            {
              id: 5,
              category: " Intake Assessment ",
              template_scope_label: "Assessment",
              type: "ndis",
              description: " First visit ",
              popular: true,
              recently_used: false,
              item_count: 2,
              is_favourite: true,
            },
            { id: 6, item_count: 0 },
          ],
        },
      },
    });

    const { templates, favouriteIds } = await fetchInvoiceDefaults(9);

    expect(templates[0]).toMatchObject({
      id: "5",
      name: "Intake Assessment",
      category: "Assessment",
      industry: NDIS_INDUSTRY,
      popular: true,
      recentlyUsed: false,
      summary: "First visit",
      description: " First visit ",
      paymentTermsDays: 7,
      accent: accentForId("5"),
    });
    expect(templates[0].items).toEqual([
      { description: "", quantity: "", price: "", gst: false },
      { description: "", quantity: "", price: "", gst: false },
    ]);
    // A row with nothing filled in still renders as something.
    expect(templates[1]).toMatchObject({
      name: "Untitled template",
      category: "General",
      industry: "General",
      summary: "General template",
      items: [],
    });
    expect(favouriteIds).toEqual(["5"]);
  });

  it("is empty when the response carries no list", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });
    expect(await fetchInvoiceDefaults(9)).toEqual({ templates: [], favouriteIds: [] });
  });
});

describe("toggleInvoiceDefaultFavouriteApi", () => {
  it("POSTs to the template's own favourite route and returns the new state", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { is_favourite: true } } });

    expect(await toggleInvoiceDefaultFavouriteApi("5")).toBe(true);
    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.invoice.defaultFavourite("5"));
  });

  it("reads a missing answer as not favourited", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false } });
    expect(await toggleInvoiceDefaultFavouriteApi("5")).toBe(false);
  });
});

describe("accentForId", () => {
  it("gives the same id the same colour every time", () => {
    expect(accentForId("abc")).toBe(accentForId("abc"));
    expect(["indigo", "orange", "teal"]).toContain(accentForId("abc"));
  });

  it("spreads ids across the palette", () => {
    const accents = new Set(["1", "2", "3", "4", "5", "6"].map(accentForId));
    expect(accents.size).toBeGreaterThan(1);
  });
});

/* ------------------------------------------------------------------ *
 * Filters, routing and tags
 * ------------------------------------------------------------------ */

describe("filtersForTemplates", () => {
  it("shows the saved views, then only the categories actually present, in their fixed order", () => {
    const filters = filtersForTemplates([
      template({ category: "Support" }),
      template({ category: "Trades" }),
      template({ category: "Something custom" }),
    ]);
    expect(filters).toEqual(["All", "Favourites", "Recent", "Popular", "Trades", "Support"]);
  });
});

describe("filterTemplates", () => {
  const templates = [
    template({ id: "1", name: "Bathroom reno", category: "Trades", popular: true }),
    template({ id: "2", name: "Logo design", category: "Creative", recentlyUsed: true }),
    template({ id: "3", name: "Strategy day", category: "Consulting" }),
  ];
  const ids = (list: InvoiceTemplate[]) => list.map((t) => t.id);

  it("narrows by the saved views and by category", () => {
    expect(ids(filterTemplates(templates, "All", "", []))).toEqual(["1", "2", "3"]);
    expect(ids(filterTemplates(templates, "Favourites", "", ["3"]))).toEqual(["3"]);
    expect(ids(filterTemplates(templates, "Recent", "", []))).toEqual(["2"]);
    expect(ids(filterTemplates(templates, "Popular", "", []))).toEqual(["1"]);
    expect(ids(filterTemplates(templates, "Creative", "", []))).toEqual(["2"]);
  });

  it("searches name and category, case-insensitively and trimmed", () => {
    expect(ids(filterTemplates(templates, "All", "  LOGO ", []))).toEqual(["2"]);
    expect(ids(filterTemplates(templates, "All", "consult", []))).toEqual(["3"]);
  });

  it("applies the search inside the chosen filter, not across everything", () => {
    expect(ids(filterTemplates(templates, "Trades", "logo", []))).toEqual([]);
  });
});

describe("isNdisTemplate / templateHref / templateIndustryTag", () => {
  it("opens an NDIS template in the NDIS editor and anything else in the general one", () => {
    const ndis = template({ id: "5", industry: NDIS_INDUSTRY });
    const general = template({ id: "6", industry: "General" });

    expect(isNdisTemplate(ndis)).toBe(true);
    expect(templateHref(ndis)).toBe("/invoices/new/ndis?template=5");
    expect(isNdisTemplate(general)).toBe(false);
    expect(templateHref(general)).toBe("/invoices/new/general?template=6");
  });

  it("tags NDIS short, another industry by name, and General not at all", () => {
    expect(templateIndustryTag(template({ industry: NDIS_INDUSTRY }))).toBe("NDIS");
    expect(templateIndustryTag(template({ industry: "General" }))).toBeUndefined();
    const other = template({ industry: "Trades" as never });
    expect(templateIndustryTag(other)).toBe("Trades");
  });
});

/* ------------------------------------------------------------------ *
 * Opening a template
 * ------------------------------------------------------------------ */

describe("fetchInvoiceDefaultDetail", () => {
  it("returns the record from the template's detail route", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { category: "Intake", invoice_item: [] } },
    });

    expect(await fetchInvoiceDefaultDetail("5")).toEqual({
      category: "Intake",
      invoice_item: [],
    });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.invoice.defaultDetail("5"));
  });

  it("throws when there's no record", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });
    await expect(fetchInvoiceDefaultDetail("5")).rejects.toThrow("Template not found");
  });
});

describe("draftFromInvoiceDefault", () => {
  it("dates the draft today and sets due to today + payment_term", () => {
    const draft = draftFromInvoiceDefault({ payment_term: 14 }, false, "INV-9", "2026-10-07");
    expect(draft).toMatchObject({ number: "INV-9", issued: "2026-10-07", due: "2026-10-21" });
  });

  it("falls back to 7 days when payment_term is missing or 0", () => {
    expect(draftFromInvoiceDefault({}, false, "INV-9", "2026-10-07").due).toBe("2026-10-14");
    expect(
      draftFromInvoiceDefault({ payment_term: 0 }, false, "INV-9", "2026-10-07").due,
    ).toBe("2026-10-14");
  });

  it("gives a general line GST only when the template saved a positive rate", () => {
    const draft = draftFromInvoiceDefault(
      {
        invoice_item: [
          { description: "Labour", qty: 2, price: "90", gst_percentage: 10, qty_type: "hours" },
          { description: "Skip bin", qty: "1", price: 300, gst_percentage: "0" },
        ],
      },
      false,
      "INV-9",
      "2026-10-07",
    );

    expect(draft.ndis).toBe(false);
    expect(draft.items[0]).toMatchObject({
      description: "Labour",
      quantity: "2",
      price: "90",
      qtyType: "hours",
      gst: true,
      supportItemNumber: undefined,
      claimType: undefined,
      date: undefined,
    });
    expect(draft.items[1]).toMatchObject({ quantity: "1", price: "300", gst: false, qtyType: "items" });
  });

  it("makes every NDIS support GST-free and dates an undated one today", () => {
    const draft = draftFromInvoiceDefault(
      {
        invoice_item: [
          {
            description: "Assessment",
            qty: 1,
            price: 230,
            gst_percentage: 10,
            item_support_no: "09_034567890_0120_1_3",
            claim_type: "Travel - Time",
          },
          { description: "Report", qty: 1, price: 100, date: "2026-09-30" },
        ],
      },
      true,
      "INV-9",
      "2026-10-07",
    );

    expect(draft.ndis).toBe(true);
    expect(draft.items[0]).toMatchObject({
      gst: false,
      supportItemNumber: "09_034567890_0120_1_3",
      // Matched on letters and digits alone, so a hyphen lands on the en dash.
      claimType: "Travel – Time",
      date: "2026-10-07",
    });
    expect(draft.items[1]).toMatchObject({
      supportItemNumber: "",
      claimType: "Standard Service",
      date: "2026-09-30",
    });
  });

  it("reads a line's discount as the template stored it, percent or flat amount", () => {
    const draft = draftFromInvoiceDefault(
      {
        invoice_item: [
          { description: "A", qty: 1, price: 100, disc_criteria: "currency", discount_amount: 25 },
          { description: "B", qty: 1, price: 100, disc_criteria: "percent", discount_percentage: 5 },
          { description: "C", qty: 1, price: 100 },
        ],
      },
      false,
      "INV-9",
      "2026-10-07",
    );

    expect(draft.items.map((item) => [item.discountType, item.discountPercent])).toEqual([
      ["amount", "25"],
      ["percent", "5"],
      ["percent", ""],
    ]);
  });

  it("carries the description, extra discount and notes, falling back to a blank draft's", () => {
    const filled = draftFromInvoiceDefault(
      { description: "  Kitchen  ", extra_discount: 20, notes: "Thanks" },
      false,
      "INV-9",
      "2026-10-07",
    );
    expect(filled).toMatchObject({ description: "Kitchen", extraDiscount: "20", notes: "Thanks" });

    const blank = draftFromInvoiceDefault({}, false, "INV-9", "2026-10-07");
    expect(blank).toMatchObject({ description: "", extraDiscount: "", notes: "" });
    // No lines on the template still leaves the editor its one blank row.
    expect(blank.items).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ *
 * Saving
 * ------------------------------------------------------------------ */

describe("templateSaveIssue", () => {
  it("blocks a save until one line is filled", () => {
    const draft = emptyInvoiceDraft("INV-1", "2026-10-07");
    expect(templateSaveIssue(draft)).toBe(
      "Add at least one line item with a description, quantity and price.",
    );

    const filled = {
      ...draft,
      items: [{ ...newLineItem(), description: "Labour", quantity: "1", price: "50" }],
    };
    expect(templateSaveIssue(filled)).toBeUndefined();
  });

  it("doesn't care that there's no client", () => {
    const draft = {
      ...emptyInvoiceDraft("INV-1", "2026-10-07"),
      clientId: null,
      items: [{ ...newLineItem(), description: "Labour", quantity: "1", price: "50" }],
    };
    expect(templateSaveIssue(draft)).toBeUndefined();
  });
});

describe("templateItemPayload", () => {
  it("mirrors the line discount into disc, the field the template endpoints read", () => {
    const payload = templateItemPayload(
      { ...newLineItem(), description: "A", quantity: "1", price: "100", discountPercent: "15" },
      10,
      false,
    );
    expect(payload).toMatchObject({ discount: "15", disc: "15" });
  });
});

describe("withoutBlanks", () => {
  it("drops null, undefined and empty-string keys but keeps 0 and false", () => {
    expect(
      withoutBlanks({ a: null, b: undefined, c: "", d: 0, e: false, f: "x" }),
    ).toEqual({ d: 0, e: false, f: "x" });
  });
});

describe("createInvoiceDefaultApi / updateInvoiceDefaultApi failures", () => {
  it("throws the server's message, or the save fallback, when a create is refused", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Duplicate name" } });
    await expect(createInvoiceDefaultApi(SAVE_INPUT)).rejects.toThrow("Duplicate name");

    apiMock.post.mockResolvedValue({ data: { success: false } });
    await expect(createInvoiceDefaultApi(SAVE_INPUT)).rejects.toThrow(
      "Couldn't save that template.",
    );
  });

  it("throws when a create succeeds without an id at data.invoice.id", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 5 } } });
    await expect(createInvoiceDefaultApi(SAVE_INPUT)).rejects.toThrow(
      "The template saved but the server returned no id.",
    );
  });

  it("throws the update fallback when an update is refused", async () => {
    apiMock.put.mockResolvedValue({ data: { success: false } });
    await expect(updateInvoiceDefaultApi("5", SAVE_INPUT)).rejects.toThrow(
      "Couldn't update that template.",
    );
  });

  it("files an NDIS template under industry 9 when the business has no industry", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { invoice: { id: 1 } } } });

    await createInvoiceDefaultApi({ ...SAVE_INPUT, ndis: true, industryId: null });

    const body = apiMock.post.mock.calls[0][1] as { data: string };
    expect(decryptPayload(body.data)).toMatchObject({ industry_id: 9, type: "ndis" });
  });
});
