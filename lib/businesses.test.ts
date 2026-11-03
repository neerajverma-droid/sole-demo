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
  createBusinessApi,
  updateBusinessApi,
  deleteBusinessApi,
  setBusinessDefaultApi,
  fetchBusinesses,
  fetchBusinessDetail,
  logoDocumentId,
  logoFileName,
  hasBusinessAddress,
  hasBankDetails,
} = await import("@/lib/businesses");

/** A full, valid draft — individual fields overridden per test as needed. */
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
  // Realistic value: PhoneInput always stores the dial code first (typing a
  // bare national number without one first isn't a state it produces).
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

/** Decrypts whatever body a call sent, whether it's a bare `{data}` object or a FormData carrying one. */
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

describe("creating a business", () => {
  it("POSTs an encrypted body to businesses.create", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { id: 501, business_name: "Harbourline Studio" } },
    });

    const created = await createBusinessApi(BASE_DRAFT, 6, undefined);

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.businesses.create);
    // No file: the whole thing travels as a plain {data} object, not FormData.
    expect(body).not.toBeInstanceOf(FormData);

    const fields = decryptedFieldsFromBody(body);
    expect(fields).toMatchObject({
      business_email: "hello@harbourline.com.au",
      business_name: "Harbourline Studio",
      abn: "72 629 951 766",
      industry_id: 6,
      company_type: "solo_traders",
      accounting_type: "cash",
      // The phone input's one display value split back into the two fields
      // the record stores separately.
      country_code: "+61",
      mobile_no: "411111111",
      address: BASE_DRAFT.addressSearch,
      address_line1: "18 Cremorne Street",
      city: "Richmond",
      state: "VIC",
      postcode: "3121",
    });

    expect(created).toEqual({ id: 501, business_name: "Harbourline Studio" });
  });

  it("sends the logo as a raw file alongside the encrypted fields, not inside them", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { id: 502 } },
    });
    const logoFile = new File(["fake-image-bytes"], "logo.png", { type: "image/png" });

    await createBusinessApi(BASE_DRAFT, 6, { file: logoFile });

    const [, body] = apiMock.post.mock.calls[0];
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect(form.get("profile_pic")).toBe(logoFile);
    // The rest of the fields are still encrypted into `data`, same as the no-file case.
    const fields = decryptedFieldsFromBody(form);
    expect(fields.business_name).toBe("Harbourline Studio");
  });

  it("maps every business type to a backend company_type", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });

    for (const [businessType, expected] of [
      ["Sole trader", "solo_traders"],
      ["Company", "pvt_company"],
      ["Partnership", "pvt_company"],
      ["Trust", "pvt_company"],
    ] as const) {
      await createBusinessApi({ ...BASE_DRAFT, businessType }, 6, undefined);
      const [, body] = apiMock.post.mock.calls.at(-1)!;
      expect(decryptedFieldsFromBody(body).company_type).toBe(expected);
    }
  });

  it("throws when the server reports failure, carrying its message", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "ABN already registered" },
    });

    await expect(createBusinessApi(BASE_DRAFT, 6, undefined)).rejects.toThrow(
      "ABN already registered",
    );
  });
});

describe("editing a business", () => {
  it("PATCHes an encrypted body to businesses.update(id)", async () => {
    apiMock.patch.mockResolvedValue({
      data: { success: true, data: { id: 32807, business_name: "Renamed Co" } },
    });

    const updated = await updateBusinessApi(
      "32807",
      { ...BASE_DRAFT, businessName: "Renamed Co" },
      6,
      undefined,
    );

    expect(apiMock.patch).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.patch.mock.calls[0];
    expect(url).toBe(apiRoutes.businesses.update("32807"));
    const fields = decryptedFieldsFromBody(body);
    expect(fields.business_name).toBe("Renamed Co");
    expect(updated.business_name).toBe("Renamed Co");
  });

  it("sends remove_profile_pic only when the logo is removed and not replaced", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true, data: { id: 1 } } });

    await updateBusinessApi("1", BASE_DRAFT, 6, { remove: true });
    let fields = decryptedFieldsFromBody(apiMock.patch.mock.calls.at(-1)![1]);
    expect(fields.remove_profile_pic).toBe("true");

    // Replacing supersedes removing — the new file wins, no removal sentinel.
    const logoFile = new File(["bytes"], "new-logo.png", { type: "image/png" });
    await updateBusinessApi("1", BASE_DRAFT, 6, { remove: true, file: logoFile });
    const secondBody = apiMock.patch.mock.calls.at(-1)![1] as FormData;
    expect(secondBody.get("profile_pic")).toBe(logoFile);
    fields = decryptedFieldsFromBody(secondBody);
    expect(fields.remove_profile_pic).toBeUndefined();
  });

  it("throws when the server reports failure", async () => {
    apiMock.patch.mockResolvedValue({
      data: { success: false, message: "Business not found" },
    });

    await expect(updateBusinessApi("999", BASE_DRAFT, 6, undefined)).rejects.toThrow(
      "Business not found",
    );
  });
});

describe("removing a business", () => {
  it("DELETEs with an encrypted empty body carried as the `data` config option", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });

    await deleteBusinessApi("32807");

    expect(apiMock.delete).toHaveBeenCalledTimes(1);
    const [url, config] = apiMock.delete.mock.calls[0];
    expect(url).toBe(apiRoutes.businesses.delete("32807"));
    expect(config.data).not.toBeInstanceOf(FormData);
    expect(typeof config.data.data).toBe("string");
    // An empty object encrypted, not an unencrypted `{}` or nothing at all.
    expect(decryptPayload(config.data.data)).toEqual({});
  });
});

describe("updating a business (set as default)", () => {
  it("PATCHes an encrypted empty body to businesses.setDefault(id)", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });

    await setBusinessDefaultApi("32807");

    expect(apiMock.patch).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.patch.mock.calls[0];
    expect(url).toBe(apiRoutes.businesses.setDefault("32807"));
    expect(decryptedFieldsFromBody(body)).toEqual({});
  });
});

describe("listing businesses", () => {
  it("maps the raw list, sorting usable-then-locked and default-first among ties", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { id: 1, business_name: "Locked Co", requires_payment: true, is_default: false },
          { id: 2, business_name: "Usable, not default", requires_payment: false, is_default: false },
          { id: 3, business_name: "Usable default", requires_payment: false, is_default: true },
        ],
      },
    });

    const { businesses, defaultId } = await fetchBusinesses();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.businesses.list);
    expect(businesses.map((b) => b.name)).toEqual([
      "Usable default",
      "Usable, not default",
      "Locked Co",
    ]);
    expect(businesses.find((b) => b.name === "Locked Co")?.paid).toBe(false);
    expect(defaultId).toBe("3");
  });

  it("treats a default business as usable even while it still requires payment", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [{ id: 9, business_name: "Grandfathered", requires_payment: true, is_default: true }],
      },
    });

    const { businesses } = await fetchBusinesses();
    expect(businesses[0].paid).toBe(true);
  });

  it("falls back through the name chain when business_name is blank", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [{ id: 1, first_name: "Jane", last_name: "Citizen" }],
      },
    });

    const { businesses } = await fetchBusinesses();
    expect(businesses[0].name).toBe("Jane Citizen");
  });
});

describe("fetching one business's detail", () => {
  it("returns the record on success", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { id: 32807, business_name: "Harbourline Studio" } },
    });

    const detail = await fetchBusinessDetail("32807");
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.businesses.detail("32807"));
    expect(detail.business_name).toBe("Harbourline Studio");
  });

  it("throws when the API returns no data", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    await expect(fetchBusinessDetail("does-not-exist")).rejects.toThrow(
      "Business not found",
    );
  });
});

describe("the logo's document id and filename", () => {
  const business = {
    id: 32807,
    logo: "https://s3.example.com/a.png",
    documents: [
      { id: 111, file_path: "https://s3.example.com/unrelated.pdf", file_name: "unrelated.pdf" },
      { id: 9336, file_path: "https://s3.example.com/a.png", file_name: "logo-original.png" },
    ],
  };

  it("matches the document whose file_path equals the logo url", () => {
    expect(logoDocumentId(business)).toBe("9336");
    expect(logoFileName(business)).toBe("logo-original.png");
  });

  it("returns null when there's no logo, or no matching document", () => {
    expect(logoDocumentId({ id: 1 })).toBeNull();
    expect(logoFileName({ id: 1 })).toBeNull();
    expect(logoDocumentId({ id: 1, logo: "https://s3.example.com/missing.png" })).toBeNull();
  });
});

/** A full, valid profile — individual fields overridden per test as needed. */
const BASE_BUSINESS: BusinessProfile = {
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
  bank: {
    bsb: "083-004",
    accountNumber: "12345678",
    accountHolder: "Jane Citizen",
    bankName: "Commonwealth Bank",
  },
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
};

describe("hasBusinessAddress", () => {
  it("is true when every address field is filled in", () => {
    expect(hasBusinessAddress(BASE_BUSINESS)).toBe(true);
  });

  it("is true when only one field is filled in — any one counts", () => {
    const empty = { line1: "", city: "", state: "", postcode: "", country: "" };
    expect(
      hasBusinessAddress({ ...BASE_BUSINESS, address: { ...empty, country: "Australia" } }),
    ).toBe(true);
    expect(
      hasBusinessAddress({ ...BASE_BUSINESS, address: { ...empty, state: "VIC" } }),
    ).toBe(true);
  });

  it("is false when address fields are blank or whitespace-only", () => {
    expect(
      hasBusinessAddress({
        ...BASE_BUSINESS,
        address: { line1: "  ", city: "", state: "", postcode: "", country: "" },
      }),
    ).toBe(false);
  });
});

describe("hasBankDetails", () => {
  it("is true when all four bank fields are filled in", () => {
    expect(hasBankDetails(BASE_BUSINESS)).toBe(true);
  });

  it("is false when any single field is missing — unlike the address, it's all or nothing", () => {
    expect(
      hasBankDetails({
        ...BASE_BUSINESS,
        bank: { ...BASE_BUSINESS.bank, accountHolder: "" },
      }),
    ).toBe(false);
    expect(
      hasBankDetails({
        ...BASE_BUSINESS,
        bank: { ...BASE_BUSINESS.bank, bankName: "   " },
      }),
    ).toBe(false);
    expect(
      hasBankDetails({
        ...BASE_BUSINESS,
        bank: { bsb: "", accountNumber: "", accountHolder: "", bankName: "" },
      }),
    ).toBe(false);
  });

  it("asks only for the account fields the business's country has", async () => {
    const { mapCountryContext } = await import("@/lib/country-context");
    const nz = mapCountryContext({
      country_iso2: "NZ",
      bank_account_schema: [{ key: "account_number", label: "Account number", required: true }],
    });
    const za = mapCountryContext({
      country_iso2: "ZA",
      bank_account_schema: [
        { key: "branch_code", label: "Branch code", required: true },
        { key: "account_number", label: "Account number", required: true },
      ],
    });
    // New Zealand has no BSB: its account number carries the bank and branch.
    const nzBank = { ...BASE_BUSINESS.bank, bsb: "", accountNumber: "01-0123-0123456-00" };
    expect(hasBankDetails({ ...BASE_BUSINESS, bank: nzBank }, nz)).toBe(true);
    // Judged as Australian (the default), the same record is missing its BSB.
    expect(hasBankDetails({ ...BASE_BUSINESS, bank: nzBank })).toBe(false);
    expect(hasBankDetails({ ...BASE_BUSINESS, bank: { ...nzBank, bankName: "" } }, nz)).toBe(false);
    // South Africa's branch code lives in the same column and is required.
    expect(hasBankDetails({ ...BASE_BUSINESS, bank: { ...BASE_BUSINESS.bank, bsb: "" } }, za)).toBe(false);
    expect(hasBankDetails(BASE_BUSINESS, za)).toBe(true);
  });
});

describe("creating a business in a chosen country", () => {
  it("sends country_iso2 and keeps the ABN as `abn` for Australia", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 601 } } });

    await createBusinessApi(BASE_DRAFT, 6, undefined, { iso2: "au", dialCode: "+61" });

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields).toMatchObject({ country_iso2: "AU", abn: "72 629 951 766", country_code: "+61" });
    expect(fields).not.toHaveProperty("business_registration_number");
  });

  it("sends a New Zealand NZBN as business_registration_number, with NZ's dial code", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 602 } } });

    await createBusinessApi(
      { ...BASE_DRAFT, abn: " 9429041535134 ", phone: "", country: "New Zealand" },
      6,
      undefined,
      { iso2: "NZ", dialCode: "+64" },
    );

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields).toMatchObject({
      country_iso2: "NZ",
      business_registration_number: "9429041535134",
      abn: "",
      country_code: "+64",
      mobile_no: "",
      country: "New Zealand",
    });
  });

  it("sends no country at all when none is given, as before", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 603 } } });

    await createBusinessApi(BASE_DRAFT, 6, undefined);

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields).not.toHaveProperty("country_iso2");
    expect(fields.abn).toBe("72 629 951 766");
  });
});
