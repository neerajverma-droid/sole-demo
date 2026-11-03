import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const { draftInvoicesQueryKey, fetchDraftInvoices } = await import(
  "@/lib/invoice-drafts"
);

describe("fetchDraftInvoices", () => {
  beforeEach(() => apiMock.get.mockReset());

  it("asks the account-wide route, with no params, when no client is given", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });
    await fetchDraftInvoices();
    expect(apiMock.get.mock.calls[0][0]).toBe(apiRoutes.invoice.allDrafts);
    expect(apiMock.get.mock.calls[0][1]).toBeUndefined();
  });

  it("asks the per-client route with client_id when one is given", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });
    await fetchDraftInvoices("42");
    expect(apiMock.get.mock.calls[0][0]).toBe(apiRoutes.invoice.drafts);
    expect(apiMock.get.mock.calls[0][1]).toEqual({ params: { client_id: "42" } });
  });

  it("maps a draft row, trimming the date to an ISO day", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 91,
            invoice_no: "invoice12",
            notes: "Site visit",
            total: "240.50",
            invoice_date: "2026-09-01T00:00:00.000Z",
            template_id: 3,
            client: { id: 7, name: "Acme Pty Ltd" },
            invoiceItem: [{ description: "Consulting" }],
          },
        ],
      },
    });

    const [draft] = await fetchDraftInvoices();
    expect(draft).toEqual({
      id: "91",
      number: "invoice12",
      clientName: "Acme Pty Ltd",
      date: "2026-09-01",
      description: "Site visit",
      total: 240.5,
      templateId: "3",
    });
  });

  it("falls back to the first line's description, then to nothing", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { id: 1, notes: "  ", invoiceItem: [{ description: "Consulting" }] },
          { id: 2, invoiceItem: [] },
        ],
      },
    });

    const [withItem, bare] = await fetchDraftInvoices();
    expect(withItem.description).toBe("Consulting");
    expect(bare.description).toBe("");
  });

  it("falls back to #id when the draft has no number, and leaves no template undefined", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [{ id: 5 }] },
    });
    const [draft] = await fetchDraftInvoices();
    expect(draft.number).toBe("#5");
    expect(draft.templateId).toBeUndefined();
    expect(draft.total).toBe(0);
  });

  it("throws on an unsuccessful envelope rather than returning an empty list", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: false, message: "Nope" },
    });
    await expect(fetchDraftInvoices()).rejects.toThrow("Nope");
  });
});

describe("draftInvoicesQueryKey", () => {
  it("separates the account-wide list from each client's", () => {
    expect(draftInvoicesQueryKey(null)).toEqual(["invoice-drafts", "all"]);
    expect(draftInvoicesQueryKey()).toEqual(["invoice-drafts", "all"]);
    expect(draftInvoicesQueryKey("42")).toEqual(["invoice-drafts", "42"]);
  });
});
