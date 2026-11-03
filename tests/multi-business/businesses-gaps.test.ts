import { describe, expect, it, vi, beforeEach } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
import apiRoutes from "@/config/api-routes";
import type { BusinessProfile } from "@/lib/businesses";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// Imported after the mock so `lib/businesses.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  BUSINESS_TONES,
  businessCountLabel,
  businessInitials,
  businessLocked,
  businessPaymentHref,
  businessPlanLabel,
  businessRenewalLabel,
  businessStatus,
  businessTone,
  createBusinessApi,
  deleteBusinessApi,
  fetchBusinesses,
  fetchBusinessDetail,
  formatBusinessAddress,
  hasBusinessAddress,
  setBusinessDefaultApi,
  updateBusinessApi,
  updateBusinessShowBankDetailsApi,
} = await import("@/lib/businesses");

const BASE_DRAFT = {
  email: "hello@harbourline.com.au",
  businessName: "Harbourline Studio",
  abn: "72 629 951 766",
  industry: "Finance",
  accountingBasis: "Cash",
  businessType: "Sole trader",
  companyName: "",
  firstName: "Jane",
  middleName: "",
  lastName: "Citizen",
  phone: "+61411111111",
  ndisNumber: "",
  bankName: "",
  bsb: "",
  accountHolder: "",
  accountNumber: "",
  addressSearch: "18 Cremorne St, Richmond VIC 3121, Australia",
  addressLine1: "18 Cremorne Street",
  country: "Australia",
  city: "Richmond",
  state: "VIC",
  postcode: "3121",
};

function decryptedFieldsFromBody(body: unknown): Record<string, unknown> {
  if (body instanceof FormData) {
    const data = body.get("data");
    if (typeof data !== "string") throw new Error("FormData had no 'data' field");
    return decryptPayload(data);
  }
  const asData = body as { data?: string };
  if (typeof asData?.data !== "string") {
    throw new Error("Body was neither FormData nor a {data} envelope");
  }
  return decryptPayload(asData.data);
}

beforeEach(() => {
  vi.clearAllMocks();
});

function business(overrides: Partial<BusinessProfile> = {}): BusinessProfile {
  return {
    id: "32807",
    name: "Harbourline Studio",
    email: "hello@harbourline.com.au",
    abn: "72 629 951 766",
    paid: true,
    tone: 0,
    logo: null,
    subscription: null,
    industryId: 6,
    ndisNumber: "",
    accountingType: "cash",
    companyType: "solo_traders",
    bank: { bsb: "", accountNumber: "", accountHolder: "", bankName: "" },
    address: {
      line1: "18 Cremorne Street",
      city: "Richmond",
      state: "VIC",
      postcode: "3121",
      country: "Australia",
    },
    countryIso2: "AU",
    countryCode: "+61",
    mobile: "411111111",
    firstName: "Jane",
    middleName: "",
    lastName: "Citizen",
    companyName: "",
    documents: [],
    ...overrides,
  };
}

async function listOne(row: Record<string, unknown>) {
  apiMock.get.mockResolvedValue({ data: { success: true, data: [{ id: 1, ...row }] } });
  return (await fetchBusinesses()).businesses[0];
}

describe("businessStatus / businessLocked", () => {
  it("reads Active/unlocked when paid, Payment required/locked otherwise", () => {
    expect(businessStatus(business({ paid: true }))).toBe("Active");
    expect(businessLocked(business({ paid: true }))).toBe(false);
    expect(businessStatus(business({ paid: false }))).toBe("Payment required");
    expect(businessLocked(business({ paid: false }))).toBe(true);
  });
});

describe("businessTone / businessInitials", () => {
  it("wraps the tone index via modulo, for any tone value", () => {
    expect(BUSINESS_TONES).toHaveLength(4);
    expect(businessTone(business({ tone: 0 }))).toBe(BUSINESS_TONES[0]);
    expect(businessTone(business({ tone: 5 }))).toBe(BUSINESS_TONES[1]);
    expect(businessTone(business({ tone: 4_000_000_003 }))).toBe(BUSINESS_TONES[3]);
  });

  it("takes up to two initials from the name", () => {
    expect(businessInitials(business({ name: "Harbourline Studio Pty Ltd" }))).toBe("HS");
    expect(businessInitials(business({ name: "" }))).toBe("?");
  });
});

describe("formatBusinessAddress", () => {
  it("joins suburb/state/postcode with spaces, then the parts with commas", () => {
    expect(formatBusinessAddress(business())).toBe(
      "18 Cremorne Street, Richmond VIC 3121, Australia",
    );
  });

  it("drops empty parts without stray punctuation", () => {
    expect(
      formatBusinessAddress(
        business({ address: { line1: "", city: "", state: "VIC", postcode: "3121", country: "" } }),
      ),
    ).toBe("VIC 3121");
    expect(
      formatBusinessAddress(
        business({ address: { line1: "", city: "", state: "", postcode: "", country: "" } }),
      ),
    ).toBe("");
  });

  it("is blank for no business", () => {
    expect(formatBusinessAddress(null)).toBe("");
  });
});

describe("hasBusinessAddress — postcode alone doesn't count", () => {
  it("is false when only the postcode is filled in", () => {
    expect(
      hasBusinessAddress(
        business({ address: { line1: "", city: "", state: "", postcode: "3121", country: "" } }),
      ),
    ).toBe(false);
  });
});

describe("subscription labels", () => {
  it("businessPlanLabel is Free without a subscription", () => {
    expect(businessPlanLabel(business())).toBe("Free");
  });

  it("businessPlanLabel names the tier from the pricing catalogue, with the cycle", () => {
    expect(
      businessPlanLabel(
        business({
          subscription: { packageId: "advanced", cycle: "monthly", price: 30, renews: "" },
        }),
      ),
    ).toBe("Advanced (Monthly)");
    expect(
      businessPlanLabel(
        business({
          subscription: { packageId: "unknown-tier", cycle: "annual", price: 30, renews: "" },
        }),
      ),
    ).toBe("Plan (Annual)");
  });

  it("businessRenewalLabel formats the renewal date, null without one", () => {
    expect(businessRenewalLabel(business())).toBeNull();
    expect(
      businessRenewalLabel(
        business({
          subscription: { packageId: "pro", cycle: "monthly", price: 1, renews: "" },
        }),
      ),
    ).toBeNull();
    expect(
      businessRenewalLabel(
        business({
          subscription: { packageId: "pro", cycle: "monthly", price: 1, renews: "2026-10-02" },
        }),
      ),
    ).toBe("Renews 2 Oct 2026");
  });
});

describe("businessPaymentHref / businessCountLabel", () => {
  it("points at the add-business payment step, with the id encoded", () => {
    expect(businessPaymentHref(business({ id: "a b&c" }))).toBe(
      "/businesses/new?business=a%20b%26c&step=payment",
    );
  });

  it("pluralises the count", () => {
    expect(businessCountLabel(1)).toBe("1 business");
    expect(businessCountLabel(0)).toBe("0 businesses");
    expect(businessCountLabel(3)).toBe("3 businesses");
  });
});

describe("mapApiBusiness (via fetchBusinesses) — the paid truth table", () => {
  it.each([
    [true, true, true],
    [true, false, false],
    [false, true, true],
    [false, false, true],
    [undefined, undefined, true],
  ])("requires_payment %s + is_default %s → paid %s", async (requires_payment, is_default, paid) => {
    expect((await listOne({ requires_payment, is_default })).paid).toBe(paid);
  });
});

describe("mapApiBusiness (via fetchBusinesses) — remaining fields", () => {
  it("prefers address_line1, falling back to the legacy address column only when blank", async () => {
    expect((await listOne({ address_line1: "1 New St", address: "Old St" })).address.line1).toBe(
      "1 New St",
    );
    expect((await listOne({ address_line1: "  ", address: "Old St" })).address.line1).toBe(
      "Old St",
    );
  });

  it("has no subscription without a plan_slug, even when other fields are present", async () => {
    const mapped = await listOne({
      subscription: { plan_name: "Pro", monthly_price: 20, current_period_end: "2026-10-02" },
    });
    expect(mapped.subscription).toBeNull();
  });

  it("maps a subscription as monthly always, preferring the effective price", async () => {
    const mapped = await listOne({
      subscription: {
        plan_slug: "pro",
        monthly_price: 40,
        effective_monthly_price: 32,
        current_period_end: "2026-10-02",
      },
    });
    expect(mapped.subscription).toEqual({
      packageId: "pro",
      cycle: "monthly",
      price: 32,
      renews: "2026-10-02",
    });

    const fallback = await listOne({ subscription: { plan_slug: "pro", monthly_price: 40 } });
    expect(fallback.subscription).toEqual({
      packageId: "pro",
      cycle: "monthly",
      price: 40,
      renews: "",
    });
  });

  it("falls back from business_name to company_name, then the person's name, then Untitled", async () => {
    expect((await listOne({ business_name: " ", company_name: "Acme Pty Ltd" })).name).toBe(
      "Acme Pty Ltd",
    );
    expect((await listOne({ first_name: "Jane" })).name).toBe("Jane");
    expect((await listOne({})).name).toBe("Untitled business");
  });

  it("shows bank details on invoices unless explicitly turned off", async () => {
    expect((await listOne({})).showBankDetailsOnInvoice).toBe(true);
    expect((await listOne({ show_bank_detail_invoice: null })).showBankDetailsOnInvoice).toBe(true);
    expect((await listOne({ show_bank_detail_invoice: 1 })).showBankDetailsOnInvoice).toBe(true);
    expect((await listOne({ show_bank_detail_invoice: 0 })).showBankDetailsOnInvoice).toBe(false);
    expect((await listOne({ show_bank_detail_invoice: false })).showBankDetailsOnInvoice).toBe(
      false,
    );
  });

  it("trims text fields, uppercases the ISO country, and numbers the industry id", async () => {
    const mapped = await listOne({
      business_email: " a@b.co ",
      country_iso2: "au",
      industry_id: "6",
      bsb: " 083-004 ",
      documents: [{ id: 9, source_type: "logo", file_path: "https://x/logo.png", file_name: "logo.png" }],
    });
    expect(mapped.email).toBe("a@b.co");
    expect(mapped.countryIso2).toBe("AU");
    expect(mapped.industryId).toBe(6);
    expect(mapped.bank.bsb).toBe("083-004");
    expect(mapped.documents).toEqual([
      { id: "9", sourceType: "logo", filePath: "https://x/logo.png", fileName: "logo.png" },
    ]);
  });

  it("reads a missing or non-numeric industry id as null", async () => {
    expect((await listOne({})).industryId).toBeNull();
    expect((await listOne({ industry_id: "abc" })).industryId).toBeNull();
  });

  it("gives the same id the same tone every time", async () => {
    const a = await listOne({ id: 777 });
    const b = await listOne({ id: 777 });
    expect(a.tone).toBe(b.tone);
    expect(Number.isInteger(a.tone)).toBe(true);
  });
});

describe("fetchBusinesses — defaultId and the empty case", () => {
  it("is an empty list with a null defaultId when there's nothing (no success check)", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    expect(await fetchBusinesses()).toEqual({ businesses: [], defaultId: null });
  });

  it("falls back to the first entry after sorting when none is flagged default", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { id: 1, business_name: "Locked", requires_payment: true },
          { id: 2, business_name: "Usable" },
        ],
      },
    });
    const { businesses, defaultId } = await fetchBusinesses();
    expect(businesses.map((b) => b.id)).toEqual(["2", "1"]);
    expect(defaultId).toBe("2");
  });

  it("keeps the API order among equal ties (stable sort)", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { id: 3, business_name: "C" },
          { id: 1, business_name: "A" },
          { id: 2, business_name: "B" },
        ],
      },
    });
    expect((await fetchBusinesses()).businesses.map((b) => b.id)).toEqual(["3", "1", "2"]);
  });
});

describe("setBusinessDefaultApi / deleteBusinessApi — never inspect the response", () => {
  it("resolves even on a success:false body", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: false, message: "Nope" } });
    await expect(setBusinessDefaultApi("1")).resolves.toBeUndefined();

    apiMock.delete.mockResolvedValue({ data: { success: false, message: "Nope" } });
    await expect(deleteBusinessApi("1")).resolves.toBeUndefined();
  });
});

describe("fetchBusinessDetail — checks data, not success", () => {
  it("returns the record even on success:false when data is present", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, data: { id: 1 } } });
    expect(await fetchBusinessDetail("1")).toEqual({ id: 1 });
  });
});

describe("buildBusinessRequestBody — remaining field mapping", () => {
  async function sentFields(draft: Partial<typeof BASE_DRAFT>, industryId: number | null = 6) {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });
    await createBusinessApi({ ...BASE_DRAFT, ...draft }, industryId, undefined);
    return decryptedFieldsFromBody(apiMock.post.mock.calls.at(-1)![1]);
  }

  it("falls back to solo_traders (not pvt_company) for an unrecognised business type", async () => {
    expect((await sentFields({ businessType: "Cooperative" })).company_type).toBe("solo_traders");
  });

  it("sends accrual only for exactly 'Accrual'", async () => {
    expect((await sentFields({ accountingBasis: "Accrual" })).accounting_type).toBe("accrual");
    expect((await sentFields({ accountingBasis: "accrual" })).accounting_type).toBe("cash");
    expect((await sentFields({ accountingBasis: "Cash" })).accounting_type).toBe("cash");
  });

  it("sends blank optional fields as empty strings rather than omitting them", async () => {
    const fields = await sentFields({}, null);
    for (const key of [
      "company_name",
      "middle_name",
      "ndis_no",
      "bank_name",
      "bsb",
      "account_holder",
      "account_number",
    ]) {
      expect(fields).toHaveProperty(key, "");
    }
    expect(fields.industry_id).toBe("");
  });

  it("omits remove_profile_pic when nothing about the logo changes", async () => {
    expect(await sentFields({})).not.toHaveProperty("remove_profile_pic");
  });
});

describe("createBusinessApi / updateBusinessApi — generic failures", () => {
  it("throws on a nominal success with no data", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await expect(createBusinessApi(BASE_DRAFT, 6)).rejects.toThrow("Failed to create business");

    apiMock.patch.mockResolvedValue({ data: { success: true } });
    await expect(updateBusinessApi("1", BASE_DRAFT, 6)).rejects.toThrow(
      "Failed to update business",
    );
  });
});

describe("updateBusinessShowBankDetailsApi", () => {
  it("PATCHes just the encrypted show_bank_detail_invoice flag to businesses.update(id)", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });
    await updateBusinessShowBankDetailsApi("32807", true);
    const [url, body] = apiMock.patch.mock.calls[0];
    expect(url).toBe(apiRoutes.businesses.update("32807"));
    expect(decryptedFieldsFromBody(body)).toEqual({ show_bank_detail_invoice: 1 });

    await updateBusinessShowBankDetailsApi("32807", false);
    expect(decryptedFieldsFromBody(apiMock.patch.mock.calls[1][1])).toEqual({
      show_bank_detail_invoice: 0,
    });
  });

  it("throws the server's message, or a generic one", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: false, message: "Locked" } });
    await expect(updateBusinessShowBankDetailsApi("1", true)).rejects.toThrow("Locked");
    apiMock.patch.mockResolvedValue({ data: { success: false } });
    await expect(updateBusinessShowBankDetailsApi("1", true)).rejects.toThrow(
      "Couldn't update the bank details setting.",
    );
  });
});
