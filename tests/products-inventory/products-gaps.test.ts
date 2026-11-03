/**
 * The rest of lib/products.ts — `products.test.ts` covers `paginate` only.
 * Filters, stats, the Custom dialog's validator, the three "copy into my
 * catalogue" draft builders, and the bulk-import CSV functions.
 */
import { describe, expect, it } from "vitest";

import type { GeneralCatalogueEntry } from "@/lib/general-catalogue";
import type { InventoryItem } from "@/lib/inventory";
import type { NdisSupportItem } from "@/lib/ndis-support-items";
import type { ProductTaxLabels } from "@/lib/product-tax";
import {
  activeGeneralFilters,
  activeNdisFilters,
  activeProductFilters,
  customNarrowed,
  customStats,
  draftFromCatalogueEntry,
  draftFromImportRow,
  draftFromSupportItem,
  duplicateItemDraft,
  EMPTY_GENERAL_FILTERS,
  EMPTY_NDIS_FILTERS,
  EMPTY_PRODUCT_FILTERS,
  emptyCustomItemDraft,
  filterCustomProducts,
  filterGeneralCatalogue,
  generalStats,
  isYes,
  ndisFilterOptions,
  ndisStats,
  PAGE_SIZES,
  parseProductsCsv,
  PRODUCT_IMPORT_FIELDS,
  PRODUCT_IMPORT_TEMPLATE_HEADERS,
  productImportTemplateCsv,
  productIssues,
  productRowIssues,
  splitCsvLine,
} from "@/lib/products";

function generalEntry(
  overrides: Partial<GeneralCatalogueEntry> = {},
): GeneralCatalogueEntry {
  return {
    code: "FIN-FIN01",
    name: "Financial planning",
    industry: "Finance",
    type: "Service",
    transactionType: "Income",
    quantityType: "Hours",
    salePrice: "",
    taxRate: "GST (10%)",
    ...overrides,
  };
}

function ndisItem(overrides: Partial<NdisSupportItem> = {}): NdisSupportItem {
  return {
    id: "1",
    supportItemNumber: "01_011_0107_1_1",
    supportItemName: "Assistance With Self-Care Activities",
    registrationGroupNumber: "0107",
    registrationGroupName: "Daily Personal Activities",
    supportCategoryNumber: "01",
    pricingType: "Price Limited Supports",
    ...overrides,
  };
}

function customItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "c1",
    name: "Consulting hour",
    sku: "CONS-1",
    type: "Service",
    quantityType: "Hours",
    transactionType: "Income",
    industry: "Finance",
    costPrice: "",
    salePrice: "180",
    purchaseTax: "— None —",
    saleTax: "GST (10%)",
    assetCategory: "Inventory",
    incomeAccount: "Sales income",
    purchaseDescription: "",
    saleDescription: "Billed hourly",
    tracked: false,
    openingStock: "",
    lowStockAlert: "",
    ...overrides,
  };
}

describe("General tab filters", () => {
  const entries = [
    generalEntry({ code: "A", taxRate: "GST (10%)", type: "Service" }),
    generalEntry({
      code: "B",
      taxRate: "GST Free",
      type: "Product",
      transactionType: "Expense",
      quantityType: "Items",
    }),
    generalEntry({ code: "C", taxRate: "GST (10%)", type: "Product", quantityType: "Items" }),
  ];

  it("counts each active facet once for the Filter badge", () => {
    expect(activeGeneralFilters(EMPTY_GENERAL_FILTERS)).toBe(0);
    expect(
      activeGeneralFilters({
        gstEnabled: true,
        type: "Product",
        transactionType: "Income",
        quantityType: "Items",
      }),
    ).toBe(4);
  });

  it("keeps everything with no filter active", () => {
    expect(filterGeneralCatalogue(entries, EMPTY_GENERAL_FILTERS)).toHaveLength(3);
  });

  it("narrows by GST, type, transaction type and quantity type, combined", () => {
    const codes = (filters: typeof EMPTY_GENERAL_FILTERS) =>
      filterGeneralCatalogue(entries, filters).map((e) => e.code);

    expect(codes({ ...EMPTY_GENERAL_FILTERS, gstEnabled: true })).toEqual(["A", "C"]);
    expect(codes({ ...EMPTY_GENERAL_FILTERS, type: "Product" })).toEqual(["B", "C"]);
    expect(codes({ ...EMPTY_GENERAL_FILTERS, transactionType: "Expense" })).toEqual(["B"]);
    expect(
      codes({ ...EMPTY_GENERAL_FILTERS, gstEnabled: true, quantityType: "Items" }),
    ).toEqual(["C"]);
  });
});

describe("NDIS tab filters", () => {
  it("counts only the facets that aren't 'All'", () => {
    expect(activeNdisFilters(EMPTY_NDIS_FILTERS)).toBe(0);
    expect(
      activeNdisFilters({ registrationGroup: "Daily Personal Activities", supportCategory: "All" }),
    ).toBe(1);
    expect(activeNdisFilters({ registrationGroup: "X", supportCategory: "01" })).toBe(2);
  });

  it("builds deduplicated, sorted option lists and skips blanks", () => {
    const options = ndisFilterOptions([
      ndisItem({ registrationGroupName: "Therapeutic Supports", supportCategoryNumber: "12" }),
      ndisItem({ registrationGroupName: "Daily Personal Activities", supportCategoryNumber: "01" }),
      ndisItem({ registrationGroupName: "Therapeutic Supports", supportCategoryNumber: "01" }),
      ndisItem({ registrationGroupName: "", supportCategoryNumber: "" }),
    ]);

    expect(options).toEqual({
      registrationGroups: ["Daily Personal Activities", "Therapeutic Supports"],
      supportCategories: ["01", "12"],
    });
  });
});

describe("Custom tab filters and search", () => {
  const items = [
    customItem({ id: "1", name: "Consulting hour", sku: "CONS-1", saleTax: "GST (10%)" }),
    customItem({
      id: "2",
      name: "Oak panel",
      sku: "TMB-OAK",
      saleDescription: "Timber 1200x600",
      saleTax: "GST Free",
      transactionType: "Expense",
      quantityType: "Items",
    }),
  ];
  const ids = (query: string, filters = EMPTY_PRODUCT_FILTERS) =>
    filterCustomProducts(items, query, filters).map((i) => i.id);

  it("counts active filters for the badge", () => {
    expect(activeProductFilters(EMPTY_PRODUCT_FILTERS)).toBe(0);
    expect(
      activeProductFilters({ gstEnabled: true, transactionType: "Expense", quantityType: "Items" }),
    ).toBe(3);
  });

  it("searches name, SKU and sale description — wider than Inventory's name-only search", () => {
    expect(ids("consult")).toEqual(["1"]);
    expect(ids("tmb-oak")).toEqual(["2"]);
    expect(ids("TIMBER")).toEqual(["2"]);
    expect(ids("   ")).toEqual(["1", "2"]);
  });

  it("applies GST, transaction type and quantity type filters before the search", () => {
    expect(ids("", { ...EMPTY_PRODUCT_FILTERS, gstEnabled: true })).toEqual(["1"]);
    expect(ids("", { ...EMPTY_PRODUCT_FILTERS, transactionType: "Expense" })).toEqual(["2"]);
    expect(ids("oak", { ...EMPTY_PRODUCT_FILTERS, quantityType: "Hours" })).toEqual([]);
  });

  it("reports narrowed for a non-blank query or any active filter", () => {
    expect(customNarrowed("  ", EMPTY_PRODUCT_FILTERS)).toBe(false);
    expect(customNarrowed("oak", EMPTY_PRODUCT_FILTERS)).toBe(true);
    expect(customNarrowed("", { ...EMPTY_PRODUCT_FILTERS, gstEnabled: true })).toBe(true);
  });
});

describe("PAGE_SIZES", () => {
  it("offers the four documented page sizes", () => {
    expect(PAGE_SIZES).toEqual([10, 25, 50, 100]);
  });
});

describe("summary stats", () => {
  it("drops General's average price entirely while every price is zero/blank", () => {
    const stats = generalStats([
      generalEntry({ type: "Service" }),
      generalEntry({ type: "Product", salePrice: "0" }),
    ]);

    expect(stats).toEqual([
      { label: "Suggested items", value: "2" },
      { label: "Products / services", value: "1 / 1" },
    ]);
  });

  it("averages only the priced General rows, flagged indicative", () => {
    const stats = generalStats([
      generalEntry({ salePrice: "100" }),
      generalEntry({ salePrice: "50" }),
      generalEntry({ salePrice: "" }),
    ]);

    expect(stats[2]).toEqual({
      label: "Average price",
      value: "$75.00",
      hint: "indicative",
    });
  });

  it("counts distinct NDIS registration groups and support categories", () => {
    expect(
      ndisStats([
        ndisItem({ registrationGroupNumber: "0107", supportCategoryNumber: "01" }),
        ndisItem({ registrationGroupNumber: "0107", supportCategoryNumber: "04" }),
        ndisItem({ registrationGroupNumber: "0128", supportCategoryNumber: "01" }),
      ]),
    ).toEqual([
      { label: "Support items", value: "3" },
      { label: "Registration groups", value: "2" },
      { label: "Support categories", value: "2" },
    ]);
  });

  it("averages Custom sale prices, ignoring unpriced items", () => {
    expect(
      customStats([
        customItem({ type: "Service", salePrice: "180" }),
        customItem({ type: "Product", salePrice: "" }),
        customItem({ type: "Product", salePrice: "20" }),
      ]),
    ).toEqual([
      { label: "Total items", value: "3" },
      { label: "Products / services", value: "2 / 1" },
      { label: "Average sale price", value: "$100.00" },
    ]);
  });

  it("drops Custom's average with nothing priced", () => {
    expect(customStats([customItem({ salePrice: "" })])).toHaveLength(2);
  });
});

describe("productIssues (the Custom dialog's narrower validator)", () => {
  const valid = { ...emptyCustomItemDraft("Finance"), name: "Consulting", quantityType: "Hours" as const };

  it("passes a draft with a name and quantity type, prices blank", () => {
    expect(productIssues(valid)).toEqual([]);
  });

  it("needs at least two characters of name", () => {
    expect(productIssues({ ...valid, name: " A " }).map((i) => i.key)).toEqual(["name"]);
    expect(productIssues({ ...valid, name: "Ab" })).toEqual([]);
  });

  it("requires a quantity type and a transaction type", () => {
    const keys = productIssues({
      ...valid,
      quantityType: "",
      transactionType: "" as never,
    }).map((i) => i.key);
    expect(keys).toEqual(["quantityType", "transactionType"]);
  });

  it("flags a malformed cost or sale price", () => {
    const keys = productIssues({ ...valid, costPrice: "-5", salePrice: "1.234" }).map(
      (i) => i.key,
    );
    expect(keys).toEqual(["costPrice", "salePrice"]);
  });

  it("never raises a stock issue, even on a tracked draft with blank stock", () => {
    expect(
      productIssues({ ...valid, tracked: true, openingStock: "", lowStockAlert: "" }),
    ).toEqual([]);
  });
});

describe("drafts", () => {
  it("starts a Custom item untracked with blank stock, unlike Inventory's tracked default", () => {
    const draft = emptyCustomItemDraft("Finance");
    expect(draft).toMatchObject({
      industry: "Finance",
      tracked: false,
      openingStock: "",
      lowStockAlert: "",
      name: "",
    });
  });

  it("duplicates an item without its id, suffixing name and SKU", () => {
    const copy = duplicateItemDraft(customItem());
    expect(copy).not.toHaveProperty("id");
    expect(copy.name).toBe("Consulting hour (copy)");
    expect(copy.sku).toBe("CONS-1-COPY");
  });

  it("leaves a blank SKU blank on duplicate rather than inventing -COPY", () => {
    expect(duplicateItemDraft(customItem({ sku: "  " })).sku).toBe("");
  });

  it("copies a General row into an untracked Custom draft", () => {
    const draft = draftFromCatalogueEntry(
      generalEntry({ type: "Product", quantityType: "Items", taxRate: "GST Free", salePrice: "45" }),
    );

    expect(draft).toMatchObject({
      name: "Financial planning",
      sku: "FIN-FIN01",
      industry: "Finance",
      type: "Product",
      transactionType: "Income",
      quantityType: "Items",
      salePrice: "45",
      saleTax: "GST Free",
      tracked: false,
    });
  });

  it('blanks an indicative "0" price so the user is prompted to set a real one', () => {
    expect(draftFromCatalogueEntry(generalEntry({ salePrice: "0" })).salePrice).toBe("");
  });

  it("copies an hourly NDIS support as a Service/Hours, Income, GST Free", () => {
    const draft = draftFromSupportItem(ndisItem(), "Health and Social Care");
    expect(draft).toMatchObject({
      name: "Assistance With Self-Care Activities",
      sku: "01_011_0107_1_1",
      industry: "Health and Social Care",
      type: "Service",
      quantityType: "Hours",
      transactionType: "Income",
      saleTax: "GST Free",
      tracked: false,
    });
  });

  it("copies into the business's own tax words when given them", () => {
    const nz: ProductTaxLabels = { none: "— None —", taxed: "GST (15%)", free: "GST Free" };
    expect(draftFromCatalogueEntry(generalEntry({ taxRate: "GST (10%)" }), nz).saleTax).toBe("GST (15%)");
    const za: ProductTaxLabels = { none: "— None —", taxed: "VAT (15%)", free: "Zero-rated" };
    expect(draftFromSupportItem(ndisItem(), "Health and Social Care", za).saleTax).toBe("Zero-rated");
  });

  it("copies a blank-pricing equipment row (e.g. a wheelchair) as Product/Items", () => {
    const draft = draftFromSupportItem(
      ndisItem({ supportItemName: "Manual wheelchair", pricingType: "" }),
      "Health and Social Care",
    );
    expect(draft.type).toBe("Product");
    expect(draft.quantityType).toBe("Items");
  });
});

describe("bulk import: template", () => {
  it("lists the nine fields in the documented fixed order, three required", () => {
    expect(PRODUCT_IMPORT_TEMPLATE_HEADERS).toEqual([
      "Item name",
      "Type",
      "Quantity type",
      "Description",
      "Cost price",
      "Selling price",
      "GST",
      "Track inventory",
      "Inventory count",
    ]);
    expect(PRODUCT_IMPORT_FIELDS.filter((f) => f.required).map((f) => f.name)).toEqual([
      "Item name",
      "Type",
      "Quantity type",
    ]);
  });

  it("downloads as headers plus two sample rows, quoting the comma-bearing description", () => {
    const lines = productImportTemplateCsv().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(PRODUCT_IMPORT_TEMPLATE_HEADERS.join(","));
    expect(lines[1]).toContain('"Consulting, billed hourly"');
  });

  it("only offers sample rows its own parser accepts", () => {
    const rows = parseProductsCsv(productImportTemplateCsv());
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.issues)).toEqual([[], []]);
    expect(rows[0].description).toBe("Consulting, billed hourly");
  });
});

describe("bulk import: splitCsvLine", () => {
  it("honours quoted commas and doubled quotes, and trims each cell", () => {
    expect(splitCsvLine(' a , "b, c" ,"say ""hi"""')).toEqual(["a", "b, c", 'say "hi"']);
  });

  it("keeps a trailing empty cell", () => {
    expect(splitCsvLine("a,b,")).toEqual(["a", "b", ""]);
  });
});

describe("bulk import: parseProductsCsv", () => {
  const header = PRODUCT_IMPORT_TEMPLATE_HEADERS.join(",");

  it("returns nothing for a header-only or empty file", () => {
    expect(parseProductsCsv("")).toEqual([]);
    expect(parseProductsCsv(`${header}\n`)).toEqual([]);
  });

  it("skips blank lines and tolerates CRLF", () => {
    const rows = parseProductsCsv(
      `${header}\r\n\r\nWidget,Product,Items,,,10,No,No,\r\n`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Widget", salePrice: "10", issues: [] });
  });

  it("fills missing trailing cells with blanks", () => {
    const [row] = parseProductsCsv(`${header}\nWidget,Product,Items`);
    expect(row).toMatchObject({ description: "", inventoryCount: "", issues: [] });
  });

  it("reads columns by FIXED position, ignoring the file's own header order", () => {
    // Header says Type first, but position 0 is still read as the name — the
    // documented Known issue: the Map data step's choices are never applied.
    const [row] = parseProductsCsv(
      "Type,Item name,Quantity type\nProduct,Widget,Items",
    );
    expect(row.name).toBe("Product");
    expect(row.type).toBe("Widget");
    expect(row.issues).toContain("Type must be Product or Service");
  });

  // Known open bug (docs/testing-coverage-products-inventory.md "Still open"):
  // product-bulk-dialog's Map data `mapping` is never passed to the parser, so
  // a reordered file cannot be corrected. Enable once parsing honours a mapping.
  it.todo("reads cells through the Map data step's column mapping rather than by position");
});

describe("bulk import: productRowIssues", () => {
  const base = {
    name: "Widget",
    type: "product",
    quantityType: "KM",
    description: "",
    costPrice: "",
    salePrice: "",
    gst: "",
    tracked: "",
    inventoryCount: "",
  };

  it("accepts type and quantity type case-insensitively", () => {
    expect(productRowIssues(base)).toEqual([]);
  });

  it("reports every problem, in column order", () => {
    expect(
      productRowIssues({
        ...base,
        name: " ",
        type: "Bundle",
        quantityType: "Weeks",
        costPrice: "abc",
        salePrice: "$10",
      }),
    ).toEqual([
      "Item name is required",
      "Type must be Product or Service",
      "Quantity type must be Items, Hours, Days or Km",
      "Cost price isn't a valid number",
      "Selling price isn't a valid number",
    ]);
  });
});

describe("bulk import: draftFromImportRow", () => {
  function row(overrides: Partial<ReturnType<typeof parseProductsCsv>[number]> = {}) {
    return {
      name: " Widget ",
      type: "service",
      quantityType: "hOURS",
      description: " Sold by the hour ",
      costPrice: " 5 ",
      salePrice: "10",
      gst: "Y",
      tracked: "no",
      inventoryCount: "",
      issues: [],
      ...overrides,
    };
  }

  it("canonicalises casing, trims, and maps GST yes to GST (10%)", () => {
    expect(draftFromImportRow(row(), "Trades")).toMatchObject({
      name: "Widget",
      type: "Service",
      quantityType: "Hours",
      saleDescription: "Sold by the hour",
      costPrice: "5",
      salePrice: "10",
      saleTax: "GST (10%)",
      industry: "Trades",
      tracked: false,
      openingStock: "",
      lowStockAlert: "",
    });
  });

  it("maps anything not yes to GST Free", () => {
    expect(draftFromImportRow(row({ gst: "" }), "Trades").saleTax).toBe("GST Free");
  });

  it("uses the business's own taxed label when given one", () => {
    const za: ProductTaxLabels = { none: "— None —", taxed: "VAT (15%)", free: "VAT Free" };
    expect(draftFromImportRow(row(), "Trades", za).saleTax).toBe("VAT (15%)");
    expect(draftFromImportRow(row({ gst: "no" }), "Trades", za).saleTax).toBe("VAT Free");
  });

  it("gives a tracked row its count, or 0, and a low-stock alert of 5", () => {
    expect(
      draftFromImportRow(row({ type: "Product", tracked: "Yes", inventoryCount: " 12 " }), "Trades"),
    ).toMatchObject({ type: "Product", tracked: true, openingStock: "12", lowStockAlert: "5" });
    expect(
      draftFromImportRow(row({ tracked: "1", inventoryCount: "" }), "Trades").openingStock,
    ).toBe("0");
  });
});

describe("isYes", () => {
  it("accepts yes/y/true/1 in any case, nothing else", () => {
    for (const value of ["Yes", " y ", "TRUE", "1"]) expect(isYes(value)).toBe(true);
    for (const value of ["no", "", "2", "yeah"]) expect(isYes(value)).toBe(false);
  });
});
