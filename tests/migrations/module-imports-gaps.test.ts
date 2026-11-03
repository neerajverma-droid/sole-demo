/**
 * Per-module rules `module-imports.test.ts` leaves out: the invalid-date and
 * "Mark as" messages, the email/phone rules for every spec, contact Type
 * defaulting to 1, the payload fallbacks, and the batch `…Payloads` mappers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  bulkNumber,
  bulkRowIssues,
  isEmail,
  type BulkRow,
  type BulkValues,
} from "@/lib/bulk-import";
import { CONTACT_IMPORT_SPEC, contactPayload, contactPayloads } from "@/lib/contact-import";
import { INVOICE_IMPORT_SPEC, invoicePayload, invoicePayloads } from "@/lib/invoice-import";
import { expenseImportSpec, expensePayload, expensePayloads } from "@/lib/expense-import";
import { assetImportSpec, assetPayload, assetPayloads } from "@/lib/asset-bulk-import";

/** Fills in every field of a spec so a test only states what it's varying. */
function values(
  spec: { fields: readonly { label: string }[] },
  overrides: BulkValues,
): BulkValues {
  const row: BulkValues = {};
  for (const field of spec.fields) row[field.label] = "";
  return { ...row, ...overrides };
}

function bulkRow(index: number, rowValues: BulkValues): BulkRow {
  return { index, values: rowValues, issues: [] };
}

const CATEGORIES = [{ id: "72", name: "Office supplies" }];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2025, 8, 21, 10, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe("invoice rules", () => {
  const base = { "Client name": "Williams Health", "Sub total": "100", "Total GST": "10" };
  const issues = (overrides: BulkValues) =>
    bulkRowIssues(INVOICE_IMPORT_SPEC, values(INVOICE_IMPORT_SPEC, { ...base, ...overrides }));

  it("flags an unreadable invoice or due date, but not a blank one", () => {
    expect(issues({ "Invoice date": "July 20", "Due date": "31/02/2025" })).toEqual([
      "Invoice date must be DD/MM/YYYY",
      "Due date must be DD/MM/YYYY",
    ]);
    expect(issues({ "Invoice date": "", "Due date": "" })).toEqual([]);
  });

  it("refuses an unknown Mark as status, case-insensitively accepting the three real ones", () => {
    expect(issues({ "Mark as": "Sent" })).toEqual([
      "Mark as must be one of: Draft, Paid, Overdue",
    ]);
    expect(issues({ "Mark as": "pAiD" })).toEqual([]);
  });

  it("refuses Overdue with a due date of today itself", () => {
    expect(issues({ "Mark as": "Overdue", "Due date": "21/09/2025" })).toEqual([
      "An invoice marked Overdue needs a Due date in the past",
    ]);
    expect(issues({ "Mark as": "Overdue", "Due date": "20/09/2025" })).toEqual([]);
  });

  it("checks client email and phone only when present", () => {
    expect(issues({ "Client email": "not-an-email", "Client phone": "123" })).toEqual([
      "Invalid client email",
      "Invalid client phone",
    ]);
    expect(issues({ "Client email": "a@b.co", "Client phone": "(03) 9000-1000" })).toEqual([]);
  });

  it("rejects a negative or non-numeric sub total", () => {
    expect(issues({ "Sub total": "-5" })).toEqual(["Sub total must be a positive number"]);
    expect(issues({ "Sub total": "abc" })).toEqual(["Sub total must be a positive number"]);
  });

  it("hard-codes the documented defaults and reads payment terms only when positive", () => {
    const payload = invoicePayload(
      values(INVOICE_IMPORT_SPEC, { ...base, "Payment terms": "14", "Extra discount": "$5.50" }),
    );
    expect(payload).toMatchObject({
      currency: "AUD",
      total_discount: 0,
      show_bank_details: 1,
      is_payrixpay: 0,
      is_InstantPay: 0,
      template_id: 1,
      payment_term: 14,
      extra_discount: 5.5,
      total: 110,
    });
    expect(
      invoicePayload(values(INVOICE_IMPORT_SPEC, { ...base, "Payment terms": "0" })).payment_term,
    ).toBe(30);
    expect(
      invoicePayload(values(INVOICE_IMPORT_SPEC, { ...base, "Payment terms": "net" })).payment_term,
    ).toBe(30);
  });

  it("maps every row of a batch through invoicePayload", () => {
    const payloads = invoicePayloads([
      bulkRow(0, values(INVOICE_IMPORT_SPEC, base)),
      bulkRow(1, values(INVOICE_IMPORT_SPEC, { ...base, "Client name": "  Turner " })),
    ]);
    expect(payloads.map((p) => p.client_name)).toEqual(["Williams Health", "Turner"]);
  });
});

describe("expense rules", () => {
  const spec = expenseImportSpec(CATEGORIES);
  const base = {
    "Expense name": "Office chairs",
    "Supplier name": "Officeworks",
    Date: "20/09/2025",
    "Total amount": "110",
    "GST included": "Yes",
    Category: "Office supplies",
    Paid: "Yes",
  };
  const issues = (overrides: BulkValues) =>
    bulkRowIssues(spec, values(spec, { ...base, ...overrides }));

  it("requires a readable date — unlike invoices, blank fails", () => {
    expect(issues({ Date: "" })).toEqual(["Date must be DD/MM/YYYY"]);
    expect(issues({ Date: "31/02/2025" })).toEqual(["Date must be DD/MM/YYYY"]);
  });

  it("allows today itself but not tomorrow", () => {
    expect(issues({ Date: "21/09/2025" })).toEqual([]);
    expect(issues({ Date: "22/09/2025" })).toEqual(["Date is in the future"]);
  });

  it("checks supplier email and phone only when present", () => {
    expect(issues({ "Supplier email": "x@", "Supplier phone": "12" })).toEqual([
      "Invalid supplier email",
      "Invalid supplier phone",
    ]);
  });

  it("falls back to Untitled Expense and today's date when the row has neither", () => {
    const payload = expensePayload(
      values(spec, { ...base, "Expense name": " ", Date: "soon" }),
      CATEGORIES,
    );
    expect(payload.name).toBe("Untitled Expense");
    expect(payload.description).toBe("");
    expect(payload.date).toBe("2025-09-21");
  });

  it("sends blank supplier fields as null and an unmatched category as null", () => {
    const payload = expensePayload(
      values(spec, { ...base, "Supplier name": "", Category: "Travel" }),
      CATEGORIES,
    );
    expect(payload).toMatchObject({
      client_name: null,
      client_email: null,
      client_phone: null,
      account_subcategory_id: null,
    });
  });

  it("treats an unparseable total as 0 and an unpaid row as not paid", () => {
    const payload = expensePayload(
      values(spec, { ...base, "Total amount": "", Paid: "No", "GST included": "No" }),
      CATEGORIES,
    );
    expect(payload).toMatchObject({ price: 0, sub_total: 0, total_gst: 0, gst: 0, paid_with_cash: false });
  });

  it("maps every row of a batch through expensePayload", () => {
    const payloads = expensePayloads(
      [bulkRow(0, values(spec, base)), bulkRow(1, values(spec, { ...base, Category: "72" }))],
      CATEGORIES,
    );
    expect(payloads.map((p) => p.account_subcategory_id)).toEqual(["72", "72"]);
  });
});

describe("asset rules", () => {
  const spec = assetImportSpec([{ id: "80", name: "Office equipment" }]);
  const base = {
    "Asset name": "Laptop",
    Category: "Office equipment",
    "Purchase date": "01/06/2025",
    "Purchase price": "2349.00",
    Paid: "Yes",
  };
  const issues = (overrides: BulkValues) =>
    bulkRowIssues(spec, values(spec, { ...base, ...overrides }));

  it("flags an unreadable purchase date", () => {
    expect(issues({ "Purchase date": "June" })).toEqual(["Purchase date must be DD/MM/YYYY"]);
  });

  it("flags an unreadable GST amount, but not a blank one", () => {
    expect(issues({ "GST amount": "ten" })).toEqual(["GST amount must be a number"]);
    expect(issues({ "GST amount": "" })).toEqual([]);
  });

  it("checks the supplier phone only when present", () => {
    expect(issues({ "Supplier phone": "abc" })).toEqual(["Invalid supplier phone"]);
    expect(issues({ "Supplier phone": "+61 411 111 111" })).toEqual([]);
  });

  it("suppresses the unknown-category rule while the category list is empty", () => {
    const loading = assetImportSpec([]);
    expect(
      bulkRowIssues(loading, values(loading, { ...base, Category: "Anything" })),
    ).toEqual([]);
    expect(issues({ Category: "Vehicles" })).toEqual([
      "Category doesn't match one of your asset accounts",
    ]);
  });

  it("falls back to Unnamed Asset, today's date and a 0 price", () => {
    const payload = assetPayload(
      values(spec, { "Asset name": "", "Purchase date": "", "Purchase price": "" }),
      [],
    );
    expect(payload).toMatchObject({
      name: "Unnamed Asset",
      date_of_purchase: "2025-09-21",
      price: 0,
      gst_amount: 0,
      account_subcategory_id: null,
      paid_with_cash: false,
    });
  });

  it("maps every row of a batch through assetPayload, never sending phone or description", () => {
    const payloads = assetPayloads(
      [bulkRow(0, values(spec, { ...base, "Supplier phone": "0411111111", Description: "Spare" }))],
      [{ id: "80", name: "Office equipment" }],
    );
    expect(payloads).toHaveLength(1);
    expect(Object.keys(payloads[0]).sort()).toEqual(
      [
        "account_subcategory_id",
        "client_name",
        "date_of_purchase",
        "gst_amount",
        "name",
        "paid_with_cash",
        "price",
      ].sort(),
    );
  });
});

describe("contact rules", () => {
  const base = {
    "Contact name": "Jo Lee",
    "Contact email": "jo@acme.test",
    Type: "Client",
    "Business type": "Individual",
  };
  const issues = (overrides: BulkValues) =>
    bulkRowIssues(CONTACT_IMPORT_SPEC, values(CONTACT_IMPORT_SPEC, { ...base, ...overrides }));

  it("needs only one character of contact name — the backend's own rule", () => {
    expect(issues({ "Contact name": "J" })).toEqual([]);
    expect(issues({ "Contact name": "  " })).toEqual(["Contact name missing"]);
  });

  it("flags a malformed email on any contact type", () => {
    expect(issues({ Type: "Supplier", "Contact email": "jo@acme" })).toEqual(["Invalid email"]);
  });

  it("flags a phone outside 8–15 digits, only when present", () => {
    expect(issues({ "Mobile no": "1234567" })).toEqual(["Phone must be 8–15 digits"]);
    expect(issues({ "Mobile no": "1234567890123456" })).toEqual(["Phone must be 8–15 digits"]);
    expect(issues({ "Mobile no": "" })).toEqual([]);
  });

  it("refuses an unknown Type and Business type", () => {
    expect(issues({ Type: "Partner", "Business type": "Trust" })).toEqual([
      "Type must be Client or Supplier",
      "Business type must be Business or Individual",
    ]);
  });

  it("sends an unrecognised Type as 1 (client), and only Supplier as 2", () => {
    expect(contactPayload(values(CONTACT_IMPORT_SPEC, { ...base, Type: "Partner" })).Type).toBe(1);
    expect(contactPayload(values(CONTACT_IMPORT_SPEC, { ...base, Type: "SUPPLIER" })).Type).toBe(2);
  });

  it("maps every row of a batch through contactPayload", () => {
    const payloads = contactPayloads([
      bulkRow(0, values(CONTACT_IMPORT_SPEC, base)),
      bulkRow(1, values(CONTACT_IMPORT_SPEC, { ...base, Type: "Supplier" })),
    ]);
    expect(payloads.map((p) => [p["Contact Name"], p.Type, p.Currency])).toEqual([
      ["Jo Lee", 1, "AUD"],
      ["Jo Lee", 2, "AUD"],
    ]);
  });
});

describe("bulkNumber and isEmail", () => {
  it("strips $, commas and spaces; NaN for empty", () => {
    expect(bulkNumber(" $1,120.50 ")).toBe(1120.5);
    expect(bulkNumber("")).toBeNaN();
    expect(bulkNumber("abc")).toBeNaN();
  });

  it("needs something@something.tld with no spaces", () => {
    expect(isEmail(" jo@acme.test ")).toBe(true);
    expect(isEmail("jo@acme")).toBe(false);
    expect(isEmail("jo lee@acme.test")).toBe(false);
  });
});
