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
// "@/utils/axiosInstance"` resolves to the mocked module above. The rest of
// this module is covered by lib/invoices.test.ts; this file takes the
// exports that one doesn't reach.
const {
  currencySymbol,
  currentFinancialYear,
  draftFromInvoice,
  dueDateClass,
  fetchInvoiceDetail,
  fetchInvoiceStatusCounts,
  fetchInvoices,
  financialYearRevenue,
  formatDateLabel,
  formatInvoiceDate,
  invoiceDepositAmount,
  invoiceMoney,
  invoiceOverview,
  isForeignCurrency,
  isLineItemFilled,
  lineItemFromCatalogue,
  newLineItem,
  percentShares,
  repeatFrequencyFromId,
  statusVariant,
  toDiscountType,
  toNdisClaimType,
  toQtyType,
} = await import("@/lib/invoices");

type Invoice = Awaited<ReturnType<typeof fetchInvoices>>[number];
type InvoiceLineItem = Invoice["items"][number];

function line(over: Partial<InvoiceLineItem> = {}): InvoiceLineItem {
  return { ...newLineItem(), quantity: "1", price: "100", gst: false, ...over };
}

/** An invoice worth `amount` (one GST-free line), with `paidAmount` received. */
function invoice(over: Partial<Invoice> & { amount?: number } = {}): Invoice {
  const { amount = 100, ...rest } = over;
  return {
    id: "1",
    number: "INV-1",
    clientId: "42",
    clientName: "Acme",
    issued: "2026-03-01",
    due: "2026-03-15",
    status: "Outstanding",
    description: "Work",
    items: [line({ price: String(amount) })],
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
    isRecurring: false,
    paidWithCash: false,
    ...rest,
  } as Invoice;
}

/** One row of `GET /invoice/invoices/:id`, with the fields tests override. */
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

function detailReturns(over: Record<string, unknown>) {
  apiMock.get.mockResolvedValue({
    data: { success: true, data: { ...API_ROW, ...over } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ *
 * Status counts
 * ------------------------------------------------------------------ */

describe("fetchInvoiceStatusCounts", () => {
  it("maps the server's aggregate onto the tabs, with due as Outstanding", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { all: 12, draft: 1, due: 4, overdue: 3, partially_paid: 2, paid: 2 },
      },
    });

    expect(await fetchInvoiceStatusCounts()).toEqual({
      All: 12,
      Draft: 1,
      Outstanding: 4,
      Overdue: 3,
      "Partially paid": 2,
      Paid: 2,
    });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.invoice.statusCounts, {
      params: {},
    });
  });

  it("scopes to clients with 1-indexed filter_by[client_id][n] params", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });

    await fetchInvoiceStatusCounts(["42", "43"]);

    expect(apiMock.get.mock.calls[0][1]).toEqual({
      params: { "filter_by[client_id][1]": "42", "filter_by[client_id][2]": "43" },
    });
  });

  it("defaults each missing count to 0", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });

    expect(await fetchInvoiceStatusCounts()).toEqual({
      All: 0,
      Draft: 0,
      Outstanding: 0,
      Overdue: 0,
      "Partially paid": 0,
      Paid: 0,
    });
  });
});

/* ------------------------------------------------------------------ *
 * Detail mapping the main suite doesn't reach
 * ------------------------------------------------------------------ */

describe("fetchInvoiceDetail — recurrence", () => {
  it("reads the schedule off invoice_recurring", async () => {
    detailReturns({
      is_recurring_invoice: 1,
      invoice_recurring: {
        frequency: "fortnightly",
        on_occurance: 2,
        no_of_occurance: 6,
        start_date: "2026-04-01T00:00:00.000Z",
        tag_line: "Fortnightly cleaning",
      },
    });

    expect(await fetchInvoiceDetail("8801")).toMatchObject({
      repeating: true,
      isRecurring: true,
      repeatFrequency: "Fortnightly",
      // 2 sends each copy straight out, so there's no review step.
      reviewBeforeSending: false,
      repeatStart: "2026-04-01",
      repeatOccurrences: "6",
      repeatTagLine: "Fortnightly cleaning",
    });
  });

  it("holds each copy for review unless on_occurance is 2", async () => {
    detailReturns({
      is_recurring_invoice: 1,
      invoice_recurring: { frequency: "weekly", on_occurance: "1" },
    });
    expect((await fetchInvoiceDetail("8801")).reviewBeforeSending).toBe(true);
  });

  it("isn't repeating without a schedule, and defaults the rest like a blank draft", async () => {
    detailReturns({ is_recurring_invoice: 1, invoice_recurring: null });

    expect(await fetchInvoiceDetail("8801")).toMatchObject({
      repeating: false,
      repeatFrequency: "Monthly",
      reviewBeforeSending: true,
      // The day after issue — never the issue date itself.
      repeatStart: "2026-03-02",
      repeatOccurrences: "",
      repeatTagLine: "",
    });
  });

  it("isn't repeating when the flag is off, even with a stored schedule", async () => {
    detailReturns({
      is_recurring_invoice: 0,
      invoice_recurring: { frequency: "weekly" },
    });
    expect((await fetchInvoiceDetail("8801")).repeating).toBe(false);
  });
});

describe("fetchInvoiceDetail — deposit", () => {
  it("reads an items deposit by its selection type first", async () => {
    detailReturns({
      is_deposit: 1,
      deposit_type: "fixed",
      deposit_selection_type: "select_items",
      deposit_selected_items: [0, "2", 1.5],
      deposit_value: 330,
      deposit_due_date: "2026-03-08T00:00:00.000Z",
    });

    expect((await fetchInvoiceDetail("8801")).deposit).toEqual({
      mode: "items",
      value: "330",
      selectedItems: [0, 2],
      dueDate: "2026-03-08",
    });
  });

  it("reads a percentage deposit, and anything else as a fixed amount", async () => {
    detailReturns({
      payment_structure: "deposit_balance",
      deposit_type: "percentage",
      deposit_value: "25",
    });
    expect((await fetchInvoiceDetail("8801")).deposit).toEqual({
      mode: "percent",
      value: "25",
      selectedItems: undefined,
      dueDate: undefined,
    });

    detailReturns({ is_deposit: true, deposit_type: "fixed" });
    expect((await fetchInvoiceDetail("8801")).deposit).toMatchObject({
      mode: "amount",
      value: "0",
    });
  });

  it("has no deposit unless one was requested", async () => {
    detailReturns({ is_deposit: 0, deposit_type: "percentage", deposit_value: 25 });
    expect((await fetchInvoiceDetail("8801")).deposit).toBeNull();
  });
});

describe("fetchInvoiceDetail — documents and list-level fields", () => {
  it("names each attachment from file_name, then the path's last segment, then a fallback", async () => {
    detailReturns({
      documents: [
        { id: 1, file_name: "quote.pdf", file_path: "uploads/x/other.pdf" },
        { id: 2, file_path: "uploads/invoice/8801/site-photo.jpg" },
        { id: 3 },
      ],
    });

    expect((await fetchInvoiceDetail("8801")).attachments).toEqual([
      { id: "1", name: "quote.pdf", size: 0 },
      { id: "2", name: "site-photo.jpg", size: 0 },
      { id: "3", name: "Attachment", size: 0 },
    ]);
  });

  it("carries the sent date, match, possible-match count and template", async () => {
    detailReturns({
      sent_at: "2026-03-02 19:54:18",
      bank_transaction_id: 991,
      possible_match: 2,
      template_id: 4,
    });

    expect(await fetchInvoiceDetail("8801")).toMatchObject({
      sentAt: "2026-03-02",
      matchedTransactionId: "991",
      possibleMatch: 2,
      templateId: "4",
    });
  });

  it("leaves them empty when the record has none", async () => {
    detailReturns({});
    expect(await fetchInvoiceDetail("8801")).toMatchObject({
      sentAt: null,
      matchedTransactionId: null,
      possibleMatch: 0,
      templateId: undefined,
      attachments: [],
    });
  });
});

/* ------------------------------------------------------------------ *
 * Dashboard figures
 * ------------------------------------------------------------------ */

describe("percentShares", () => {
  it("is all zeros for no invoices", () => {
    expect(percentShares([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("always sums to 100, handing leftovers to the largest fractions", () => {
    // 1/3 each: 33.33… floors to 33, so one entry gets the leftover point.
    const shares = percentShares([1, 1, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    expect([...shares].sort()).toEqual([33, 33, 34]);

    // 6 equal sixths wouldn't overshoot to 101 the way independent rounding does.
    expect(percentShares([1, 1, 1, 1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("never gives a leftover point to a zero-count entry", () => {
    const shares = percentShares([0, 1, 2, 0]);
    expect(shares[0]).toBe(0);
    expect(shares[3]).toBe(0);
    expect(shares).toEqual([0, 33, 67, 0]);
  });
});

describe("currentFinancialYear", () => {
  it("starts a new year on 1 July, labelled by its start year", () => {
    expect(currentFinancialYear(new Date(2026, 6, 1))).toEqual({
      startIso: "2026-07-01",
      endIso: "2027-06-30",
      label: "Financial year 2026",
    });
  });

  it("counts 30 June as the end of the previous year", () => {
    expect(currentFinancialYear(new Date(2026, 5, 30))).toEqual({
      startIso: "2025-07-01",
      endIso: "2026-06-30",
      label: "Financial year 2025",
    });
  });
});

describe("financialYearRevenue", () => {
  const year = currentFinancialYear(new Date(2026, 8, 1));

  it("counts everything issued inside the year except drafts, both ends inclusive", () => {
    const revenue = financialYearRevenue(
      [
        invoice({ issued: "2026-07-01", amount: 100, status: "Paid" }),
        invoice({ issued: "2027-06-30", amount: 200, status: "Outstanding" }),
        invoice({ issued: "2026-10-01", amount: 400, status: "Draft" }),
        invoice({ issued: "2026-06-30", amount: 800, status: "Paid" }),
        invoice({ issued: "2027-07-01", amount: 1600, status: "Overdue" }),
      ],
      year,
    );
    expect(revenue).toEqual({ amount: 300, count: 2 });
  });

  it("counts an issued invoice whether or not it's been paid", () => {
    expect(
      financialYearRevenue(
        [invoice({ issued: "2026-08-01", amount: 500, status: "Overdue", paidAmount: 0 })],
        year,
      ),
    ).toEqual({ amount: 500, count: 1 });
  });
});

describe("invoiceOverview", () => {
  const book = [
    invoice({ status: "Draft", amount: 50 }),
    invoice({ status: "Outstanding", amount: 100 }),
    invoice({ status: "Overdue", amount: 200, paidAmount: 0 }),
    invoice({ status: "Partially paid", amount: 10_000, paidAmount: 9_000 }),
    invoice({ status: "Paid", amount: 300, paidAmount: 300 }),
  ];

  it("folds Overdue into outstanding and takes mid-flight buckets at the balance owed", () => {
    const overview = invoiceOverview(book);

    expect(overview.draft).toEqual({ amount: 50, count: 1 });
    expect(overview.outstanding).toEqual({ amount: 300, count: 2 });
    // $10,000 with $9,000 received contributes the $1,000 still owed.
    expect(overview.partiallyPaid).toEqual({ amount: 1_000, count: 1 });
    expect(overview.paid).toEqual({ amount: 300, count: 1 });
    expect(overview.total).toEqual({ amount: 10_650, count: 5 });
  });

  it("deliberately doesn't sum the buckets to the total", () => {
    const o = invoiceOverview(book);
    const sum = o.draft.amount + o.outstanding.amount + o.partiallyPaid.amount + o.paid.amount;
    expect(sum).not.toBe(o.total.amount);
  });

  it("gives one count per status, in status order", () => {
    expect(invoiceOverview(book).distribution).toEqual([
      { status: "Draft", count: 1 },
      { status: "Outstanding", count: 1 },
      { status: "Overdue", count: 1 },
      { status: "Partially paid", count: 1 },
      { status: "Paid", count: 1 },
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * Drafts and catalogue lines
 * ------------------------------------------------------------------ */

describe("draftFromInvoice", () => {
  it("deep-copies items, deposit, attachments and recipients", () => {
    const source = invoice({
      deposit: { mode: "items", value: "0", selectedItems: [0] },
      attachments: [{ id: "a1", name: "x.pdf", size: 10 }],
      recipients: [{ id: "c1", name: "Jo", email: "jo@acme.test" }],
    });

    const draft = draftFromInvoice(source);

    expect(draft.items[0]).toEqual(source.items[0]);
    expect(draft.items[0]).not.toBe(source.items[0]);
    expect(draft.deposit).toEqual(source.deposit);
    expect(draft.deposit).not.toBe(source.deposit);
    expect(draft.attachments[0]).not.toBe(source.attachments[0]);
    expect(draft.recipients![0]).not.toBe(source.recipients![0]);
    expect(draft).not.toHaveProperty("status");
    expect(draft).not.toHaveProperty("paidAmount");
  });

  it("falls back to blank-draft defaults for fields a list-mapped invoice lacks", () => {
    const draft = draftFromInvoice(invoice());

    expect(draft).toMatchObject({
      recipients: [],
      invoiceEmail: "",
      convertCurrency: false,
      exchangeRate: null,
      rateEdited: false,
      followUpDays: "",
      followUpNote: "",
      followUpNotifyClient: false,
      repeatStart: "2026-03-02",
      repeatOccurrences: "",
      repeatTagLine: "",
      showBankDetails: true,
      stripeEnabled: false,
    });
  });

  it("keeps the fields a detail-mapped invoice does carry", () => {
    const draft = draftFromInvoice(
      invoice({
        currency: "NZD",
        convertCurrency: true,
        exchangeRate: 1.08,
        exchangeTotal: 118.8,
        repeatStart: "2026-04-01",
        showBankDetails: false,
        templateId: "4",
      }),
    );
    expect(draft).toMatchObject({
      currency: "NZD",
      convertCurrency: true,
      exchangeRate: 1.08,
      exchangeTotal: 118.8,
      repeatStart: "2026-04-01",
      showBankDetails: false,
      templateId: "4",
    });
  });
});

describe("lineItemFromCatalogue", () => {
  it("prefills description, price and a quantity of 1", () => {
    expect(
      lineItemFromCatalogue({
        name: "Tap install",
        saleDescription: "  Install mixer tap  ",
        salePrice: "180",
        saleTax: "GST (10%)",
      }),
    ).toMatchObject({ description: "Install mixer tap", quantity: "1", price: "180", gst: true });
  });

  it("falls back to the name, and charges GST for any taxed label but not a free or empty one", () => {
    const item = lineItemFromCatalogue({
      name: "Tap install",
      saleDescription: " ",
      salePrice: "180",
      saleTax: "GST Free",
    });
    expect(item).toMatchObject({ description: "Tap install", gst: false });
    // The rate comes from the business, so an NZ label or a legacy code taxes the line too.
    const gstFor = (saleTax: string) =>
      lineItemFromCatalogue({ name: "x", saleDescription: "", salePrice: "1", saleTax }).gst;
    expect(gstFor("GST (15%)")).toBe(true);
    expect(gstFor("GST_10")).toBe(true);
    expect(gstFor("— None —")).toBe(false);
    expect(gstFor("")).toBe(false);
  });
});

describe("invoiceDepositAmount", () => {
  it("is null with no deposit", () => {
    expect(invoiceDepositAmount(invoice())).toBeNull();
  });

  it("works a percentage off the AUD total, and clamps an amount to it", () => {
    expect(
      invoiceDepositAmount(invoice({ amount: 400, deposit: { mode: "percent", value: "25" } })),
    ).toBe(100);
    expect(
      invoiceDepositAmount(invoice({ amount: 400, deposit: { mode: "amount", value: "900" } })),
    ).toBe(400);
  });
});

/* ------------------------------------------------------------------ *
 * Reading stored values back
 * ------------------------------------------------------------------ */

describe("toDiscountType / toQtyType / repeatFrequencyFromId", () => {
  it("accepts the known values", () => {
    expect(toDiscountType("amount")).toBe("amount");
    expect(toQtyType("km")).toBe("km");
    expect(repeatFrequencyFromId("halfyearly")).toBe("Half yearly");
    expect(repeatFrequencyFromId("day")).toBe("Once off");
  });

  it("falls back to percent / items / Monthly for anything else", () => {
    expect(toDiscountType("currency")).toBe("percent");
    expect(toDiscountType(undefined)).toBe("percent");
    expect(toQtyType("Hours")).toBe("items");
    expect(toQtyType(undefined)).toBe("items");
    expect(repeatFrequencyFromId("Weekly")).toBe("Monthly");
    expect(repeatFrequencyFromId(undefined)).toBe("Monthly");
  });
});

describe("toNdisClaimType", () => {
  it("matches on letters and digits only, so dash and case differences don't matter", () => {
    expect(toNdisClaimType("Travel - Time")).toBe("Travel – Time");
    expect(toNdisClaimType("travel—non-labour costs")).toBe("Travel – Non-Labour Costs");
    expect(toNdisClaimType("NON FACE TO FACE NF2F")).toBe("Non-Face-to-Face (NF2F)");
  });

  it("falls back to Standard Service for blank or unknown values", () => {
    expect(toNdisClaimType(undefined)).toBe("Standard Service");
    expect(toNdisClaimType("  -  ")).toBe("Standard Service");
    expect(toNdisClaimType("Overtime")).toBe("Standard Service");
  });
});

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

describe("currencySymbol / isForeignCurrency", () => {
  it("uses the fixed prefixes for the common currencies, AUD by default", () => {
    expect(currencySymbol()).toBe("$");
    expect(currencySymbol("USD")).toBe("US$");
    expect(currencySymbol("NZD")).toBe("NZ$");
    expect(currencySymbol("GBP")).toBe("£");
    expect(currencySymbol("EUR")).toBe("€");
  });

  it("asks Intl for anything else, and returns an unknown code as itself", () => {
    expect(currencySymbol("SGD")).toBe("SGD");
    expect(currencySymbol("not-a-code")).toBe("not-a-code");
  });

  it("calls anything set and not AUD foreign", () => {
    expect(isForeignCurrency("NZD")).toBe(true);
    expect(isForeignCurrency("AUD")).toBe(false);
    expect(isForeignCurrency(undefined)).toBe(false);
    expect(isForeignCurrency("")).toBe(false);
  });
});

describe("invoiceMoney", () => {
  it("always shows cents, with thousands separators", () => {
    expect(invoiceMoney(1234.5)).toBe("$1,234.50");
    expect(invoiceMoney(0)).toBe("$0.00");
  });
});

describe("formatInvoiceDate / formatDateLabel", () => {
  it("formats an ISO date as DD/MM/YYYY, or an em dash", () => {
    expect(formatInvoiceDate("2026-03-01")).toBe("01/03/2026");
    expect(formatInvoiceDate("")).toBe("—");
    expect(formatInvoiceDate("2026-03")).toBe("—");
  });

  it("formats an ISO date as DD Mon YYYY, or 'Select date'", () => {
    expect(formatDateLabel("2026-03-01")).toBe("01 Mar 2026");
    expect(formatDateLabel("2026-12-25")).toBe("25 Dec 2026");
    expect(formatDateLabel("")).toBe("Select date");
    expect(formatDateLabel("not-a-date")).toBe("Select date");
  });
});

describe("statusVariant / dueDateClass", () => {
  it("colours paid green, overdue red, draft neutral and the rest amber", () => {
    expect(statusVariant("Paid")).toBe("success");
    expect(statusVariant("Overdue")).toBe("danger");
    expect(statusVariant("Draft")).toBe("secondary");
    expect(statusVariant("Outstanding")).toBe("warning");
    expect(statusVariant("Partially paid")).toBe("warning");
  });

  it("keeps the due date's colour only while money is owed", () => {
    expect(dueDateClass("Overdue")).toBe("text-destructive");
    expect(dueDateClass("Outstanding")).toBe("text-warning");
    expect(dueDateClass("Partially paid")).toBe("text-warning");
    expect(dueDateClass("Paid")).toBe("text-muted-foreground");
    expect(dueDateClass("Draft")).toBe("text-muted-foreground");
  });
});

describe("isLineItemFilled", () => {
  it("needs a description, a positive quantity and a positive price", () => {
    expect(isLineItemFilled(line({ description: "Work" }))).toBe(true);
    expect(isLineItemFilled(line({ description: "  " }))).toBe(false);
    expect(isLineItemFilled(line({ description: "Work", quantity: "0" }))).toBe(false);
    expect(isLineItemFilled(line({ description: "Work", price: "" }))).toBe(false);
    expect(isLineItemFilled(line({ description: "Work", price: "-5" }))).toBe(false);
  });
});
