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
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  buildQuotePayload,
  buildQuoteRuntimePreviewPayload,
  fetchQuoteRuntimePreviewBlob,
  saveQuoteApi,
} = await import("@/lib/quote-submit");
const { emptyNdisQuoteDraft, emptyQuoteDraft } = await import("@/lib/quotes");

type QuoteDraft = ReturnType<typeof emptyQuoteDraft>;

/** What the editor knows before it can save: GST, the layout, the rate. */
const CONTEXT = {
  gstPercent: 10,
  gstEnabled: true,
  templateId: "13",
  exchangeRate: null as number | null,
  files: [] as File[],
};

/**
 * A general quote with two real lines and one blank editing row, which is the
 * state the editor is actually in when Save is pressed.
 */
function draft(over: Partial<QuoteDraft> = {}): QuoteDraft {
  return {
    ...emptyQuoteDraft("QUO-9", "2026-03-01"),
    clientId: "42",
    clientName: "Acme",
    description: "Fitout",
    items: [
      { id: "1", description: "Labour", quantity: "4", price: "95", discountPercent: "", gst: true },
      { id: "2", description: "Materials", quantity: "1", price: "260", discountPercent: "", gst: true },
      { id: "3", description: "", quantity: "", price: "", discountPercent: "", gst: false },
    ],
    ...over,
  };
}

/** Decrypts whatever body a call sent, whether a bare `{data}` object or FormData. */
function decryptedFieldsFromBody(body: unknown): Record<string, unknown> {
  if (body instanceof FormData) {
    const data = body.get("data");
    if (typeof data !== "string") throw new Error("FormData had no 'data' field");
    return decryptPayload(data);
  }
  const asData = body as { data?: string };
  if (typeof asData?.data !== "string") {
    throw new Error("Body was neither FormData nor a {data} envelope");
  }
  return decryptPayload(asData.data);
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ *
 * The document fields
 * ------------------------------------------------------------------ */

describe("the quote payload", () => {
  it("names every document field the way the endpoint expects", () => {
    const payload = buildQuotePayload(draft(), "draft", CONTEXT);

    expect(payload).toMatchObject({
      quote_no: "QUO-9",
      quote_type: "general",
      client_id: "42",
      description: "Fitout",
      quote_date: "2026-03-01",
      // A week from the quote date, which is the default validity.
      valid_till: "2026-03-08",
      template_id: "13",
      currency_code: "AUD",
      is_multicurrency: 0,
      gst_percentage: 10,
    });
  });

  it("omits gst_percentage entirely when the business doesn't charge GST", () => {
    const payload = buildQuotePayload(draft(), "draft", {
      ...CONTEXT,
      gstEnabled: false,
    });
    expect(payload.gst_percentage).toBeUndefined();
  });

  it("carries an id only when a quote is being updated", () => {
    expect(buildQuotePayload(draft(), "draft", CONTEXT).id).toBeUndefined();
    expect(
      buildQuotePayload(draft(), "draft", { ...CONTEXT, quoteId: "77" }).id,
    ).toBe("77");
  });
});

/* ------------------------------------------------------------------ *
 * Line items and the money
 * ------------------------------------------------------------------ */

describe("line items", () => {
  it("drops the trailing blank row rather than billing an empty line", () => {
    const payload = buildQuotePayload(draft(), "draft", CONTEXT) as Record<string, unknown>;
    expect(payload.item).toHaveLength(2);
  });

  it("keeps one line even when every row is blank, so the quote is still valid", () => {
    const blank = draft({
      items: [{ id: "1", description: "", quantity: "", price: "", discountPercent: "", gst: false }],
    });
    expect((buildQuotePayload(blank, "draft", CONTEXT) as Record<string, unknown>).item).toHaveLength(1);
  });

  it("rounds GST per line and sums those, rather than taxing the subtotal", () => {
    const payload = buildQuotePayload(draft(), "draft", CONTEXT) as Record<string, unknown>;
    const items = payload.item as Record<string, unknown>[];

    expect(items[0]).toMatchObject({
      description: "Labour",
      qty: "4",
      price: "95",
      gst: true,
      gst_amount: 38,
      disc_criteria: "percent",
    });
    expect(payload.sub_total).toBe(640);
    expect(payload.total_gst).toBe(64);
    expect(payload.total).toBe(704);
  });

  it("subtracts a whole-document discount from the total", () => {
    const payload = buildQuotePayload(draft({ extraDiscount: "40" }), "draft", CONTEXT);
    expect(payload.extra_discount).toBe(40);
    expect(payload.total).toBe(664);
  });
});

/* ------------------------------------------------------------------ *
 * NDIS
 * ------------------------------------------------------------------ */

describe("an NDIS quote", () => {
  const ndisDraft: QuoteDraft = {
    ...emptyNdisQuoteDraft("QUO-N1", "2026-03-01"),
    clientId: "7",
    clientName: "Participant",
    items: [
      {
        id: "s1",
        description: "Assistance with self-care",
        quantity: "2",
        price: "65.09",
        discountPercent: "",
        gst: false,
        supportItemNumber: "01_011_0107_1_1",
        claimType: "Standard Service",
        date: "2026-02-20",
      },
    ],
  };

  it("declares itself as ndis and sends the per-support fields", () => {
    const payload = buildQuotePayload(ndisDraft, "draft", CONTEXT) as Record<string, unknown>;
    expect(payload.quote_type).toBe("ndis");
    expect((payload.item as Record<string, unknown>[])[0]).toMatchObject({
      item_support_no: "01_011_0107_1_1",
      claim_type: "Standard Service",
      date: "2026-02-20",
    });
  });

  it("puts no support fields on an ordinary quote's lines", () => {
    const payload = buildQuotePayload(draft(), "draft", CONTEXT) as Record<string, unknown>;
    expect((payload.item as Record<string, unknown>[])[0].item_support_no).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ *
 * Multicurrency
 * ------------------------------------------------------------------ */

describe("a quote written in the client's currency", () => {
  /*
   * 1.09 NZD per AUD. Line prices are entered in the document's currency, so
   * the two lines are 640 NZD plus 64 GST = 704 NZD, and the books get
   * 704 / 1.09 = 645.87 AUD.
   */
  const converted = draft({ convertCurrency: true, currency: "NZD", rateEdited: true });
  const context = { ...CONTEXT, exchangeRate: 1.09 };

  it("sends the totals in AUD with the client-facing figures alongside", () => {
    const payload = buildQuotePayload(converted, "draft", context);

    expect(payload).toMatchObject({
      currency_code: "NZD",
      is_multicurrency: 1,
      // What the client was quoted, in their own currency.
      exchange_total: 704,
      exchange_rate: 1.09,
      is_exchange_rate_edited: 1,
    });
    // The books are in AUD, so the top-level total is the converted one.
    expect(payload.total).toBeCloseTo(645.87, 2);
  });

  it("sends the whole-document discount in the quote's own currency", () => {
    // The server recomputes the totals from the line prices, which are NZD,
    // so the discount it subtracts from them has to be NZD too.
    const payload = buildQuotePayload(
      { ...converted, extraDiscount: "40" },
      "draft",
      context,
    );
    expect(payload.extra_discount).toBe(40);
    expect(payload.exchange_extra_discount).toBe(40);
    expect(payload.exchange_total).toBe(664);
    expect(payload.total).toBeCloseTo(664 / 1.09, 2);
  });

  it("ignores a rate left over from a client who was since swapped out", () => {
    const payload = buildQuotePayload(
      draft({ currency: "NZD", convertCurrency: false }),
      "draft",
      context,
    );
    expect(payload).toMatchObject({ currency_code: "AUD", is_multicurrency: 0 });
    expect(payload.exchange_rate).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ *
 * Deposit
 * ------------------------------------------------------------------ */

describe("the deposit", () => {
  it("says what it isn't when the quote asks for nothing up front", () => {
    // The server's columns are NOT NULL with defaults, so a full-payment
    // quote still has to state the shape.
    expect(buildQuotePayload(draft(), "draft", CONTEXT)).toMatchObject({
      payment_structure: "full",
      is_deposit: 0,
      deposit_type: "fixed",
      deposit_value: null,
    });
  });

  it("sends a percentage deposit as a percentage", () => {
    const payload = buildQuotePayload(
      draft({ deposit: { mode: "percent", value: "30" } }),
      "draft",
      CONTEXT,
    );
    expect(payload).toMatchObject({
      payment_structure: "deposit_balance",
      is_deposit: 1,
      deposit_type: "percentage",
      deposit_value: 30,
    });
  });

  it("sends a flat deposit as a fixed amount", () => {
    const payload = buildQuotePayload(
      draft({ deposit: { mode: "amount", value: "200" } }),
      "draft",
      CONTEXT,
    );
    expect(payload).toMatchObject({ deposit_type: "fixed", deposit_value: 200 });
  });
});

/* ------------------------------------------------------------------ *
 * Recipients, notes, the from-address
 * ------------------------------------------------------------------ */

describe("who the quote goes to and what it says", () => {
  it("carries recipients, the from-address and both notes", () => {
    const payload = buildQuotePayload(
      draft({
        recipients: [{ id: "c1", name: "Jo", email: "jo@acme.test" }],
        quoteEmail: "me@biz.test",
        notes: "Scope as discussed",
        displayNote: true,
        customNote: "Valid 14 days",
      }),
      "draft",
      CONTEXT,
    );

    expect(payload).toMatchObject({
      selected_contact: [{ id: "c1", name: "Jo", email: "jo@acme.test" }],
      invoice_email: "me@biz.test",
      notes: "Scope as discussed",
      display_note: 1,
      custom_note: "Valid 14 days",
    });
  });

  it("sends an empty recipient list rather than omitting the field", () => {
    expect(buildQuotePayload(draft(), "draft", CONTEXT).selected_contact).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Save / send / print
 * ------------------------------------------------------------------ */

describe("what the server is told to do with the quote", () => {
  it("parks a draft, emails a send, and finalises a print", () => {
    expect(buildQuotePayload(draft(), "draft", CONTEXT)).toMatchObject({ save: 0, send: 0 });
    expect(buildQuotePayload(draft(), "send", CONTEXT)).toMatchObject({ save: 1, send: 1 });
    expect(buildQuotePayload(draft(), "print", CONTEXT)).toMatchObject({ save: 1, send: 2 });
  });
});

/* ------------------------------------------------------------------ *
 * The calls
 * ------------------------------------------------------------------ */

describe("saving a quote", () => {
  it("POSTs a new quote encrypted, and returns the id the server assigned", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { quote_id: 4502 } },
    });

    const saved = await saveQuoteApi(draft(), "draft", CONTEXT);

    expect(apiMock.put).not.toHaveBeenCalled();
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.quote.add);
    // No files, so the whole thing travels as a plain {data} envelope.
    expect(body).not.toBeInstanceOf(FormData);
    expect(Object.keys(body)).toEqual(["data"]);
    // Nothing readable on the wire.
    expect(body.data).not.toContain("QUO-9");
    expect(saved).toEqual({ id: "4502" });
  });

  it("keeps the nested lines intact through the envelope", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { quote_id: 1 } },
    });

    await saveQuoteApi(draft(), "draft", CONTEXT);

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.quote_no).toBe("QUO-9");
    // Real nested objects rather than `item[0][description]` strings — the
    // controller reads them straight off the decrypted payload.
    expect(fields.item).toHaveLength(2);
    expect((fields.item as Record<string, unknown>[])[0]).toMatchObject({
      description: "Labour",
      qty: "4",
    });
  });

  it("PUTs an existing quote to its own URL and keeps its id", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });

    const saved = await saveQuoteApi(draft(), "draft", { ...CONTEXT, quoteId: "77" });

    expect(apiMock.post).not.toHaveBeenCalled();
    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(`${apiRoutes.quote.update}77`);
    expect(decryptedFieldsFromBody(body).id).toBe("77");
    expect(saved).toEqual({ id: "77" });
  });

  it("sends attachments as raw files beside the ciphertext, not inside it", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { quote_id: 1 } },
    });
    const file = new File(["bytes"], "scope.pdf", { type: "application/pdf" });

    await saveQuoteApi(draft(), "draft", { ...CONTEXT, files: [file] });

    const body = apiMock.post.mock.calls[0][1] as FormData;
    // Bytes can't go into a JSON string, so a file forces multipart.
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("files[]")).toBe(file);
    // The fields are still encrypted into `data`, same as the no-file case.
    expect(decryptedFieldsFromBody(body).quote_no).toBe("QUO-9");
  });

  it("sends a single file under files[] rather than its own field name", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { quote_id: 1 } } });
    const file = new File(["bytes"], "one.pdf");

    await saveQuoteApi(draft(), "draft", { ...CONTEXT, files: [file] });

    const body = apiMock.post.mock.calls[0][1] as FormData;
    expect(body.getAll("files[]")).toHaveLength(1);
  });

  it("never sends files on an update — that route takes none", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });
    const file = new File(["bytes"], "scope.pdf");

    await saveQuoteApi(draft(), "draft", { ...CONTEXT, quoteId: "77", files: [file] });

    // `AddQuote.js` appends files in its create branch alone, and the update
    // service has no parameter for them.
    expect(apiMock.put.mock.calls[0][1]).not.toBeInstanceOf(FormData);
  });

  it("throws with the server's message when it refuses", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Quote number already used" },
    });
    await expect(saveQuoteApi(draft(), "draft", CONTEXT)).rejects.toThrow(
      "Quote number already used",
    );
  });

  it("throws rather than pretending to have saved when no id comes back", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    await expect(saveQuoteApi(draft(), "draft", CONTEXT)).rejects.toThrow(
      /returned no id/,
    );
  });
});

/* ------------------------------------------------------------------ *
 * Runtime preview
 * ------------------------------------------------------------------ */

describe("the quote runtime preview", () => {
  it("sends the save payload plus what the preview endpoint reads", () => {
    const payload = buildQuoteRuntimePreviewPayload(
      draft({
        expiry: "2026-03-15",
        deposit: { mode: "percent", value: "25", dueDate: "2026-03-05" },
      }),
      { ...CONTEXT, quoteId: "88" },
    );
    expect(payload).toMatchObject({
      quote_no: "QUO-9",
      quote_date: "2026-03-01",
      valid_till: "2026-03-15",
      quoteDate: "2026-03-01",
      quoteExpDate: "2026-03-15",
      template_id: "13",
      render_type: "pdf",
      quoteId: "88",
      client_name: "Acme",
      payment_structure: "deposit_balance",
      is_deposit: 1,
      deposit_type: "percentage",
      deposit_value: 25,
      deposit_due_date: "2026-03-05",
    });
    const items = payload.items as Record<string, unknown>[];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      description: "Labour",
      price_currency: "AUD",
      amount_currency: "AUD",
      gst_amount_currency: "AUD",
    });
  });

  it("omits quoteId for a new quote", () => {
    expect(buildQuoteRuntimePreviewPayload(draft(), CONTEXT).quoteId).toBeUndefined();
  });

  it("posts encrypted to /quote/runtime-preview as a blob", async () => {
    apiMock.post.mockResolvedValue({ data: new Blob(["%PDF"]) });
    const blob = await fetchQuoteRuntimePreviewBlob(draft(), CONTEXT);
    expect(blob.type).toBe("application/pdf");
    const [url, body, config] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.quote.runtimePreview);
    expect(config).toEqual({ responseType: "blob" });
    expect(decryptedFieldsFromBody(body)).toMatchObject({ render_type: "pdf" });
  });

  it("sends picked files under `files`, the field the route accepts", async () => {
    apiMock.post.mockResolvedValue({ data: new Blob(["%PDF"]) });
    const file = new File(["x"], "plan.pdf", { type: "application/pdf" });
    await fetchQuoteRuntimePreviewBlob(draft(), { ...CONTEXT, files: [file, file] });
    const body = apiMock.post.mock.calls[0][1] as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.getAll("files")).toHaveLength(2);
    expect(body.getAll("files[]")).toHaveLength(0);
    expect(decryptedFieldsFromBody(body)).toMatchObject({ quote_no: "QUO-9" });
  });

  it("leaves files off when previewing an existing quote", async () => {
    apiMock.post.mockResolvedValue({ data: new Blob(["%PDF"]) });
    const file = new File(["x"], "plan.pdf");
    await fetchQuoteRuntimePreviewBlob(draft(), { ...CONTEXT, files: [file], quoteId: "5" });
    expect(apiMock.post.mock.calls[0][1]).not.toBeInstanceOf(FormData);
  });
});
