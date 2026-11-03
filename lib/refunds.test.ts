import { describe, expect, it, vi, beforeEach } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
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

// Imported after the mock so `lib/refunds.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above. `paginate`
// doesn't touch the network, but it's kept dynamic too rather than a static
// top-level import — a static one gets hoisted ahead of `apiMock`/`vi.mock`
// above, which throws on evaluation.
const {
  fetchClientRefunds,
  createClientRefundApi,
  updateClientRefundApi,
  markClientRefundedApi,
  deleteClientRefundApi,
  generateClientRefundNumberApi,
  emptyRefundDraft,
  filterRefunds,
} = await import("@/lib/refunds");
const { paginate } = await import("@/lib/products");

import type { Refund, RefundDraft } from "@/lib/refunds";

function decryptedFieldsFromBody(body: unknown): Record<string, unknown> {
  const asData = body as { data?: string };
  if (typeof asData?.data !== "string") {
    throw new Error("Body was not an encrypted {data} envelope");
  }
  return decryptPayload(asData.data);
}

function draft(overrides: Partial<RefundDraft> = {}): RefundDraft {
  return {
    ...emptyRefundDraft("CRN-0001", "2026-03-01"),
    clientId: "44231",
    clientName: "Turner Consulting",
    amount: "450",
    gstAmount: "40.91",
    reason: "Overpayment",
    invoiceId: "21",
    ...overrides,
  };
}

function refund(overrides: Partial<Refund> = {}): Refund {
  return {
    id: "ref-1",
    clientId: "c1",
    clientName: "Turner Consulting",
    date: "2026-03-01",
    reference: "CRN-0001",
    type: "Client refund",
    amount: "450",
    gstAmount: "40.91",
    gstManual: false,
    reason: "Overpayment",
    reasonOther: "",
    notes: "",
    invoiceId: null,
    bank: null,
    status: "Issued",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchClientRefunds", () => {
  it("scopes the request to this user, the client side of the endpoint, and a page large enough to cover everything", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });

    await fetchClientRefunds(493);

    expect(apiMock.get).toHaveBeenCalledTimes(1);
    const [url, config] = apiMock.get.mock.calls[0];
    expect(url).toBe(apiRoutes.creditNote.list);
    expect(config.params).toEqual({
      user_id: "493",
      type: "client",
      page: "1",
      limit: "500",
    });
  });

  it("derives 'Client refund' vs 'Credit note' from has_complete_bank_info, not the server's own type", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 1,
            credit_note_no: "CRN-0001",
            credit_note_date: "2026-03-01",
            type: "client",
            total: 110,
            gst_amount: 10,
            reason: "Returned goods",
            status: "issued",
            has_complete_bank_info: true,
            client: {
              business_name: "Turner Consulting",
              account_holder: "Turner Consulting",
              bsb: "062-000",
              account_number: "10054321",
            },
          },
          {
            id: 2,
            credit_note_no: "CRN-0002",
            credit_note_date: "2026-03-02",
            type: "client",
            total: 55,
            gst_amount: 5,
            reason: "Billing adjustment",
            status: "refunded",
            has_complete_bank_info: false,
            client: { name: "Williams Health Services" },
          },
        ],
      },
    });

    const refunds = await fetchClientRefunds(493);

    expect(refunds[0]).toMatchObject({
      id: "1",
      reference: "CRN-0001",
      type: "Client refund",
      status: "Issued",
      clientName: "Turner Consulting",
      bank: {
        accountName: "Turner Consulting",
        bsb: "062-000",
        accountNumber: "10054321",
      },
    });

    expect(refunds[1]).toMatchObject({
      id: "2",
      reference: "CRN-0002",
      type: "Credit note",
      status: "Refunded",
      clientName: "Williams Health Services",
      bank: null,
    });
  });

  it("maps the client's contact id from client.id, so the table can match a live Contacts entry", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 1,
            credit_note_no: "CRN-0003",
            credit_note_date: "2026-09-09",
            type: "client",
            total: "450.00",
            gst_amount: "40.91",
            reason: "Overpayment",
            status: "issued",
            has_complete_bank_info: true,
            client: {
              id: 44231,
              name: "Emma Williams",
              business_name: "Williams Health Services",
              bsb: "013456",
              account_number: "456123789",
              account_holder: "Emma Williams",
              bank_name: "ANZ Bank",
            },
          },
          {
            id: 2,
            credit_note_no: "CRN-0004",
            credit_note_date: "2026-09-09",
            type: "client",
            total: "51.00",
            gst_amount: "0.00",
            reason: "Other reason entirely",
            status: "refunded",
            has_complete_bank_info: false,
            client: null,
          },
        ],
      },
    });

    const refunds = await fetchClientRefunds(493);

    expect(refunds[0].clientId).toBe("44231");
    // No client on the row at all — nothing to match a contact by.
    expect(refunds[1].clientId).toBeNull();
  });

  it("maps the linked invoice's nested id, and links to a known reason case-insensitively while bucketing anything else as Other", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 1,
            credit_note_no: "CRN-0005",
            credit_note_date: "2026-03-01",
            type: "client",
            total: 100,
            gst_amount: 0,
            reason: "overpayment",
            status: "issued",
            has_complete_bank_info: false,
            invoice: { id: 21, invoice_no: "INV-0021" },
          },
          {
            id: 2,
            credit_note_no: "CRN-0006",
            credit_note_date: "2026-03-02",
            type: "client",
            total: 100,
            gst_amount: 0,
            reason: "Goodwill credit after a delayed delivery",
            status: "issued",
            has_complete_bank_info: false,
            invoice: null,
          },
        ],
      },
    });

    const refunds = await fetchClientRefunds(493);

    expect(refunds[0]).toMatchObject({
      invoiceId: "21",
      reason: "Overpayment",
      reasonOther: "",
    });
    expect(refunds[1]).toMatchObject({
      invoiceId: null,
      reason: "Other",
      reasonOther: "Goodwill credit after a delayed delivery",
    });
  });
});

describe("createClientRefundApi", () => {
  it("POSTs the encrypted fields, keyed for the create endpoint's own vocabulary", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });

    await createClientRefundApi(draft(), 493);

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.creditNote.add);
    expect(decryptedFieldsFromBody(body)).toEqual({
      user_id: "493",
      type: "client",
      status: "issued",
      related_invoice_id: "21",
      reason: "Overpayment",
      gst_amount: 40.91,
      total: 450,
      credit_note_date: "2026-03-01",
      credit_note_number: "CRN-0001",
    });
  });

  it("sends the free-text reason for 'Other', not the placeholder label", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });

    await createClientRefundApi(
      draft({ reason: "Other", reasonOther: "Goodwill credit" }),
      493,
    );

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.reason).toBe("Goodwill credit");
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Invoice not found" },
    });
    await expect(createClientRefundApi(draft(), 493)).rejects.toThrow(
      "Invoice not found",
    );
  });

  it("translates the generic 'invoice or expense' message into something that makes sense for a client refund", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: false,
        message: "Either invoice or expense reference is required",
      },
    });
    await expect(
      createClientRefundApi(draft({ invoiceId: null }), 493),
    ).rejects.toThrow(
      "Select an invoice to link this refund to — a client refund can't be saved without one.",
    );
  });
});

describe("updateClientRefundApi", () => {
  it("PATCHes the id/user_id path with the encrypted fields, keyed for the model's own column names", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });

    await updateClientRefundApi("7", draft(), "Refunded", 493);

    const [url, body] = apiMock.patch.mock.calls[0];
    expect(url).toBe(`${apiRoutes.creditNote.update}/7/493`);
    expect(decryptedFieldsFromBody(body)).toEqual({
      related_invoice_id: "21",
      reason: "Overpayment",
      gst_amount: 40.91,
      total: 450,
      credit_note_date: "2026-03-01",
      credit_note_no: "CRN-0001",
      status: "refunded",
    });
  });

  it("sends 'issued' for any status other than Refunded", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });

    await updateClientRefundApi("7", draft(), "Issued", 493);

    const fields = decryptedFieldsFromBody(apiMock.patch.mock.calls[0][1]);
    expect(fields.status).toBe("issued");
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.patch.mockResolvedValue({
      data: { success: false, message: "Unauthorized to update this Credit Note" },
    });
    await expect(
      updateClientRefundApi("7", draft(), "Issued", 493),
    ).rejects.toThrow("Unauthorized to update this Credit Note");
  });
});

describe("markClientRefundedApi", () => {
  it("PATCHes just the encrypted status, leaving every other field alone", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });

    await markClientRefundedApi("7", 493);

    const [url, body] = apiMock.patch.mock.calls[0];
    expect(url).toBe(`${apiRoutes.creditNote.update}/7/493`);
    expect(decryptedFieldsFromBody(body)).toEqual({ status: "refunded" });
  });
});

describe("deleteClientRefundApi", () => {
  it("DELETEs by id, with no body", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });

    await deleteClientRefundApi("7");

    expect(apiMock.delete).toHaveBeenCalledWith(
      `${apiRoutes.creditNote.update}/7`,
    );
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.delete.mockResolvedValue({
      data: { success: false, message: "Refunded Credit Note cannot be deleted" },
    });
    await expect(deleteClientRefundApi("7")).rejects.toThrow(
      "Refunded Credit Note cannot be deleted",
    );
  });
});

describe("generateClientRefundNumberApi", () => {
  it("POSTs the encrypted user_id and returns the server's generated reference", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: "CR-12" } });

    const reference = await generateClientRefundNumberApi(493);

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.creditNote.generate);
    expect(decryptedFieldsFromBody(body)).toEqual({ user_id: "493" });
    expect(reference).toBe("CR-12");
  });

  it("throws when the server reports failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Failed to generate credit number" },
    });
    await expect(generateClientRefundNumberApi(493)).rejects.toThrow(
      "Failed to generate credit number",
    );
  });
});

/**
 * The listing's own pagination — `RefundsTable` filters the full fetched
 * list client-side with `filterRefunds`, then slices *that* result with
 * `paginate` (lib/products.ts, shared with the product catalogues and the
 * same `NumberedPagination` bar the invoice list uses). These tests exercise
 * that exact combination rather than `paginate` in isolation, since a filter
 * narrowing the list is what the page-reset behaviour in the table exists
 * for in the first place.
 */
describe("client refunds — filter then paginate", () => {
  const refunds = Array.from({ length: 23 }, (_, index) =>
    refund({
      id: `ref-${index + 1}`,
      reference: `CRN-${String(index + 1).padStart(4, "0")}`,
      clientName: index % 2 === 0 ? "Turner Consulting" : "Williams Health",
      status: index % 3 === 0 ? "Refunded" : "Issued",
    }),
  );

  it("paginates the unfiltered list in pages of the requested size", () => {
    const filtered = filterRefunds(refunds, {
      query: "",
      status: "All status",
    });

    const page1 = paginate(filtered, 1, 10);
    expect(page1.rows).toHaveLength(10);
    expect(page1.rows[0].reference).toBe("CRN-0001");
    expect(page1).toMatchObject({ page: 1, pageCount: 3, total: 23 });

    const page3 = paginate(filtered, 3, 10);
    expect(page3.rows).toHaveLength(3);
    expect(page3.rows[0].reference).toBe("CRN-0021");
  });

  it("paginates the filtered result, not the full list", () => {
    const filtered = filterRefunds(refunds, {
      query: "",
      status: "Refunded",
    });
    // Every third seeded refund (index 0, 3, 6, ...) is "Refunded" — 8 of 23.
    expect(filtered).toHaveLength(8);

    const page1 = paginate(filtered, 1, 5);
    expect(page1.rows).toHaveLength(5);
    expect(page1.pageCount).toBe(2);
    expect(page1.rows.every((entry) => entry.status === "Refunded")).toBe(
      true,
    );
  });

  it("a search narrow enough to fit on one page reports just the one page", () => {
    const filtered = filterRefunds(refunds, {
      query: "CRN-0001",
      status: "All status",
    });
    expect(filtered).toHaveLength(1);

    const page = paginate(filtered, 1, 10);
    expect(page.pageCount).toBe(1);
    expect(page.rows).toHaveLength(1);
  });

  it("clamps back onto the last page once a filter leaves fewer pages than before", () => {
    const everyone = paginate(
      filterRefunds(refunds, { query: "", status: "All status" }),
      3,
      10,
    );
    expect(everyone.page).toBe(3);

    // Narrowing to a client with fewer rows, while still "on page 3" — the
    // table itself resets to page 1 on a filter change (see refunds-table.tsx),
    // but `paginate` clamps on its own regardless, so a stale page number is
    // never left pointing past the end.
    const narrowed = filterRefunds(refunds, {
      query: "Williams",
      status: "All status",
    });
    const page = paginate(narrowed, 3, 10);
    expect(page.page).toBe(2);
    expect(page.pageCount).toBe(2);
  });
});
