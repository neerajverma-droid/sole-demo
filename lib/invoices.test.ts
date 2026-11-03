import { decryptPayload } from "@/utils/encrypt";
import { describe, expect, it, vi, beforeEach } from "vitest";

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

// Imported after the mock so `lib/invoices.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  addDays,
  daysBetween,
  deleteInvoiceAttachmentApi,
  deleteInvoicesApi,
  depositAmount,
  documentIssues,
  fetchInvoiceDetail,
  fetchInvoicePdfBlob,
  fetchInvoices,
  formatDocumentMoney,
  invoiceAmount,
  invoiceDocumentAmount,
  invoiceDocumentOutstanding,
  invoiceOutstanding,
  invoiceSummary,
  invoiceTotals,
  lineItemErrors,
  fetchInvoicesPage,
  markInvoicePaidWithCashApi,
  markInvoiceSentApi,
  ndisIssues,
  newLineItem,
  newNdisLineItem,
  nextInvoiceNumber,
  normaliseCurrency,
  overdueSummary,
  sendInvoicePaidReceiptApi,
  sendInvoiceReminderApi,
  statusAfterPayment,
  stopRecurringInvoiceApi,
  undoInvoicePaidWithCashApi,
  uploadInvoiceAttachmentApi,
} = await import("@/lib/invoices");

type Invoice = Awaited<ReturnType<typeof fetchInvoices>>[number];
type InvoiceLineItem = Invoice["items"][number];

/** One row of `GET /invoice/invoices`, with the fields tests override. */
const API_ROW = {
  invoice_id: 8801,
  invoice_no: "INV-8801",
  client_id: 42,
  client: { client_id: 42, name: "Acme" },
  invoice_date: "2026-03-01T00:00:00.000Z",
  due_date: "2026-03-15T00:00:00.000Z",
  status: "due",
  description: "Consulting",
  total: 1100,
  remainingAmount: 1100,
};

function line(over: Partial<InvoiceLineItem> = {}): InvoiceLineItem {
  return { ...newLineItem(), quantity: "1", price: "100", gst: false, ...over };
}

function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: "1",
    number: "INV-1",
    clientId: "42",
    clientName: "Acme",
    issued: "2026-03-01",
    due: "2026-03-15",
    status: "Outstanding",
    description: "Work",
    items: [line()],
    extraDiscount: "",
    notes: "",
    followUpReminder: false,
    overdueReminder: true,
    repeating: false,
    repeatFrequency: "Monthly",
    reviewBeforeSending: true,
    deposit: null,
    attachments: [],
    ndis: false,
    paidAmount: 0,
    sentAt: null,
    possibleMatch: 0,
    ...over,
  } as Invoice;
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ *
 * Listing
 * ------------------------------------------------------------------ */

describe("fetching the invoice list", () => {
  it("asks for one large page, newest first", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { invoice_details: [API_ROW] } },
    });

    await fetchInvoices();

    const [url, config] = apiMock.get.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.list);
    expect(config.params).toMatchObject({
      page: 1,
      page_size: 200,
      "sort_by[invoice_id]": "desc",
    });
  });

  it("maps a row onto the domain shape, trimming timestamps to plain dates", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { invoice_details: [API_ROW] } },
    });

    const [mapped] = await fetchInvoices();

    expect(mapped).toMatchObject({
      id: "8801",
      number: "INV-8801",
      clientId: "42",
      clientName: "Acme",
      issued: "2026-03-01",
      due: "2026-03-15",
      status: "Outstanding",
    });
    // The list sends no line items, so the total stands in as one line and
    // `invoiceAmount` still reports the real figure.
    expect(invoiceAmount(mapped)).toBe(1100);
  });

  it("carries recurring and cash-payment flags off the list row", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          invoice_details: [
            { ...API_ROW, is_recurring_invoice: 1, paid_with_cash: 1 },
          ],
        },
      },
    });
    const [mapped] = await fetchInvoices();
    expect(mapped.isRecurring).toBe(true);
    expect(mapped.paidWithCash).toBe(true);
  });

  it("defaults recurring and cash-payment flags to false when absent", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { invoice_details: [API_ROW] } },
    });
    const [mapped] = await fetchInvoices();
    expect(mapped.isRecurring).toBe(false);
    expect(mapped.paidWithCash).toBe(false);
  });

  it("survives a response with no invoices at all", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    expect(await fetchInvoices()).toEqual([]);
  });

  it("fetches the given page, translating every filter to its own bracket key", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { invoice_details: [API_ROW], total: 43, max_price: 5000, max_due_balance: 1200 },
      },
    });

    const page = await fetchInvoicesPage(2, 25, {
      status: "Overdue",
      search: "acme",
      issuedFrom: "2026-01-01",
      issuedTo: "2026-03-01",
      minTotal: 100,
      maxTotal: 900,
      balanceMin: 10,
      balanceMax: 500,
      sent: "not_sent",
      matchedOnly: true,
      paidWithCashOnly: true,
      clientIds: ["42", "43"],
    });

    const [url, config] = apiMock.get.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.list);
    expect(config.params).toEqual({
      page: 2,
      page_size: 25,
      "sort_by[invoice_id]": "desc",
      "filter_by[status]": "overdue",
      "filter_by[search]": "acme",
      "filter_by[start_date]": "2026-01-01",
      "filter_by[end_date]": "2026-03-01",
      "filter_by[min_price]": 100,
      "filter_by[max_price]": 900,
      "filter_by[balance_min]": 10,
      "filter_by[balance_max]": 500,
      "filter_by[sent_status]": 0,
      "filter_by[matched]": 1,
      "filter_by[paid_with_cash]": 1,
      "filter_by[client_id][1]": "42",
      "filter_by[client_id][2]": "43",
    });
    expect(page.total).toBe(43);
    expect(page.maxTotal).toBe(5000);
    expect(page.maxBalance).toBe(1200);
    expect(page.invoices).toHaveLength(1);
  });

  it("leaves the status and search params off when the tab is All and the box is empty", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { invoice_details: [] } },
    });
    await fetchInvoicesPage(1, 50, { status: "All", search: "  " });

    const params = apiMock.get.mock.calls[0][1].params;
    expect(params).not.toHaveProperty("filter_by[status]");
    expect(params).not.toHaveProperty("filter_by[search]");
  });

  it("falls back to the row count when the server sends no total", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { invoice_details: [API_ROW] } },
    });
    const page = await fetchInvoicesPage(1, 50, {});
    expect(page.total).toBe(1);
    expect(page.maxTotal).toBe(0);
  });

  it("translates the server's status vocabulary", async () => {
    for (const [raw, expected] of [
      [{ status: "paid" }, "Paid"],
      [{ status: "draft" }, "Draft"],
      [{ status: "partially_paid" }, "Partially paid"],
      [{ status: "overdue" }, "Overdue"],
      [{ status: "due" }, "Outstanding"],
      [{ status: "sent" }, "Outstanding"],
      [{ status: "recurring" }, "Outstanding"],
      // Some rows carry it under `mark_as` instead.
      [{ status: undefined, mark_as: "paid" }, "Paid"],
    ] as const) {
      apiMock.get.mockResolvedValue({
        data: {
          success: true,
          data: { invoice_details: [{ ...API_ROW, ...raw }] },
        },
      });
      expect((await fetchInvoices())[0].status).toBe(expected);
    }
  });

  it("falls back to the due date only when no status came back at all", async () => {
    // Past due with nothing to go on: overdue.
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          invoice_details: [
            {
              ...API_ROW,
              status: undefined,
              mark_as: undefined,
              due_date: "2020-01-01",
            },
          ],
        },
      },
    });
    expect((await fetchInvoices())[0].status).toBe("Overdue");

    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          invoice_details: [
            {
              ...API_ROW,
              status: undefined,
              mark_as: undefined,
              due_date: "2099-01-01",
            },
          ],
        },
      },
    });
    expect((await fetchInvoices())[0].status).toBe("Outstanding");
  });

  it("reports a foreign invoice in its own currency and back in AUD", async () => {
    /*
     * `total` and `exchange_total` are two independent, server-computed
     * figures — the books' own AUD total, and what the client was actually
     * billed in their own currency — not one derived from the other by
     * `exchange_rate`, which is carried along for reference only. Deriving
     * one from the other by a single multiplication doesn't reproduce the
     * real figure once a rate has ever been hand-edited, or once per-line
     * rounding is accounted for.
     */
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          invoice_details: [
            {
              ...API_ROW,
              total: 1000,
              remainingAmount: 600,
              is_multicurrency: 1,
              currency_code: "NZD",
              exchange_rate: 1.09,
              exchange_total: 1090,
            },
          ],
        },
      },
    });

    const [mapped] = await fetchInvoices();
    expect(mapped.currency).toBe("NZD");
    expect(invoiceAmount(mapped)).toBe(1000);
    expect(invoiceDocumentAmount(mapped)).toBe(1090);
    // 60% of the AUD total remains, so the NZD figure holds the same share.
    expect(invoiceOutstanding(mapped)).toBeCloseTo(600, 2);
    expect(invoiceDocumentOutstanding(mapped)).toBeCloseTo(654, 2);
  });

  it("falls back to the AUD total when no client-currency figure was saved", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          invoice_details: [
            {
              ...API_ROW,
              total: 1000,
              is_multicurrency: 1,
              currency_code: "NZD",
              exchange_rate: 1.09,
            },
          ],
        },
      },
    });

    const [mapped] = await fetchInvoices();
    expect(invoiceDocumentAmount(mapped)).toBe(1000);
    expect(invoiceDocumentOutstanding(mapped)).toBe(invoiceOutstanding(mapped));
  });

  it("ignores a currency code when the invoice isn't multicurrency", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          invoice_details: [
            { ...API_ROW, is_multicurrency: 0, currency_code: "NZD" },
          ],
        },
      },
    });
    expect((await fetchInvoices())[0].currency).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ *
 * Detail
 * ------------------------------------------------------------------ */

describe("fetching one invoice in full", () => {
  it("replaces the list's stand-in line with the real ones", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...API_ROW,
          notes: "Thanks",
          extra_discount: 50,
          invoice_item: [
            { description: "Consulting", qty: 4, price: "150", gst: 1 },
            { description: "Travel", qty: 1, price: "80", gst: 0 },
          ],
        },
      },
    });

    const detail = await fetchInvoiceDetail("8801");

    expect(apiMock.get.mock.calls[0][0]).toBe(apiRoutes.invoice.detail("8801"));
    expect(detail.items).toHaveLength(2);
    expect(detail.items[0]).toMatchObject({
      description: "Consulting",
      quantity: "4",
      price: "150",
    });
    expect(detail.notes).toBe("Thanks");
    expect(detail.extraDiscount).toBe("50");
  });

  it("reads a flat-amount discount back as its own figure, not an equivalent percentage", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...API_ROW,
          invoice_item: [
            {
              description: "Consulting",
              qty: 2,
              price: "100",
              disc_criteria: "currency",
              discount_amount: 25,
            },
          ],
        },
      },
    });

    const detail = await fetchInvoiceDetail("8801");
    // Not "12.5" (25 as a percentage of the $200 gross) — the flat $25 itself,
    // so re-saving it stays $25 however the quantity or price change.
    expect(detail.items[0]).toMatchObject({
      discountType: "amount",
      discountPercent: "25",
    });
  });

  it("infers an NDIS claim from a line carrying a support item number", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...API_ROW,
          invoice_item: [
            {
              description: "Assistance with self-care",
              qty: 2,
              price: "65.09",
              item_support_no: "01_011_0107_1_1",
              claim_type: "Standard Service",
            },
          ],
        },
      },
    });

    const detail = await fetchInvoiceDetail("8801");
    // Nothing on the record says "NDIS claim" — a support number is the only
    // evidence, and an ordinary invoice never has one.
    expect(detail.ndis).toBe(true);
    expect(detail.items[0]).toMatchObject({
      supportItemNumber: "01_011_0107_1_1",
      claimType: "Standard Service",
    });
  });

  it("treats an invoice with no support numbers as an ordinary one", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...API_ROW,
          invoice_item: [{ description: "Consulting", qty: 1, price: "10" }],
        },
      },
    });
    expect((await fetchInvoiceDetail("8801")).ndis).toBe(false);
  });

  it("drops a recipient the server sent without an id", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...API_ROW,
          selected_contacts: [
            { contact_id: 7, name: "Jo", email: "jo@acme.test" },
            { name: "Nameless", email: "no-id@acme.test" },
          ],
        },
      },
    });
    // An id-less recipient can't be resolved back to a contact, so sending it
    // would be worse than dropping it.
    expect((await fetchInvoiceDetail("8801")).recipients).toEqual([
      { id: "7", name: "Jo", email: "jo@acme.test" },
    ]);
  });

  it("shows bank details unless the record says otherwise", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: API_ROW } });
    expect((await fetchInvoiceDetail("8801")).showBankDetails).toBe(true);

    apiMock.get.mockResolvedValue({
      data: { success: true, data: { ...API_ROW, show_bank_details: 0 } },
    });
    expect((await fetchInvoiceDetail("8801")).showBankDetails).toBe(false);
  });

  it("reads each card rail separately", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { ...API_ROW, is_payrixpay: 1 } },
    });
    expect(await fetchInvoiceDetail("8801")).toMatchObject({
      solePayEnabled: true,
      stripeEnabled: false,
    });

    apiMock.get.mockResolvedValue({
      data: { success: true, data: { ...API_ROW, is_stripe_enabled: 1 } },
    });
    expect(await fetchInvoiceDetail("8801")).toMatchObject({
      solePayEnabled: false,
      stripeEnabled: true,
    });
  });

  it("turns the stored follow-up date back into days before due", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...API_ROW,
          is_notify_future_work: 1,
          notify_future_work: {
            notify_future_work_date: "2026-03-12T00:00:00.000Z",
            notify_future_work_description: "Check the site",
            notify_future_work: "both",
          },
        },
      },
    });

    const detail = await fetchInvoiceDetail("8801");
    expect(detail.followUpReminder).toBe(true);
    // Due 15 March, fires the 12th — three days before.
    expect(detail.followUpDays).toBe("3");
    expect(detail.followUpNotifyClient).toBe(true);
  });

  it("throws when the invoice isn't there", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });
    await expect(fetchInvoiceDetail("999")).rejects.toThrow(
      "Invoice not found",
    );
  });
});

/* ------------------------------------------------------------------ *
 * Row actions
 * ------------------------------------------------------------------ */

describe("row actions", () => {
  it("bulk-deletes by numeric ids", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await deleteInvoicesApi(["8801", "8802"]);

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.bulkDelete);
    expect(body).toEqual({ invoice_ids: [8801, 8802] });
  });

  it("marks an invoice sent against its own route", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await markInvoiceSentApi("8801");
    expect(apiMock.post.mock.calls[0][0]).toBe(
      apiRoutes.invoice.markSent("8801"),
    );
  });

  it("settles an invoice in cash, dated today", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await markInvoicePaidWithCashApi("8801");

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.paidWithCash);
    expect(body.invoice_id).toBe(8801);
    expect(body.payment_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("settles an invoice in cash on the date given, not just today", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await markInvoicePaidWithCashApi("8801", "2026-02-14");

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.paidWithCash);
    expect(body).toEqual({ invoice_id: 8801, payment_date: "2026-02-14" });
  });

  it("undoes a cash payment with undo:1 and no date", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await undoInvoicePaidWithCashApi("8801");

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.paidWithCash);
    expect(body).toEqual({ invoice_id: 8801, undo: 1 });
  });

  it("sends a paid receipt against its own route", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await sendInvoicePaidReceiptApi("8801");

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.sendPaidReceipt);
    expect(body).toEqual({ invoice_id: 8801 });
  });

  it("stops a recurring invoice with is_recurring_invoice:0", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await stopRecurringInvoiceApi("8801");

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.updateRecurringStatus);
    // Encrypted like every other write; the backend decrypts it.
    expect(decryptPayload((body as { data: string }).data)).toEqual({
      id: 8801,
      is_recurring_invoice: 0,
    });
  });

  it("chases an invoice with type=invoice", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await sendInvoiceReminderApi("8801");

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.communicationPreference.sendReminder);
    expect(body).toEqual({ id: 8801, type: "invoice" });
  });

  it("carries the server's message when an action is refused", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Invoice already paid" },
    });
    await expect(markInvoiceSentApi("8801")).rejects.toThrow(
      "Invoice already paid",
    );
  });

  it("treats an absent success flag as success, not failure", async () => {
    // Not every endpoint returns the field; a non-2xx already throws.
    apiMock.post.mockResolvedValue({ data: {} });
    await expect(markInvoiceSentApi("8801")).resolves.toBeUndefined();
  });
});

describe("attachments", () => {
  it("uploads against the invoice and keeps the server's document id", async () => {
    apiMock.post.mockResolvedValue({ data: { document_id: 91 } });
    const file = new File(["bytes"], "scope.pdf", { type: "application/pdf" });

    const attachment = await uploadInvoiceAttachmentApi("8801", file);

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.fileUpload.document);
    const form = body as FormData;
    expect(form.get("files")).toBe(file);
    expect(form.get("source_type")).toBe("invoice");
    expect(form.get("source_id")).toBe("8801");
    expect(attachment).toMatchObject({ id: "91", name: "scope.pdf" });
  });

  it("still returns an attachment when the server sends no id back", async () => {
    apiMock.post.mockResolvedValue({ data: {} });
    const file = new File(["bytes"], "scope.pdf");
    expect((await uploadInvoiceAttachmentApi("8801", file)).id).toBeTruthy();
  });

  it("deletes by document id", async () => {
    apiMock.delete.mockResolvedValue({ data: {} });
    await deleteInvoiceAttachmentApi("91");
    expect(apiMock.delete.mock.calls[0][0]).toBe(
      `${apiRoutes.fileUpload.document}/91`,
    );
  });
});

/* ------------------------------------------------------------------ *
 * PDF
 * ------------------------------------------------------------------ */

describe("the invoice PDF", () => {
  it("renders on the layout the invoice was raised on", async () => {
    apiMock.get.mockResolvedValue({ data: new Blob(["%PDF"]) });

    await fetchInvoicePdfBlob(invoice({ id: "8801", templateId: "3" }));

    const [url, config] = apiMock.get.mock.calls[0];
    expect(url).toBe(apiRoutes.templates.preview("3"));
    expect(config.responseType).toBe("blob");
    expect(config.params).toMatchObject({
      invoiceId: "8801",
      type: "invoice",
      render_type: "pdf",
    });
  });

  it("asks for the receipt layout once the invoice is settled", async () => {
    apiMock.get.mockResolvedValue({ data: new Blob(["%PDF"]) });
    await fetchInvoicePdfBlob(invoice({ templateId: "3" }), true);
    expect(apiMock.get.mock.calls[0][1].params.type).toBe("invoice-receipt");
  });

  it("refuses rather than guessing when the invoice has no layout", async () => {
    await expect(fetchInvoicePdfBlob(invoice())).rejects.toThrow(
      /no template/i,
    );
    expect(apiMock.get).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ *
 * The money
 * ------------------------------------------------------------------ */

describe("totals", () => {
  it("rounds GST per line and sums those, rather than taxing the subtotal", () => {
    const totals = invoiceTotals(
      [
        line({ quantity: "4", price: "95", gst: true }),
        line({ price: "260", gst: true }),
      ],
      "",
    );
    expect(totals).toMatchObject({ subtotal: 640, gstTotal: 64, total: 704 });
  });

  it("applies a per-line percentage discount before GST", () => {
    const totals = invoiceTotals(
      [line({ price: "100", discountPercent: "10", gst: true })],
      "",
    );
    expect(totals.discountTotal).toBe(10);
    expect(totals.gstTotal).toBeCloseTo(9, 2);
    expect(totals.total).toBeCloseTo(99, 2);
  });

  it("never lets a whole-document discount drive the total negative", () => {
    expect(invoiceTotals([line({ price: "100" })], "500").total).toBe(0);
  });

  it("takes a flat-amount discount as-is rather than as a percentage", () => {
    const totals = invoiceTotals(
      [
        line({
          quantity: "2",
          price: "100",
          discountPercent: "25",
          discountType: "amount",
          gst: true,
        }),
      ],
      "",
    );
    // Gross 200, a flat $25 off (not 25% of 200), then 10% GST on the $175 net.
    expect(totals.discountTotal).toBe(25);
    expect(totals.gstTotal).toBeCloseTo(17.5, 2);
    expect(totals.total).toBeCloseTo(192.5, 2);
  });

  it("keeps reading a line with no discountType as a percentage, for old data", () => {
    const withoutType: Partial<InvoiceLineItem> = line({
      price: "100",
      discountPercent: "10",
      gst: true,
    });
    delete withoutType.discountType;
    expect(
      invoiceTotals([withoutType as InvoiceLineItem], "").discountTotal,
    ).toBe(10);
  });

  it("reports what's still owed, and never a negative balance", () => {
    expect(invoiceOutstanding(invoice({ paidAmount: 40 }))).toBe(60);
    expect(invoiceOutstanding(invoice({ paidAmount: 999 }))).toBe(0);
  });
});

describe("statusAfterPayment", () => {
  const owed = invoice(); // one 100 line

  it("settles the invoice once the balance is covered", () => {
    expect(statusAfterPayment(owed, 100)).toBe("Paid");
    expect(statusAfterPayment(owed, 150)).toBe("Paid");
  });

  it("treats a sub-cent shortfall as settled", () => {
    // Floating-point change shouldn't leave an invoice looking unpaid.
    expect(statusAfterPayment(owed, 99.999)).toBe("Paid");
  });

  it("anything less is partial", () => {
    expect(statusAfterPayment(owed, 99)).toBe("Partially paid");
  });
});

describe("depositAmount", () => {
  it("is null when nothing is asked for up front", () => {
    expect(depositAmount(null, 1000)).toBeNull();
  });

  it("takes a percentage of the total", () => {
    expect(depositAmount({ mode: "percent", value: "30" }, 1000)).toBe(300);
  });

  it("clamps a fixed amount to the total, and a negative to zero", () => {
    expect(depositAmount({ mode: "amount", value: "5000" }, 1000)).toBe(1000);
    expect(depositAmount({ mode: "amount", value: "-50" }, 1000)).toBe(0);
  });

  it("sums the chosen lines for an items deposit", () => {
    const items = [
      line({ price: "100" }),
      line({ price: "250" }),
      line({ price: "40" }),
    ];
    expect(
      depositAmount(
        { mode: "items", value: "0", selectedItems: [0, 2] },
        1000,
        items,
      ),
    ).toBe(140);
  });
});

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

describe("documentIssues", () => {
  const valid = {
    clientId: "42",
    clientName: "Acme",
    number: "INV-1",
    items: [line({ description: "Work" })],
  };

  it("has nothing to say about a complete draft", () => {
    expect(documentIssues(valid)).toEqual([]);
  });

  it("flags a missing client, number and line", () => {
    const issues = documentIssues({
      clientId: null,
      clientName: "",
      number: "",
      items: [line()],
    });
    expect(issues.map((issue) => issue.key)).toEqual(
      expect.arrayContaining(["client", "number"]),
    );
    expect(issues.some((issue) => issue.key.endsWith("-description"))).toBe(
      true,
    );
  });

  it("names the document, so a quote isn't told to enter an invoice number", () => {
    const blank = {
      clientId: null,
      clientName: "",
      number: "",
      items: [line()],
    };
    expect(documentIssues(blank)[0].message).toContain("invoice");
    expect(documentIssues(blank, "quote")[0].message).toContain("quote");
  });
});

describe("lineItemErrors", () => {
  it("passes a blank field — an untouched row isn't an error", () => {
    expect(
      lineItemErrors(line({ quantity: "", price: "", discountPercent: "" })),
    ).toEqual({});
  });

  it("rejects letters and negatives", () => {
    expect(lineItemErrors(line({ price: "abc" })).price).toBeTruthy();
    expect(lineItemErrors(line({ price: "-5" })).price).toBeTruthy();
  });

  it("requires whole quantities on an ordinary line but allows hours on a support", () => {
    expect(lineItemErrors(line({ quantity: "1.5" })).quantity).toBeTruthy();
    // NDIS supports are claimed in hours, so 1.5 is legitimate there.
    const support = { ...newNdisLineItem(), quantity: "1.5", price: "65" };
    expect(lineItemErrors(support).quantity).toBeUndefined();
  });

  it("allows fractional kilometres and hours on an ordinary line", () => {
    expect(lineItemErrors(line({ quantity: "12.38", qtyType: "km" })).quantity).toBeUndefined();
    expect(lineItemErrors(line({ quantity: "1.5", qtyType: "hours" })).quantity).toBeUndefined();
    expect(lineItemErrors(line({ quantity: "1.5", qtyType: "days" })).quantity).toBeTruthy();
  });

  it("caps a discount at 100%", () => {
    expect(
      lineItemErrors(line({ discountPercent: "101" })).discountPercent,
    ).toBe("Discount can't exceed 100%.");
    expect(
      lineItemErrors(line({ discountPercent: "100" })).discountPercent,
    ).toBeUndefined();
  });

  it("doesn't cap a flat-amount discount at 100 — that's a dollar figure, not a percentage", () => {
    expect(
      lineItemErrors(
        line({
          quantity: "1",
          price: "500",
          discountPercent: "150",
          discountType: "amount",
        }),
      ).discountPercent,
    ).toBeUndefined();
  });

  it("rejects a flat-amount discount bigger than the line itself", () => {
    expect(
      lineItemErrors(
        line({
          quantity: "1",
          price: "100",
          discountPercent: "150",
          discountType: "amount",
        }),
      ).discountPercent,
    ).toBe("Discount can't exceed the line amount.");
  });
});

describe("ndisIssues", () => {
  it("demands a support item number on every billable line", () => {
    const issues = ndisIssues([
      {
        ...newNdisLineItem(),
        description: "Support",
        quantity: "1",
        price: "65",
      },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/support item number/i);
  });

  it("leaves a blank spare row alone", () => {
    expect(ndisIssues([newNdisLineItem()])).toEqual([]);
  });

  it("is satisfied once the number is filled in", () => {
    expect(
      ndisIssues([
        {
          ...newNdisLineItem(),
          description: "Support",
          quantity: "1",
          price: "65",
          supportItemNumber: "01_011_0107_1_1",
        },
      ]),
    ).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Summaries and formatting
 * ------------------------------------------------------------------ */

describe("invoiceSummary", () => {
  it("counts by status and never lets the shares overflow 100", () => {
    const invoices = [
      invoice({ id: "a", status: "Paid" }),
      invoice({ id: "b", status: "Draft" }),
      invoice({ id: "c", status: "Overdue" }),
      invoice({ id: "d", status: "Outstanding" }),
      invoice({ id: "e", status: "Partially paid" }),
      invoice({ id: "f", status: "Paid" }),
    ];

    const summary = invoiceSummary(invoices);
    expect(summary.count).toBe(6);
    expect(summary.total).toBe(600);
    // Largest-remainder rounding: five equal shares would otherwise sum to 101.
    expect(summary.byStatus.reduce((sum, row) => sum + row.share, 0)).toBe(100);
    // Nothing in a status means no share of the bar.
    for (const row of summary.byStatus) {
      if (row.count === 0) expect(row.share).toBe(0);
    }
  });

  it("reports zeroes for an empty list rather than dividing by zero", () => {
    const summary = invoiceSummary([]);
    expect(summary).toMatchObject({ total: 0, count: 0 });
    expect(summary.byStatus.every((row) => row.share === 0)).toBe(true);
  });
});

describe("overdueSummary", () => {
  it("counts only overdue invoices and reports the worst age", () => {
    const summary = overdueSummary(
      [
        invoice({ id: "a", status: "Overdue", due: "2026-03-01" }),
        invoice({ id: "b", status: "Overdue", due: "2026-03-10" }),
        invoice({ id: "c", status: "Outstanding", due: "2026-01-01" }),
      ],
      "2026-03-15",
    );

    expect(summary).toMatchObject({ count: 2, amount: 200, oldestDays: 14 });
  });

  it("is empty when nothing is overdue", () => {
    expect(
      overdueSummary([invoice({ status: "Paid" })], "2026-03-15"),
    ).toMatchObject({
      count: 0,
      amount: 0,
      oldestDays: 0,
    });
  });
});

describe("dates and numbering", () => {
  it("adds payment terms to an issue date across a month boundary", () => {
    expect(addDays("2026-02-25", 7)).toBe("2026-03-04");
  });

  it("measures whole days between two dates, negative when reversed", () => {
    expect(daysBetween("2026-03-01", "2026-03-15")).toBe(14);
    expect(daysBetween("2026-03-15", "2026-03-01")).toBe(-14);
  });

  it("takes the next number past the highest already used, zero-padded to four", () => {
    const invoices = [
      invoice({ number: "INV-0007" }),
      invoice({ number: "INV-0012" }),
    ];
    expect(nextInvoiceNumber(invoices, { prefix: "INV", next: "1" })).toBe(
      "INV-0013",
    );
  });

  it("treats the configured start as a floor, never an override", () => {
    // Setting it backwards would otherwise mint a duplicate.
    const invoices = [invoice({ number: "INV-0003" })];
    expect(nextInvoiceNumber(invoices, { prefix: "INV", next: "50" })).toBe(
      "INV-0050",
    );
  });

  it("honours a custom prefix and falls back to INV without one", () => {
    const invoices = [invoice({ number: "AC-0004" })];
    expect(nextInvoiceNumber(invoices, { prefix: "AC", next: "1" })).toBe(
      "AC-0005",
    );
    expect(nextInvoiceNumber(invoices, { prefix: "  ", next: "1" })).toBe(
      "INV-0005",
    );
  });
});

describe("currency", () => {
  it("normalises a code and rejects anything that isn't one", () => {
    expect(normaliseCurrency("nzd")).toBe("NZD");
    expect(normaliseCurrency(undefined)).toBeNull();
  });

  it("prefixes a foreign amount with its code, and AUD with a bare dollar sign", () => {
    expect(formatDocumentMoney(1000)).toBe("$1,000.00");
    expect(formatDocumentMoney(1000, "NZD")).toContain("1,000.00");
    expect(formatDocumentMoney(1000, "NZD")).not.toBe("$1,000.00");
  });
});
