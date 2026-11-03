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

// Imported after the mock so `lib/sales-templates.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const { fetchSalesTemplates, fetchTemplatePreviewHtml, templatesFor } =
  await import("@/lib/sales-templates");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchSalesTemplates", () => {
  it("maps a flat list, splitting by category and document type", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { id: 1, name: "Standard", category_name: "GEN", type: "invoice" },
          { id: 2, name: "Classic", category_name: "CLASSIC", type: "invoice" },
          { id: 3, name: "NDIS Claim", category_name: "NDIS", type: "invoice" },
          { id: 4, name: "General Quote", category_name: "GEN", type: "quote" },
        ],
      },
    });

    const templates = await fetchSalesTemplates();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.templates.getList);
    expect(templates).toEqual([
      expect.objectContaining({ id: "1", group: "General", kind: "invoice" }),
      expect.objectContaining({ id: "2", group: "Classic", kind: "invoice" }),
      expect.objectContaining({ id: "3", group: "NDIS", kind: "invoice" }),
      expect.objectContaining({ id: "4", group: "General", kind: "quote" }),
    ]);
  });

  it("flattens the categorised-object response shape the same way", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          GEN: [{ id: 10, category_name: "GEN", type: "invoice" }],
          NDIS: [{ id: 11, category_name: "NDIS", type: "quote" }],
        },
      },
    });

    const templates = await fetchSalesTemplates();
    expect(templates.map((t) => t.id)).toEqual(["10", "11"]);
  });

  it("drops any template outside GEN, CLASSIC and NDIS", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [{ id: 1, category_name: "SOMETHING_ELSE", type: "invoice" }],
      },
    });

    expect(await fetchSalesTemplates()).toEqual([]);
  });

  it("returns an empty list when the server sends no data", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    expect(await fetchSalesTemplates()).toEqual([]);
  });

  it("prefers the server thumbnail, and falls back to a static sample per group otherwise", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 1,
            category_name: "GEN",
            type: "invoice",
            thumbnail: "https://cdn.example.com/t1.png",
          },
          { id: 2, category_name: "NDIS", type: "invoice" },
          { id: 3, category_name: "GEN", type: "quote" },
        ],
      },
    });

    const templates = await fetchSalesTemplates();
    expect(templates[0].image).toBe("https://cdn.example.com/t1.png");
    expect(templates[1].image).toMatch(/^\/images\/template\/NDISTemplate-/);
    expect(templates[2].image).toMatch(/^\/images\/template\/quote-/);
  });

  it("reads is_default from either a number or a boolean", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { id: 1, category_name: "GEN", type: "invoice", is_default: 1 },
          { id: 2, category_name: "GEN", type: "invoice", is_default: true },
          { id: 3, category_name: "GEN", type: "invoice", is_default: 0 },
        ],
      },
    });

    const templates = await fetchSalesTemplates();
    expect(templates.map((t) => t.isDefault)).toEqual([true, true, false]);
  });
});

describe("templatesFor", () => {
  it("filters by group and document kind together", () => {
    const templates = [
      { id: "1", name: "A", group: "General", kind: "invoice", image: "", isDefault: false },
      { id: "2", name: "B", group: "General", kind: "quote", image: "", isDefault: false },
      { id: "3", name: "C", group: "NDIS", kind: "invoice", image: "", isDefault: false },
    ] as const;

    expect(templatesFor([...templates], "General", "invoice").map((t) => t.id)).toEqual([
      "1",
    ]);
    expect(templatesFor([...templates], "NDIS", "invoice").map((t) => t.id)).toEqual(["3"]);
    expect(templatesFor([...templates], "Classic", "invoice")).toEqual([]);
  });
});

describe("fetchTemplatePreviewHtml", () => {
  it("hits the invoice template-details endpoint for an invoice", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { html: "<p>Invoice</p>" } },
    });

    const html = await fetchTemplatePreviewHtml("7", "invoice");

    expect(html).toBe("<p>Invoice</p>");
    const [url] = apiMock.get.mock.calls[0];
    expect(url).toBe(`${apiRoutes.templates.getDetails}/7/details?invoiceId=&useDemo=false`);
  });

  it("hits quote.preview for a quote", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { html: "<p>Quote</p>" } },
    });

    const html = await fetchTemplatePreviewHtml("25", "quote");

    expect(html).toBe("<p>Quote</p>");
    const [url] = apiMock.get.mock.calls[0];
    expect(url).toBe(`${apiRoutes.quote.preview("25")}?quoteId=`);
  });

  it("reads a top-level html field when data isn't an object carrying one", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, html: "<p>Top level</p>" },
    });
    expect(await fetchTemplatePreviewHtml("1", "invoice")).toBe("<p>Top level</p>");
  });

  it("reads data itself when the server returns the HTML as a bare string", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: "<p>Bare</p>" } });
    expect(await fetchTemplatePreviewHtml("1", "invoice")).toBe("<p>Bare</p>");
  });

  it("falls back to a friendly message when no HTML comes back at all", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });
    expect(await fetchTemplatePreviewHtml("1", "invoice")).toBe(
      "<p>Template preview not available</p>",
    );
  });
});
