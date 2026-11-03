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
const { fetchSalesTemplates, fetchTemplatePreviewHtml } = await import(
  "@/lib/sales-templates"
);

function listResponse(data: unknown) {
  return { data: { success: true, data } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchSalesTemplates — mapping rules", () => {
  it("names an unnamed or blank-named template 'Template', and trims the rest", async () => {
    apiMock.get.mockResolvedValue(
      listResponse([
        { id: 1, category_name: "GEN", type: "invoice" },
        { id: 2, category_name: "GEN", type: "invoice", name: "   " },
        { id: 3, category_name: "GEN", type: "invoice", name: "  Modern  " },
      ]),
    );
    const templates = await fetchSalesTemplates();
    expect(templates.map((t) => t.name)).toEqual(["Template", "Template", "Modern"]);
  });

  it("treats any type other than 'quote' as an invoice template", async () => {
    apiMock.get.mockResolvedValue(
      listResponse([
        { id: 1, category_name: "GEN" },
        { id: 2, category_name: "GEN", type: "receipt" },
        { id: 3, category_name: "GEN", type: "Quote" },
        { id: 4, category_name: "GEN", type: "quote" },
      ]),
    );
    const templates = await fetchSalesTemplates();
    expect(templates.map((t) => t.kind)).toEqual(["invoice", "invoice", "invoice", "quote"]);
  });

  it("reads only 1 or true as the default — the string '1' is not", async () => {
    apiMock.get.mockResolvedValue(
      listResponse([
        { id: 1, category_name: "GEN", is_default: "1" },
        { id: 2, category_name: "GEN" },
      ]),
    );
    const templates = await fetchSalesTemplates();
    expect(templates.map((t) => t.isDefault)).toEqual([false, false]);
  });
});

describe("fetchSalesTemplates — fallback images", () => {
  it("cycles the invoice sample by position, 1 to 6", async () => {
    apiMock.get.mockResolvedValue(
      listResponse(
        Array.from({ length: 7 }, (_, i) => ({ id: 100 + i, category_name: "GEN", type: "invoice" })),
      ),
    );
    const templates = await fetchSalesTemplates();
    expect(templates.map((t) => t.image)).toEqual([
      "/images/template/Invoice-1.jpg",
      "/images/template/Invoice-2.jpg",
      "/images/template/Invoice-3.jpg",
      "/images/template/Invoice-4.jpg",
      "/images/template/Invoice-5.jpg",
      "/images/template/Invoice-6.jpg",
      "/images/template/Invoice-1.jpg",
    ]);
  });

  it("keys the quote sample on the id, not the position", async () => {
    apiMock.get.mockResolvedValue(
      listResponse([
        { id: 13, category_name: "GEN", type: "quote" },
        { id: 6, category_name: "CLASSIC", type: "quote" },
      ]),
    );
    const [first, second] = await fetchSalesTemplates();
    expect(first.image).toBe("/images/template/quote-2.png");
    expect(second.image).toBe("/images/template/quote-1.png");
  });

  it("uses the NDIS sample for an NDIS quote too", async () => {
    apiMock.get.mockResolvedValue(
      listResponse([{ id: 25, category_name: "NDIS", type: "quote" }]),
    );
    expect((await fetchSalesTemplates())[0].image).toBe(
      "/images/template/NDISTemplate-1.jpg",
    );
  });

  it("counts positions before unknown categories are filtered out", async () => {
    apiMock.get.mockResolvedValue(
      listResponse([
        { id: 1, category_name: "OTHER", type: "invoice" },
        { id: 2, category_name: "OTHER", type: "invoice" },
        { id: 3, category_name: "GEN", type: "invoice" },
        { id: 4, category_name: "NDIS", type: "invoice" },
      ]),
    );
    const templates = await fetchSalesTemplates();
    expect(templates.map((t) => [t.id, t.image])).toEqual([
      ["3", "/images/template/Invoice-3.jpg"],
      ["4", "/images/template/NDISTemplate-4.jpg"],
    ]);
  });

  it("counts positions across the flattened categorised response", async () => {
    apiMock.get.mockResolvedValue(
      listResponse({
        GEN: [
          { id: 1, category_name: "GEN", type: "invoice" },
          { id: 2, category_name: "GEN", type: "invoice" },
        ],
        CLASSIC: [{ id: 3, category_name: "CLASSIC", type: "invoice" }],
      }),
    );
    const templates = await fetchSalesTemplates();
    expect(templates[2]).toMatchObject({
      id: "3",
      group: "Classic",
      image: "/images/template/Invoice-3.jpg",
    });
  });
});

describe("fetchTemplatePreviewHtml — failures", () => {
  it("lets a rejected request through for the caller to handle", async () => {
    apiMock.get.mockRejectedValue(new Error("Network Error"));
    await expect(fetchTemplatePreviewHtml("7", "invoice")).rejects.toThrow(
      "Network Error",
    );
  });

  it("doesn't check success — HTML in a failed envelope still renders", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: false, data: { html: "<p>ok</p>" } },
    });
    expect(await fetchTemplatePreviewHtml("13", "quote")).toBe("<p>ok</p>");
    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.quote.preview("13")}?quoteId=`);
  });

  it("falls back to the friendly message for an empty html string", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { html: "" } } });
    expect(await fetchTemplatePreviewHtml("7", "invoice")).toBe(
      "<p>Template preview not available</p>",
    );
  });
});
