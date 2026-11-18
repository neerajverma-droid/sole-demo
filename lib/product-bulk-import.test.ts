import { describe, expect, it } from "vitest";

import { aiTargetFromBulkSpec } from "@/lib/ai-format";
import { bulkRowIssues, type BulkValues } from "@/lib/bulk-import";
import {
  productDraftFromBulkRow,
  productImportSpec,
} from "@/lib/product-bulk-import";
import { DEFAULT_PRODUCT_TAX_LABELS } from "@/lib/product-tax";

const spec = productImportSpec();

const values = (overrides: Partial<BulkValues> = {}): BulkValues => ({
  "Item name": "Consulting hour",
  Type: "Service",
  "Quantity type": "Hours",
  Description: "",
  "Cost price": "",
  "Selling price": "180",
  GST: "Yes",
  "Track inventory": "No",
  "Inventory count": "",
  ...overrides,
});

describe("productImportSpec", () => {
  it("tells the AI formatter it is a products file", () => {
    const target = aiTargetFromBulkSpec(spec);
    expect(target.type).toBe("products");
    expect(target.fields.map((field) => field.label)).toContain("Item name");
  });

  it("passes the allowed values of a fixed-set column to the AI formatter", () => {
    const type = aiTargetFromBulkSpec(spec).fields.find(
      (field) => field.label === "Type",
    );
    expect(type?.options).toEqual(["Product", "Service"]);
  });

  it("accepts a complete row", () => {
    expect(bulkRowIssues(spec, values())).toEqual([]);
  });

  it("flags the required fields and bad values", () => {
    const issues = bulkRowIssues(
      spec,
      values({
        "Item name": " ",
        Type: "Gadget",
        "Quantity type": "Boxes",
        "Selling price": "abc",
        "Inventory count": "1.5",
      }),
    );
    expect(issues).toEqual([
      "Item name is required",
      "Type must be Product or Service",
      "Quantity type must be Items, Hours, Days or Km",
      "Selling price isn't a valid number",
      "Inventory count must be a whole number",
    ]);
  });

  it("reads a price written with a currency symbol and thousands separator", () => {
    expect(bulkRowIssues(spec, values({ "Selling price": "$1,200.50" }))).toEqual(
      [],
    );
  });
});

describe("productDraftFromBulkRow", () => {
  it("builds an untracked service draft with cleaned prices", () => {
    const draft = productDraftFromBulkRow(
      { index: 0, values: values({ "Selling price": "$1,200.50" }), issues: [] },
      "Other" as never,
      DEFAULT_PRODUCT_TAX_LABELS,
    );
    expect(draft.name).toBe("Consulting hour");
    expect(draft.type).toBe("Service");
    expect(draft.quantityType).toBe("Hours");
    expect(draft.salePrice).toBe("1200.5");
    expect(draft.tracked).toBe(false);
  });

  it("tracks stock only when asked, with its count", () => {
    const draft = productDraftFromBulkRow(
      {
        index: 0,
        values: values({
          Type: "Product",
          "Quantity type": "Items",
          "Track inventory": "yes",
          "Inventory count": "128",
        }),
        issues: [],
      },
      "Other" as never,
      DEFAULT_PRODUCT_TAX_LABELS,
    );
    expect(draft.tracked).toBe(true);
    expect(draft.openingStock).toBe("128");
  });
});
