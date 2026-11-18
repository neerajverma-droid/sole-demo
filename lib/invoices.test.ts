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
  fetchInvoiceSummaryStats,
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
  sendInvoiceToClientApi,
  formatRecipientList,
  ndisIssues,
  newLineItem,
  newNdisLineItem,
  nextInvoiceNumber,
  normaliseCurrency,
  overdueSummary,
  sendInvoicePaidReceiptApi,
  sendInvoiceReminderApi,
  canSaveInvoiceAsDraft,
  depositIssue,
  followUpIssue,
  invoiceEditBlock,
  invoiceEmailError,
  invoiceTotalIssue,
  invoiceAwaitingPayment,
  invoiceMoneyBands,
  invoiceSplit,
  invoiceUndoAction,
  stockIssues,
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

  it("lists the stored attachments with their id, link and size", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...API_ROW,
          documents: [
            {
              id: 91,
              document_id: 91,
              file_name: "scope.pdf",
              file_path: "https://bucket.test/staging/1/invoice/a.pdf",
              file_url: "https://bucket.test/staging/1/invoice/a.pdf",
              file_size: 2048,
            },
            // Older rows: only the document_id spelling, and no size.
            { document_id: 92, file_path: "staging/1/invoice/b.png" },
          ],
        },
      },
    });

    expect((await fetchInvoiceDetail("8801")).attachments).toEqual([
      {
        id: "91",
        name: "scope.pdf",
        size: 2048,
        url: "https://bucket.test/staging/1/invoice/a.pdf",
      },
      { id: "92", name: "b.png", size: 0, url: undefined },
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

  it("reports how many a bulk delete removed and how many it skipped", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        message: "1 of 2 invoices deleted; 1 skipped.",
        data: { deleted_count: 1, skipped_count: 1 },
      },
    });
    expect(await deleteInvoicesApi(["8801", "8802"])).toEqual({
      deleted: 1,
      skipped: 1,
    });
  });

  it("counts everything as deleted when the response carries no counts", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    expect(await deleteInvoicesApi(["8801", "8802"])).toEqual({
      deleted: 2,
      skipped: 0,
    });
  });

  it("throws the server's reason when every selected invoice is locked", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: false,
        message: "No invoices deleted: selected invoices are locked.",
      },
    });
    await expect(deleteInvoicesApi(["8801", "8802"])).rejects.toThrow(
      /locked/,
    );
  });

  it("marks an invoice sent against its own route", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await markInvoiceSentApi("8801");
    expect(apiMock.post.mock.calls[0][0]).toBe(
      apiRoutes.invoice.markSent("8801"),
    );
  });

  it("sends an invoice to its client and returns every recipient, client first", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          recipients: { to: ["client@example.com"], cc: ["cc@example.com"] },
        },
      },
    });
    const recipients = await sendInvoiceToClientApi("8801");
    expect(apiMock.post.mock.calls[0][0]).toBe(
      apiRoutes.invoice.sendToClient("8801"),
    );
    expect(recipients).toEqual(["client@example.com", "cc@example.com"]);
  });

  it("surfaces the server's reason when sending to the client fails", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Acme has no email address." },
    });
    await expect(sendInvoiceToClientApi("8801")).rejects.toThrow(
      /no email address/,
    );
  });

  it("names recipients as a readable list", () => {
    expect(formatRecipientList([])).toBe("");
    expect(formatRecipientList(["a@example.com"])).toBe("a@example.com");
    expect(formatRecipientList(["a@example.com", "b@example.com"])).toBe(
      "a@example.com and b@example.com",
    );
    expect(
      formatRecipientList(["a@example.com", "b@example.com", "c@example.com"]),
    ).toBe("a@example.com, b@example.com and c@example.com");
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

  it("reads the document id out of the response envelope", async () => {
    // The server answers { success, message, data: { document_id } }; the id
    // used to be read off the top level, so a real upload got a placeholder id
    // that no later delete could find.
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { document_id: 93 } },
    });
    const file = new File(["bytes"], "scope.pdf", { type: "application/pdf" });

    expect(await uploadInvoiceAttachmentApi("8801", file)).toMatchObject({
      id: "93",
    });
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

describe("canSaveInvoiceAsDraft", () => {
  it("is always on offer for a new invoice or a copy", () => {
    expect(canSaveInvoiceAsDraft(false, undefined)).toBe(true);
  });

  it("is on offer when editing an invoice that is still a draft", () => {
    expect(canSaveInvoiceAsDraft(true, "Draft")).toBe(true);
  });

  it.each(["Outstanding", "Overdue", "Partially paid", "Paid"] as const)(
    "is not on offer when editing an invoice that is %s",
    (status) => {
      expect(canSaveInvoiceAsDraft(true, status)).toBe(false);
    },
  );

  it("is not on offer while the invoice being edited hasn't loaded", () => {
    expect(canSaveInvoiceAsDraft(true, undefined)).toBe(false);
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

  describe("line items, field by field", () => {
    const draft = (items: InvoiceLineItem[]) => ({
      clientId: "42",
      clientName: "Acme",
      number: "INV-1",
      items,
    });
    const keyed = (issues: ReturnType<typeof documentIssues>) =>
      issues.map((issue) => `${issue.key.replace(/^item-line-\d+-/, "")}: ${issue.message}`);

    it("marks the quantity, not the table, when only the quantity was forgotten", () => {
      const issues = documentIssues(draft([{ ...newLineItem(), description: "Work", price: "50" }]));
      expect(keyed(issues)).toEqual(["quantity: Enter a quantity."]);
      expect(issues[0].submitOnly).toBe(true);
    });

    it("marks the price when only the price was forgotten", () => {
      const issues = documentIssues(draft([{ ...newLineItem(), description: "Work", quantity: "2" }]));
      expect(keyed(issues)).toEqual(["price: Enter a price."]);
    });

    it("marks the description when only the description was forgotten", () => {
      const issues = documentIssues(draft([{ ...newLineItem(), quantity: "1", price: "50" }]));
      expect(keyed(issues)).toEqual(["description: Enter a description."]);
    });

    it("marks all three on an untouched first line, since nothing has been billed", () => {
      expect(keyed(documentIssues(draft([newLineItem()])))).toEqual([
        "description: Enter a description.",
        "quantity: Enter a quantity.",
        "price: Enter a price.",
      ]);
    });

    it("says a zero quantity must be more than 0 rather than that it is missing", () => {
      const issues = documentIssues(draft([{ ...newLineItem(), description: "Work", quantity: "0", price: "5" }]));
      expect(keyed(issues)).toEqual(["quantity: Quantity must be more than 0."]);
    });

    it("leaves a blank spare row alone beside a complete one", () => {
      const filled = line({ description: "Work", quantity: "1", price: "50" });
      expect(documentIssues(draft([filled, newLineItem()]))).toEqual([]);
    });

    it("holds a half-typed second line to the same rule", () => {
      const filled = line({ description: "Work", quantity: "1", price: "50" });
      const issues = documentIssues(draft([filled, { ...newLineItem(), description: "More" }]));
      expect(keyed(issues)).toEqual(["quantity: Enter a quantity.", "price: Enter a price."]);
    });

    it("keeps the live message for letters, and doesn't repeat it as a missing value", () => {
      const issues = documentIssues(draft([line({ description: "Work", quantity: "1", price: "abc" })]));
      expect(issues).toHaveLength(1);
      expect(issues[0].submitOnly).toBeUndefined();
    });
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

  it("holds an NDIS support to the same quantity rule — a fraction only in hours or km", () => {
    const support = (qtyType: "items" | "hours" | "km" | "days") => ({
      ...newNdisLineItem(),
      quantity: "1.5",
      price: "65",
      qtyType,
    });
    expect(lineItemErrors(support("hours")).quantity).toBeUndefined();
    expect(lineItemErrors(support("km")).quantity).toBeUndefined();
    expect(lineItemErrors(support("items")).quantity).toBeTruthy();
    expect(lineItemErrors(support("days")).quantity).toBeTruthy();
  });

  it("allows at most 2 decimal places on a price", () => {
    expect(lineItemErrors(line({ price: "10.25" })).price).toBeUndefined();
    expect(lineItemErrors(line({ price: "10." })).price).toBeUndefined();
    expect(lineItemErrors(line({ price: "10.255" })).price).toBe(
      "Price can have up to 2 decimal places.",
    );
    expect(
      lineItemErrors({ ...newNdisLineItem(), price: "65.123" }).price,
    ).toBeTruthy();
  });

  it("allows at most 2 decimal places on a discount, percentage or amount", () => {
    expect(
      lineItemErrors(line({ discountPercent: "12.5" })).discountPercent,
    ).toBeUndefined();
    expect(
      lineItemErrors(line({ discountPercent: "12.555" })).discountPercent,
    ).toBe("Discount can have up to 2 decimal places.");
    expect(
      lineItemErrors(
        line({
          quantity: "1",
          price: "500",
          discountPercent: "10.999",
          discountType: "amount",
        }),
      ).discountPercent,
    ).toBe("Discount can have up to 2 decimal places.");
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

/* ------------------------------------------------------------------ *
 * Rules the old editor and list enforced
 * ------------------------------------------------------------------ */

describe("invoiceEditBlock", () => {
  it("lets draft, outstanding and overdue invoices be edited", () => {
    for (const status of ["Draft", "Outstanding", "Overdue"] as const) {
      expect(invoiceEditBlock({ status, bulkUpload: false })).toBeUndefined();
    }
  });

  it("opens a paid invoice in view mode only", () => {
    expect(invoiceEditBlock({ status: "Paid", bulkUpload: false })).toMatch(
      /view mode only/,
    );
  });

  it("gives a partially paid invoice no edit", () => {
    expect(
      invoiceEditBlock({ status: "Partially paid", bulkUpload: false }),
    ).toMatch(/Partially paid invoices can't be edited/);
  });

  it("never edits a bulk-uploaded invoice, whatever its status", () => {
    expect(invoiceEditBlock({ status: "Draft", bulkUpload: true })).toMatch(
      /Bulk-uploaded/,
    );
  });
});

describe("invoiceTotalIssue", () => {
  it("rejects zero and negative totals", () => {
    expect(invoiceTotalIssue(0)).toBe("Invoice total must be greater than 0.");
    expect(invoiceTotalIssue(-5)).toBeDefined();
    expect(invoiceTotalIssue(0.01)).toBeUndefined();
  });
});

describe("invoiceEmailError", () => {
  it("accepts an address and rejects everything else", () => {
    expect(invoiceEmailError("accounts@acme.test")).toBeUndefined();
    expect(invoiceEmailError("  accounts@acme.test  ")).toBeUndefined();
    expect(invoiceEmailError("")).toBeDefined();
    expect(invoiceEmailError("accounts")).toBeDefined();
    expect(invoiceEmailError("accounts@acme")).toBeDefined();
    expect(invoiceEmailError("a b@acme.test")).toBeDefined();
  });
});

describe("depositIssue", () => {
  const items = [
    { ...newLineItem(), description: "Design", quantity: "1", price: "600" },
    { ...newLineItem(), description: "Build", quantity: "1", price: "400" },
  ];
  const context = {
    total: 1000,
    items,
    gstPercent: 10,
    issued: "2026-11-01",
    due: "2026-11-15",
  };
  const percent = (value: string, dueDate = "2026-11-04") => ({
    mode: "percent" as const,
    value,
    dueDate,
  });

  it("is fine when there is no deposit", () => {
    expect(depositIssue(null, context)).toBeUndefined();
  });

  it("accepts a sensible percentage, amount and set of lines", () => {
    expect(depositIssue(percent("30"), context)).toBeUndefined();
    expect(
      depositIssue(
        { mode: "amount", value: "250", dueDate: "2026-11-04" },
        context,
      ),
    ).toBeUndefined();
    expect(
      depositIssue(
        {
          mode: "items",
          value: "",
          selectedItems: [0],
          dueDate: "2026-11-04",
        },
        context,
      ),
    ).toBeUndefined();
  });

  it("needs something to take a deposit on", () => {
    expect(depositIssue(percent("30"), { ...context, total: 0 })).toMatch(
      /at least one item/,
    );
  });

  it("keeps a percentage strictly between 0 and 100", () => {
    expect(depositIssue(percent("0"), context)).toMatch(/greater than 0/);
    expect(depositIssue(percent("100"), context)).toMatch(/less than 100/);
  });

  it("keeps a fixed amount above 0 and below the total", () => {
    const amount = (value: string) => ({
      mode: "amount" as const,
      value,
      dueDate: "2026-11-04",
    });
    expect(depositIssue(amount("0"), context)).toMatch(/greater than 0/);
    expect(depositIssue(amount("1000"), context)).toMatch(/less than 1000.00/);
  });

  it("notices a deposit the invoice has since outgrown", () => {
    // A 600 deposit was fine on a 1,000 invoice; the total has dropped to 500.
    expect(
      depositIssue(
        { mode: "amount", value: "600", dueDate: "2026-11-04" },
        { ...context, total: 500 },
      ),
    ).toMatch(/less than 500.00/);
  });

  it("needs two lines, and at least one left unchecked, for chosen lines", () => {
    const chosen = (selectedItems: number[]) => ({
      mode: "items" as const,
      value: "",
      selectedItems,
      dueDate: "2026-11-04",
    });
    expect(depositIssue(chosen([]), context)).toMatch(/Select at least one/);
    expect(depositIssue(chosen([0, 1]), context)).toMatch(/remain unchecked/);
    expect(
      depositIssue(chosen([0]), { ...context, items: items.slice(0, 1) }),
    ).toMatch(/at least two/);
  });

  it("keeps the deposit due date between the invoice date and the due date", () => {
    expect(
      depositIssue({ mode: "percent", value: "30" }, context),
    ).toMatch(/when the deposit is due/);
    expect(depositIssue(percent("30", "2026-10-31"), context)).toMatch(
      /earlier than the invoice date/,
    );
    expect(depositIssue(percent("30", "2026-11-16"), context)).toMatch(
      /later than the invoice due date/,
    );
  });
});

describe("followUpIssue", () => {
  const base = {
    followUpReminder: true,
    followUpDays: "3",
    followUpNote: "Check the install",
    issued: "2026-11-01",
    due: "2026-11-08",
  };

  it("is fine while the follow-up is off, whatever is typed", () => {
    expect(
      followUpIssue({ ...base, followUpReminder: false, followUpDays: "" }),
    ).toBeUndefined();
  });

  it("accepts days within the term and a note", () => {
    expect(followUpIssue(base)).toBeUndefined();
    expect(followUpIssue({ ...base, followUpDays: "7" })).toBeUndefined();
  });

  it("needs the days, as a whole number of 1 or more", () => {
    expect(followUpIssue({ ...base, followUpDays: "" })).toMatch(/Enter how many/);
    expect(followUpIssue({ ...base, followUpDays: "0" })).toMatch(/whole number/);
    expect(followUpIssue({ ...base, followUpDays: "1.5" })).toMatch(/whole number/);
  });

  it("can't reach back before the invoice date", () => {
    expect(followUpIssue({ ...base, followUpDays: "8" })).toMatch(
      /more than 7 days/,
    );
  });

  it("needs to say what the follow-up is about", () => {
    expect(followUpIssue({ ...base, followUpNote: "  " })).toBe(
      "Describe the follow-up work.",
    );
  });
});

describe("stockIssues", () => {
  const line = (productId: string | undefined, quantity: string) => ({
    ...newLineItem(),
    description: "Widget",
    quantity,
    price: "10",
    productId,
  });

  it("flags a line that asks for more than is on the shelf", () => {
    const items = [line("p1", "5")];
    const issues = stockIssues(items, new Map([["p1", 4]]));
    expect(issues).toEqual([
      { key: `item-${items[0].id}-quantity`, message: "Only 4 in stock." },
    ]);
  });

  it("lets a line take exactly what is there", () => {
    expect(stockIssues([line("p1", "4")], new Map([["p1", 4]]))).toEqual([]);
  });

  it("adds up two lines of the same product", () => {
    const items = [line("p1", "3"), line("p1", "3")];
    expect(stockIssues(items, new Map([["p1", 5]]))).toHaveLength(2);
  });

  it("gives back what the invoice being edited already holds", () => {
    // 0 on the shelf because this invoice took all 5; editing it as 5 is fine.
    expect(
      stockIssues(
        [line("p1", "5")],
        new Map([["p1", 0]]),
        new Map([["p1", 5]]),
      ),
    ).toEqual([]);
    expect(
      stockIssues(
        [line("p1", "6")],
        new Map([["p1", 0]]),
        new Map([["p1", 5]]),
      ),
    ).toHaveLength(1);
  });

  it("ignores lines that aren't a tracked product", () => {
    expect(
      stockIssues([line(undefined, "99"), line("untracked", "99")], new Map()),
    ).toEqual([]);
  });

  it("needs a whole-number quantity on a tracked line", () => {
    const items = [line("p1", "2.5")];
    expect(stockIssues(items, new Map([["p1", 10]]))).toEqual([
      {
        key: `item-${items[0].id}-quantity`,
        message: "Stock items need a whole-number quantity.",
      },
    ]);
    // A fractional quantity is fine on a line that isn't stock.
    expect(stockIssues([line(undefined, "2.5")], new Map())).toEqual([]);
  });

  it("a quote or draft adds nothing back, so 80 of 50 is refused", () => {
    // What the quote and draft-invoice editors call: no `onInvoice`.
    expect(stockIssues([line("p1", "80")], new Map([["p1", 50]]))).toEqual([
      expect.objectContaining({ message: "Only 50 in stock." }),
    ]);
  });
});

describe("documentIssues client", () => {
  const base = { clientName: "", number: "INV-1", items: [] };

  it("asks for a client when none is picked", () => {
    expect(
      documentIssues({ ...base, clientId: null }).find((i) => i.key === "client")
        ?.message,
    ).toBe("Select a client for this invoice.");
  });

  it("wants a client picked from the list, not just a name", () => {
    expect(
      documentIssues({ ...base, clientId: null, clientName: "Acme" }).find(
        (i) => i.key === "client",
      )?.message,
    ).toMatch(/Pick this invoice's client from the list/);
  });

  it("treats the backend's \"0\" as no client", () => {
    expect(
      documentIssues({ ...base, clientId: "0", clientName: "Acme" }).some(
        (i) => i.key === "client",
      ),
    ).toBe(true);
  });

  it("accepts a picked client", () => {
    expect(
      documentIssues({ ...base, clientId: "12", clientName: "Acme" }).some(
        (i) => i.key === "client",
      ),
    ).toBe(false);
  });
});

describe("fetchInvoiceSummaryStats", () => {
  beforeEach(() => apiMock.get.mockReset());

  it("asks the status-counts route for stats and maps both periods", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          stats: {
            year: {
              issued: 31625.54,
              draft_count: 14,
              paid: { count: 1, part_paid: 0, amount: 4036.5 },
              pending: { count: 6, part_paid: 0, amount: "26641.04" },
              overdue: { count: 3, part_paid: 0, amount: 948, oldest_days: 9 },
            },
            month: {},
          },
        },
      },
    });

    const stats = await fetchInvoiceSummaryStats();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.invoice.statusCounts, {
      params: { include_stats: 1 },
    });
    expect(stats.year).toEqual({
      issued: 31625.54,
      draftCount: 14,
      paid: { count: 1, partPaid: 0, amount: 4036.5 },
      pending: { count: 6, partPaid: 0, amount: 26641.04 },
      overdue: { count: 3, partPaid: 0, amount: 948, oldestDays: 9 },
    });
    // A period the server leaves out is zeroes, not a crash.
    expect(stats.month.issued).toBe(0);
    expect(stats.month.overdue.oldestDays).toBe(0);
  });
});

describe("invoiceAwaitingPayment", () => {
  const sent = "2026-03-02T09:00:00.000Z";

  it("is true for a sent invoice that is still owed", () => {
    for (const status of ["Outstanding", "Overdue"] as const) {
      expect(invoiceAwaitingPayment(invoice({ status, sentAt: sent }))).toBe(true);
    }
  });

  it("is false for a draft, even one the feed has a candidate for", () => {
    expect(invoiceAwaitingPayment(invoice({ status: "Draft", sentAt: sent }))).toBe(false);
    expect(invoiceAwaitingPayment(invoice({ status: "Draft" }), 2)).toBe(false);
  });

  it("is true for one saved but not sent (Save & Print), since it can still be paid or matched", () => {
    expect(
      invoiceAwaitingPayment(
        invoice({ status: "Outstanding", sentAt: null, savedAt: "2026-03-02" }),
      ),
    ).toBe(true);
    expect(invoiceAwaitingPayment(invoice({ status: "Outstanding", sentAt: null }))).toBe(true);
  });

  it("is false once nothing is owing", () => {
    expect(
      invoiceAwaitingPayment(invoice({ status: "Outstanding", sentAt: sent, paidAmount: 1100 })),
    ).toBe(false);
    expect(invoiceAwaitingPayment(invoice({ status: "Paid", sentAt: sent }))).toBe(false);
  });
});

describe("invoiceUndoAction", () => {
  const entry = {
    journalEntryId: "55",
    description: "Deposit",
    amount: 100,
    matchedAt: null,
  };

  it("offers nothing on an invoice that isn't paid or part paid", () => {
    for (const status of ["Draft", "Outstanding", "Overdue"] as const) {
      expect(
        invoiceUndoAction({
          status,
          paidWithCash: true,
          matchedEntries: [entry],
        }),
      ).toBeNull();
    }
  });

  it("undoes a cash payment by marking the invoice unpaid", () => {
    expect(
      invoiceUndoAction({ status: "Paid", paidWithCash: true }),
    ).toBe("cash");
  });

  it("undoes a bank match when the payment was one", () => {
    expect(
      invoiceUndoAction({
        status: "Paid",
        paidWithCash: false,
        matchedEntries: [entry],
      }),
    ).toBe("match");
    expect(
      invoiceUndoAction({
        status: "Partially paid",
        paidWithCash: false,
        matchedEntries: [entry],
      }),
    ).toBe("match");
  });

  it("leaves a payment settled through SolePay alone", () => {
    expect(
      invoiceUndoAction({
        status: "Paid",
        paidWithCash: true,
        paidWithPayrix: true,
      }),
    ).toBeNull();
  });

  it("has nothing to undo when the payment isn't on record here", () => {
    expect(
      invoiceUndoAction({ status: "Paid", paidWithCash: false }),
    ).toBeNull();
    expect(
      invoiceUndoAction({
        status: "Partially paid",
        paidWithCash: false,
        matchedEntries: [],
      }),
    ).toBeNull();
  });
});

describe("matched transactions on an invoice row", () => {
  it("reads each matched journal entry, newest first as sent", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          invoice_details: [
            {
              ...API_ROW,
              matched_journal_entries: [
                {
                  journal_entry_id: 77,
                  transaction_description: " ACME PTY LTD ",
                  matched_amount: "60.5",
                  matched_at: "2026-11-02 09:10:11",
                },
                { journal_entry_id: 0, matched_amount: 5 },
                {
                  journal_entry_id: 78,
                  transaction_description: null,
                  matched_amount: 39.5,
                  matched_at: null,
                },
              ],
            },
          ],
        },
      },
    });

    const [row] = await fetchInvoices();

    // The entry with no real journal entry id can't be undone, so it is dropped.
    expect(row.matchedEntries).toEqual([
      {
        journalEntryId: "77",
        description: "ACME PTY LTD",
        amount: 60.5,
        matchedAt: "2026-11-02",
      },
      { journalEntryId: "78", description: null, amount: 39.5, matchedAt: null },
    ]);
  });

  it("is empty when the row carries no matches", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { invoice_details: [API_ROW] } },
    });
    expect((await fetchInvoices())[0].matchedEntries).toEqual([]);
  });
});

describe("invoiceSplit and the summary's money bands", () => {
  // A 1,000 invoice, in whatever state a test needs.
  const thousand = (over: Partial<Invoice>) =>
    invoice({ items: [line({ price: "1000" })], ...over });

  it("counts a fully paid invoice wholly as paid, and nothing as owed", () => {
    expect(invoiceSplit(thousand({ status: "Paid", paidAmount: 1000 }))).toEqual({ paid: 1000, owed: 0 });
  });

  it("counts a Paid invoice as paid in full even when its recorded payment is missing", () => {
    // A bulk-uploaded paid invoice is settled by a cash entry the list may not echo back.
    expect(invoiceSplit(thousand({ status: "Paid", paidAmount: 0 }))).toEqual({ paid: 1000, owed: 0 });
  });

  it("splits a part-paid invoice into what was received and the balance", () => {
    expect(invoiceSplit(thousand({ status: "Partially paid", paidAmount: 400 }))).toEqual({ paid: 400, owed: 600 });
    expect(invoiceSplit(thousand({ status: "Partially paid", paidAmount: 500 }))).toEqual({ paid: 500, owed: 500 });
  });

  it("counts an unpaid invoice wholly as owed", () => {
    expect(invoiceSplit(thousand({ status: "Outstanding", paidAmount: 0 }))).toEqual({ paid: 0, owed: 1000 });
    expect(invoiceSplit(thousand({ status: "Overdue", paidAmount: 0 }))).toEqual({ paid: 0, owed: 1000 });
  });

  it("counts a draft as neither — it hasn't been issued", () => {
    expect(invoiceSplit(thousand({ status: "Draft", paidAmount: 0 }))).toEqual({ paid: 0, owed: 0 });
  });

  it("never counts more than the invoice is for", () => {
    expect(invoiceSplit(thousand({ status: "Partially paid", paidAmount: 1500 }))).toEqual({ paid: 1000, owed: 0 });
    expect(invoiceSplit(thousand({ status: "Partially paid", paidAmount: -50 }))).toEqual({ paid: 0, owed: 1000 });
  });

  it("puts the paid part of a part-paid invoice in Paid and only its balance in Pending", () => {
    const bands = invoiceMoneyBands([
      thousand({ id: "1", status: "Paid", paidAmount: 1000 }),
      thousand({ id: "2", status: "Partially paid", paidAmount: 400 }),
      thousand({ id: "3", status: "Outstanding", paidAmount: 0 }),
      thousand({ id: "4", status: "Overdue", paidAmount: 0 }),
      thousand({ id: "5", status: "Draft", paidAmount: 0 }),
    ]);

    // 1,000 paid in full + the 400 received on the part-paid one.
    expect(bands.paid).toEqual({ count: 2, partPaid: 1, amount: 1400 });
    // The part-paid balance (600) plus the untouched outstanding one (1,000), not 2,000 for both.
    expect(bands.pending).toEqual({ count: 2, partPaid: 1, amount: 1600 });
    expect(bands.overdue).toEqual({ count: 1, partPaid: 0, amount: 1000 });
  });

  it("adds up to what was invoiced, drafts aside", () => {
    const invoices = [
      thousand({ status: "Paid", paidAmount: 1000 }),
      thousand({ status: "Partially paid", paidAmount: 250 }),
      thousand({ status: "Outstanding", paidAmount: 0 }),
      thousand({ status: "Overdue", paidAmount: 0 }),
    ];
    const { paid, pending, overdue } = invoiceMoneyBands(invoices);

    expect(paid.amount + pending.amount + overdue.amount).toBe(4000);
  });

  it("leaves Paid at zero, rather than counting a part-paid invoice, when nothing has been received", () => {
    const bands = invoiceMoneyBands([thousand({ status: "Partially paid", paidAmount: 0 })]);

    expect(bands.paid).toEqual({ count: 0, partPaid: 0, amount: 0 });
    expect(bands.pending).toEqual({ count: 1, partPaid: 1, amount: 1000 });
  });
});

describe("documentHasDraftContent", () => {
  const blank = { clientId: null, clientName: "", number: "INV-1", items: [newLineItem()] };

  it("is false for a form with nothing in it", async () => {
    const { documentHasDraftContent } = await import("@/lib/invoices");
    expect(documentHasDraftContent(blank)).toBe(false);
    // "0" is the backend's "no client", not a client.
    expect(documentHasDraftContent({ ...blank, clientId: "0" })).toBe(false);
  });

  it("is true once there is a client, a description, or a line with a description or price", async () => {
    const { documentHasDraftContent } = await import("@/lib/invoices");
    expect(documentHasDraftContent({ ...blank, clientId: "7" })).toBe(true);
    expect(documentHasDraftContent({ ...blank, description: "Kitchen refit" })).toBe(true);
    expect(
      documentHasDraftContent({ ...blank, items: [{ ...newLineItem(), description: "Labour" }] }),
    ).toBe(true);
    expect(
      documentHasDraftContent({ ...blank, items: [{ ...newLineItem(), price: "50" }] }),
    ).toBe(true);
  });
});
