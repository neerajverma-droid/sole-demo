/**
 * The three new importers' specs, and the contacts spec they now share an
 * engine with. What's tested here is per-module: the validation rules and
 * the payload each builds. The mapping, grouping and CSV machinery is the
 * engine's, covered in `bulk-import.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  autoMapBulkColumns,
  bulkRowIssues,
  bulkTemplateCsv,
  type BulkValues,
} from "@/lib/bulk-import";
import { CONTACT_IMPORT_SPEC, contactPayload } from "@/lib/contact-import";
import { INVOICE_IMPORT_SPEC, invoicePayload } from "@/lib/invoice-import";
import { expenseImportSpec, expensePayload, splitGst } from "@/lib/expense-import";
import { assetImportSpec, assetPayload } from "@/lib/asset-bulk-import";

/** Fills in every field of a spec so a test only states what it's varying. */
function values(
  spec: { fields: readonly { label: string }[] },
  overrides: BulkValues,
): BulkValues {
  const row: BulkValues = {};
  for (const field of spec.fields) row[field.label] = "";
  return { ...row, ...overrides };
}

beforeEach(() => {
  // Several rules compare against today.
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2025, 8, 21, 10, 0, 0));
});
afterEach(() => vi.useRealTimers());

/**
 * Every spec's template must be self-consistent: its headers auto-map onto
 * themselves and its sample rows pass its own validation. A template that
 * fails this teaches people to build files the importer then rejects.
 */
describe.each([
  ["contacts", CONTACT_IMPORT_SPEC],
  ["invoices", INVOICE_IMPORT_SPEC],
  ["expenses", expenseImportSpec([{ id: "72", name: "Office supplies" }])],
  ["assets", assetImportSpec([{ id: "80", name: "Office equipment" }])],
] as const)("%s template", (_name, spec) => {
  const [header, ...rows] = bulkTemplateCsv(spec).split("\r\n");

  it("has headers the auto-mapper maps back onto themselves", () => {
    const mapping = autoMapBulkColumns(spec, header.split(","));
    spec.templateColumns.forEach((column, index) => {
      expect(mapping[index]).toBe(column);
    });
  });

  it("only offers sample rows the importer would itself accept", () => {
    for (const line of rows) {
      // The samples deliberately contain no commas inside cells.
      const cells = line.split(",");
      const row: BulkValues = {};
      for (const field of spec.fields) row[field.label] = "";
      spec.templateColumns.forEach((column, index) => {
        row[column] = cells[index] ?? "";
      });
      expect(bulkRowIssues(spec, row)).toEqual([]);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Invoices
 * ------------------------------------------------------------------ */

describe("invoice import", () => {
  const spec = INVOICE_IMPORT_SPEC;
  const valid = {
    "Client name": "Williams Health",
    "Sub total": "1200.00",
    "Total GST": "120.00",
  };

  it("accepts a row with only the three required fields", () => {
    expect(bulkRowIssues(spec, values(spec, valid))).toEqual([]);
  });

  it("does not require an invoice number — the backend generates one", () => {
    const issues = bulkRowIssues(spec, values(spec, valid));
    expect(issues.join(" ")).not.toContain("Invoice number");
  });

  it("requires a client name, a sub total and a GST figure", () => {
    expect(
      bulkRowIssues(spec, values(spec, { ...valid, "Client name": " " })),
    ).toContain("Client name is required");
    expect(
      bulkRowIssues(spec, values(spec, { ...valid, "Sub total": "" })),
    ).toContain("Sub total must be a positive number");
    expect(
      bulkRowIssues(spec, values(spec, { ...valid, "Total GST": "" })),
    ).toContain("Total GST must be a number");
  });

  it("accepts zero GST, for anyone not registered", () => {
    expect(
      bulkRowIssues(spec, values(spec, { ...valid, "Total GST": "0" })),
    ).toEqual([]);
  });

  it("rejects an Overdue invoice whose due date has not passed", () => {
    expect(
      bulkRowIssues(
        spec,
        values(spec, { ...valid, "Mark as": "Overdue", "Due date": "01/12/2025" }),
      ),
    ).toContain("An invoice marked Overdue needs a Due date in the past");

    expect(
      bulkRowIssues(
        spec,
        values(spec, { ...valid, "Mark as": "Overdue", "Due date": "01/08/2025" }),
      ),
    ).toEqual([]);
  });

  it("calculates the total from its parts rather than trusting the file", () => {
    const payload = invoicePayload(values(spec, valid));
    expect(payload.sub_total).toBe(1200);
    expect(payload.total_gst).toBe(120);
    expect(payload.total).toBe(1320);
  });

  it("converts dates to ISO and defaults the payment term to 30 days", () => {
    const payload = invoicePayload(
      values(spec, { ...valid, "Invoice date": "20/07/2025" }),
    );
    expect(payload.invoice_date).toBe("2025-07-20");
    expect(payload.due_date).toBe("");
    expect(payload.payment_term).toBe(30);
  });

  it("defaults the status to draft, lower-cased", () => {
    expect(invoicePayload(values(spec, valid)).mark_as).toBe("draft");
    expect(
      invoicePayload(values(spec, { ...valid, "Mark as": "Paid" })).mark_as,
    ).toBe("paid");
  });
});

/* ------------------------------------------------------------------ *
 * Expenses
 * ------------------------------------------------------------------ */

describe("expense import", () => {
  const categories = [
    { id: "72", name: "Office supplies" },
    { id: "73", name: "Software" },
  ];
  const spec = expenseImportSpec(categories);
  const valid = {
    "Expense name": "Office chairs",
    "Supplier name": "Officeworks",
    Date: "21/07/2025",
    "Total amount": "482.90",
    "GST included": "Yes",
    Category: "Office supplies",
    Paid: "Yes",
  };

  it("accepts a complete row", () => {
    expect(bulkRowIssues(spec, values(spec, valid))).toEqual([]);
  });

  it("insists on a Yes/No for GST and Paid rather than assuming", () => {
    expect(
      bulkRowIssues(spec, values(spec, { ...valid, "GST included": "" })),
    ).toContain("GST included must be Yes or No");
    expect(bulkRowIssues(spec, values(spec, { ...valid, Paid: "" }))).toContain(
      "Paid must be Yes or No",
    );
  });

  it("flags a category that isn't on the chart of accounts", () => {
    expect(
      bulkRowIssues(spec, values(spec, { ...valid, Category: "Marketing" })),
    ).toContain("Category doesn't match one of your expense accounts");
  });

  it("does not flag an unmatched category before the accounts have loaded", () => {
    // Otherwise every row would read as broken for the tick before the fetch
    // lands. The dialog blocks the import until it has.
    const loading = expenseImportSpec([]);
    expect(
      bulkRowIssues(loading, values(loading, { ...valid, Category: "Marketing" })),
    ).toEqual([]);
  });

  it("rejects a future date", () => {
    expect(
      bulkRowIssues(spec, values(spec, { ...valid, Date: "21/07/2026" })),
    ).toContain("Date is in the future");
  });

  it("splits a GST-inclusive total back out at 10%", () => {
    expect(splitGst(110, true)).toEqual({ subTotal: 100, totalGst: 10 });
    expect(splitGst(110, false)).toEqual({ subTotal: 110, totalGst: 0 });
    // Nothing to split out of nothing.
    expect(splitGst(0, true)).toEqual({ subTotal: 0, totalGst: 0 });
  });

  it("resolves the category to an id and carries the split", () => {
    const payload = expensePayload(values(spec, valid), categories);
    expect(payload.account_subcategory_id).toBe("72");
    expect(payload.price).toBe(482.9);
    expect(payload.sub_total).toBe(439);
    expect(payload.total_gst).toBe(43.9);
    // The split has to reconstitute the gross, or the expense list and the
    // BAS disagree about the same receipt.
    expect(payload.sub_total + payload.total_gst).toBeCloseTo(payload.price, 2);
    expect(payload.gst).toBe(1);
    expect(payload.paid_with_cash).toBe(true);
    expect(payload.date).toBe("2025-07-21");
  });

  it("sends the gross as the sub-total when GST wasn't included", () => {
    const payload = expensePayload(
      values(spec, { ...valid, "GST included": "No" }),
      categories,
    );
    expect(payload.sub_total).toBe(482.9);
    expect(payload.total_gst).toBe(0);
    expect(payload.gst).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * Assets
 * ------------------------------------------------------------------ */

describe("asset import", () => {
  const categories = [{ id: "80", name: "Office equipment" }];
  const spec = assetImportSpec(categories);
  const valid = {
    "Asset name": "Dell laptop",
    Category: "Office equipment",
    "Purchase date": "01/06/2025",
    "Purchase price": "2349.00",
    Paid: "Yes",
  };

  it("accepts a complete row", () => {
    expect(bulkRowIssues(spec, values(spec, valid))).toEqual([]);
  });

  it("rejects GST larger than the price", () => {
    expect(
      bulkRowIssues(spec, values(spec, { ...valid, "GST amount": "9999" })),
    ).toContain("GST amount is more than the purchase price");
    expect(
      bulkRowIssues(spec, values(spec, { ...valid, "GST amount": "234.90" })),
    ).toEqual([]);
  });

  it("rejects a future purchase date", () => {
    expect(
      bulkRowIssues(spec, values(spec, { ...valid, "Purchase date": "01/06/2026" })),
    ).toContain("Purchase date is in the future");
  });

  it("resolves the category and normalises the payload", () => {
    const payload = assetPayload(
      values(spec, { ...valid, "GST amount": "234.90", "Supplier name": "HN" }),
      categories,
    );
    expect(payload).toEqual({
      name: "Dell laptop",
      price: 2349,
      date_of_purchase: "2025-06-01",
      account_subcategory_id: "80",
      client_name: "HN",
      gst_amount: 234.9,
      paid_with_cash: true,
    });
  });

  it("sends a null supplier rather than an empty string", () => {
    expect(assetPayload(values(spec, valid), categories).client_name).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Contacts — the rules that moved onto the shared engine
 * ------------------------------------------------------------------ */

describe("contact import", () => {
  const spec = CONTACT_IMPORT_SPEC;
  const valid = {
    "Business name": "Acme",
    "Contact name": "Jo Lee",
    "Contact email": "jo@acme.test",
    "Mobile no": "411111111",
    Type: "Client",
    "Business type": "Business",
  };

  it("accepts a complete row", () => {
    expect(bulkRowIssues(spec, values(spec, valid))).toEqual([]);
  });

  it("requires an email of a Client but not of a Supplier", () => {
    expect(
      bulkRowIssues(spec, values(spec, { ...valid, "Contact email": "" })),
    ).toContain("Email is required for clients");
    expect(
      bulkRowIssues(
        spec,
        values(spec, {
          ...valid,
          Type: "Supplier",
          "Contact email": "",
        }),
      ),
    ).toEqual([]);
  });

  it("requires a business name only for a Business", () => {
    expect(
      bulkRowIssues(spec, values(spec, { ...valid, "Business name": "" })),
    ).toContain("Business name required for Business");
    expect(
      bulkRowIssues(
        spec,
        values(spec, {
          ...valid,
          "Business type": "Individual",
          "Business name": "",
        }),
      ),
    ).toEqual([]);
  });

  it("tolerates sole-webapp's 'bussiness' spelling", () => {
    expect(
      bulkRowIssues(spec, values(spec, { ...valid, "Business type": "bussiness" })),
    ).toEqual([]);
  });

  it("sends Type as the backend's numeric code, defaulting Currency", () => {
    expect(contactPayload(values(spec, valid))).toMatchObject({
      "Business Name": "Acme",
      "Contact Name": "Jo Lee",
      Type: 1,
      Currency: "AUD",
    });
    expect(
      contactPayload(values(spec, { ...valid, Type: "supplier" })).Type,
    ).toBe(2);
  });

  it("lets a mapped Currency column beat the AUD default", () => {
    expect(
      contactPayload(values(spec, { ...valid, Currency: "NZD" })).Currency,
    ).toBe("NZD");
  });

  it("omits an empty optional rather than sending a blank string", () => {
    expect(contactPayload(values(spec, valid))).not.toHaveProperty("Website");
  });
});
