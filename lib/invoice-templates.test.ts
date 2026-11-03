import { describe, expect, it, vi, beforeEach } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const {
  createInvoiceDefaultApi,
  fetchInvoiceDefaults,
  isGlobalTemplateOwner,
  updateInvoiceDefaultApi,
} = await import("@/lib/invoice-templates");
const { emptyInvoiceDraft, emptyNdisDraft, newNdisLineItem } = await import(
  "@/lib/invoices"
);

function sentFields(body: unknown): Record<string, unknown> {
  return decryptPayload((body as { data: string }).data);
}

const BASE_INPUT = {
  category: "Intake Assessment",
  gstPercent: 10,
  gstEnabled: true,
  renderTemplateId: "7",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saving a template", () => {
  it("sends the dates the backend requires, the business industry and the line discount", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { invoice: { id: 41 } } },
    });
    const draft = {
      ...emptyNdisDraft("INV-1", "2026-10-07"),
      issued: "2026-10-07",
      due: "2026-10-14",
      items: [
        {
          ...newNdisLineItem(),
          description: "Initial Assessment",
          quantity: "1",
          price: "230",
          discountPercent: "10",
          supportItemNumber: "09_034567890_0120_1_3",
          date: "2026-10-07",
        },
      ],
    };

    const { id } = await createInvoiceDefaultApi({
      ...BASE_INPUT,
      draft,
      ndis: true,
      industryId: 9,
    });

    expect(id).toBe("41");
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.default);
    const fields = sentFields(body);
    expect(fields).toMatchObject({
      category: "Intake Assessment",
      invoice_date: "2026-10-07",
      due_date: "2026-10-14",
      payment_term: 7,
      industry_id: 9,
      module: "invoice",
      type: "ndis",
    });
    const [item] = fields.items as Array<Record<string, unknown>>;
    expect(item).toMatchObject({ disc: "10", item_support_no: "09_034567890_0120_1_3" });
  });

  it("files a general template under the business's own industry, typed general", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { invoice: { id: 42 } } },
    });
    const draft = {
      ...emptyInvoiceDraft("INV-1", "2026-10-07"),
      issued: "2026-10-07",
      due: "2026-10-21",
      items: [
        {
          ...emptyInvoiceDraft("INV-1", "2026-10-07").items[0],
          description: "Consulting",
          quantity: "2",
          price: "100",
        },
      ],
    };
    await createInvoiceDefaultApi({
      ...BASE_INPUT,
      draft,
      ndis: false,
      industryId: 9,
    });
    const fields = sentFields(apiMock.post.mock.calls[0][1]);
    // An NDIS business's general template must still list in its gallery.
    expect(fields).toMatchObject({ industry_id: 9, type: "general", due_date: "2026-10-21" });
    // Blank keys are dropped on create rather than sent as "".
    expect(fields).not.toHaveProperty("deposit_due_date");
  });

  it("updates with PUT on the template's own id", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });
    await updateInvoiceDefaultApi("41", {
      ...BASE_INPUT,
      draft: { ...emptyInvoiceDraft("INV-1", "2026-10-07"), issued: "2026-10-07", due: "2026-10-14" },
      ndis: false,
      industryId: 3,
    });
    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.defaultDetail("41"));
    expect(sentFields(body)).toMatchObject({ category: "Intake Assessment", due_date: "2026-10-14" });
  });
});

describe("default (shared) templates", () => {
  it("are the user_id = 0 rows", () => {
    expect(isGlobalTemplateOwner(0)).toBe(true);
    expect(isGlobalTemplateOwner("0")).toBe(true);
    expect(isGlobalTemplateOwner(7)).toBe(false);
    expect(isGlobalTemplateOwner(null)).toBe(false);
    expect(isGlobalTemplateOwner(undefined)).toBe(false);
  });

  it("marks only shared rows as standard in the gallery, not is_default ones", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          invoices: [
            { id: 1, user_id: 0, category: "Shared", is_default: false },
            { id: 2, user_id: 7, category: "Mine", is_default: true },
          ],
        },
      },
    });
    const { templates } = await fetchInvoiceDefaults(9);
    expect(templates.map((template) => template.standard)).toEqual([true, false]);
  });
});

describe("opening a template", () => {
  it("never preselects a client — a shared default's client_id 0 isn't one", async () => {
    const { draftFromInvoiceDefault } = await import("@/lib/invoice-templates");
    const { documentIssues } = await import("@/lib/invoices");
    const draft = draftFromInvoiceDefault(
      {
        category: "Consumables / Equipment Reimbursement",
        client_id: 0,
        client: null,
        payment_term: 7,
        invoice_item: [
          { description: "Shipping / Delivery", qty: 1, price: 20, item_support_no: "15_012345678_0117_1_3" },
        ],
      },
      true,
      "INV-24",
      "2026-10-07",
    );
    expect(draft.clientId).toBeNull();
    expect(draft.clientName).toBe("");
    // So the editor's own check stops the save and points at the client.
    expect(documentIssues(draft)[0]).toMatchObject({ key: "client" });
  });

  it("treats a '0' client id as no client", async () => {
    const { documentIssues, emptyInvoiceDraft } = await import("@/lib/invoices");
    const draft = { ...emptyInvoiceDraft("INV-1", "2026-10-07"), clientId: "0" };
    expect(documentIssues(draft).some((issue) => issue.key === "client")).toBe(true);
  });
});
