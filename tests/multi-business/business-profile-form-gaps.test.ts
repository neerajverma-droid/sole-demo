import { describe, expect, it } from "vitest";

import {
  EMPTY_BUSINESS_DRAFT,
  businessDraftIssues,
  draftFromDetail,
} from "@/components/businesses/business-profile-form";
import type { ApiBusinessDetail } from "@/lib/businesses";
import type { IndustryOption } from "@/lib/industries";

const VALID_DRAFT = {
  ...EMPTY_BUSINESS_DRAFT,
  email: "hello@harbourline.com.au",
  businessName: "Harbourline Studio",
  abn: "72 629 951 766",
  industry: "Finance",
};

const industries: IndustryOption[] = [
  { id: "6", name: "Finance" },
  { id: "9", name: "NDIS (Health and Social Care)" },
];

const baseRecord: ApiBusinessDetail = {
  id: 32807,
  business_email: "edit@yopmail.com",
  business_name: "Harbourline Studio",
  abn: "11111111111",
  industry_id: 6,
  company_type: "solo_traders",
  accounting_type: "cash",
  country_code: "+61",
  mobile_no: "411111111",
  country: "India",
};

describe("EMPTY_BUSINESS_DRAFT", () => {
  it("pre-sets exactly three non-blank defaults: Cash, Sole trader and Australia", () => {
    const nonBlank = Object.entries(EMPTY_BUSINESS_DRAFT).filter(([, value]) => value !== "");
    expect(Object.fromEntries(nonBlank)).toEqual({
      accountingBasis: "Cash",
      businessType: "Sole trader",
      country: "Australia",
    });
  });
});

describe("businessDraftIssues — exact required-field wording", () => {
  it("uses each field's own required message", () => {
    expect(businessDraftIssues(EMPTY_BUSINESS_DRAFT)).toEqual({
      email: "Business email is required.",
      businessName: "Business name is required.",
      abn: "ABN is required.",
      industry: "Industry is required.",
    });
  });

  it("treats whitespace-only email, name and ABN as missing", () => {
    const issues = businessDraftIssues({
      ...VALID_DRAFT,
      email: "  ",
      businessName: "   ",
      abn: " ",
    });
    expect(issues.email).toBe("Business email is required.");
    expect(issues.businessName).toBe("Business name is required.");
    expect(issues.abn).toBe("ABN is required.");
  });

  it("accepts an email with surrounding whitespace", () => {
    expect(
      businessDraftIssues({ ...VALID_DRAFT, email: "  hello@harbourline.com.au  " }).email,
    ).toBeUndefined();
  });

  it("ignores a whitespace-only NDIS number even on the NDIS industry", () => {
    expect(
      businessDraftIssues({
        ...VALID_DRAFT,
        industry: "NDIS (Health and Social Care)",
        ndisNumber: "   ",
      }).ndisNumber,
    ).toBeUndefined();
  });
});

describe("draftFromDetail — fallbacks", () => {
  it("falls back to Australia for an empty-string country, not just a missing one (|| not ??)", () => {
    expect(draftFromDetail({ ...baseRecord, country: "" }, industries).country).toBe("Australia");
    expect(draftFromDetail({ ...baseRecord, country: undefined }, industries).country).toBe(
      "Australia",
    );
  });

  it("reads accounting_type case-sensitively — only lowercase 'accrual' is Accrual", () => {
    expect(
      draftFromDetail({ ...baseRecord, accounting_type: "Accrual" }, industries).accountingBasis,
    ).toBe("Cash");
  });

  it("leaves the industry blank for a null or missing industry_id", () => {
    expect(
      draftFromDetail({ ...baseRecord, industry_id: null as unknown as number }, industries)
        .industry,
    ).toBe("");
    expect(draftFromDetail({ ...baseRecord, industry_id: undefined }, industries).industry).toBe(
      "",
    );
  });

  it("only looks the industry up in the list it's given", () => {
    expect(draftFromDetail(baseRecord, []).industry).toBe("");
  });

  it("falls back to Sole trader when company_type is missing entirely", () => {
    expect(draftFromDetail({ ...baseRecord, company_type: undefined }, industries).businessType).toBe(
      "Sole trader",
    );
  });

  it("falls back businessName to company_name when business_name is absent", () => {
    expect(
      draftFromDetail(
        { ...baseRecord, business_name: undefined, company_name: "Acme Pty Ltd" },
        industries,
      ).businessName,
    ).toBe("Acme Pty Ltd");
  });

  it("assumes +61 when the record has no country_code", () => {
    expect(draftFromDetail({ ...baseRecord, country_code: undefined }, industries).phone).toBe(
      "+61411111111",
    );
  });

  it("maps the bank and address columns, defaulting missing ones to blank", () => {
    const draft = draftFromDetail(
      {
        ...baseRecord,
        bank_name: "CBA",
        bsb: "083004",
        account_holder: "Jane",
        account_number: "12345678",
        address: "18 Cremorne St, Richmond",
        address_line1: "18 Cremorne Street",
        ndis_no: "123456789",
      },
      industries,
    );
    expect(draft).toMatchObject({
      bankName: "CBA",
      bsb: "083004",
      accountHolder: "Jane",
      accountNumber: "12345678",
      addressSearch: "18 Cremorne St, Richmond",
      addressLine1: "18 Cremorne Street",
      ndisNumber: "123456789",
      city: "",
      state: "",
      postcode: "",
      middleName: "",
    });
  });
});
