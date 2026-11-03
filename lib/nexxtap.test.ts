import { describe, expect, it, vi } from "vitest";

import type { BusinessProfile } from "@/lib/businesses";

vi.mock("@/utils/axiosInstance", () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const {
  activityIssues,
  bankIssues,
  businessIssues,
  buildFullPayload,
  EMPTY_NEXXTAP_ONBOARDING,
  hydrateFromDraft,
  isValidAbn,
  nexxtapCardState,
  nexxtapFileIssue,
  ownersIssues,
  prefillFromBusiness,
  sectionPayload,
} = await import("@/lib/nexxtap");

function baseBusiness(overrides: Partial<BusinessProfile> = {}): BusinessProfile {
  return {
    id: "b1",
    name: "",
    email: "",
    abn: "",
    paid: true,
    tone: 0,
    logo: null,
    subscription: null,
    industryId: null,
    ndisNumber: "",
    accountingType: "",
    companyType: "",
    bank: { bsb: "", accountNumber: "", accountHolder: "", bankName: "" },
    address: { line1: "", city: "", state: "", postcode: "", country: "" },
    countryIso2: "AU",
    countryCode: "",
    mobile: "",
    firstName: "",
    middleName: "",
    lastName: "",
    companyName: "",
    documents: [],
    ...overrides,
  };
}

const profile = {
  user_id: "1",
  email: "owner@example.com",
  mobile_number: "0412 345 678",
  first_name: "Sam",
  last_name: "Turner",
  business_name: "Turner Consulting",
  company_name: "Turner Pty Ltd",
  abn: "51 824 753 556",
  address: {
    address_line1: "1 Home St",
    city: "Brisbane",
    state: "QLD",
    postcode: "4000",
    country: "Australia",
  },
  bank: {
    account_holder: "Sam Turner",
    bsb: "062-000",
    account_number: "1234 5678",
    bank_name: "CBA",
  },
};

describe("prefillFromBusiness", () => {
  it("prefers the business record over the user's profile", () => {
    const result = prefillFromBusiness(
      baseBusiness({
        name: "Acme Trading",
        abn: "11 111 111 111",
        email: "accounts@acme.test",
        mobile: "+61 400 000 000",
        firstName: "Alex",
        lastName: "Acme",
        address: {
          line1: "9 Shop Rd",
          city: "Sydney",
          state: "NSW",
          postcode: "2000",
          country: "Australia",
        },
        bank: {
          bsb: "112-233",
          accountNumber: "99887766",
          accountHolder: "Acme Trading",
          bankName: "NAB",
        },
      }),
      profile,
    );

    expect(result.business).toMatchObject({
      business_name: "Acme Trading",
      abn: "11111111111",
      contact_support_number: "61400000000",
      business_address: "9 Shop Rd",
      city: "Sydney",
      state: "New South Wales",
      post_code: "2000",
    });
    expect(result.applicant).toMatchObject({
      first_name: "Alex",
      last_name: "Acme",
      email: "accounts@acme.test",
    });
    expect(result.bank).toEqual({
      account_name: "Acme Trading",
      bsb: "112233",
      account_number: "99887766",
      bank_name: "NAB",
    });
  });

  it("fills what the business lacks from the user's profile", () => {
    const result = prefillFromBusiness(baseBusiness(), profile);

    expect(result.business).toMatchObject({
      business_name: "Turner Consulting",
      doing_business_as: "Turner Pty Ltd",
      abn: "51824753556",
      contact_support_number: "0412345678",
      business_address: "1 Home St",
      city: "Brisbane",
      state: "Queensland",
      post_code: "4000",
    });
    expect(result.applicant).toMatchObject({
      first_name: "Sam",
      last_name: "Turner",
      contact_number: "0412345678",
      email: "owner@example.com",
      address: "1 Home St",
    });
    expect(result.bank).toEqual({
      account_name: "Sam Turner",
      bsb: "062000",
      account_number: "12345678",
      bank_name: "CBA",
    });
  });

  it("still prefills from the profile when no business is loaded", () => {
    const result = prefillFromBusiness(null, profile);

    expect(result.business.business_name).toBe("Turner Consulting");
    expect(result.applicant.first_name).toBe("Sam");
    expect(result.applicant.email).toBe("owner@example.com");
  });

  it("never mixes an address or a bank account across the two sources", () => {
    const result = prefillFromBusiness(
      baseBusiness({
        address: { line1: "9 Shop Rd", city: "", state: "", postcode: "", country: "" },
        bank: { bsb: "112-233", accountNumber: "", accountHolder: "", bankName: "" },
      }),
      profile,
    );

    expect(result.business.business_address).toBe("9 Shop Rd");
    expect(result.business.city).toBe("");
    expect(result.bank.bsb).toBe("112233");
    expect(result.bank.account_number).toBe("");
  });

  it("lets the saved draft win over the prefill", () => {
    const prefill = prefillFromBusiness(baseBusiness(), profile);
    const state = hydrateFromDraft(
      { authorised_applicant_details: { first_name: "Jo", email: "" } },
      prefill,
    );

    expect(state.applicant.first_name).toBe("Jo");
    // An empty saved value doesn't blank out the prefill.
    expect(state.applicant.email).toBe("owner@example.com");
  });
});

describe("nexxtapCardState", () => {
  it("keeps an application whose first submit failed on Continue, not Update", () => {
    // Nexxtap issued an id but its submit never ran: documents were rejected.
    const card = nexxtapCardState({
      applicationId: "93",
      submitted: false,
      status: "needs_update",
      completion: 86,
    });
    expect(card.action).toBe("Continue onboarding");
  });

  it("asks for an update once Nexxtap has the application and wants changes", () => {
    const card = nexxtapCardState({
      applicationId: "93",
      submitted: true,
      status: "needs_update",
      completion: 100,
    });
    expect(card.action).toBe("Update application");
  });
});

describe("validation mirrors what Nexxtap and the service accept", () => {
  it("checks the ABN check digit, not just its length", () => {
    expect(isValidAbn("51 824 753 556")).toBe(true);
    expect(isValidAbn("51824753557")).toBe(false);
    const business = { ...EMPTY_NEXXTAP_ONBOARDING.business, abn: "12345678901" };
    expect(businessIssues(business).abn).toMatch(/not valid/);
  });

  it("takes 6–9 digit account numbers, the range both sides agree on", () => {
    const bank = { account_name: "A", bsb: "062-000", account_number: "", bank_name: "" };
    expect(bankIssues({ ...bank, account_number: "12345" }).account_number).toBeDefined();
    expect(bankIssues({ ...bank, account_number: "1234567890" }).account_number).toBeDefined();
    expect(bankIssues({ ...bank, account_number: "123 456 789" })).toEqual({});
  });

  it("sends typed formatting as digits only", () => {
    const state = {
      ...EMPTY_NEXXTAP_ONBOARDING,
      bank: { account_name: "A", bsb: "062-000", account_number: "1234 5678", bank_name: "" },
    };
    expect(sectionPayload("bank", state)).toEqual({
      account_name: "A",
      bsb: "062000",
      account_number: "12345678",
    });
    const full = buildFullPayload({
      ...state,
      business: { ...state.business, abn: "51 824 753 556" },
    }) as { business_information: { abn: string } };
    expect(full.business_information.abn).toBe("51824753556");
  });

  it("rejects dates that don't exist", () => {
    const owner = { ...EMPTY_NEXXTAP_ONBOARDING.applicant, residential_address: "x" };
    const issues = ownersIssues([{ ...owner, date_of_birth: "1990-02-31" } as never]);
    expect(issues["0.date_of_birth"]).toMatch(/doesn't exist/);
  });

  it("says so when turnover isn't a plain number", () => {
    const issues = activityIssues({
      ...EMPTY_NEXXTAP_ONBOARDING.activity,
      estimated_annual_turnover: "50,000",
    });
    expect(issues.estimated_annual_turnover).toMatch(/without commas/);
  });
});

describe("nexxtapFileIssue", () => {
  const pdfBytes = new TextEncoder().encode("%PDF-1.4\n...");

  it("accepts a real PDF", async () => {
    const file = new File([pdfBytes], "a.pdf", { type: "application/pdf" });
    expect(await nexxtapFileIssue(file)).toBeNull();
  });

  it("rejects a PDF whose content is something else", async () => {
    // The shape the broken Balance Sheet export had: JSON text named .pdf.
    const file = new File(['{"0":37,"1":80}'], "Balance Sheet.pdf", {
      type: "application/pdf",
    });
    expect(await nexxtapFileIssue(file)).toMatch(/looks damaged/);
  });

  it("rejects WebP, which Nexxtap refuses", async () => {
    const file = new File(["RIFF"], "a.webp", { type: "image/webp" });
    expect(await nexxtapFileIssue(file)).toMatch(/Only JPG/);
  });

  it("rejects an empty file", async () => {
    const file = new File([], "a.pdf", { type: "application/pdf" });
    expect(await nexxtapFileIssue(file)).toMatch(/empty/);
  });
});
