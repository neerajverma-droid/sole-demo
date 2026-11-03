import { describe, expect, it, vi, beforeEach } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
import apiRoutes from "@/config/api-routes";

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
  DEFAULT_QUOTE_PREVIEW_TEMPLATE_ID,
  convertQuoteToInvoiceApi,
  deleteQuotesApi,
  downloadQuotesApi,
  fetchQuoteDetail,
  fetchQuoteHistory,
  fetchQuotePdfBlob,
  fetchQuoteTemplates,
  fetchQuotes,
  quoteAmount,
  quoteAmountAud,
  quoteDisplayStatus,
  quoteSummary,
  quoteTemplateHref,
  quoteTemplateIndustryTag,
  sendQuoteApi,
  sendQuoteReminderApi,
  mapQuoteDeposit,
  isNdisQuoteTemplate,
  mapApiQuoteTemplate,
  draftFromQuoteDefault,
  duplicateQuoteDraft,
  emptyQuoteDraft,
  buildQuoteDefaultPayload,
  createQuoteDefaultApi,
  updateQuoteDefaultApi,
  quoteTemplateSaveIssue,
} = await import("@/lib/quotes");

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

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ *
 * Listing
 * ------------------------------------------------------------------ */

describe("fetching the quote list", () => {
  it("asks for one large page, newest first", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { quote_details: [API_ROW] } },
    });

    await fetchQuotes();

    const [url, config] = apiMock.get.mock.calls[0];
    expect(url).toBe(apiRoutes.quote.list);
    expect(config.params).toMatchObject({
      page: 1,
      page_size: 200,
      "sort_by[quote_id]": "desc",
    });
  });

  it("maps a row onto the domain shape, trimming timestamps to plain dates", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { quote_details: [API_ROW] } },
    });

    const [mapped] = await fetchQuotes();

    expect(mapped).toMatchObject({
      id: "4501",
      number: "QUO-4501",
      clientId: "42",
      clientName: "Acme",
      issued: "2026-03-01",
      expiry: "2026-03-08",
      status: "Sent",
      ndis: false,
    });
    // The list sends no line items, so the total stands in as one line and
    // `quoteAmount` still reports the real figure.
    expect(quoteAmount(mapped)).toBe(704);
  });

  it("survives a response with no quotes at all", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    expect(await fetchQuotes()).toEqual([]);
  });

  it("reads the stored status from either `status` or `mark_as`", async () => {
    for (const [raw, expected] of [
      [{ status: "draft" }, "Draft"],
      [{ status: "accepted" }, "Accepted"],
      [{ status: "rejected" }, "Declined"],
      [{ status: "declined" }, "Declined"],
      // Not a stored status of its own — a lapsed quote is one still awaiting
      // an answer, and `quoteDisplayStatus` puts the Expired badge back.
      [{ status: "expired" }, "Sent"],
      [{ status: undefined, mark_as: "accepted" }, "Accepted"],
      // No status at all: the reference defaults to sent.
      [{ status: undefined }, "Sent"],
    ] as const) {
      apiMock.get.mockResolvedValue({
        data: { success: true, data: { quote_details: [{ ...API_ROW, ...raw }] } },
      });
      const [mapped] = await fetchQuotes();
      expect(mapped.status).toBe(expected);
    }
  });

  it("marks a quote NDIS from its quote_type", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { quote_details: [{ ...API_ROW, quote_type: "ndis" }] },
      },
    });
    expect((await fetchQuotes())[0].ndis).toBe(true);
  });

  it("reads when a quote was sent or saved, as dates", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          quote_details: [
            { ...API_ROW, sent_at: "2026-09-02 19:54:18", saved_at: null },
            { ...API_ROW, sent_at: null, saved_at: "2026-09-03 08:00:00" },
          ],
        },
      },
    });
    const [sent, saved] = await fetchQuotes();
    expect(sent).toMatchObject({ sentAt: "2026-09-02", savedAt: null });
    expect(saved).toMatchObject({ sentAt: null, savedAt: "2026-09-03" });
  });

  it("carries the invoice number across only once the quote is converted", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          quote_details: [
            { ...API_ROW, converted: 1, invoice: { invoice_no: "INV-20" } },
          ],
        },
      },
    });
    expect((await fetchQuotes())[0].convertedInvoice).toBe("INV-20");

    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          quote_details: [
            { ...API_ROW, converted: 0, invoice: { invoice_no: "INV-20" } },
          ],
        },
      },
    });
    expect((await fetchQuotes())[0].convertedInvoice).toBeUndefined();
  });

  it("reports a foreign quote in its own currency and back in AUD", async () => {
    // `total` is always AUD; `exchange_total` is the client-facing figure.
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          quote_details: [
            {
              ...API_ROW,
              total: 1000,
              is_multicurrency: 1,
              currency_code: "NZD",
              exchange_rate: 1.09,
              exchange_total: 1090,
            },
          ],
        },
      },
    });

    const [mapped] = await fetchQuotes();
    expect(mapped.currency).toBe("NZD");
    expect(quoteAmount(mapped)).toBeCloseTo(1090, 2);
    expect(quoteAmountAud(mapped)).toBeCloseTo(1000, 2);
  });

  it("ignores a currency code when the quote isn't multicurrency", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          quote_details: [
            { ...API_ROW, is_multicurrency: 0, currency_code: "NZD" },
          ],
        },
      },
    });
    expect((await fetchQuotes())[0].currency).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ *
 * Status, as the list displays it
 * ------------------------------------------------------------------ */

describe("quoteDisplayStatus", () => {
  const today = "2026-06-01";

  it("puts billed ahead of everything else", () => {
    expect(
      quoteDisplayStatus(
        quote({ status: "Draft", convertedInvoice: "INV-1" }),
        today,
      ),
    ).toBe("Converted");
    expect(
      quoteDisplayStatus(
        quote({ status: "Accepted", convertedInvoice: "INV-1" }),
        today,
      ),
    ).toBe("Converted");
  });

  it("never lets expiry overturn an answer the client already gave", () => {
    for (const status of ["Accepted", "Declined", "Draft"] as const) {
      expect(
        quoteDisplayStatus(quote({ status, expiry: "2020-01-01" }), today),
      ).toBe(status);
    }
  });

  it("lapses a sent quote on the server's flag or on the date", () => {
    expect(
      quoteDisplayStatus(quote({ expired: true, expiry: "2099-01-01" }), today),
    ).toBe("Expired");
    expect(quoteDisplayStatus(quote({ expiry: "2020-01-01" }), today)).toBe(
      "Expired",
    );
    expect(quoteDisplayStatus(quote({ expiry: "2099-01-01" }), today)).toBe(
      "Sent",
    );
  });

  it("shows a finalised quote that was never emailed as Saved", () => {
    const open = { expiry: "2099-01-01" };
    expect(
      quoteDisplayStatus(
        quote({ ...open, sentAt: null, savedAt: "2026-05-30" }),
        today,
      ),
    ).toBe("Saved");
    // Emailed after an earlier save — sent wins.
    expect(
      quoteDisplayStatus(
        quote({ ...open, sentAt: "2026-05-31", savedAt: "2026-05-30" }),
        today,
      ),
    ).toBe("Sent");
    // A lapsed saved quote is still lapsed.
    expect(
      quoteDisplayStatus(
        quote({ sentAt: null, expiry: "2020-01-01" }),
        today,
      ),
    ).toBe("Expired");
  });
});

describe("quoteSummary", () => {
  it("drops lapsed quotes from Sent but keeps converted ones in Won value", () => {
    const summary = quoteSummary([
      quote({ id: "a", status: "Draft" }),
      quote({ id: "b", status: "Sent", expiry: "2020-01-01" }),
      quote({ id: "c", status: "Sent", expiry: "2099-01-01" }),
      quote({ id: "d", status: "Accepted" }),
      quote({ id: "e", status: "Accepted", convertedInvoice: "INV-1" }),
    ]);

    expect(summary).toEqual({
      total: 5,
      drafts: 1,
      // Only the one still genuinely awaiting an answer.
      sent: 1,
      // Both accepted quotes: being billed doesn't un-win the work.
      acceptedValue: 200,
    });
  });

  it("reports zeroes rather than throwing on an empty list", () => {
    expect(quoteSummary([])).toEqual({
      total: 0,
      drafts: 0,
      sent: 0,
      acceptedValue: 0,
    });
  });
});

/* ------------------------------------------------------------------ *
 * Detail
 * ------------------------------------------------------------------ */

describe("fetching one quote in full", () => {
  it("replaces the list's stand-in line with the real ones", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...API_ROW,
          notes: "Valid 14 days",
          extra_discount: 50,
          quote_item: [
            { description: "Labour", qty: 4, price: "95", gst: 1, gst_percentage: 10 },
            { description: "Materials", qty: 1, price: "260", gst: 0 },
          ],
        },
      },
    });

    const detail = await fetchQuoteDetail("4501");

    expect(apiMock.get.mock.calls[0][0]).toBe(`${apiRoutes.quote.info}4501`);
    expect(detail.items).toHaveLength(2);
    expect(detail.items[0]).toMatchObject({
      description: "Labour",
      quantity: "4",
      price: "95",
      gst: true,
    });
    expect(detail.items[1].gst).toBe(false);
    expect(detail.notes).toBe("Valid 14 days");
    expect(detail.extraDiscount).toBe("50");
  });

  it('treats the string "null" as no note, which is what the server sends', async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { ...API_ROW, notes: "null" } },
    });
    expect((await fetchQuoteDetail("4501")).notes).toBe("");
  });

  it("converts a flat per-line discount into the percentage the editor holds", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...API_ROW,
          quote_item: [
            // 25 off a 100 gross line is 25%.
            {
              description: "Labour",
              qty: 1,
              price: "100",
              disc_criteria: "amount",
              discount_amount: 25,
            },
          ],
        },
      },
    });
    expect((await fetchQuoteDetail("4501")).items[0].discountPercent).toBe("25");
  });

  it("reads NDIS support fields back onto the lines of an NDIS quote", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...API_ROW,
          quote_type: "ndis",
          quote_item: [
            {
              description: "Assistance with self-care",
              qty: 2,
              price: "65.09",
              item_support_no: "01_011_0107_1_1",
              claim_type: "Standard Service",
              date: "2026-02-20T00:00:00.000Z",
            },
          ],
        },
      },
    });

    const detail = await fetchQuoteDetail("4501");
    expect(detail.ndis).toBe(true);
    expect(detail.items[0]).toMatchObject({
      supportItemNumber: "01_011_0107_1_1",
      claimType: "Standard Service",
      date: "2026-02-20",
    });
  });

  it("reads attachments back under the keys the endpoint actually sends", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...API_ROW,
          invoice_email: "me@biz.test",
          // The detail endpoint names these `selected_contacts` (plural) and
          // `document_id` — reading `selected_contact` and `id` is what made
          // a saved attachment vanish on edit and dropped every recipient.
          selected_contacts: [{ contact_id: 7, name: "Jo", email: "jo@acme.test" }],
          documents: [
            { document_id: 91, file_name: "scope.pdf", file_path: "https://s3/scope.pdf" },
          ],
        },
      },
    });

    const detail = await fetchQuoteDetail("4501");
    expect(detail.quoteEmail).toBe("me@biz.test");
    expect(detail.recipients).toEqual([
      { id: "7", name: "Jo", email: "jo@acme.test" },
    ]);
    expect(detail.attachments).toEqual([
      { id: "91", name: "scope.pdf", size: 0, url: "https://s3/scope.pdf" },
    ]);
  });

  it("still reads the singular/`id` spellings, in case either side changes", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...API_ROW,
          selected_contact: [{ id: 7, name: "Jo", email: "jo@acme.test" }],
          documents: [{ id: 91, file_name: "scope.pdf" }],
        },
      },
    });

    const detail = await fetchQuoteDetail("4501");
    expect(detail.recipients?.[0].id).toBe("7");
    expect(detail.attachments?.[0]).toMatchObject({ id: "91", url: undefined });
  });

  it("drops a document with no id at all rather than listing one that can't be removed", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { ...API_ROW, documents: [{ file_name: "orphan.pdf" }] },
      },
    });
    expect((await fetchQuoteDetail("4501")).attachments).toEqual([]);
  });

  it("throws when the quote isn't there", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: false, message: "Quote not found" },
    });
    await expect(fetchQuoteDetail("999")).rejects.toThrow("Quote not found");
  });
});

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

describe("quote history", () => {
  const timeline = [
    {
      key: "quote_created",
      title: "Quote created",
      status: "completed",
      occurred_at: "2026-03-01T09:12:00.000Z",
      meta: { amount: 704 },
    },
    {
      key: "quote_sent",
      title: "Sent to client",
      status: "completed",
      occurred_at: "2026-03-01T11:30:00.000Z",
      meta: { sent_to: ["jo@acme.test", "bo@acme.test"] },
    },
    {
      key: "quote_accepted",
      title: "Accepted by client",
      status: "pending",
      occurred_at: null,
      meta: null,
    },
    {
      key: "quote_converted",
      title: "Converted to invoice",
      status: "upcoming",
      occurred_at: null,
      meta: { invoice_no: "INV-20" },
    },
  ];

  it("reads data.timeline and keeps the steps that haven't happened yet", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { status: "sent", timeline } },
    });

    const events = await fetchQuoteHistory("4501");

    expect(apiMock.get.mock.calls[0][0]).toBe(apiRoutes.quote.history("4501"));
    expect(events).toHaveLength(4);
    expect(events[0]).toMatchObject({
      kind: "created",
      status: "completed",
      at: "2026-03-01T09:12:00.000Z",
    });
    // A step still ahead carries no date, and must not be dropped.
    expect(events[2]).toMatchObject({ kind: "accepted", status: "pending", at: "" });
    expect(events[3]).toMatchObject({ kind: "converted", status: "upcoming" });
  });

  it("flattens the meta object into one detail line", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { status: "sent", timeline } },
    });

    const events = await fetchQuoteHistory("4501");
    expect(events[0].detail).toBe("$704.00");
    expect(events[1].detail).toBe("jo@acme.test, bo@acme.test");
    expect(events[3].detail).toBe("Invoice INV-20");
    expect(events[2].detail).toBeUndefined();
  });

  it("drops the conversion step for a quote the client declined", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { status: "rejected", timeline } },
    });

    const events = await fetchQuoteHistory("4501");
    expect(events).toHaveLength(3);
    expect(events.map((event) => event.kind)).not.toContain("converted");
  });

  it("returns nothing rather than throwing when there is no timeline", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    expect(await fetchQuoteHistory("4501")).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Deleting, sending, downloading
 * ------------------------------------------------------------------ */

describe("deleting quotes", () => {
  it("uses the single-row route for one quote", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });
    await deleteQuotesApi(["4501"]);

    expect(apiMock.post).not.toHaveBeenCalled();
    expect(apiMock.delete.mock.calls[0][0]).toBe(
      `${apiRoutes.quote.delete}/4501`,
    );
  });

  it("uses the bulk route for a selection", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await deleteQuotesApi(["4501", "4502"]);

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.quote.bulkDelete);
    expect(body).toEqual({ quote_ids: [4501, 4502] });
  });

  it("throws with the server's message", async () => {
    apiMock.delete.mockResolvedValue({
      data: { success: false, message: "Quote is already converted" },
    });
    await expect(deleteQuotesApi(["4501"])).rejects.toThrow(
      "Quote is already converted",
    );
  });
});

describe("sending a quote", () => {
  it("posts to the unibox send route", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await sendQuoteApi("4501");
    expect(apiMock.post.mock.calls[0][0]).toBe(
      apiRoutes.unibox.sendQuote("4501"),
    );
  });
});

describe("downloading a selection", () => {
  it("names the file from X-Filename first", async () => {
    apiMock.post.mockResolvedValue({
      data: new Blob(["zip"]),
      headers: { "x-filename": "quotes-march.zip" },
    });

    const result = await downloadQuotesApi(["1", "2"]);
    const [url, body, config] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.quote.download);
    expect(body).toEqual({ data: ["1", "2"] });
    expect(config.responseType).toBe("blob");
    expect(result.filename).toBe("quotes-march.zip");
  });

  it("falls back to content-disposition, then to a default name", async () => {
    apiMock.post.mockResolvedValue({
      data: new Blob(["zip"]),
      headers: { "content-disposition": 'attachment; Filename="q.zip"' },
    });
    expect((await downloadQuotesApi(["1"])).filename).toBe("q.zip");

    apiMock.post.mockResolvedValue({ data: new Blob(["zip"]), headers: {} });
    expect((await downloadQuotesApi(["1"])).filename).toBe("quotes.zip");
  });
});

/* ------------------------------------------------------------------ *
 * Converting and chasing — the two encrypted routes
 * ------------------------------------------------------------------ */

describe("converting a quote to an invoice", () => {
  it("sends an encrypted id and due date, never plaintext", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await convertQuoteToInvoiceApi(quote({ id: "31", expiry: "2026-04-01" }));

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.convertToInvoice);
    // The route goes through the reference's generic `post`, which encrypts —
    // sending plain FormData is answered with "Failed to decrypt payload".
    expect(body).not.toBeInstanceOf(FormData);
    expect(Object.keys(body)).toEqual(["data"]);
    expect(body.data).not.toContain("2026-04-01");

    expect(decryptedFieldsFromBody(body)).toEqual({
      id: "31",
      due_date: "2026-04-01",
    });
  });

  it("falls back to today when the quote has no expiry", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await convertQuoteToInvoiceApi(quote({ id: "31", expiry: "" }));

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("surfaces the server's refusal", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Quote already converted" },
    });
    await expect(convertQuoteToInvoiceApi(quote())).rejects.toThrow(
      "Quote already converted",
    );
  });
});

describe("chasing a quote", () => {
  it("sends an encrypted id and type", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await sendQuoteReminderApi("31");

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.communicationPreference.sendReminder);
    expect(decryptedFieldsFromBody(body)).toEqual({ id: "31", type: "quote" });
  });
});

/* ------------------------------------------------------------------ *
 * Templates
 * ------------------------------------------------------------------ */

describe("quote templates", () => {
  it("asks the shared defaults route for the quote side of it", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { invoices: [] } } });

    await fetchQuoteTemplates(9);

    const [url, config] = apiMock.get.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.default);
    expect(config.params).toMatchObject({
      module: "quote",
      is_quote: true,
      industry_id: 9,
    });
  });

  it("omits industry_id when the business has no industry", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { invoices: [] } } });
    await fetchQuoteTemplates(null);
    expect(apiMock.get.mock.calls[0][1].params.industry_id).toBeUndefined();
  });

  it("marks an NDIS template and labels the rest by their collection", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          invoices: [
            { id: 5, category: "Supports", type: "ndis", item_count: 2 },
            { id: 6, category: "Fitout", template_scope_label: "Trades" },
          ],
        },
      },
    });

    const [ndisTemplate, general] = await fetchQuoteTemplates(9);

    expect(ndisTemplate).toMatchObject({ id: "5", name: "Supports", ndis: true, industry: "NDIS" });
    // The list sends a count, not the lines — enough for the card's skeleton.
    expect(ndisTemplate.items).toHaveLength(2);
    expect(general).toMatchObject({ id: "6", ndis: false, industry: "Trades" });
  });

  it("sends an NDIS template to the NDIS editor and badges it", () => {
    const ndisTemplate = {
      id: "5",
      name: "Supports",
      summary: "",
      accent: "indigo" as const,
      description: "",
      industry: "NDIS",
      ndis: true,
      items: [],
    };
    expect(quoteTemplateHref(ndisTemplate)).toBe("/quotes/new/ndis?template=5");
    expect(quoteTemplateIndustryTag(ndisTemplate)).toBe("NDIS");

    const general = { ...ndisTemplate, id: "6", ndis: false, industry: "General" };
    expect(quoteTemplateHref(general)).toBe("/quotes/new/manual?template=6");
    // The shared collection needs no badge — it's the default.
    expect(quoteTemplateIndustryTag(general)).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ *
 * PDF
 * ------------------------------------------------------------------ */

describe("the quote PDF", () => {
  it("renders on the layout the quote was raised on", async () => {
    apiMock.get.mockResolvedValue({ data: new Blob(["%PDF"]) });

    await fetchQuotePdfBlob(quote({ id: "31", templateId: "17" }));

    const [url, config] = apiMock.get.mock.calls[0];
    expect(url).toBe(apiRoutes.quote.preview("17"));
    expect(config.responseType).toBe("blob");
    expect(config.params).toMatchObject({
      quoteId: "31",
      useDemo: "false",
      type: "quote",
      render_type: "pdf",
    });
  });

  it("falls back to the reference's own default layout", async () => {
    apiMock.get.mockResolvedValue({ data: new Blob(["%PDF"]) });
    await fetchQuotePdfBlob(quote({ templateId: undefined }));
    expect(apiMock.get.mock.calls[0][0]).toBe(
      apiRoutes.quote.preview(DEFAULT_QUOTE_PREVIEW_TEMPLATE_ID),
    );
  });
});

/* ------------------------------------------------------------------ *
 * Deposit — read the way an invoice's is
 * ------------------------------------------------------------------ */

describe("mapQuoteDeposit", () => {
  it("is null for a full-payment quote", () => {
    expect(mapQuoteDeposit({ is_deposit: 0, payment_structure: "full" })).toBeNull();
    expect(mapQuoteDeposit({ is_deposit: "0" })).toBeNull();
  });

  it("keeps the deposit due date, date-only", () => {
    expect(
      mapQuoteDeposit({
        is_deposit: 1,
        deposit_type: "percentage",
        deposit_value: "30",
        deposit_due_date: "2026-03-05T00:00:00.000Z",
      }),
    ).toEqual({ mode: "percent", value: "30", selectedItems: undefined, dueDate: "2026-03-05" });
  });

  it("recognises a deposit from payment_structure alone", () => {
    expect(
      mapQuoteDeposit({ payment_structure: "deposit_balance", deposit_type: "fixed", deposit_value: 200 }),
    ).toMatchObject({ mode: "amount", value: "200" });
  });

  it("reads an items deposit from deposit_selection_type, with its lines", () => {
    expect(
      mapQuoteDeposit({
        is_deposit: 1,
        deposit_type: "fixed",
        deposit_selection_type: "select_items",
        deposit_value: 150,
        deposit_selected_items: [0, "2"],
        deposit_due_date: "2026-03-04",
      }),
    ).toEqual({ mode: "items", value: "150", selectedItems: [0, 2], dueDate: "2026-03-04" });
  });

  it("reads a template's deposit_type: select_items as an items deposit", () => {
    expect(
      mapQuoteDeposit({ is_deposit: 1, deposit_type: "select_items", deposit_selected_items: [1] }),
    ).toMatchObject({ mode: "items", selectedItems: [1] });
  });

  it("uses the foreign-currency figure for a fixed deposit on a foreign quote", () => {
    expect(
      mapQuoteDeposit({
        is_deposit: 1,
        deposit_type: "fixed",
        deposit_value: 100,
        exchange_deposit_value: 65,
        is_multicurrency: 1,
        currency_code: "USD",
      }),
    ).toMatchObject({ mode: "amount", value: "65" });
    // An AUD quote ignores any stray exchange figure.
    expect(
      mapQuoteDeposit({ is_deposit: 1, deposit_type: "fixed", deposit_value: 100, exchange_deposit_value: 65 }),
    ).toMatchObject({ value: "100" });
  });

  it("survives an edit round-trip through the detail endpoint", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...API_ROW,
          is_deposit: 1,
          payment_structure: "deposit_balance",
          deposit_type: "percentage",
          deposit_value: "25.00",
          deposit_due_date: "2026-03-04",
          quote_item: [{ description: "Labour", qty: 1, price: 100 }],
        },
      },
    });
    const detail = await fetchQuoteDetail("4501");
    expect(detail.deposit).toEqual({ mode: "percent", value: "25", selectedItems: undefined, dueDate: "2026-03-04" });
  });
});

/* ------------------------------------------------------------------ *
 * Templates — which editor, and what they prefill
 * ------------------------------------------------------------------ */

describe("isNdisQuoteTemplate", () => {
  it("trusts type over industry", () => {
    expect(isNdisQuoteTemplate({ type: "ndis", industry_id: 3 })).toBe(true);
    // A general template of an NDIS provider carries industry 9 too.
    expect(isNdisQuoteTemplate({ type: "general", industry_id: 9 })).toBe(false);
  });

  it("falls back to the NDIS industry only when type is missing", () => {
    expect(isNdisQuoteTemplate({ type: null, industry_id: 9 })).toBe(true);
    expect(isNdisQuoteTemplate({ type: "", industry_id: "9" })).toBe(true);
    expect(isNdisQuoteTemplate({ industry_id: 4 })).toBe(false);
    expect(mapApiQuoteTemplate({ id: 7, industry_id: 9 }).ndis).toBe(true);
    expect(mapApiQuoteTemplate({ id: 8, type: "general", industry_id: 9 }).ndis).toBe(false);
  });
});

describe("draftFromQuoteDefault", () => {
  const blank = emptyQuoteDraft("QUO-10", "2026-03-01");

  it("sets expiry from the template's payment term, defaulting to a week", () => {
    expect(draftFromQuoteDefault({ payment_term: 14 }, blank).expiry).toBe("2026-03-15");
    expect(draftFromQuoteDefault({}, blank).expiry).toBe("2026-03-08");
    expect(draftFromQuoteDefault({ payment_term: 0 }, blank).expiry).toBe("2026-03-01");
  });

  it("applies the template's deposit, due date and chosen lines included", () => {
    const draft = draftFromQuoteDefault(
      {
        payment_structure: "deposit_balance",
        is_deposit: 1,
        deposit_type: "select_items",
        deposit_value: 50,
        deposit_selected_items: [1],
        deposit_due_date: "2026-03-03",
        invoice_item: [
          { description: "A", qty: 1, price: 10 },
          { description: "B", qty: 1, price: 50 },
        ],
      },
      blank,
    );
    expect(draft.deposit).toEqual({ mode: "items", value: "50", selectedItems: [1], dueDate: "2026-03-03" });
    expect(draft.number).toBe("QUO-10");
  });

  it("leaves no deposit for a full-payment template", () => {
    expect(draftFromQuoteDefault({ payment_structure: "full", is_deposit: 0 }, blank).deposit).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Duplicating
 * ------------------------------------------------------------------ */

describe("duplicateQuoteDraft", () => {
  const original = quote({
    id: "77",
    number: "QUO-77",
    status: "Accepted",
    issued: "2026-01-10",
    expiry: "2026-01-24",
    sentAt: "2026-01-10",
    savedAt: "2026-01-10",
    expired: true,
    convertedInvoice: "INV-5",
    customNote: "Old note",
    templateId: "17",
    attachments: [{ id: "d1", name: "plan.pdf", size: 0, url: "https://x/plan.pdf" }],
    deposit: { mode: "items", value: "100", selectedItems: [0], dueDate: "2026-01-15" },
  });

  it("takes a new number, note and dates, and keeps the deposit", () => {
    const copy = duplicateQuoteDraft(original, "2026-03-01", { number: "QUO-90", note: "Standing note" });
    expect(copy.number).toBe("QUO-90");
    expect(copy.customNote).toBe("Standing note");
    expect(copy.issued).toBe("2026-03-01");
    // Same 14-day validity as the original, counted from today.
    expect(copy.expiry).toBe("2026-03-15");
    expect(copy.deposit).toEqual({ mode: "items", value: "100", selectedItems: [0], dueDate: "2026-01-15" });
    expect(copy.clientId).toBe("42");
    expect(copy.items[0]).toMatchObject({ description: "Labour", price: "100" });
    expect(copy.items[0].id).not.toBe("l1");
  });

  it("copies none of what makes the original its own document", () => {
    const copy = duplicateQuoteDraft(original, "2026-03-01", null) as Record<string, unknown>;
    expect(copy.number).toBe("");
    expect(copy.attachments).toEqual([]);
    for (const key of ["id", "status", "sentAt", "savedAt", "expired", "convertedInvoice", "templateId"]) {
      expect(copy[key]).toBeUndefined();
    }
  });
});

/* ------------------------------------------------------------------ *
 * Saving as a template
 * ------------------------------------------------------------------ */

describe("saving a quote as a template", () => {
  const input = {
    draft: {
      ...emptyQuoteDraft("QUO-11", "2026-03-01"),
      expiry: "2026-03-11",
      description: "Fitout",
      notes: "Thanks",
      items: [
        { id: "a", description: "Labour", quantity: "2", price: "100", discountPercent: "10", gst: true },
        { id: "b", description: "", quantity: "", price: "", discountPercent: "", gst: false },
      ],
      deposit: { mode: "percent" as const, value: "30", dueDate: "2026-03-05" },
    },
    category: "  Kitchen  ",
    ndis: false,
    industryId: 4,
    gstPercent: 10,
    gstEnabled: true,
    renderTemplateId: "13",
  };

  it("builds the quote-side default payload", () => {
    const payload = buildQuoteDefaultPayload(input);
    expect(payload).toMatchObject({
      category: "Kitchen",
      module: "quote",
      type: "general",
      industry_id: 4,
      template_id: "13",
      invoice_date: "2026-03-01",
      due_date: "2026-03-11",
      payment_term: 10,
      gst_enabled: true,
      gst_percentage: 10,
      payment_structure: "deposit_balance",
      is_deposit: 1,
      deposit_type: "percentage",
      deposit_value: 30,
      deposit_due_date: "2026-03-05",
    });
    expect(payload.client_id).toBeUndefined();
    const items = payload.items as Record<string, unknown>[];
    // The blank editing row is dropped, and `disc` carries the discount.
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ description: "Labour", disc: "10", discount: "10" });
  });

  it("marks an NDIS template by type, keeping the business's own industry", () => {
    const payload = buildQuoteDefaultPayload({ ...input, ndis: true, industryId: 9 });
    expect(payload).toMatchObject({ type: "ndis", industry_id: 9, module: "quote" });
  });

  it("creates encrypted, without blank keys", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { invoice: { id: 55 } } } });
    const result = await createQuoteDefaultApi({ ...input, draft: { ...input.draft, clientId: "42" } });
    expect(result).toEqual({ id: "55" });
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.default);
    const sent = decryptedFieldsFromBody(body);
    expect(sent).toMatchObject({ module: "quote", client_id: "42", due_date: "2026-03-11" });
    expect(Object.values(sent)).not.toContain("");
  });

  it("updates the template it was opened from", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });
    await updateQuoteDefaultApi("12", input);
    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.defaultDetail("12"));
    expect(decryptedFieldsFromBody(body)).toMatchObject({ module: "quote", category: "Kitchen" });
  });

  it("needs at least one filled line", () => {
    expect(quoteTemplateSaveIssue({ items: [input.draft.items[1]] })).toMatch(/at least one line item/);
    expect(quoteTemplateSaveIssue(input.draft)).toBeUndefined();
  });
});

describe("templateEditorFromDetail", () => {
  it("ignores the detail endpoint's document type and never guesses", async () => {
    const { templateEditorFromDetail } = await import("@/lib/quotes");
    // The real default-template detail: type "invoice", no template_type.
    expect(
      templateEditorFromDetail({ type: "invoice" } as never),
    ).toBeNull();
    expect(templateEditorFromDetail({ template_type: "ndis" })).toBe("ndis");
    expect(templateEditorFromDetail({ template_type: "general" })).toBe(
      "general",
    );
    expect(templateEditorFromDetail({ template_type: null })).toBeNull();
  });
});
