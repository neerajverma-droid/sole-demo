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

// Imported after the mock so `lib/quotes.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  DEFAULT_QUOTE_NUMBERING,
  DEFAULT_QUOTE_VALIDITY,
  QUOTE_FILTERS,
  deleteQuoteApi,
  deleteQuotesApi,
  draftFromQuote,
  draftFromQuoteDefault,
  emptyNdisQuoteDraft,
  emptyQuoteDraft,
  fetchNextQuoteNumber,
  fetchQuoteDetail,
  fetchQuoteHistory,
  fetchQuoteTemplates,
  fetchQuotes,
  formatQuoteEventTime,
  invoiceDraftFromQuote,
  isForeignQuote,
  nextQuoteNumber,
  quoteAmount,
  quoteAmountAud,
  quoteDefaultValidity,
  quoteDepositAmount,
  quoteStatusVariant,
  quoteValidityDays,
  sendQuoteApi,
  sendQuoteReminderApi,
  templateEditorFromDetail,
} = await import("@/lib/quotes");
const { emptyInvoiceDraft } = await import("@/lib/invoices");

type Quote = Awaited<ReturnType<typeof fetchQuotes>>[number];

/** One row of `GET /quote`'s `quote_details`, with the fields tests override. */
const API_ROW = {
  quote_id: 4501,
  quote_no: "QUO-4501",
  description: "Clinic fitout",
  total: 704,
  quote_date: "2026-03-01T00:00:00.000Z",
  valid_till: "2026-03-08T00:00:00.000Z",
  status: "sent",
  converted: 0,
  client_id: 42,
  client: { client_id: 42, name: "Acme" },
};

/** A domain quote, for the pure functions. */
function quote(over: Partial<Quote> = {}): Quote {
  return {
    id: "1",
    number: "QUO-1",
    clientId: "42",
    clientName: "Acme",
    issued: "2026-03-01",
    expiry: "2026-03-08",
    status: "Sent",
    description: "Work",
    items: [
      {
        id: "l1",
        description: "Labour",
        quantity: "1",
        price: "100",
        discountPercent: "",
        gst: false,
      },
    ],
    extraDiscount: "",
    notes: "",
    ndis: false,
    ...over,
  } as Quote;
}

function listResponse(rows: Record<string, unknown>[]) {
  return { data: { success: true, data: { quote_details: rows } } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ *
 * Pure helpers
 * ------------------------------------------------------------------ */

describe("quoteStatusVariant", () => {
  it("gives billed its own colour rather than a second green", () => {
    expect(quoteStatusVariant("Accepted")).toBe("success");
    expect(quoteStatusVariant("Converted")).toBe("default");
  });

  it("reds both dead ends and leaves a draft neutral", () => {
    expect(quoteStatusVariant("Sent")).toBe("warning");
    expect(quoteStatusVariant("Saved")).toBe("outline");
    expect(quoteStatusVariant("Declined")).toBe("danger");
    expect(quoteStatusVariant("Expired")).toBe("danger");
    expect(quoteStatusVariant("Draft")).toBe("secondary");
  });

  it("has a variant for every pill the list filters on", () => {
    for (const filter of QUOTE_FILTERS) {
      if (filter === "All") continue;
      expect(quoteStatusVariant(filter)).toBeTruthy();
    }
  });
});

describe("isForeignQuote and quoteDepositAmount", () => {
  it("treats a missing currency and AUD alike as domestic", () => {
    expect(isForeignQuote(quote())).toBe(false);
    expect(isForeignQuote(quote({ currency: "AUD" }))).toBe(false);
    expect(isForeignQuote(quote({ currency: "NZD" }))).toBe(true);
  });

  it("is null without a deposit, and works one out against the quote total", () => {
    expect(quoteDepositAmount(quote())).toBeNull();
    expect(quoteDepositAmount(quote({ deposit: null }))).toBeNull();
    expect(
      quoteDepositAmount(quote({ deposit: { mode: "percent", value: "30" } })),
    ).toBe(30);
    expect(
      quoteDepositAmount(quote({ deposit: { mode: "amount", value: "40" } })),
    ).toBe(40);
  });
});

describe("nextQuoteNumber", () => {
  it("defaults to QUO-1 for an empty list", () => {
    expect(DEFAULT_QUOTE_NUMBERING).toEqual({ prefix: "QUO", next: "1" });
    expect(nextQuoteNumber([])).toBe("QUO-1");
  });

  it("goes one past the highest trailing number, with no zero padding", () => {
    expect(
      nextQuoteNumber([
        quote({ number: "QUO-0009" }),
        quote({ number: "QUO-12" }),
        quote({ number: "no digits" }),
      ]),
    ).toBe("QUO-13");
  });

  it("treats the configured start as a floor, never an override", () => {
    const quotes = [quote({ number: "QUO-12" })];
    expect(nextQuoteNumber(quotes, { prefix: "Q", next: "500" })).toBe("Q-500");
    expect(nextQuoteNumber(quotes, { prefix: "Q", next: "5" })).toBe("Q-13");
    // Only the digits of `next` count.
    expect(nextQuoteNumber([], { prefix: "Q", next: "Q-0042" })).toBe("Q-42");
  });

  it("falls back to QUO for a blank prefix", () => {
    expect(nextQuoteNumber([], { prefix: "  ", next: "3" })).toBe("QUO-3");
  });
});

describe("emptyQuoteDraft and emptyNdisQuoteDraft", () => {
  it("opens a week, with one general line and every optional field blank", () => {
    expect(DEFAULT_QUOTE_VALIDITY).toBe(7);
    const draft = emptyQuoteDraft("QUO-9", "2026-03-28");

    expect(draft).toMatchObject({
      number: "QUO-9",
      clientId: null,
      clientName: "",
      issued: "2026-03-28",
      // Across a month boundary.
      expiry: "2026-04-04",
      description: "",
      extraDiscount: "",
      notes: "",
      ndis: false,
      deposit: null,
      recipients: [],
      quoteEmail: "",
      attachments: [],
      convertCurrency: false,
      exchangeRate: null,
      rateEdited: false,
      displayNote: false,
      customNote: "",
    });
    expect(draft.items).toHaveLength(1);
    expect(draft.items[0].claimType).toBeUndefined();
  });

  it("marks the NDIS draft as one, with a single GST-free support line", () => {
    const draft = emptyNdisQuoteDraft("QUO-9", "2026-03-01");
    expect(draft.ndis).toBe(true);
    expect(draft.expiry).toBe("2026-03-08");
    expect(draft.items).toHaveLength(1);
    expect(draft.items[0]).toMatchObject({ gst: false, supportItemNumber: "" });
    expect(draft.items[0].claimType).toBeDefined();
  });

  it("gives every blank draft a line id of its own", () => {
    const a = emptyQuoteDraft("QUO-1", "2026-03-01");
    const b = emptyQuoteDraft("QUO-1", "2026-03-01");
    expect(a.items[0].id).not.toBe(b.items[0].id);
  });
});

describe("draftFromQuote", () => {
  it("copies lines as new objects but keeps their ids, for editing in place", () => {
    const source = quote();
    const draft = draftFromQuote(source);

    expect(draft.items[0]).toEqual(source.items[0]);
    expect(draft.items[0]).not.toBe(source.items[0]);
    expect(draft.items[0].id).toBe("l1");
    // Editing the draft doesn't reach back into the quote.
    draft.items[0].description = "Changed";
    expect(source.items[0].description).toBe("Labour");
  });

  it("backfills every optional editor field a list row doesn't carry", () => {
    expect(draftFromQuote(quote())).toMatchObject({
      deposit: null,
      recipients: [],
      quoteEmail: "",
      attachments: [],
      convertCurrency: false,
      exchangeRate: null,
      rateEdited: false,
      displayNote: false,
      customNote: "",
    });
  });

  it("drops what isn't part of a draft and keeps what the detail set", () => {
    const draft = draftFromQuote(
      quote({
        status: "Accepted",
        convertedInvoice: "INV-1",
        currency: "NZD",
        convertCurrency: true,
        exchangeRate: 1.09,
        customNote: "Thanks",
      }),
    );
    expect(draft).not.toHaveProperty("id");
    expect(draft).not.toHaveProperty("status");
    expect(draft).not.toHaveProperty("convertedInvoice");
    expect(draft).toMatchObject({
      currency: "NZD",
      convertCurrency: true,
      exchangeRate: 1.09,
      customNote: "Thanks",
    });
  });
});

describe("quoteValidityDays and quoteDefaultValidity", () => {
  it("counts expiry less issue date, never negative, a week when either is blank", () => {
    expect(quoteValidityDays("2026-03-01", "2026-03-15")).toBe(14);
    expect(quoteValidityDays("2026-03-15", "2026-03-01")).toBe(0);
    expect(quoteValidityDays("", "2026-03-01")).toBe(7);
    expect(quoteValidityDays("2026-03-01", "")).toBe(7);
  });

  it("reads a template's payment term, rounded, with a week for blank or junk", () => {
    expect(quoteDefaultValidity({ payment_term: 10 })).toBe(10);
    expect(quoteDefaultValidity({ payment_term: "21" })).toBe(21);
    expect(quoteDefaultValidity({ payment_term: 2.6 })).toBe(3);
    expect(quoteDefaultValidity({ payment_term: -4 })).toBe(0);
    expect(quoteDefaultValidity({ payment_term: null })).toBe(7);
    expect(quoteDefaultValidity({ payment_term: "" })).toBe(7);
    expect(quoteDefaultValidity({ payment_term: "abc" })).toBe(7);
  });
});

describe("formatQuoteEventTime", () => {
  it("writes both midnight and noon as 12", () => {
    expect(formatQuoteEventTime("2026-07-22T00:05:00.000Z", "UTC")).toBe(
      "22 Jul 2026 · 12:05 am",
    );
    expect(formatQuoteEventTime("2026-07-22T12:30:00.000Z", "UTC")).toBe(
      "22 Jul 2026 · 12:30 pm",
    );
  });

  it("shows a bare date without a time", () => {
    expect(formatQuoteEventTime("2026-07-22", "UTC")).toBe("22 Jul 2026");
  });
});

describe("invoiceDraftFromQuote", () => {
  const blank = emptyInvoiceDraft("INV-30", "2026-04-01");
  const source = quote({
    clientId: "42",
    clientName: "Acme",
    description: "Fitout",
    extraDiscount: "15",
    notes: "This quote is valid for 7 days.",
    items: [
      { id: "q1", description: "Labour", quantity: "2", price: "90", discountPercent: "10", gst: true },
      { id: "q2", description: "Paint", quantity: "1", price: "40", discountPercent: "", gst: false },
    ],
  });

  it("keeps the invoice's own number, dates and notes", () => {
    const draft = invoiceDraftFromQuote(source, blank);
    expect(draft.number).toBe("INV-30");
    expect(draft.issued).toBe(blank.issued);
    expect(draft.due).toBe(blank.due);
    // The quote's notes say things that are untrue of an invoice.
    expect(draft.notes).toBe(blank.notes);
    expect(draft.notes).not.toBe(source.notes);
  });

  it("carries the client, description, discount and the lines across", () => {
    const draft = invoiceDraftFromQuote(source, blank);
    expect(draft).toMatchObject({
      clientId: "42",
      clientName: "Acme",
      description: "Fitout",
      extraDiscount: "15",
    });
    expect(draft.items.map(({ id: _id, ...rest }) => rest)).toEqual(
      source.items.map(({ id: _id, ...rest }) => rest),
    );
  });

  it("gives every copied line a fresh id", () => {
    const draft = invoiceDraftFromQuote(source, blank);
    const ids = draft.items.map((item) => item.id);
    expect(ids).not.toContain("q1");
    expect(ids).not.toContain("q2");
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("draftFromQuoteDefault — the lines", () => {
  const blank = emptyQuoteDraft("QUO-10", "2026-03-01");
  const ndisBlank = emptyNdisQuoteDraft("QUO-11", "2026-03-01");

  it("prices a general line's GST from the rate it was saved with", () => {
    const draft = draftFromQuoteDefault(
      {
        invoice_item: [
          { description: "Taxed", qty: 2, price: 50, gst_percentage: 10, qty_type: "hours" },
          { description: "Free", qty: 1, price: 20, gst_percentage: 0 },
        ],
      },
      blank,
    );
    expect(draft.items[0]).toMatchObject({
      description: "Taxed",
      quantity: "2",
      price: "50",
      qtyType: "hours",
      gst: true,
    });
    expect(draft.items[1].gst).toBe(false);
    expect(draft.items[0].claimType).toBeUndefined();
  });

  it("forces NDIS supports GST-free and dates an undated one on the quote's day", () => {
    const draft = draftFromQuoteDefault(
      {
        invoice_item: [
          { description: "Support", qty: 1, price: 70, gst_percentage: 10, item_support_no: "01_011" },
          { description: "Dated", qty: 1, price: 70, date: "2026-03-05" },
        ],
      },
      ndisBlank,
    );
    expect(draft.items[0]).toMatchObject({
      gst: false,
      supportItemNumber: "01_011",
      date: "2026-03-01",
    });
    expect(draft.items[1].date).toBe("2026-03-05");
  });

  it("keeps the blank's own line and description when the template has none", () => {
    const draft = draftFromQuoteDefault({ invoice_item: [], description: "  " }, blank);
    expect(draft.items).toBe(blank.items);
    expect(draft.description).toBe(blank.description);
  });

  it("keeps the blank's number and issue date, and preselects no client", () => {
    const draft = draftFromQuoteDefault(
      { client_id: 0, client: { client_id: 0, name: "Shared" }, description: "Template work" },
      { ...blank, clientId: "42", clientName: "Acme" },
    );
    expect(draft).toMatchObject({
      number: "QUO-10",
      issued: "2026-03-01",
      clientId: null,
      clientName: "",
      description: "Template work",
    });
  });

  it("drops an items deposit when the template has no lines for it to cover", () => {
    const draft = draftFromQuoteDefault(
      { is_deposit: 1, deposit_type: "select_items", deposit_selected_items: [0] },
      blank,
    );
    expect(draft.deposit).toBeNull();
  });
});

describe("templateEditorFromDetail", () => {
  it("reads template_type only, and says so when it can't tell", () => {
    expect(templateEditorFromDetail({ template_type: " NDIS " })).toBe("ndis");
    expect(templateEditorFromDetail({ template_type: "general" })).toBe("general");
    expect(templateEditorFromDetail({ template_type: null })).toBeNull();
    expect(templateEditorFromDetail({})).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * The list — branches of the row mapper
 * ------------------------------------------------------------------ */

describe("fetching the quote list — the rest of the row", () => {
  it("defaults to an empty list when the response has no data at all", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    expect(await fetchQuotes()).toEqual([]);
  });

  it("maps the lapsed flag, the layout id and a deposit", async () => {
    apiMock.get.mockResolvedValue(
      listResponse([
        {
          ...API_ROW,
          expired: 1,
          template_id: 17,
          is_deposit: 1,
          deposit_type: "percentage",
          deposit_value: 25,
        },
        API_ROW,
      ]),
    );

    const [withExtras, plain] = await fetchQuotes();

    expect(withExtras.expired).toBe(true);
    expect(withExtras.templateId).toBe("17");
    expect(withExtras.deposit).toEqual({
      mode: "percent",
      value: "25",
      selectedItems: undefined,
      dueDate: undefined,
    });
    expect(quoteDepositAmount(withExtras)).toBe(176);

    expect(plain.expired).toBe(false);
    expect(plain.templateId).toBeUndefined();
    expect(plain.deposit).toBeNull();
  });

  it("puts the AUD total through the rate when there is no exchange_total", async () => {
    apiMock.get.mockResolvedValue(
      listResponse([
        {
          ...API_ROW,
          total: 100,
          is_multicurrency: 1,
          currency_code: "USD",
          exchange_rate: 0.655,
        },
      ]),
    );

    const [mapped] = await fetchQuotes();

    expect(mapped.currency).toBe("USD");
    // 100 × 0.655, to the cent.
    expect(quoteAmount(mapped)).toBe(65.5);
    expect(mapped.audRate).toBeCloseTo(1 / 0.655, 10);
    expect(quoteAmountAud(mapped)).toBeCloseTo(100, 6);
  });

  it("leaves audRate unset for a zero or missing rate, so nothing becomes Infinity", async () => {
    apiMock.get.mockResolvedValue(
      listResponse([
        { ...API_ROW, total: 100, is_multicurrency: 1, currency_code: "USD", exchange_rate: 0 },
        { ...API_ROW, total: 100, is_multicurrency: 1, currency_code: "USD" },
      ]),
    );

    const [zero, missing] = await fetchQuotes();

    for (const mapped of [zero, missing]) {
      expect(mapped.audRate).toBeUndefined();
      // No rate to convert with — the AUD total stands.
      expect(quoteAmount(mapped)).toBe(100);
      expect(quoteAmountAud(mapped)).toBe(100);
    }
  });

  it("treats a multicurrency flag on AUD as plain AUD", async () => {
    apiMock.get.mockResolvedValue(
      listResponse([
        { ...API_ROW, total: 100, is_multicurrency: 1, currency_code: "AUD", exchange_rate: 2, exchange_total: 200 },
      ]),
    );
    const [mapped] = await fetchQuotes();
    expect(mapped.currency).toBeUndefined();
    expect(mapped.audRate).toBeUndefined();
    expect(quoteAmount(mapped)).toBe(100);
  });

  it("names the invoice by id when the converted row carries no invoice number", async () => {
    apiMock.get.mockResolvedValue(
      listResponse([{ ...API_ROW, converted: 1, invoice: null, invoice_id: 88 }]),
    );
    expect((await fetchQuotes())[0].convertedInvoice).toBe("88");
  });

  it("reads the client id off the nested client, and is null once the contact is gone", async () => {
    apiMock.get.mockResolvedValue(
      listResponse([
        { ...API_ROW, client_id: null, client: { client_id: 7, name: "Nested" } },
        { ...API_ROW, client_id: null, client: null },
      ]),
    );
    const [nested, gone] = await fetchQuotes();
    expect(nested.clientId).toBe("7");
    expect(nested.clientName).toBe("Nested");
    expect(gone.clientId).toBeNull();
    expect(gone.clientName).toBe("");
  });

  it("stands the total in as one GST-free line", async () => {
    apiMock.get.mockResolvedValue(listResponse([API_ROW]));
    const [mapped] = await fetchQuotes();
    expect(mapped.items).toHaveLength(1);
    expect(mapped.items[0]).toMatchObject({ quantity: "1", price: "704", gst: false });
  });
});

/* ------------------------------------------------------------------ *
 * The detail — branches not covered elsewhere
 * ------------------------------------------------------------------ */

describe("fetching one quote in full — the rest of the record", () => {
  it("carries the currency settings, rate and both notes into the editor", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...API_ROW,
          is_multicurrency: 1,
          currency_code: "NZD",
          exchange_rate: "1.09",
          display_note: 1,
          custom_note: "Thanks for the work",
          invoice_email: "quotes@me.test",
        },
      },
    });

    const detail = await fetchQuoteDetail("4501");

    expect(detail).toMatchObject({
      convertCurrency: true,
      exchangeRate: 1.09,
      currency: "NZD",
      displayNote: true,
      customNote: "Thanks for the work",
      quoteEmail: "quotes@me.test",
    });
  });

  it("defaults the editor fields for a domestic quote", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { ...API_ROW } } });

    const detail = await fetchQuoteDetail("4501");

    expect(detail).toMatchObject({
      convertCurrency: false,
      exchangeRate: null,
      displayNote: false,
      customNote: "",
      quoteEmail: "",
      notes: "",
      extraDiscount: "",
      recipients: [],
      attachments: [],
    });
  });

  it("switches currency conversion on for a multicurrency AUD row, without a currency", async () => {
    // Unlike the list's check, the detail's flag reads is_multicurrency alone.
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { ...API_ROW, is_multicurrency: 1, currency_code: "AUD" } },
    });
    const detail = await fetchQuoteDetail("4501");
    expect(detail.convertCurrency).toBe(true);
    expect(detail.currency).toBeUndefined();
  });

  it("reads each line's product, quantity type and a percentage discount", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...API_ROW,
          quote_item: [
            {
              description: "Hours",
              qty: 3,
              price: 80,
              qty_type: "hours",
              product_id: 55,
              disc_criteria: "percent",
              discount_percentage: 12.5,
              discount_amount: 999,
              gst: "true",
            },
            { description: "Plain", qty: 1, price: 10, qty_type: "furlongs", gst: "yes" },
          ],
        },
      },
    });

    const [first, second] = (await fetchQuoteDetail("4501")).items;

    expect(first).toMatchObject({
      qtyType: "hours",
      productId: "55",
      // The percentage is read as stored; the flat amount is ignored.
      discountPercent: "12.5",
      gst: true,
    });
    // Unknown quantity type falls back to the default; only true/1/"1"/"true" are GST.
    expect(second.qtyType).toBe("items");
    expect(second.productId).toBeUndefined();
    expect(second.discountPercent).toBe("");
    expect(second.gst).toBe(false);
  });

  it("keeps the list's stand-in line when the detail sends no lines", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { ...API_ROW, quote_item: [] } },
    });
    const detail = await fetchQuoteDetail("4501");
    expect(detail.items).toHaveLength(1);
    expect(quoteAmount(detail)).toBe(704);
  });

  it("falls back to a generic message when the server says nothing", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    await expect(fetchQuoteDetail("4501")).rejects.toThrow("Quote not found");
  });
});

/* ------------------------------------------------------------------ *
 * Numbering
 * ------------------------------------------------------------------ */

describe("fetchNextQuoteNumber", () => {
  it("asks the server for the next number and the standing note", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { no: "QUO-45411", note: "Valid for 7 days" } },
    });

    expect(await fetchNextQuoteNumber()).toEqual({
      number: "QUO-45411",
      note: "Valid for 7 days",
    });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.quote.getNo);
  });

  it("falls back to blanks rather than throwing", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    expect(await fetchNextQuoteNumber()).toEqual({ number: "", note: "" });
  });
});

/* ------------------------------------------------------------------ *
 * History — the rest of the vocabulary
 * ------------------------------------------------------------------ */

describe("quote history — event kinds", () => {
  it("maps the server's keys onto the timeline's kinds, in precedence order", async () => {
    const keys = [
      "quote_emailed",
      "quote_viewed",
      "quote_opened",
      "quote_approved",
      "quote_rejected",
      "quote_declined",
      "quote_invoiced",
      "quote_expired",
      "quote_lapsed",
      "something_else",
      undefined,
    ];
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          status: "sent",
          timeline: keys.map((key) => ({ key, title: "Step", status: "completed" })),
        },
      },
    });

    const events = await fetchQuoteHistory("4501");

    expect(events.map((event) => event.kind)).toEqual([
      "sent",
      "viewed",
      "viewed",
      "accepted",
      "rejected",
      "rejected",
      "converted",
      "expired",
      "expired",
      "created",
      "created",
    ]);
  });

  it("labels an untitled step and reads anything unrecognised as upcoming", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          timeline: [
            { key: "quote_sent", title: "   ", status: "COMPLETED", occurred_at: "2026-03-01T00:00:00Z" },
            { key: "quote_viewed", status: "weird" },
          ],
        },
      },
    });

    const [first, second] = await fetchQuoteHistory("4501");

    expect(first).toMatchObject({ label: "Quote updated", status: "completed" });
    expect(second).toMatchObject({ label: "Quote updated", status: "upcoming", at: "" });
  });

  it("joins several facts on one detail line", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          timeline: [
            {
              key: "quote_converted",
              title: "Converted",
              status: "completed",
              meta: { sent_to: ["jo@acme.test"], invoice_no: "INV-9", amount: "12.5" },
            },
          ],
        },
      },
    });
    const [event] = await fetchQuoteHistory("4501");
    expect(event.detail).toBe("jo@acme.test · Invoice INV-9 · $12.50");
  });

  it("keeps the conversion step for a quote that wasn't declined", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { status: "accepted", timeline: [{ key: "quote_converted", status: "upcoming" }] },
      },
    });
    expect(await fetchQuoteHistory("4501")).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ *
 * Failure paths
 * ------------------------------------------------------------------ */

describe("deleteQuoteApi", () => {
  it("DELETEs the row's own route with no body", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });

    await deleteQuoteApi("4501");

    expect(apiMock.delete).toHaveBeenCalledTimes(1);
    expect(apiMock.delete.mock.calls[0]).toEqual([`${apiRoutes.quote.delete}/4501`]);
  });

  it("uses its own fallback message, and treats a missing success as success", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: false } });
    await expect(deleteQuoteApi("4501")).rejects.toThrow("Couldn't delete that quote.");

    apiMock.delete.mockResolvedValue({ data: {} });
    await expect(deleteQuoteApi("4501")).resolves.toBeUndefined();
  });
});

describe("failure paths", () => {
  it("bulk delete throws with the server's message or its own fallback", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "One is converted" } });
    await expect(deleteQuotesApi(["1", "2"])).rejects.toThrow("One is converted");

    apiMock.post.mockResolvedValue({ data: { success: false } });
    await expect(deleteQuotesApi(["1", "2"])).rejects.toThrow("Couldn't delete those quotes.");
    expect(apiMock.delete).not.toHaveBeenCalled();
  });

  it("sending throws with the server's message or its own fallback", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "No recipients" } });
    await expect(sendQuoteApi("4501")).rejects.toThrow("No recipients");

    apiMock.post.mockResolvedValue({ data: { success: false } });
    await expect(sendQuoteApi("4501")).rejects.toThrow("Couldn't send that quote.");
  });

  it("sends nothing in the body when emailing a saved quote", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await sendQuoteApi("4501");
    expect(apiMock.post.mock.calls[0]).toHaveLength(1);
  });

  it("chasing throws with the server's message or its own fallback", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Already accepted" } });
    await expect(sendQuoteReminderApi("4501")).rejects.toThrow("Already accepted");

    apiMock.post.mockResolvedValue({ data: { success: false } });
    await expect(sendQuoteReminderApi("4501")).rejects.toThrow("Couldn't send that reminder.");
  });

  it("chasing posts to the shared reminder route, encrypted", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await sendQuoteReminderApi("4501");
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.communicationPreference.sendReminder);
    expect(decryptPayload((body as { data: string }).data)).toEqual({ id: "4501", type: "quote" });
  });
});

describe("quote templates — fallbacks", () => {
  it("names and summarises a template that carries neither", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          invoices: [
            { id: 1, category: "  ", description: "" },
            { id: 2, template_scope_label: "Trades" },
            { id: 3, category: "Fitout", description: "  Full fitout  " },
          ],
        },
      },
    });

    const [blank, trades, named] = await fetchQuoteTemplates(null);

    expect(blank).toMatchObject({ name: "Untitled template", summary: "General template", industry: "General" });
    expect(blank.items).toEqual([]);
    expect(trades).toMatchObject({ name: "Untitled template", summary: "Trades template", industry: "Trades" });
    expect(named).toMatchObject({ name: "Fitout", summary: "Full fitout" });
    // The page size the picker asks for.
    expect(apiMock.get.mock.calls[0][1].params.page_size).toBe(100);
  });

  it("returns nothing for a response without data", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    expect(await fetchQuoteTemplates(9)).toEqual([]);
  });
});
