/**
 * The three new importers' specs, and the contacts spec they now share an
 * engine with. What's tested here is per-module: the validation rules and
 * the payload each builds. The mapping, grouping and CSV machinery is the
 * engine's, covered in `bulk-import.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  autoMapBulkColumns,
  buildBulkRows,
  bulkCellText,
  bulkEditorSeed,
  bulkFieldErrors,
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
      const sheetRow: Record<string, string> = {};
      spec.templateColumns.forEach((column, index) => {
        sheetRow[column] = cells[index] ?? "";
      });
      // Through the same door a real file takes, so a category written as a
      // name in the sample resolves to the id the row holds.
      const mapping = Object.fromEntries(
        spec.templateColumns.map((column, index) => [index, column]),
      );
      const [row] = buildBulkRows(spec, [...spec.templateColumns], [sheetRow], mapping);
      expect(row.issues).toEqual([]);
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
    "Client email": "accounts@williams.example",
    "Mark as": "Draft",
    "Sub total": "1200.00",
    "Total GST": "120.00",
  };

  it("accepts a row with every required field and nothing else", () => {
    expect(bulkRowIssues(spec, values(spec, valid))).toEqual([]);
  });

  it("requires a status and a client email", () => {
    expect(
      bulkRowIssues(spec, values(spec, { ...valid, "Mark as": "" })),
    ).toEqual(["Mark as is required (Draft, Paid, Overdue)"]);
    expect(
      bulkRowIssues(spec, values(spec, { ...valid, "Client email": "" })),
    ).toEqual(["Client email is required"]);
  });

  it("lists status and email among the required fields", () => {
    const required = spec.fields.filter((f) => f.required).map((f) => f.label);
    expect(required).toEqual([
      "Client name",
      "Sub total",
      "Total GST",
      "Mark as",
      "Client email",
    ]);
  });

  it("shows a blank invoice number as auto, as the old importer did", () => {
    const field = spec.fields.find((f) => f.label === "Invoice number");
    expect(field?.review?.empty).toBe("auto");
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

  it("never requires a date — the server fills a missing one in", () => {
    expect(
      bulkRowIssues(spec, values(spec, { ...valid, "Invoice date": "", "Due date": "" })),
    ).toEqual([]);
    // Not even for Overdue: a blank due date is derived, not refused.
    expect(
      bulkRowIssues(spec, values(spec, { ...valid, "Mark as": "Overdue", "Due date": "" })),
    ).toEqual([]);
  });

  it("rejects a due date before the invoice date, only when both are given", () => {
    const issues = (invoice: string, due: string) =>
      bulkRowIssues(
        spec,
        values(spec, { ...valid, "Invoice date": invoice, "Due date": due }),
      );
    expect(issues("20/07/2025", "19/07/2025")).toEqual([
      "Due date can't be before the invoice date",
    ]);
    expect(issues("20/07/2025", "20/07/2025")).toEqual([]);
    expect(issues("20/07/2025", "19/08/2025")).toEqual([]);
    expect(issues("", "19/07/2025")).toEqual([]);
    expect(issues("20/07/2025", "")).toEqual([]);
  });

  it("gives the due-date cell its own short message", () => {
    expect(
      bulkFieldErrors(
        spec,
        values(spec, { ...valid, "Invoice date": "20/07/2025", "Due date": "01/07/2025" }),
      ),
    ).toEqual({ "Due date": "Before the invoice date" });
  });

  it("rejects an Overdue invoice whose due date has not passed", () => {

    expect(
      bulkRowIssues(
        spec,
        values(spec, { ...valid, "Mark as": "Overdue", "Due date": "01/12/2025" }),
      ),
    ).toEqual(["Due date must be in the past when the status is Overdue"]);

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

  it("converts dates to ISO and leaves a missing due date and term for the server", () => {
    const payload = invoicePayload(
      values(spec, { ...valid, "Invoice date": "20/07/2025" }),
    );
    expect(payload.invoice_date).toBe("2025-07-20");
    expect(payload.due_date).toBe("");
    // Nothing sent, so the server's own default (invoice date + 7 days) applies.
    expect(payload.payment_term).toBeNull();
  });

  it("sends a payment term only when the file states one", () => {
    expect(
      invoicePayload(values(spec, { ...valid, "Payment terms": "30" })).payment_term,
    ).toBe(30);
    expect(
      invoicePayload(values(spec, { ...valid, "Payment terms": "0" })).payment_term,
    ).toBeNull();
  });

  it("falls back to overdue, lower-cased, for a caller that skips the status", () => {
    expect(invoicePayload(values(spec, { ...valid, "Mark as": "" })).mark_as).toBe("overdue");
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
    // The row holds the category's id; the name is what Review shows.
    Category: "72",
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

  it("asks for a category when the AI left it empty", () => {
    expect(bulkRowIssues(spec, values(spec, { ...valid, Category: "" }))).toEqual([
      "Category is required",
    ]);
    expect(bulkFieldErrors(spec, values(spec, { ...valid, Category: "" }))).toEqual({
      Category: "Choose a category",
    });
  });

  it("flags a category id that isn't on the chart of accounts", () => {
    expect(
      bulkRowIssues(spec, values(spec, { ...valid, Category: "999" })),
    ).toEqual(["Category isn't one of your expense accounts"]);
  });

  it("does not ask for a category before the accounts have loaded", () => {
    // Otherwise every row would read as broken for the tick before the fetch
    // lands — or for good if it never does, with nothing to choose from. The
    // dialog blocks the upload until the list is in.
    const loading = expenseImportSpec([]);
    expect(
      bulkRowIssues(loading, values(loading, { ...valid, Category: "" })),
    ).toEqual([]);
  });

  describe("the Category column", () => {
    const sheet = (category: string) => [
      { ...valid, Category: category },
    ];
    const columns = Object.keys(valid);
    const mapping = Object.fromEntries(columns.map((c, i) => [i, c]));
    const build = (category: string) =>
      buildBulkRows(spec, columns, sheet(category), mapping)[0];

    it("keeps the id the AI formatter returned", () => {
      expect(build("73").values.Category).toBe("73");
      expect(build("73").issues).toEqual([]);
    });

    it("leaves it empty when the AI gave none, rather than guessing", () => {
      const row = build("");
      expect(row.values.Category).toBe("");
      expect(row.issues).toEqual(["Category is required"]);
    });

    it("reads a name from a plain-parse fallback into its id", () => {
      expect(build("Software").values.Category).toBe("73");
      expect(build("office").values.Category).toBe("72");
      expect(build("Marketing").values.Category).toBe("");
    });

    it("shows the name on screen and in the error CSV, not the id", () => {
      expect(bulkCellText(spec, build("73").values, "Category")).toBe("Software");
      expect(bulkCellText(spec, build("").values, "Category")).toBe("");
    });
  });

  it("hands a Yes/No editor the value a sheet's own spelling stands for", () => {
    const paid = spec.fields.find((field) => field.label === "Paid")!;
    expect(bulkEditorSeed(paid, "TRUE")).toBe("Yes");
    expect(bulkEditorSeed(paid, "unpaid")).toBe("No");
    expect(bulkEditorSeed(paid, "maybe")).toBe("");
  });

  it("gives each wrong cell a short message of its own", () => {
    expect(
      bulkFieldErrors(
        spec,
        values(spec, {
          ...valid,
          Date: "",
          "Total amount": "lots",
          "Supplier email": "x@",
        }),
      ),
    ).toEqual({
      Date: "Required",
      "Total amount": "Enter a number, e.g. 482.90",
      "Supplier email": "Not a valid email",
    });
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
    Category: "80",
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
