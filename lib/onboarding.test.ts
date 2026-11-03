import { describe, expect, it } from "vitest";

import {
  companyProfileIssues,
  emptyCompanyProfile,
  splitFullName,
} from "@/lib/onboarding";

describe("splitFullName", () => {
  it("puts a single word entirely in first_name, with last_name null", () => {
    expect(splitFullName("Cher")).toEqual({
      first_name: "Cher",
      last_name: null,
    });
  });

  it("splits two words into first_name and last_name", () => {
    expect(splitFullName("Ada Lovelace")).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
    });
  });

  it("keeps everything after the first word in last_name, space-joined", () => {
    expect(splitFullName("Jean Luc Picard")).toEqual({
      first_name: "Jean",
      last_name: "Luc Picard",
    });
  });

  it("trims leading and trailing whitespace", () => {
    expect(splitFullName("  Ada Lovelace  ")).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
    });
  });

  it("collapses runs of internal whitespace", () => {
    expect(splitFullName("Jean   Luc    Picard")).toEqual({
      first_name: "Jean",
      last_name: "Luc Picard",
    });
  });

  it("treats an empty or whitespace-only value as no name at all", () => {
    expect(splitFullName("")).toEqual({ first_name: "", last_name: null });
    expect(splitFullName("   ")).toEqual({ first_name: "", last_name: null });
  });
});

/**
 * The country is the one answer on this screen that can never be revised — it
 * fixes the currency, the tax label, the financial-year shape and which
 * registration number is required. So it is the one that blocks Next, and it
 * must never arrive pre-answered.
 */
describe("companyProfileIssues — country", () => {
  it("blocks until a country is chosen", () => {
    const issues = companyProfileIssues(emptyCompanyProfile());
    expect(issues.some((issue) => issue.key === "countryIso2")).toBe(true);
  });

  it("stops blocking once one is", () => {
    const issues = companyProfileIssues({
      ...emptyCompanyProfile(),
      countryIso2: "AU",
      businessName: "Turner Consulting",
    });
    expect(issues.some((issue) => issue.key === "countryIso2")).toBe(false);
  });

  it("treats whitespace as unanswered", () => {
    const issues = companyProfileIssues({
      ...emptyCompanyProfile(),
      countryIso2: "   ",
    });
    expect(issues.some((issue) => issue.key === "countryIso2")).toBe(true);
  });
});

describe("emptyCompanyProfile", () => {
  it("leaves the country blank rather than defaulting to AU", () => {
    // Pre-answering the one irreversible question would be choosing for them,
    // silently — a business created in the wrong country can't be moved once
    // it has books.
    expect(emptyCompanyProfile().countryIso2).toBe("");
  });
});

/**
 * The business number is never required on this screen, whatever the
 * registry says — an ABN lookup depends on a credential that isn't always
 * configured, and blocking sign-up on a field whose own lookup can be down is
 * worse than letting someone type their business name by hand. A number that
 * IS typed is still checked against the country's own shape and check digit.
 */
describe("companyProfileIssues — business number", () => {
  const NZBN = {
    key: "business_registration_number",
    label: "NZBN",
    // The registry's own answer for New Zealand: not legally required.
    required: false,
    pattern: "^\\d{13}$",
    mask: null,
    validator: "nzbn_gs1",
    sameAs: null,
  };

  const filled = {
    ...emptyCompanyProfile(),
    countryIso2: "NZ",
    businessName: "Kiwi Co",
  };

  it("doesn't ask for the number, even from a country whose own registry requires it", () => {
    const AU_ABN = { ...NZBN, label: "ABN", required: true, pattern: "^\\d{11}$", validator: "abn_mod89" };
    const issues = companyProfileIssues({ ...filled, countryIso2: "AU" }, AU_ABN);
    expect(issues.some((issue) => issue.key === "abn")).toBe(false);
  });

  it("still flags a number that's typed in but malformed", () => {
    const issues = companyProfileIssues({ ...filled, abn: "123" }, NZBN);
    expect(issues.some((issue) => issue.key === "abn")).toBe(true);
  });

  it("is satisfied by a valid number", () => {
    const issues = companyProfileIssues(
      { ...filled, abn: "9429038053894" },
      NZBN,
    );
    expect(issues.some((issue) => issue.key === "abn")).toBe(false);
  });

  it("still requires the name, even without a number", () => {
    const issues = companyProfileIssues(
      { ...filled, businessName: "" },
      NZBN,
    );
    expect(issues.some((issue) => issue.key === "businessName")).toBe(true);
  });
});

/**
 * The account holder's name, moved here from the sign-up step.
 *
 * Sign-up is "confirm it's you", and a name is not a credential — it belongs
 * beside the business it prints next to on an invoice.
 */
describe("companyProfileIssues — your name", () => {
  const ready = {
    ...emptyCompanyProfile(),
    countryIso2: "AU",
    businessName: "Turner Consulting",
  };

  it("blocks until a name is given", () => {
    const issues = companyProfileIssues(ready);
    expect(issues.some((issue) => issue.key === "fullName")).toBe(true);
  });

  it("accepts a single name", () => {
    // Plenty of people go by one, and `last_name` is nullable on the API.
    const issues = companyProfileIssues({ ...ready, fullName: "Cher" });
    expect(issues.some((issue) => issue.key === "fullName")).toBe(false);
  });

  it("treats whitespace as unanswered", () => {
    const issues = companyProfileIssues({ ...ready, fullName: "   " });
    expect(issues.some((issue) => issue.key === "fullName")).toBe(true);
  });
});

describe("emptyCompanyProfile — name", () => {
  it("starts blank", () => {
    expect(emptyCompanyProfile().fullName).toBe("");
  });
});

/**
 * The mobile number, unlike the ABN, has no register to fall back on — so
 * it's the one that's actually required, and checked against whichever
 * country was chosen rather than a fixed shape.
 */
describe("companyProfileIssues — mobile number", () => {
  const ready = {
    ...emptyCompanyProfile(),
    countryIso2: "AU",
    businessName: "Turner Consulting",
    fullName: "Jane Smith",
  };

  it("blocks until a number is given", () => {
    const issues = companyProfileIssues(ready);
    expect(issues.some((issue) => issue.key === "mobile")).toBe(true);
  });

  it("is satisfied by a valid number for the chosen country", () => {
    const issues = companyProfileIssues({
      ...ready,
      mobile: "+61412345678",
    });
    expect(issues.some((issue) => issue.key === "mobile")).toBe(false);
  });

  it("rejects a number that belongs to a different country", () => {
    const issues = companyProfileIssues({
      ...ready,
      countryIso2: "AU",
      mobile: "+14155552671", // a US number
    });
    expect(issues.some((issue) => issue.key === "mobile")).toBe(true);
  });

  it("rejects a malformed number", () => {
    const issues = companyProfileIssues({ ...ready, mobile: "123" });
    expect(issues.some((issue) => issue.key === "mobile")).toBe(true);
  });
});
