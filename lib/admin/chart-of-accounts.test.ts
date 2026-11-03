import { describe, expect, it } from "vitest";

import {
  accountIssues,
  availabilityLabel,
  categoryIssues,
  categoryRetireBlockedReason,
  cleanLabels,
  mapAccount,
  mapCategory,
  nameIn,
  retireBlockedReason,
  type AccountInput,
  type ChartAccount,
  type ChartCountry,
} from "@/lib/admin/chart-of-accounts";

const COUNTRIES: ChartCountry[] = [
  { iso2: "AU", name: "Australia" },
  { iso2: "NZ", name: "New Zealand" },
  { iso2: "ZA", name: "South Africa" },
];

const account = (over: Partial<ChartAccount> = {}): ChartAccount => ({
  id: 9001,
  categoryId: 1,
  name: "Bank fees",
  code: "404",
  countryIso2: null,
  labels: null,
  taxRole: null,
  catType: "N",
  isHidden: false,
  orderNo: 10,
  deleted: false,
  protected: false,
  protectedReason: null,
  postings: 0,
  ...over,
});

const input = (over: Partial<AccountInput> = {}): AccountInput => ({
  name: "Bank fees",
  code: "404",
  categoryId: 1,
  countryIso2: null,
  taxRole: null,
  catType: "N",
  labels: {},
  ...over,
});

describe("mapping", () => {
  it("reads an account, with the backend's own flags", () => {
    expect(
      mapAccount({
        id: "39",
        account_category_id: "2",
        name: "GST Payable",
        code: "402",
        country_iso2: null,
        labels: { za: "VAT Payable" },
        tax_role: "tax_payable",
        cat_type: "N",
        is_hidden: 0,
        order_no: "20",
        deleted: false,
        protected: true,
        protected_reason: "invoice_gst, a tax control account",
        postings: "4312",
      }),
    ).toMatchObject({
      id: 39,
      categoryId: 2,
      taxRole: "tax_payable",
      // Keys are upper-cased so a lookup by ISO code always hits.
      labels: { ZA: "VAT Payable" },
      protected: true,
      postings: 4312,
    });
  });

  it("falls back rather than trusting a value this build doesn't know", () => {
    const row = mapAccount({ id: 1, tax_role: "tax_magic", cat_type: "Z" });
    expect(row.taxRole).toBeNull();
    expect(row.catType).toBe("N");
  });

  it("treats an empty country as 'every country', not as a code", () => {
    expect(mapAccount({ id: 1, country_iso2: "" }).countryIso2).toBeNull();
    expect(mapAccount({ id: 1, country_iso2: " nz " }).countryIso2).toBe("NZ");
  });

  it("drops a blank label rather than storing an empty override", () => {
    expect(mapAccount({ id: 1, labels: { ZA: "   ", NZ: "GST Payable" } }).labels).toEqual({
      NZ: "GST Payable",
    });
    expect(mapAccount({ id: 1, labels: {} }).labels).toBeNull();
    expect(mapAccount({ id: 1, labels: ["VAT"] }).labels).toBeNull();
  });

  it("nests the accounts a category came with", () => {
    const category = mapCategory({
      id: 2,
      name: "Expenses",
      subcategories: [{ id: 1, name: "Bank fees" }, { id: 2, name: "Rent" }],
    });
    expect(category.accounts.map((a) => a.name)).toEqual(["Bank fees", "Rent"]);
  });
});

describe("what a country calls an account", () => {
  it("prefers the override and falls back to the stored name", () => {
    const row = account({ name: "GST Collected", labels: { ZA: "VAT Collected" } });
    expect(nameIn(row, "ZA")).toBe("VAT Collected");
    expect(nameIn(row, "za")).toBe("VAT Collected");
    expect(nameIn(row, "NZ")).toBe("GST Collected");
    expect(nameIn(account(), "ZA")).toBe("Bank fees");
  });
});

describe("where an account is offered", () => {
  it("says every country when it isn't restricted — which is most of them", () => {
    expect(availabilityLabel(account(), COUNTRIES)).toBe("Every country");
  });

  it("names the country it is restricted to", () => {
    expect(availabilityLabel(account({ countryIso2: "ZA" }), COUNTRIES)).toBe("South Africa");
  });

  it("shows the raw code for a country the list hasn't loaded", () => {
    expect(availabilityLabel(account({ countryIso2: "IE" }), COUNTRIES)).toBe("IE");
  });
});

describe("what can be retired", () => {
  it("allows an ordinary account, postings or not", () => {
    expect(retireBlockedReason(account())).toBeNull();
    expect(retireBlockedReason(account({ postings: 4312 }))).toBeNull();
  });

  it("refuses one Sole's code posts to by id, and says which constant", () => {
    const reason = retireBlockedReason(
      account({ protected: true, protectedReason: "bank_clearing_subcategory" }),
    );
    expect(reason).toContain("bank_clearing_subcategory");
  });

  it("refuses a category that still has live accounts, and counts them", () => {
    const category = mapCategory({
      id: 1,
      name: "Expenses",
      subcategories: [{ id: 1, deleted: false }, { id: 2, deleted: true }],
    });
    // The retired one doesn't count — only what's still offered blocks it.
    expect(categoryRetireBlockedReason(category)).toContain("1 account is");
  });

  it("allows an empty category, and one whose accounts are all retired", () => {
    expect(categoryRetireBlockedReason(mapCategory({ id: 1, subcategories: [] }))).toBeNull();
    expect(
      categoryRetireBlockedReason(mapCategory({ id: 1, subcategories: [{ id: 1, deleted: true }] })),
    ).toBeNull();
  });
});

describe("validation", () => {
  it("accepts a complete account", () => {
    expect(accountIssues(input())).toEqual({});
  });

  it("holds name and code to their column widths", () => {
    expect(accountIssues(input({ name: "" })).name).toBeTruthy();
    expect(accountIssues(input({ name: "x".repeat(256) })).name).toContain("255");
    expect(accountIssues(input({ code: "" })).code).toBeTruthy();
    expect(accountIssues(input({ code: "12345678901" })).code).toContain("10");
  });

  it("insists an account sits under a category", () => {
    expect(accountIssues(input({ categoryId: null })).categoryId).toBeTruthy();
  });

  it("checks a category the same way", () => {
    expect(categoryIssues({ name: "Expenses", countryIso2: null, catType: "N", labels: {} })).toEqual({});
    expect(categoryIssues({ name: "  ", countryIso2: null, catType: "N", labels: {} }).name).toBeTruthy();
  });

  it("strips the blank rows a labels editor leaves behind", () => {
    expect(cleanLabels({ za: " VAT Output ", NZ: "", "": "x" })).toEqual({ ZA: "VAT Output" });
    expect(cleanLabels({})).toEqual({});
  });
});
