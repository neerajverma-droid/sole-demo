import { describe, expect, it, vi } from "vitest";

import {
  EMPTY_BANK_DETAILS,
  EMPTY_BUSINESS_DETAILS,
  bankDetailsFrom,
  businessDetailsFrom,
} from "@/lib/business-settings";
import type { BusinessProfile } from "@/lib/businesses";

vi.mock("@/utils/axiosInstance", () => ({ default: { post: vi.fn() } }));

/** A full record, as `mapApiBusiness` produces one. */
function profile(overrides: Partial<BusinessProfile> = {}): BusinessProfile {
  return {
    id: "7",
    name: "Turner Consulting",
    email: "hi@turner.com.au",
    abn: "12 345 678 901",
    paid: true,
    tone: 0,
    logo: null,
    subscription: null,
    industryId: 15,
    ndisNumber: "",
    accountingType: "cash",
    companyType: "Sole trader",
    bank: {
      bsb: "083-004",
      accountNumber: "12345678",
      accountHolder: "Turner Consulting",
      bankName: "ANZ",
    },
    address: {
      line1: "14 Latrobe St",
      city: "Melbourne",
      state: "VIC",
      postcode: "3000",
      country: "AU",
    },
    countryIso2: "AU",
    countryCode: "+61",
    mobile: "0400 000 000",
    firstName: "Dana",
    middleName: "",
    lastName: "Turner",
    companyName: "",
    documents: [],
    ...overrides,
  };
}

/**
 * These used to come out of a store that invented them — "Jonathan's Firm",
 * ABN 12 345 678 901, a Melbourne address — for every account, on every
 * device, regardless of which business was open. The point of these tests is
 * that what the form shows is now whatever the server said, and nothing else.
 */
describe("businessDetailsFrom", () => {
  it("reads the open business's own record", () => {
    expect(businessDetailsFrom(profile())).toEqual({
      businessName: "Turner Consulting",
      abn: "12 345 678 901",
      industryId: 15,
      companyType: "Sole trader",
      // The one-line value the Places search box opens on, composed the same
      // way a document prints the address.
      addressSearch: "14 Latrobe St, Melbourne VIC 3000, AU",
      addressLine1: "14 Latrobe St",
      city: "Melbourne",
      state: "VIC",
      postcode: "3000",
      country: "AU",
      // `country_code` and `mobile_no` are stored apart and rejoined for the
      // one field the form edits.
      phone: "+61400000000",
      email: "hi@turner.com.au",
      ndisNumber: "",
    });
  });

  it("is empty when no business is open, rather than invented", () => {
    // A form that arrives already filled with plausible details is one nobody
    // corrects — which is exactly how the old sample profile survived.
    expect(businessDetailsFrom(null)).toEqual(EMPTY_BUSINESS_DETAILS);
  });

  it("blanks the placeholder name the mapper uses for an unnamed business", () => {
    // `mapApiBusiness` falls back to "Untitled business" for display. Putting
    // that in an editable field would have people save it as their real name.
    expect(businessDetailsFrom(profile({ name: "Untitled business" })).businessName).toBe("");
  });

  it("carries a null industry through rather than guessing one", () => {
    // The old store defaulted to "Professional services", which is what put a
    // wrong industry on Finance businesses — see use-active-business-industry.
    expect(businessDetailsFrom(profile({ industryId: null })).industryId).toBeNull();
  });
});

describe("bankDetailsFrom", () => {
  it("reads the payout account off the record", () => {
    expect(bankDetailsFrom(profile())).toEqual({
      accountName: "Turner Consulting",
      bankName: "ANZ",
      bsb: "083-004",
      accountNumber: "12345678",
    });
  });

  it("is empty with no business open", () => {
    expect(bankDetailsFrom(null)).toEqual(EMPTY_BANK_DETAILS);
  });
});
