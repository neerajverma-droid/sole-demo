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

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// Imported after the mock so the modules' own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above. The payload
// as a whole is covered by lib/invoice-submit.test.ts; this file tests the
// builders it's made of directly — quotes and templates call them too — plus
// the runtime preview call.
const {
  audTotals,
  billableEntries,
  buildInvoicePayload,
  depositPayload,
  documentTotals,
  fetchInvoiceRuntimePreviewBlob,
  itemPayload,
  money,
  solePayRailOn,
  stripeRailOn,
} = await import("@/lib/invoice-submit");
const { emptyInvoiceDraft, newLineItem, newNdisLineItem } = await import("@/lib/invoices");

type InvoiceDraft = ReturnType<typeof emptyInvoiceDraft>;
type InvoiceLineItem = InvoiceDraft["items"][number];

function line(over: Partial<InvoiceLineItem> = {}): InvoiceLineItem {
  return { ...newLineItem(), description: "Work", quantity: "1", price: "100", gst: false, ...over };
}

const RAILS = {
  stripeConnected: false,
  payrixConnected: false,
  payrixAutomate: false,
  paymentType: "direct_payment",
  showBankDetails: true,
};

const CONTEXT = {
  gstPercent: 10,
  gstEnabled: true,
  templateId: "1",
  rails: RAILS,
  exchangeRate: null as number | null,
  files: [] as File[],
};

function draft(over: Partial<InvoiceDraft> = {}): InvoiceDraft {
  return {
    ...emptyInvoiceDraft("INV-0009", "2026-03-01"),
    due: "2026-03-15",
    clientId: "42",
    items: [line({ quantity: "2", price: "100", gst: true })],
    ...over,
  };
}

function sentFields(body: unknown): Record<string, unknown> {
  return decryptPayload((body as { data: string }).data);
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ *
 * Rounding and totals
 * ------------------------------------------------------------------ */

describe("money", () => {
  it("rounds to cents", () => {
    expect(money(10.005)).toBe(10.01);
    expect(money(1.234)).toBe(1.23);
    expect(money(-2.5)).toBe(-2.5);
  });

  it("turns NaN into 0", () => {
    expect(money(Number.NaN)).toBe(0);
  });
});

describe("documentTotals", () => {
  it("rounds each sum once, after adding the unrounded lines", () => {
    // Three lines of 0.25 + 10% GST: each line's GST is 0.025.
    const totals = documentTotals(
      {
        items: [
          line({ price: "0.25", gst: true }),
          line({ price: "0.25", gst: true }),
          line({ price: "0.25", gst: true }),
        ],
        extraDiscount: "",
      },
      10,
    );
    expect(totals).toEqual({ subTotal: 0.75, discount: 0, extraDiscount: 0, gst: 0.08, total: 0.83 });
  });
});

describe("audTotals", () => {
  const totals = { subTotal: 109, discount: 10.9, extraDiscount: 5.45, gst: 10.9, total: 103.55 };

  it("divides every figure by the rate, rounded to cents", () => {
    expect(audTotals(totals, 1.09)).toEqual({
      subTotal: 100,
      discount: 10,
      extraDiscount: 5,
      gst: 10,
      total: 95,
    });
  });

  it("returns the totals unchanged for a missing, zero or negative rate", () => {
    expect(audTotals(totals, null)).toBe(totals);
    expect(audTotals(totals, 0)).toBe(totals);
    expect(audTotals(totals, -1)).toBe(totals);
  });
});

/* ------------------------------------------------------------------ *
 * Line items
 * ------------------------------------------------------------------ */

describe("itemPayload", () => {
  it("keeps a saved line's own rate and gives a new line the document's", () => {
    expect(itemPayload(line({ price: "100", gst: true, gstPercent: 10 }), 15, false)).toMatchObject({ gst_percentage: 10, gst_amount: 10, amount: 110 });
    expect(itemPayload(line({ price: "100", gst: true }), 15, false)).toMatchObject({ gst_percentage: 15, gst_amount: 15, amount: 115 });
    expect(itemPayload(line({ price: "100", gst: false, gstPercent: 10 }), 15, false)).toMatchObject({ gst_percentage: 0, gst_amount: 0 });
  });

  it("sends the line as typed, with GST and the amount rounded per line", () => {
    expect(
      itemPayload(
        line({ description: "Labour", quantity: "3", price: "33.33", gst: true, qtyType: "hours" }),
        10,
        false,
      ),
    ).toEqual({
      description: "Labour",
      price: "33.33",
      qty: "3",
      product_id: null,
      discount: 0,
      disc_criteria: "percent",
      // 99.99 net + 9.999 GST.
      amount: 109.99,
      gst: true,
      gst_amount: 10,
      gst_percentage: 10,
      qty_type: "hours",
    });
  });

  it("sends a flat discount as 'currency', and a GST-free line with zero GST", () => {
    const payload = itemPayload(
      line({ quantity: "2", price: "50", discountPercent: "15", discountType: "amount", productId: "77" }),
      10,
      false,
    );
    expect(payload).toMatchObject({
      discount: "15",
      disc_criteria: "currency",
      amount: 85,
      gst: false,
      gst_amount: 0,
      gst_percentage: 0,
      product_id: "77",
    });
  });

  it("applies the business's own rate, not a fixed 10%", () => {
    expect(itemPayload(line({ price: "100", gst: true }), 15, false)).toMatchObject({
      gst_amount: 15,
      gst_percentage: 15,
      amount: 115,
    });
  });

  it("adds the support fields only on an NDIS claim", () => {
    const support = {
      ...newNdisLineItem(),
      description: "Self-care",
      quantity: "1",
      price: "65",
      supportItemNumber: "01_011_0107_1_1",
      claimType: "Cancellation" as const,
      date: "2026-03-01",
    };
    expect(itemPayload(support, 10, true)).toMatchObject({
      item_support_no: "01_011_0107_1_1",
      claim_type: "Cancellation",
      date: "2026-03-01",
    });
    expect(itemPayload(support, 10, false)).not.toHaveProperty("item_support_no");

    // A plain line on an NDIS claim still gets the keys, blank.
    expect(itemPayload(line(), 10, true)).toMatchObject({
      item_support_no: "",
      claim_type: "",
      date: "",
    });
  });

  it("can disagree with total_gst by a cent, since each line rounds on its own", () => {
    const items = [
      line({ price: "0.25", gst: true }),
      line({ price: "0.25", gst: true }),
      line({ price: "0.25", gst: true }),
    ];
    const payload = buildInvoicePayload(draft({ items }), "draft", CONTEXT);
    const lineGst = (payload.item as Array<{ gst_amount: number }>).reduce(
      (sum, item) => sum + item.gst_amount,
      0,
    );

    expect(money(lineGst)).toBe(0.09);
    expect(payload.total_gst).toBe(0.08);
  });
});

describe("billableEntries", () => {
  it("keeps rows with a description, quantity or price, with their editor index", () => {
    const items = [
      line({ id: "a" }),
      line({ id: "b", description: "", quantity: "", price: "" }),
      line({ id: "c", description: " ", quantity: "", price: "5" }),
      line({ id: "d", description: "", quantity: "2", price: "" }),
    ];
    expect(billableEntries(items).map(({ item, index }) => [item.id, index])).toEqual([
      ["a", 0],
      ["c", 2],
      ["d", 3],
    ]);
  });

  it("keeps the first row when every row is blank", () => {
    const blank = [
      line({ id: "a", description: "", quantity: "", price: "" }),
      line({ id: "b", description: "", quantity: "0", price: "0" }),
    ];
    expect(billableEntries(blank).map(({ item, index }) => [item.id, index])).toEqual([["a", 0]]);
  });

  it("is empty for no rows at all", () => {
    expect(billableEntries([])).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Deposit
 * ------------------------------------------------------------------ */

describe("depositPayload", () => {
  const totals = { subTotal: 200, discount: 0, extraDiscount: 0, gst: 20, total: 220 };
  const identity = new Map([[0, 0]]);

  it("sends the explicit full-payment shape with no deposit", () => {
    expect(depositPayload({ deposit: null, items: [] }, totals, 10, null, identity)).toEqual({
      payment_structure: "full",
      is_deposit: 0,
      deposit_type: "fixed",
      deposit_selection_type: null,
      deposit_value: null,
      exchange_deposit_value: null,
      deposit_value_currency: null,
      deposit_selected_items: [],
      deposit_due_date: null,
    });
  });

  it("keeps a percentage in points and sends its due date", () => {
    expect(
      depositPayload(
        { deposit: { mode: "percent", value: "25", dueDate: "2026-03-08" }, items: [] },
        totals,
        10,
        null,
        identity,
      ),
    ).toEqual({
      payment_structure: "deposit_balance",
      is_deposit: 1,
      deposit_type: "percentage",
      deposit_selection_type: null,
      deposit_value: 25,
      exchange_deposit_value: null,
      deposit_value_currency: "AUD",
      deposit_selected_items: [],
      deposit_due_date: "2026-03-08",
    });
  });

  it("converts a fixed amount to AUD and keeps the document-currency figure alongside", () => {
    const payload = depositPayload(
      { deposit: { mode: "amount", value: "109" }, items: [] },
      totals,
      10,
      1.09,
      identity,
    );
    expect(payload).toMatchObject({
      deposit_type: "fixed",
      deposit_value: 100,
      exchange_deposit_value: 109,
      deposit_value_currency: "AUD",
      deposit_due_date: null,
    });
  });

  it("leaves a percentage unconverted even with a rate, but still sends exchange_deposit_value", () => {
    const payload = depositPayload(
      { deposit: { mode: "percent", value: "50" }, items: [] },
      totals,
      10,
      2,
      identity,
    );
    // 50% of 220 = 110 in the document currency.
    expect(payload).toMatchObject({ deposit_value: 50, exchange_deposit_value: 110 });
  });

  it("sums the chosen lines incl. GST and renumbers them against the lines sent", () => {
    const items = [
      line({ price: "100", gst: true }),
      line({ description: "", quantity: "", price: "" }),
      line({ price: "50", gst: false }),
    ];
    // Editor row 1 was blank and dropped, so row 2 is sent at position 1.
    const indexMap = new Map([
      [0, 0],
      [2, 1],
    ]);
    const payload = depositPayload(
      { deposit: { mode: "items", value: "0", selectedItems: [1, 2] }, items },
      { ...totals, total: 160 },
      10,
      null,
      indexMap,
    );
    expect(payload).toMatchObject({
      deposit_type: "fixed",
      deposit_selection_type: "select_items",
      deposit_value: 50,
      deposit_selected_items: [1],
    });
  });

  it("flows deposit_due_date through the full invoice payload", () => {
    const payload = buildInvoicePayload(
      draft({ deposit: { mode: "amount", value: "50", dueDate: "2026-03-05" } }),
      "draft",
      CONTEXT,
    );
    expect(payload.deposit_due_date).toBe("2026-03-05");
  });
});

/* ------------------------------------------------------------------ *
 * Payment rails
 * ------------------------------------------------------------------ */

describe("stripeRailOn / solePayRailOn", () => {
  it("needs Stripe both connected and switched on for the invoice", () => {
    expect(stripeRailOn({ stripeEnabled: true }, { ...RAILS, stripeConnected: true })).toBe(true);
    expect(stripeRailOn({ stripeEnabled: true }, RAILS)).toBe(false);
    expect(stripeRailOn({ stripeEnabled: undefined }, { ...RAILS, stripeConnected: true })).toBe(false);
  });

  it("needs SolePay connected, chosen (or automated), and not direct payment", () => {
    const live = { ...RAILS, payrixConnected: true, paymentType: "credit_card" };
    expect(solePayRailOn({ solePayEnabled: true }, live)).toBe(true);
    expect(solePayRailOn({ solePayEnabled: false }, { ...live, payrixAutomate: true })).toBe(false);
    expect(solePayRailOn({ solePayEnabled: undefined }, { ...live, payrixAutomate: true })).toBe(true);
    expect(solePayRailOn({ solePayEnabled: true }, { ...live, paymentType: "direct_payment" })).toBe(
      false,
    );
    expect(solePayRailOn({ solePayEnabled: true }, { ...live, payrixConnected: false })).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Runtime preview
 * ------------------------------------------------------------------ */

describe("fetchInvoiceRuntimePreviewBlob", () => {
  it("POSTs the draft payload encrypted, with the lines under items and render_type pdf", async () => {
    apiMock.post.mockResolvedValue({ data: new Uint8Array([37, 80, 68, 70]) });

    const blob = await fetchInvoiceRuntimePreviewBlob(draft(), CONTEXT);

    const [url, body, config] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.templates.runtimePreview);
    expect(config).toEqual({ responseType: "blob" });

    const fields = sentFields(body);
    expect(fields).toMatchObject({
      invoice_no: "INV-0009",
      template_id: "1",
      render_type: "pdf",
      save: 0,
      isStripe: 0,
      // A top-level boolean goes through encryptPayload as its string form.
      isPayrix: "false",
    });
    expect(fields.items).toEqual(fields.item);
    expect((fields.items as unknown[]).length).toBe(1);
    expect(fields).not.toHaveProperty("invoiceId");

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBe(4);
  });

  it("names the saved invoice as invoiceId when previewing an edit, alongside the edit id", async () => {
    apiMock.post.mockResolvedValue({ data: new Uint8Array() });

    await fetchInvoiceRuntimePreviewBlob(draft(), { ...CONTEXT, invoiceId: "8801" });

    const fields = sentFields(apiMock.post.mock.calls[0][1]);
    expect(fields).toMatchObject({ invoiceId: "8801", id: "8801" });
  });

  it("reads the pay button from the gated rail flags", async () => {
    apiMock.post.mockResolvedValue({ data: new Uint8Array() });

    await fetchInvoiceRuntimePreviewBlob(draft({ stripeEnabled: true, solePayEnabled: true }), {
      ...CONTEXT,
      rails: { ...RAILS, stripeConnected: true, payrixConnected: true, paymentType: "payto" },
    });

    expect(sentFields(apiMock.post.mock.calls[0][1])).toMatchObject({
      isStripe: 1,
      isPayrix: "true",
    });
  });

  it("refuses a foreign-currency draft with no rate before making any call", async () => {
    await expect(
      fetchInvoiceRuntimePreviewBlob(draft({ convertCurrency: true, currency: "NZD" }), CONTEXT),
    ).rejects.toThrow("no exchange rate");
    expect(apiMock.post).not.toHaveBeenCalled();
  });
});
