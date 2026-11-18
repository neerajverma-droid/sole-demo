/**
 * `lib/asset-bulk-import.ts` — the asset-specific rules and payload. The
 * template self-consistency, GST-exceeds-price, future-date and happy-path
 * payload are already pinned in `lib/module-imports.test.ts`; this covers
 * the remaining `issues[]` rules and the payload's fallbacks. The shared
 * helpers themselves are `lib/bulk-import.test.ts`'s.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildBulkRows,
  bulkCellText,
  bulkFieldErrors,
  bulkRowIssues,
  type BulkValues,
} from "@/lib/bulk-import";
import { assetImportSpec, assetPayload, assetPayloads } from "@/lib/asset-bulk-import";

const categories = [
  { id: "80", name: "Office equipment" },
  { id: "81", name: "Motor vehicles" },
];
const spec = assetImportSpec(categories);

function values(overrides: BulkValues): BulkValues {
  const row: BulkValues = {};
  for (const field of spec.fields) row[field.label] = "";
  return { ...row, ...overrides };
}

const valid = {
  "Asset name": "Dell laptop",
  // The row holds the category's id; the name is what Review shows.
  Category: "80",
  "Purchase date": "01/06/2025",
  "Purchase price": "2349.00",
  Paid: "Yes",
};

const issuesOf = (overrides: BulkValues) =>
  bulkRowIssues(spec, values({ ...valid, ...overrides }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2025, 8, 21, 10, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe("assetImportSpec", () => {
  it("requires name, category, purchase date, price and paid — the rest are optional", () => {
    const required = spec.fields.filter((f) => f.required).map((f) => f.label);
    expect(required).toEqual([
      "Asset name",
      "Category",
      "Purchase date",
      "Purchase price",
      "Paid",
    ]);
  });

  it("carries no brand or type column — the bulk endpoint never took them", () => {
    const labels = spec.fields.map((f) => f.label.toLowerCase());
    expect(labels).not.toContain("brand");
    expect(labels).not.toContain("type");
  });

  it("flags a blank asset name or category", () => {
    expect(issuesOf({ "Asset name": "  " })).toEqual(["Asset name is required"]);
    expect(issuesOf({ Category: "" })).toEqual(["Category is required"]);
  });

  it("flags a category id that isn't on the chart of accounts", () => {
    expect(issuesOf({ Category: "999" })).toEqual([
      "Category isn't one of your asset accounts",
    ]);
    expect(issuesOf({ Category: "81" })).toEqual([]);
  });

  it("asks for no category when none were fetched — there's nothing to choose", () => {
    const blind = assetImportSpec([]);
    expect(bulkRowIssues(blind, values({ ...valid, Category: "" }))).toEqual([]);
    expect(bulkRowIssues(blind, values({ ...valid, Category: "999" }))).toEqual([]);
  });

  describe("the Category column", () => {
    const columns = ["Asset name", "Category", "Purchase date", "Purchase price", "Paid"];
    const mapping = Object.fromEntries(columns.map((column, index) => [index, column]));
    const build = (category: string) =>
      buildBulkRows(spec, columns, [{ ...valid, Category: category }], mapping)[0];

    it("keeps the id the AI formatter returned and shows its name", () => {
      const row = build("81");
      expect(row.values.Category).toBe("81");
      expect(row.issues).toEqual([]);
      expect(bulkCellText(spec, row.values, "Category")).toBe("Motor vehicles");
    });

    it("stays empty when the AI gave none, and asks for a pick", () => {
      const row = build("");
      expect(row.values.Category).toBe("");
      expect(bulkFieldErrors(spec, row.values)).toEqual({ Category: "Choose a category" });
    });

    it("reads a name from a plain-parse fallback into its id", () => {
      expect(build("motor VEHICLES").values.Category).toBe("81");
      expect(build("Spaceships").values.Category).toBe("");
    });
  });

  it("requires a DD/MM/YYYY purchase date", () => {
    expect(issuesOf({ "Purchase date": "31/02/2025" })).toEqual([
      "Purchase date must be DD/MM/YYYY",
    ]);
    expect(issuesOf({ "Purchase date": "" })).toEqual(["Purchase date must be DD/MM/YYYY"]);
  });

  it("accepts today, rejects tomorrow", () => {
    expect(issuesOf({ "Purchase date": "21/09/2025" })).toEqual([]);
    expect(issuesOf({ "Purchase date": "22/09/2025" })).toEqual([
      "Purchase date is in the future",
    ]);
  });

  it("requires a non-negative price", () => {
    expect(issuesOf({ "Purchase price": "" })).toEqual([
      "Purchase price must be a positive number",
    ]);
    expect(issuesOf({ "Purchase price": "-10" })).toEqual([
      "Purchase price must be a positive number",
    ]);
    expect(issuesOf({ "Purchase price": "$2,349.00" })).toEqual([]);
  });

  it("requires a recognisable Yes/No for Paid", () => {
    expect(issuesOf({ Paid: "maybe" })).toEqual(["Paid must be Yes or No"]);
    expect(issuesOf({ Paid: "" })).toEqual(["Paid must be Yes or No"]);
    expect(issuesOf({ Paid: "n" })).toEqual([]);
  });

  it("flags an unreadable GST amount, but not a blank one", () => {
    expect(issuesOf({ "GST amount": "ten" })).toEqual(["GST amount must be a number"]);
    expect(issuesOf({ "GST amount": "" })).toEqual([]);
  });

  it("allows GST equal to the price, only more than it is an issue", () => {
    expect(issuesOf({ "GST amount": "2349.00" })).toEqual([]);
  });

  it("validates an optional supplier phone only when given", () => {
    expect(issuesOf({ "Supplier phone": "12ab" })).toEqual(["Invalid supplier phone"]);
    expect(issuesOf({ "Supplier phone": "(02) 9876 5432" })).toEqual([]);
    expect(issuesOf({ "Supplier phone": "" })).toEqual([]);
  });

  it("builds sample rows from the business's own categories", () => {
    expect(spec.sampleRows.map((row) => row[1])).toEqual([
      "Office equipment",
      "Motor vehicles",
      "Office equipment",
    ]);
  });
});

describe("assetPayload — fallbacks", () => {
  it("names a blank row 'Unnamed Asset' and defaults price/GST to 0, date to today", () => {
    const payload = assetPayload(
      values({ Paid: "No", "Purchase price": "abc", "GST amount": "" }),
      categories,
    );
    expect(payload).toEqual({
      name: "Unnamed Asset",
      price: 0,
      date_of_purchase: "2025-09-21",
      account_subcategory_id: null,
      client_name: null,
      gst_amount: 0,
      paid_with_cash: false,
    });
  });

  it("rounds money to cents and strips currency formatting", () => {
    const payload = assetPayload(
      values({ ...valid, "Purchase price": "$1,234.567", "GST amount": "112.234" }),
      categories,
    );
    expect(payload.price).toBe(1234.57);
    expect(payload.gst_amount).toBe(112.23);
  });

  it("only sends paid_with_cash true for a recognised yes", () => {
    expect(assetPayload(values({ ...valid, Paid: "paid" }), categories).paid_with_cash).toBe(true);
    expect(assetPayload(values({ ...valid, Paid: "garbage" }), categories).paid_with_cash).toBe(false);
  });

  it("resolves the category case-insensitively to its id", () => {
    expect(
      assetPayload(values({ ...valid, Category: "motor VEHICLES" }), categories)
        .account_subcategory_id,
    ).toBe("81");
  });

  it("maps every row in order", () => {
    const rows = [
      { index: 0, values: values({ ...valid, "Asset name": "One" }), issues: [] },
      { index: 1, values: values({ ...valid, "Asset name": "Two" }), issues: [] },
    ];
    expect(assetPayloads(rows, categories).map((p) => p.name)).toEqual(["One", "Two"]);
  });
});
