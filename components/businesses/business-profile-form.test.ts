import { describe, expect, it } from "vitest";

import {
  EMPTY_BUSINESS_DRAFT,
  businessDraftIssues,
  countryRegistrationField,
  draftFromDetail,
  newBusinessCountry,
  newBusinessCountryOptions,
} from "@/components/businesses/business-profile-form";
import { FALLBACK_COUNTRY_CONTEXT } from "@/lib/country-context";
import type { ApiBusinessDetail } from "@/lib/businesses";
import type { IndustryOption } from "@/lib/industries";

const VALID_DRAFT = {
  ...EMPTY_BUSINESS_DRAFT,
  email: "hello@harbourline.com.au",
  businessName: "Harbourline Studio",
  abn: "72 629 951 766",
  industry: "Finance",
};

describe("businessDraftIssues", () => {
  it("flags every required field on a blank draft", () => {
    const issues = businessDraftIssues(EMPTY_BUSINESS_DRAFT);
    expect(Object.keys(issues).sort()).toEqual(
      ["abn", "businessName", "email", "industry"].sort(),
    );
  });

  it("has no issues once the four required fields are filled and valid", () => {
    expect(businessDraftIssues(VALID_DRAFT)).toEqual({});
  });

  it("flags a malformed email without flagging a missing one", () => {
    const issues = businessDraftIssues({ ...VALID_DRAFT, email: "not-an-email" });
    expect(issues.email).toBe("That doesn't look like an email address.");
  });

  it("flags an ABN with the wrong shape", () => {
    const issues = businessDraftIssues({ ...VALID_DRAFT, abn: "123" });
    expect(issues.abn).toBeTruthy();
  });

  it("leaves the NDIS number optional unless the NDIS industry is chosen and something was typed", () => {
    // Not the NDIS industry — an invalid-shaped number is still not flagged.
    expect(
      businessDraftIssues({ ...VALID_DRAFT, industry: "Finance", ndisNumber: "1" }).ndisNumber,
    ).toBeUndefined();

    // NDIS industry, nothing typed yet — still not flagged (it's optional until typed).
    const ndisIndustry = "NDIS (Health and Social Care)";
    expect(
      businessDraftIssues({ ...VALID_DRAFT, industry: ndisIndustry, ndisNumber: "" }).ndisNumber,
    ).toBeUndefined();

    // NDIS industry, something typed, wrong shape — flagged.
    expect(
      businessDraftIssues({ ...VALID_DRAFT, industry: ndisIndustry, ndisNumber: "1" })
        .ndisNumber,
    ).toBeTruthy();

    // NDIS industry, a correctly-shaped 9-digit number — not flagged.
    expect(
      businessDraftIssues({ ...VALID_DRAFT, industry: ndisIndustry, ndisNumber: "123456789" })
        .ndisNumber,
    ).toBeUndefined();
  });
});

describe("draftFromDetail", () => {
  const industries: IndustryOption[] = [
    { id: "6", name: "Finance" },
    { id: "9", name: "NDIS (Health and Social Care)" },
  ];

  const baseRecord: ApiBusinessDetail = {
    id: 32807,
    business_email: "edit@yopmail.com",
    business_name: "edit@yopmail.com",
    abn: "11111111111",
    industry_id: 6,
    company_type: "solo_traders",
    accounting_type: "cash",
    country_code: "+61",
    mobile_no: "411111111",
    country: "India",
    city: "Champawat",
    state: "Uttarakhand",
    postcode: "262523",
  };

  it("resolves industry_id to a name via the fetched industries list", () => {
    const draft = draftFromDetail(baseRecord, industries);
    expect(draft.industry).toBe("Finance");
  });

  it("leaves the industry blank when nothing in the fetched list matches", () => {
    const draft = draftFromDetail({ ...baseRecord, industry_id: 999 }, industries);
    expect(draft.industry).toBe("");
  });

  it.each([
    ["solo_traders", "Sole trader"],
    ["individual", "Sole trader"],
    ["pvt_company", "Company"],
  ] as const)("maps company_type %s back to %s", (companyType, expected) => {
    const draft = draftFromDetail({ ...baseRecord, company_type: companyType }, industries);
    expect(draft.businessType).toBe(expected);
  });

  it("falls back to the default business type for an unrecognised company_type", () => {
    const draft = draftFromDetail({ ...baseRecord, company_type: "something_new" }, industries);
    expect(draft.businessType).toBe(EMPTY_BUSINESS_DRAFT.businessType);
  });

  it.each([
    ["accrual", "Accrual"],
    ["cash", "Cash"],
    [undefined, "Cash"],
  ] as const)("maps accounting_type %s back to %s", (accountingType, expected) => {
    const draft = draftFromDetail({ ...baseRecord, accounting_type: accountingType }, industries);
    expect(draft.accountingBasis).toBe(expected);
  });

  it("rebuilds the phone input's combined display value from country_code + mobile_no", () => {
    const draft = draftFromDetail(baseRecord, industries);
    expect(draft.phone).toBe("+61411111111");
  });

  it("carries the rest of the fields straight through", () => {
    const draft = draftFromDetail(baseRecord, industries);
    expect(draft).toMatchObject({
      email: "edit@yopmail.com",
      abn: "11111111111",
      city: "Champawat",
      state: "Uttarakhand",
      postcode: "262523",
      country: "India",
    });
  });
});

describe("adding a business in another country", () => {
  const NZBN_FIELD = {
    key: "business_registration_number",
    label: "NZBN",
    required: false,
    pattern: "^\\d{13}$",
    mask: null,
    validator: "nzbn_gs1",
    sameAs: null,
  };
  const NZ_COUNTRY = {
    iso2: "NZ",
    name: "New Zealand",
    currency: "NZD",
    phoneDialCode: "+64",
    taxType: "GST",
    identifierSchema: [NZBN_FIELD],
    hasLookup: true,
  };

  it("validates the business number as the chosen country's", () => {
    const idField = countryRegistrationField(NZ_COUNTRY.identifierSchema);
    expect(idField.label).toBe("NZBN");
    // A valid ABN isn't an NZBN…
    expect(businessDraftIssues(VALID_DRAFT, idField).abn).toBe(
      "NZBN is not in the expected format.",
    );
    // …and a valid NZBN passes.
    expect(businessDraftIssues({ ...VALID_DRAFT, abn: "9429041535134" }, idField)).toEqual({});
    // Still required by Sole, whatever the country says.
    expect(businessDraftIssues({ ...VALID_DRAFT, abn: "" }, idField).abn).toBe("NZBN is required.");
  });

  it("falls back to the ABN while nothing better is known", () => {
    expect(countryRegistrationField(undefined).label).toBe("ABN");
    expect(businessDraftIssues(VALID_DRAFT, countryRegistrationField([]))).toEqual({});
  });

  it("always offers the active business's own country", () => {
    expect(newBusinessCountryOptions([], FALLBACK_COUNTRY_CONTEXT).map((c) => c.iso2)).toEqual(["AU"]);
    expect(newBusinessCountryOptions([NZ_COUNTRY], FALLBACK_COUNTRY_CONTEXT).map((c) => c.iso2)).toEqual([
      "AU",
      "NZ",
    ]);
    expect(newBusinessCountry([NZ_COUNTRY], "NZ", FALLBACK_COUNTRY_CONTEXT)?.phoneDialCode).toBe("+64");
    expect(newBusinessCountry([NZ_COUNTRY], "AU", FALLBACK_COUNTRY_CONTEXT)?.identifierSchema[0].label).toBe(
      "ABN",
    );
  });
});
