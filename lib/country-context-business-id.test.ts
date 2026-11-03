import { describe, expect, it } from "vitest";

import {
  FALLBACK_COUNTRY_CONTEXT,
  businessIdDisplay,
  mapCountryContext,
  type CountryContext,
} from "@/lib/country-context";

/**
 * The business's own registration number, labelled and spaced per country.
 *
 * Two separate ways this was wrong before, both of which only showed up outside
 * Australia — which is why neither was noticed:
 *
 * 1. The label was the string "ABN", so a New Zealand business was told its
 *    NZBN was an ABN.
 * 2. The value was read from `abn`, Australia's legacy column. Every other
 *    country keeps the number in `business_registration_number`, so the row
 *    found nothing and silently didn't render at all. That one is the reason
 *    these tests lead with the value rather than the label.
 */

const AU = FALLBACK_COUNTRY_CONTEXT;

const NZ: CountryContext = mapCountryContext({
  country_iso2: "NZ",
  country_name: "New Zealand",
  labels: { business_id: "NZBN" },
});

const ZA: CountryContext = mapCountryContext({
  country_iso2: "ZA",
  country_name: "South Africa",
  labels: { business_id: "Company registration number" },
});

describe("the label", () => {
  it("is ABN in Australia", () => {
    expect(businessIdDisplay(AU, { abn: "12345678901" })?.label).toBe("ABN");
  });

  it("is NZBN in New Zealand", () => {
    expect(
      businessIdDisplay(NZ, { registrationNumber: "9429041234567" })?.label,
    ).toBe("NZBN");
  });

  it("is whatever the registry says, however long", () => {
    expect(
      businessIdDisplay(ZA, { registrationNumber: "2019/123456/07" })?.label,
    ).toBe("Company registration number");
  });

  it("falls back to ABN when the registry names nothing", () => {
    // Every existing business is Australian, so that is the honest default
    // for a country whose labels haven't been filled in yet.
    const sparse = mapCountryContext({
      country_iso2: "IE",
      country_name: "Ireland",
    });

    expect(
      businessIdDisplay(sparse, { registrationNumber: "123456" })?.label,
    ).toBe("ABN");
  });
});

describe("which column the number comes from", () => {
  it("reads the general column outside Australia", () => {
    // The bug: this used to read `abn`, find nothing, and render no row.
    expect(
      businessIdDisplay(NZ, { registrationNumber: "9429041234567" })?.value,
    ).toBe("9429041234567");
  });

  it("prefers the legacy abn column in Australia, which is what its form writes", () => {
    const both = { abn: "12345678901", registrationNumber: "99999999999" };

    expect(businessIdDisplay(AU, both)?.value).toBe("12 345 678 901");
  });

  it("falls back to the general column in Australia when abn is empty", () => {
    expect(
      businessIdDisplay(AU, { abn: "  ", registrationNumber: "12345678901" })
        ?.value,
    ).toBe("12 345 678 901");
  });

  it("falls back to abn outside Australia when the general column is empty", () => {
    // A business that pre-dates the general column, whose country has since
    // been corrected. Showing the number it has beats showing none.
    expect(
      businessIdDisplay(NZ, { abn: "9429041234567", registrationNumber: "" })
        ?.value,
    ).toBe("9429041234567");
  });
});

describe("the spacing", () => {
  it("groups an Australian ABN 2-3-3-3", () => {
    expect(businessIdDisplay(AU, { abn: "12345678901" })?.value).toBe(
      "12 345 678 901",
    );
  });

  it("leaves a half-typed Australian number alone", () => {
    // Rearranging six digits into an ABN's shape makes a partial entry look
    // like a complete one.
    expect(businessIdDisplay(AU, { abn: "123456" })?.value).toBe("123456");
  });

  it("does not apply Australia's grouping elsewhere", () => {
    expect(
      businessIdDisplay(NZ, { registrationNumber: "9429041234567" })?.value,
    ).toBe("9429041234567");
  });

  it("keeps letters in a company number", () => {
    // The reason the grouping is country-gated rather than applied everywhere:
    // a digits-only formatter turns "SC123456" into "123456" — a different,
    // real company.
    expect(
      businessIdDisplay(ZA, { registrationNumber: "SC123456" })?.value,
    ).toBe("SC123456");
  });

  it("keeps the punctuation a country writes into its number", () => {
    expect(
      businessIdDisplay(ZA, { registrationNumber: "2019/123456/07" })?.value,
    ).toBe("2019/123456/07");
  });
});

describe("nothing to show", () => {
  it.each([
    ["no business at all", null],
    ["an undefined business", undefined],
    ["an empty record", {}],
    ["blank strings", { abn: "", registrationNumber: "" }],
    ["whitespace only", { abn: "   ", registrationNumber: "  " }],
  ])("returns null for %s", (_label, business) => {
    // Null rather than a label with an em dash after it: the caller drops the
    // row, and a recap listing "NZBN · —" is a line that says nothing.
    expect(businessIdDisplay(NZ, business)).toBeNull();
  });

  it("trims before deciding there is something", () => {
    expect(
      businessIdDisplay(NZ, { registrationNumber: " 94290 " })?.value,
    ).toBe("94290");
  });
});
