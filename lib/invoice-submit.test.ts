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
const { buildInvoicePayload, objectToFormData, saveInvoiceApi } =
  await import("@/lib/invoice-submit");
const { emptyInvoiceDraft, emptyNdisDraft } = await import("@/lib/invoices");

type InvoiceDraft = ReturnType<typeof emptyInvoiceDraft>;

/** Neither rail connected, so a pay link can never go out by accident. */
const NO_RAILS = {
  stripeConnected: false,
  payrixConnected: false,
  payrixAutomate: false,
  paymentType: "",
} as never;

/** What the editor knows before it can save: GST, the layout, the rails, the rate. */
const CONTEXT = {
  gstPercent: 10,
  gstEnabled: true,
  templateId: "1",
  rails: NO_RAILS,
  exchangeRate: null as number | null,
  files: [] as File[],
};

/**
 * An invoice with two real lines and one blank editing row, which is the state
 * the editor is actually in when Save is pressed.
 */
function draft(over: Partial<InvoiceDraft> = {}): InvoiceDraft {
  return {
    ...emptyInvoiceDraft("INV-0009", "2026-03-01"),
    due: "2026-03-15",
    clientId: "42",
    clientName: "Acme",
    description: "Consulting",
    items: [
      {
        id: "1",
        description: "Consulting",
        quantity: "4",
        price: "95",
        discountPercent: "",
        gst: true,
      },
      {
        id: "2",
        description: "Travel",
        quantity: "1",
        price: "260",
        discountPercent: "",
        gst: true,
      },
      {
        id: "3",
        description: "",
        quantity: "",
        price: "",
        discountPercent: "",
        gst: false,
      },
    ],
    ...over,
  };
}

/** Decrypts whatever body a call sent, whether a bare `{data}` object or FormData. */
function decryptedFieldsFromBody(body: unknown): Record<string, unknown> {
  if (body instanceof FormData) {
    const data = body.get("data");
    if (typeof data !== "string")
      throw new Error("FormData had no 'data' field");
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

describe("the invoice payload", () => {
  it("names every document field the way the endpoint expects", () => {
    const payload = buildInvoicePayload(draft(), "draft", CONTEXT);

    expect(payload).toMatchObject({
      invoice_no: "INV-0009",
      client_id: "42",
      description: "Consulting",
      invoice_date: "2026-03-01",
      due_date: "2026-03-15",
      template_id: "1",
      currency_code: "AUD",
      is_multicurrency: 0,
      gst_percentage: 10,
    });
  });

  it("derives payment terms from the two dates rather than storing them twice", () => {
    // The editor shows the gap between issue and due, so this can't disagree.
    expect(buildInvoicePayload(draft(), "draft", CONTEXT).payment_term).toBe(
      14,
    );
  });

  it("never sends a negative term when the due date precedes the issue date", () => {
    const payload = buildInvoicePayload(
      draft({ issued: "2026-03-15", due: "2026-03-01" }),
      "draft",
      CONTEXT,
    );
    expect(payload.payment_term).toBe(0);
  });

  it("omits gst_percentage entirely when the business doesn't charge GST", () => {
    expect(
      buildInvoicePayload(draft(), "draft", { ...CONTEXT, gstEnabled: false })
        .gst_percentage,
    ).toBeUndefined();
  });

  it("carries an id only when an invoice is being updated", () => {
    expect(buildInvoicePayload(draft(), "draft", CONTEXT).id).toBeUndefined();
    expect(
      buildInvoicePayload(draft(), "draft", { ...CONTEXT, invoiceId: "77" }).id,
    ).toBe("77");
  });
});

/* ------------------------------------------------------------------ *
 * Line items and the money
 * ------------------------------------------------------------------ */

describe("line items", () => {
  it("drops the trailing blank row rather than billing an empty line", () => {
    const payload = buildInvoicePayload(draft(), "draft", CONTEXT) as Record<
      string,
      unknown
    >;
    expect(payload.item).toHaveLength(2);
  });

  it("keeps one line even when every row is blank, so the invoice is still valid", () => {
    const blank = draft({
      items: [
        {
          id: "1",
          description: "",
          quantity: "",
          price: "",
          discountPercent: "",
          gst: false,
        },
      ],
    });
    expect(
      (buildInvoicePayload(blank, "draft", CONTEXT) as Record<string, unknown>)
        .item,
    ).toHaveLength(1);
  });

  it("rounds GST per line and sums those, rather than taxing the subtotal", () => {
    const payload = buildInvoicePayload(draft(), "draft", CONTEXT) as Record<
      string,
      unknown
    >;
    const items = payload.item as Record<string, unknown>[];

    expect(items[0]).toMatchObject({
      description: "Consulting",
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
    const payload = buildInvoicePayload(
      draft({ extraDiscount: "40" }),
      "draft",
      CONTEXT,
    );
    expect(payload.extra_discount).toBe(40);
    expect(payload.total).toBe(664);
  });

  it("sends a flat-amount line discount as 'currency' — the column's own spelling — with the dollar figure itself", () => {
    const payload = buildInvoicePayload(
      draft({
        items: [
          {
            id: "1",
            description: "Consulting",
            quantity: "2",
            price: "100",
            discountPercent: "25",
            discountType: "amount",
            gst: true,
          },
        ],
      }),
      "draft",
      CONTEXT,
    ) as Record<string, unknown>;
    const items = payload.item as Record<string, unknown>[];

    expect(items[0]).toMatchObject({ disc_criteria: "currency", discount: "25" });
    // Gross 200, flat $25 off, 10% GST on the $175 net.
    expect(payload.total_discount).toBe(25);
    expect(payload.total).toBe(192.5);
  });
});

/* ------------------------------------------------------------------ *
 * NDIS
 * ------------------------------------------------------------------ */

describe("an NDIS claim", () => {
  const ndisDraft: InvoiceDraft = {
    ...emptyNdisDraft("INV-0010", "2026-03-01"),
    due: "2026-03-15",
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

  it("sends the per-support fields", () => {
    const payload = buildInvoicePayload(ndisDraft, "draft", CONTEXT) as Record<
      string,
      unknown
    >;
    expect((payload.item as Record<string, unknown>[])[0]).toMatchObject({
      item_support_no: "01_011_0107_1_1",
      claim_type: "Standard Service",
      date: "2026-02-20",
    });
  });

  it("puts no support fields on an ordinary invoice's lines", () => {
    const payload = buildInvoicePayload(draft(), "draft", CONTEXT) as Record<
      string,
      unknown
    >;
    expect(
      (payload.item as Record<string, unknown>[])[0].item_support_no,
    ).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ *
 * Multicurrency
 * ------------------------------------------------------------------ */

describe("an invoice written in the client's currency", () => {
  /*
   * 1.09 NZD per AUD. Line prices are entered in the document's currency, so
   * the two lines are 640 NZD plus 64 GST = 704 NZD, and the books get
   * 704 / 1.09 = 645.87 AUD.
   */
  const converted = draft({
    convertCurrency: true,
    currency: "NZD",
    rateEdited: true,
  });
  const context = { ...CONTEXT, exchangeRate: 1.09 };

  it("sends the totals in AUD with the client-facing figures alongside", () => {
    const payload = buildInvoicePayload(converted, "draft", context);

    expect(payload).toMatchObject({
      currency_code: "NZD",
      is_multicurrency: 1,
      exchange_total: 704,
      exchange_rate: 1.09,
      is_exchange_rate_edited: 1,
    });
    expect(payload.total).toBeCloseTo(645.87, 2);
  });

  it("ignores a rate left over from a client who was since swapped out", () => {
    const payload = buildInvoicePayload(
      draft({ currency: "NZD", convertCurrency: false }),
      "draft",
      context,
    );
    expect(payload).toMatchObject({
      currency_code: "AUD",
      is_multicurrency: 0,
    });
    expect(payload.exchange_rate).toBeUndefined();
  });

  /*
   * The bug this guards: with no rate, `audTotals` used to fall through to
   * the client-currency figures unchanged — so the "AUD" total sent to the
   * backend was actually the 704 NZD figure, not 645.87 AUD, while
   * `is_multicurrency: 1` still went out and `exchange_rate` was silently
   * missing. That combination is wrong regardless of *why* the rate is
   * missing — never loaded yet, or the lookup failed outright — so this must
   * refuse to build the payload rather than guess.
   */
  it("refuses to build a payload for a foreign-currency invoice with no rate", () => {
    expect(() =>
      buildInvoicePayload(converted, "draft", {
        ...CONTEXT,
        exchangeRate: null,
      }),
    ).toThrow(/exchange rate/i);

    expect(() =>
      buildInvoicePayload(converted, "draft", { ...CONTEXT, exchangeRate: 0 }),
    ).toThrow(/exchange rate/i);
  });
});

/* ------------------------------------------------------------------ *
 * Deposit
 * ------------------------------------------------------------------ */

describe("the deposit", () => {
  it("says what it isn't when the invoice asks for nothing up front", () => {
    // The server's columns are NOT NULL with defaults, so a full-payment
    // invoice still has to state the shape.
    expect(buildInvoicePayload(draft(), "draft", CONTEXT)).toMatchObject({
      payment_structure: "full",
      is_deposit: 0,
      deposit_type: "fixed",
      deposit_value: null,
      deposit_selected_items: [],
    });
  });

  it("sends a percentage deposit as a percentage", () => {
    const payload = buildInvoicePayload(
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

  it("stores an items deposit as the amount those lines come to", () => {
    const payload = buildInvoicePayload(
      draft({ deposit: { mode: "items", value: "0", selectedItems: [0] } }),
      "draft",
      CONTEXT,
    );
    // Line 0 is 4 x 95 + GST = 418.
    expect(payload).toMatchObject({
      deposit_type: "fixed",
      deposit_selection_type: "select_items",
      deposit_value: 418,
      deposit_selected_items: [0],
    });
  });

  it("renumbers a selection against the lines actually sent", () => {
    /*
     * The blank row sits at index 1 here, so the second real line is at
     * editor index 2 but position 1 in the payload. Without remapping, the
     * deposit would silently start covering different work.
     */
    const payload = buildInvoicePayload(
      draft({
        items: [
          {
            id: "1",
            description: "Consulting",
            quantity: "4",
            price: "95",
            discountPercent: "",
            gst: true,
          },
          {
            id: "2",
            description: "",
            quantity: "",
            price: "",
            discountPercent: "",
            gst: false,
          },
          {
            id: "3",
            description: "Travel",
            quantity: "1",
            price: "260",
            discountPercent: "",
            gst: true,
          },
        ],
        deposit: { mode: "items", value: "0", selectedItems: [2] },
      }),
      "draft",
      CONTEXT,
    );
    expect(payload.deposit_selected_items).toEqual([1]);
  });
});

/* ------------------------------------------------------------------ *
 * Payment rails — the flags that put a pay link on the invoice
 * ------------------------------------------------------------------ */

describe("payment rails", () => {
  it("never sets a pay link when the rail isn't connected", () => {
    // Switching card payments on for an account that never finished
    // onboarding would otherwise put a dead link on the invoice.
    const payload = buildInvoicePayload(
      draft({ stripeEnabled: true, solePayEnabled: true }),
      "draft",
      CONTEXT,
    );
    expect(payload).toMatchObject({ is_stripe_enabled: 0, is_payrixpay: 0 });
  });

  it("sets the Stripe flag once that rail is connected and asked for", () => {
    const payload = buildInvoicePayload(
      draft({ stripeEnabled: true }),
      "draft",
      {
        ...CONTEXT,
        rails: {
          stripeConnected: true,
          payrixConnected: false,
          payrixAutomate: false,
          paymentType: "",
        } as never,
      },
    );
    expect(payload.is_stripe_enabled).toBe(1);
    expect(payload.is_payrixpay).toBe(0);
  });

  it("keeps the two rails independent, as sole-webapp does", () => {
    const rails = {
      stripeConnected: true,
      payrixConnected: true,
      payrixAutomate: false,
      paymentType: "credit_card",
      showBankDetails: true,
    };
    const solePayOnly = buildInvoicePayload(
      draft({ stripeEnabled: false, solePayEnabled: true }),
      "draft",
      { ...CONTEXT, rails },
    );
    expect(solePayOnly).toMatchObject({ is_stripe_enabled: 0, is_payrixpay: 1 });

    const stripeOnly = buildInvoicePayload(
      draft({ stripeEnabled: true, solePayEnabled: false }),
      "draft",
      { ...CONTEXT, rails },
    );
    expect(stripeOnly).toMatchObject({ is_stripe_enabled: 1, is_payrixpay: 0 });
  });

  it("follows the account's SolePay setting until the invoice chooses", () => {
    const rails = {
      stripeConnected: false,
      payrixConnected: true,
      payrixAutomate: true,
      paymentType: "payto",
      showBankDetails: true,
    };
    expect(
      buildInvoicePayload(draft(), "draft", { ...CONTEXT, rails }).is_payrixpay,
    ).toBe(1);
    // "Direct payment" means bank details only — no SolePay link.
    expect(
      buildInvoicePayload(draft({ solePayEnabled: true }), "draft", {
        ...CONTEXT,
        rails: { ...rails, paymentType: "direct_payment" },
      }).is_payrixpay,
    ).toBe(0);
  });

  it("shows bank details unless they're switched off", () => {
    expect(
      buildInvoicePayload(draft(), "draft", CONTEXT).show_bank_details,
    ).toBe(1);
    expect(
      buildInvoicePayload(draft({ showBankDetails: false }), "draft", CONTEXT)
        .show_bank_details,
    ).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * Reminders and recurrence
 * ------------------------------------------------------------------ */

describe("the follow-up reminder", () => {
  it("resolves days-before into the absolute date the server stores", () => {
    const payload = buildInvoicePayload(
      draft({
        followUpReminder: true,
        followUpDays: "3",
        followUpNote: "Check the site",
      }),
      "draft",
      CONTEXT,
    );
    expect(payload).toMatchObject({
      is_notify_future_work: 1,
      notify_future_work_days_before_due: 3,
      // Due 15 March, so it fires on the 12th.
      notify_future_work_date: "2026-03-12",
      notify_future_work_description: "Check the site",
    });
  });

  it("sends nothing when the reminder is on but no days were given", () => {
    const payload = buildInvoicePayload(
      draft({ followUpReminder: true, followUpDays: "" }),
      "draft",
      CONTEXT,
    );
    expect(payload.is_notify_future_work).toBeUndefined();
  });

  it("says whether the client is chased too, or only the business", () => {
    const both = buildInvoicePayload(
      draft({
        followUpReminder: true,
        followUpDays: "3",
        followUpNotifyClient: true,
      }),
      "draft",
      CONTEXT,
    );
    expect(both).toMatchObject({
      notify_future_work_both: 1,
      notify_future_work_me_only: 0,
    });

    const meOnly = buildInvoicePayload(
      draft({
        followUpReminder: true,
        followUpDays: "3",
        followUpNotifyClient: false,
      }),
      "draft",
      CONTEXT,
    );
    expect(meOnly).toMatchObject({
      notify_future_work_both: 0,
      notify_future_work_me_only: 1,
    });
  });
});

describe("a repeating invoice", () => {
  it("sends the frequency as the id the server stores, not the label", () => {
    const payload = buildInvoicePayload(
      draft({
        repeating: true,
        repeatFrequency: "Monthly",
        repeatOccurrences: "6",
      }),
      "draft",
      CONTEXT,
    );
    expect(payload.is_recurring_invoice).toBe(1);
    expect(payload.frequency).toBeTruthy();
    expect(payload.frequency).not.toBe("Monthly");
    expect(payload.no_of_occurance).toBe("6");
  });

  it("holds each copy as a draft when review is on, and sends it when off", () => {
    // 1 holds and alerts you; 2 sends it straight out.
    expect(
      buildInvoicePayload(
        draft({ repeating: true, reviewBeforeSending: true }),
        "draft",
        CONTEXT,
      ).on_occurance,
    ).toBe(1);
    expect(
      buildInvoicePayload(
        draft({ repeating: true, reviewBeforeSending: false }),
        "draft",
        CONTEXT,
      ).on_occurance,
    ).toBe(2);
  });

  it("sends no recurrence fields at all when it isn't repeating", () => {
    expect(
      buildInvoicePayload(draft(), "draft", CONTEXT).is_recurring_invoice,
    ).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ *
 * Save / send / print
 * ------------------------------------------------------------------ */

describe("what the server is told to do with the invoice", () => {
  it("parks a draft, emails a send, and finalises a print", () => {
    // Draft and sent are mutually exclusive: `save: 0` parks it, and `send`
    // decides whether the client is emailed (1) or it's finalised quietly (2).
    expect(buildInvoicePayload(draft(), "draft", CONTEXT).save).toBe(0);
    expect(buildInvoicePayload(draft(), "send", CONTEXT).send).toBe(1);
    expect(buildInvoicePayload(draft(), "print", CONTEXT).send).toBe(2);
  });
});

/* ------------------------------------------------------------------ *
 * The calls
 * ------------------------------------------------------------------ */

describe("saving an invoice", () => {
  it("POSTs a new invoice encrypted, and returns the id the server assigned", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { invoice_id: 8802 } },
    });

    const saved = await saveInvoiceApi(draft(), "draft", CONTEXT);

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.add);
    // No files, so the whole thing travels as a plain {data} envelope.
    expect(body).not.toBeInstanceOf(FormData);
    expect(Object.keys(body)).toEqual(["data"]);
    // Nothing readable on the wire.
    expect(body.data).not.toContain("INV-0009");
    expect(saved).toEqual({ id: "8802" });
  });

  it("keeps the nested lines intact through the envelope", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { invoice_id: 1 } },
    });

    await saveInvoiceApi(draft(), "draft", CONTEXT);

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.invoice_no).toBe("INV-0009");
    // Real nested objects rather than `item[0][description]` strings — the
    // controller reads them straight off the decrypted payload.
    expect(fields.item).toHaveLength(2);
    expect((fields.item as Record<string, unknown>[])[0]).toMatchObject({
      description: "Consulting",
      qty: "4",
    });
  });

  it("posts an update to the edit route and keeps the invoice's own id", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    const saved = await saveInvoiceApi(draft(), "draft", {
      ...CONTEXT,
      invoiceId: "77",
    });

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.update);
    // Unlike a quote, an invoice update does carry its id in the payload.
    expect(decryptedFieldsFromBody(body).id).toBe("77");
    expect(saved).toEqual({ id: "77" });
  });

  it("sends attachments as raw files beside the ciphertext, not inside it", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { invoice_id: 1 } },
    });
    const file = new File(["bytes"], "scope.pdf", { type: "application/pdf" });

    await saveInvoiceApi(draft(), "draft", { ...CONTEXT, files: [file] });

    const body = apiMock.post.mock.calls[0][1] as FormData;
    // Bytes can't go into a JSON string, so a file forces multipart. The
    // field name matches what the controller filters `req.files` on.
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("files[]")).toBe(file);
    expect(decryptedFieldsFromBody(body).invoice_no).toBe("INV-0009");
  });

  it("throws with the server's message when it refuses", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Invoice number already used" },
    });
    await expect(saveInvoiceApi(draft(), "draft", CONTEXT)).rejects.toThrow(
      "Invoice number already used",
    );
  });

  it("throws rather than pretending to have saved when no id comes back", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    await expect(saveInvoiceApi(draft(), "draft", CONTEXT)).rejects.toThrow(
      /returned no id/,
    );
  });
});

describe("flattening the payload", () => {
  it("turns nested items into the item[n][field] keys the parser rebuilds", () => {
    const form = objectToFormData(
      buildInvoicePayload(draft(), "draft", CONTEXT),
    );
    expect(form.get("item[0][description]")).toBe("Consulting");
    expect(form.get("item[0][qty]")).toBe("4");
    expect(form.get("item[1][description]")).toBe("Travel");
    expect(form.get("invoice_no")).toBe("INV-0009");
  });

  it("writes a null as an empty string, not the word null", () => {
    const form = objectToFormData(
      buildInvoicePayload(draft(), "draft", CONTEXT),
    );
    expect(form.get("deposit_value")).toBe("");
  });

  it("carries a File through untouched rather than stringifying it", () => {
    const file = new File(["bytes"], "scope.pdf");
    expect(objectToFormData({ doc: file }).get("doc")).toBe(file);
  });
});
