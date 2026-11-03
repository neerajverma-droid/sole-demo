import { describe, expect, it, vi, beforeEach } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// Imported after the mock so `lib/solepay.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  EMPTY_SOLEPAY_ONBOARDING,
  accountsDone,
  accountsIssues,
  basisPointsToPercent,
  directorDone,
  directorInvalidIssues,
  directorIssues,
  documentsDone,
  entityDone,
  entityInvalidIssues,
  entityIssues,
  fetchSolePayDraft,
  formatDobForWire,
  formatSolePayAddress,
  isValidAustralianAbn,
  isValidSolePayPhone,
  parseDobFromWire,
  percentToBasisPoints,
  requiredDocumentSlots,
  saveSolePayDraft,
  submitSolePayDraft,
  uploadSolePayDocuments,
} = await import("@/lib/solepay");

import type { SolePayOnboarding } from "@/lib/solepay";

beforeEach(() => {
  vi.clearAllMocks();
});

function baseState(overrides: Partial<SolePayOnboarding> = {}): SolePayOnboarding {
  return {
    ...EMPTY_SOLEPAY_ONBOARDING,
    entity: {
      name: "Turner Consulting",
      legalName: "Turner Consulting Pty Ltd",
      abn: "51824753556",
      type: "1",
      email: "accounts@turnerconsulting.com.au",
      industry: "Professional Services",
      website: "turnerconsulting.com.au",
      phone: "+61412345678",
      transactionsFor: "Sales of goods and services",
      maxTransaction: "1000",
      avgTransaction: "500",
      transactionQty: "20",
      paidInArrears: false,
      daysInAdvance: "14",
    },
    address: {
      line1: "18 Cremorne Street",
      city: "Melbourne",
      state: "VIC",
      postcode: "3121",
      country: "Australia",
    },
    director: {
      firstName: "Michael",
      lastName: "Turner",
      email: "michael.turner@email.com",
      phone: "+61412345679",
      dateOfBirth: "1990-05-14",
      idType: "1",
      idNumber: "123456789",
      ownershipPercent: "25.3",
      licenceState: "VIC",
      cardNumber: "AB1234567",
      address: {
        line1: "18 Cremorne Street",
        city: "Melbourne",
        state: "VIC",
        postcode: "3121",
        country: "Australia",
      },
    },
    bankAccounts: {
      settlement: {
        accountName: "Turner Consulting Pty Ltd",
        bsb: "083004",
        accountNumber: "12345678",
      },
      billing: { accountName: "", bsb: "", accountNumber: "" },
      billingSameAsSettlement: true,
    },
    ...overrides,
  };
}

describe("percentToBasisPoints / basisPointsToPercent — ownership's wire round-trip", () => {
  it("converts a percent string to basis points, rounding to the nearest integer", () => {
    expect(percentToBasisPoints("25.3")).toBe("2530");
    expect(percentToBasisPoints("100")).toBe("10000");
    expect(percentToBasisPoints("0.01")).toBe("1");
  });

  it("is null for a blank or non-numeric value", () => {
    expect(percentToBasisPoints("")).toBeNull();
    expect(percentToBasisPoints("abc")).toBeNull();
  });

  it("converts basis points back to the shortest equivalent percent string", () => {
    expect(basisPointsToPercent("2530")).toBe("25.3");
    expect(basisPointsToPercent(10000)).toBe("100");
    expect(basisPointsToPercent("1")).toBe("0.01");
  });

  it("is '' for a missing or non-numeric basis-point value", () => {
    expect(basisPointsToPercent(null)).toBe("");
    expect(basisPointsToPercent(undefined)).toBe("");
    expect(basisPointsToPercent("")).toBe("");
  });

  it("round-trips without drift", () => {
    expect(basisPointsToPercent(percentToBasisPoints("33.33") ?? "")).toBe("33.33");
  });
});

describe("formatDobForWire / parseDobFromWire — YYYY-MM-DD <-> Worldpay's YYYYMMDD", () => {
  it("converts an ISO date to YYYYMMDD", () => {
    expect(formatDobForWire("1990-05-14")).toBe("19900514");
  });

  it("is null for anything that isn't a full date", () => {
    expect(formatDobForWire("")).toBeNull();
    expect(formatDobForWire("1990-05")).toBeNull();
  });

  it("converts YYYYMMDD back to an ISO date", () => {
    expect(parseDobFromWire("19900514")).toBe("1990-05-14");
  });

  it("is '' for anything that isn't 8 digits", () => {
    expect(parseDobFromWire(undefined)).toBe("");
    expect(parseDobFromWire("1990-05-14")).toBe("");
  });
});

describe("isValidAustralianAbn — the real modulus-89 checksum", () => {
  it("accepts a real, checksum-valid ABN", () => {
    expect(isValidAustralianAbn("51824753556")).toBe(true);
  });

  it("rejects a wrong length", () => {
    expect(isValidAustralianAbn("123")).toBe(false);
  });

  it("rejects an 11-digit number that fails the checksum", () => {
    expect(isValidAustralianAbn("12345678901")).toBe(false);
  });

  it("ignores spaces, the way an ABN is usually typed", () => {
    expect(isValidAustralianAbn("51 824 753 556")).toBe(true);
  });
});

describe("isValidSolePayPhone — Worldpay's own AU-specific rule", () => {
  it("accepts a real AU mobile in international format", () => {
    expect(isValidSolePayPhone("+61412345678")).toBe(true);
  });

  it("rejects an AU number carrying the local leading 0", () => {
    expect(isValidSolePayPhone("+610412345678")).toBe(false);
  });

  it("rejects a number with no country code", () => {
    expect(isValidSolePayPhone("0412345678")).toBe(false);
  });

  it("accepts a non-AU international number without the AU-specific check", () => {
    expect(isValidSolePayPhone("+14155552671")).toBe(true);
  });
});

describe("phone defaults to +61", () => {
  it("is +61 on a blank entity and a blank director, so the field never opens empty", () => {
    expect(EMPTY_SOLEPAY_ONBOARDING.entity.phone).toBe("+61");
    expect(EMPTY_SOLEPAY_ONBOARDING.director.phone).toBe("+61");
  });

  it("falls back to +61 when a fetched draft has no phone saved yet", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          draft_exists: true,
          entity: { name: "Turner Consulting" },
          member: { first: "Michael" },
          accounts: {},
          attachments: [],
          is_complete: false,
          grouped_missing: { entity: [], member: [], accounts: [], attachments: [] },
          grouped_invalid: { entity: [], member: [], accounts: [] },
        },
      },
    });

    const result = await fetchSolePayDraft();
    expect(result.state.entity.phone).toBe("+61");
    expect(result.state.director.phone).toBe("+61");
  });

  it("keeps the real saved number rather than overriding it", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          draft_exists: true,
          entity: { phone: "+61412345678" },
          member: { phone: "+61412345679" },
          accounts: {},
          attachments: [],
          is_complete: false,
        },
      },
    });

    const result = await fetchSolePayDraft();
    expect(result.state.entity.phone).toBe("+61412345678");
    expect(result.state.director.phone).toBe("+61412345679");
  });
});

describe("entityDone / directorDone / accountsDone / documentsDone", () => {
  it("is done once every real backend-required field is filled, website included", () => {
    const state = baseState();
    expect(entityDone(state.entity, state.address)).toBe(true);
  });

  it("is not done while website is blank — Worldpay's own required list includes it even though sole-webapp's form doesn't mark it required", () => {
    const state = baseState();
    expect(entityDone({ ...state.entity, website: "" }, state.address)).toBe(false);
  });

  it("director is done for a complete driving-licence record", () => {
    const state = baseState();
    expect(directorDone(state.director)).toBe(true);
  });

  it("director is NOT done without licenceState/cardNumber when idType is Driving Licence", () => {
    const state = baseState();
    expect(
      directorDone({ ...state.director, licenceState: "", cardNumber: "" }),
    ).toBe(false);
  });

  it("director IS done without licenceState/cardNumber when idType is Passport", () => {
    const state = baseState();
    expect(
      directorDone({
        ...state.director,
        idType: "2",
        licenceState: "",
        cardNumber: "",
      }),
    ).toBe(true);
  });

  it("accounts is done from settlement alone when billing is mirrored", () => {
    const state = baseState();
    expect(accountsDone(state.bankAccounts)).toBe(true);
  });

  it("accounts is NOT done when billing isn't mirrored and billing is blank", () => {
    const state = baseState();
    expect(
      accountsDone({ ...state.bankAccounts, billingSameAsSettlement: false }),
    ).toBe(false);
  });

  it("documents requires a trust agreement only for a Trustee entity (type '4')", () => {
    expect(requiredDocumentSlots(true, "1", "1")).not.toContain("trust-agreement");
    expect(requiredDocumentSlots(true, "4", "1")).toContain("trust-agreement");
  });

  it("documents requires identification back only for a Driving Licence (idType '1'), matching the backend's own getMissingFields rule", () => {
    expect(requiredDocumentSlots(true, "1", "1")).toContain("id-back");
    expect(requiredDocumentSlots(true, "1", "2")).not.toContain("id-back");
  });

  it("documentsDone reflects exactly the slots requiredDocumentSlots asks for", () => {
    const documents = {
      "id-front": { name: "front.png", uploadedAt: "2026-01-01" },
      "id-back": { name: "back.png", uploadedAt: "2026-01-01" },
      "settlement-statement": { name: "stmt.pdf", uploadedAt: "2026-01-01" },
      "billing-statement": null,
      "trust-agreement": null,
    } as const;
    expect(documentsDone(documents, true, "1", "1")).toBe(true);
    expect(documentsDone(documents, true, "4", "1")).toBe(false);
  });

  it("documentsDone doesn't wait on identification back for a Passport (idType '2')", () => {
    const documents = {
      "id-front": { name: "front.png", uploadedAt: "2026-01-01" },
      "id-back": null,
      "settlement-statement": { name: "stmt.pdf", uploadedAt: "2026-01-01" },
      "billing-statement": null,
      "trust-agreement": null,
    } as const;
    expect(documentsDone(documents, true, "1", "2")).toBe(true);
  });
});

describe("entityIssues / directorIssues / accountsIssues", () => {
  it("accepts any 11-digit ABN client-side, checksum included or not — matching sole-webapp's own EntitySchema (a plain /^\\d{11}$/ regex, not the checksum)", () => {
    const state = baseState();
    // A real, checksum-valid ABN and an 11-digit number that fails the
    // checksum both pass here — only Worldpay's own save response can tell
    // the two apart, via `entityInvalidIssues`.
    expect(entityIssues({ ...state.entity, abn: "12345678901" }, state.address).abn).toBeUndefined();
  });

  it("flags an ABN with the wrong digit count", () => {
    const state = baseState();
    expect(entityIssues({ ...state.entity, abn: "123" }, state.address).abn).toBeTruthy();
  });

  it("doesn't restrict address.state to the real 8 AU codes client-side — that's a backend-only check too", () => {
    const state = baseState();
    const issues = entityIssues(state.entity, { ...state.address, state: "CA" });
    expect(issues["address.state"]).toBeUndefined();
  });

  it("doesn't apply the AU-specific phone shape client-side — only a length floor", () => {
    const state = baseState();
    expect(entityIssues({ ...state.entity, phone: "+610412345678" }, state.address).phone).toBeUndefined();
    expect(entityIssues({ ...state.entity, phone: "123" }, state.address).phone).toBeTruthy();
  });

  it("requires licenceState/cardNumber only when idType is Driving Licence", () => {
    const state = baseState();
    const withPassport = directorIssues({
      ...state.director,
      idType: "2",
      licenceState: "",
      cardNumber: "",
    });
    expect(withPassport.licenceState).toBeUndefined();
    expect(withPassport.cardNumber).toBeUndefined();

    const withLicence = directorIssues({
      ...state.director,
      licenceState: "",
      cardNumber: "",
    });
    expect(withLicence.licenceState).toBeTruthy();
    expect(withLicence.cardNumber).toBeTruthy();
  });

  it("flags an ownership percent outside 0.01-100", () => {
    const state = baseState();
    expect(directorIssues({ ...state.director, ownershipPercent: "150" }).ownershipPercent).toBeTruthy();
    expect(directorIssues({ ...state.director, ownershipPercent: "0" }).ownershipPercent).toBeTruthy();
  });

  it("flags a BSB or account number with the wrong digit count", () => {
    const state = baseState();
    const issues = accountsIssues({
      ...state.bankAccounts,
      settlement: { ...state.bankAccounts.settlement, bsb: "12", accountNumber: "12" },
    });
    expect(issues["settlement.bsb"]).toMatch(/6-digit/);
    expect(issues["settlement.accountNumber"]).toMatch(/6–10 digit/);
  });

  it("skips billing entirely when it's mirrored", () => {
    const state = baseState();
    const issues = accountsIssues(state.bankAccounts);
    expect(Object.keys(issues).some((key) => key.startsWith("billing."))).toBe(false);
  });
});

describe("entityInvalidIssues / directorInvalidIssues — surfaced only from a real save response", () => {
  it("maps entity.abn/entity.state/entity.phone to their local keys, with the real sole-webapp wording", () => {
    const issues = entityInvalidIssues(["entity.abn", "entity.state", "entity.phone"]);
    expect(issues.abn).toMatch(/ABN/);
    expect(issues["address.state"]).toMatch(/ACT, NSW/);
    expect(issues.phone).toMatch(/international format/);
  });

  it("ignores an unrecognised field path rather than throwing", () => {
    expect(entityInvalidIssues(["entity.somethingElse"])).toEqual({});
  });

  it("is empty for an empty list — the common case, most saves have nothing invalid", () => {
    expect(entityInvalidIssues([])).toEqual({});
  });

  it("maps member.dob/ownership/state/phone/dlstate to their local keys", () => {
    const issues = directorInvalidIssues([
      "member.dob",
      "member.ownership",
      "member.state",
      "member.phone",
      "member.dlstate",
    ]);
    expect(issues.dateOfBirth).toBeTruthy();
    expect(issues.ownershipPercent).toMatch(/0.01 and 100/);
    expect(issues["address.state"]).toMatch(/ACT, NSW/);
    expect(issues.phone).toMatch(/international format/);
    expect(issues.licenceState).toMatch(/Driving licence/);
  });
});

describe("formatSolePayAddress", () => {
  it("joins the filled parts with a comma, dropping blanks", () => {
    const state = baseState();
    expect(formatSolePayAddress(state.address)).toBe(
      "18 Cremorne Street, Melbourne, VIC, 3121, Australia",
    );
  });
});

describe("fetchSolePayDraft — GET /worldpay/merchant/draft/status", () => {
  it("maps a real draft response into the local shape", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          draft_exists: true,
          entity: {
            name: "Turner Consulting",
            fulllegalname: "Turner Consulting Pty Ltd",
            abn: "51824753556",
            address1: "18 Cremorne Street",
            city: "Melbourne",
            state: "VIC",
            zip: "3121",
            country: "Australia",
            email: "accounts@turnerconsulting.com.au",
            type: 1,
            website: "turnerconsulting.com.au",
            phone: "+61412345678",
            transactionsFor: "Sales of goods and services",
            maxTransaction: 1000,
            avgTransaction: 500,
            qtyTransactions: 20,
            paidInArrears: false,
          },
          member: {
            first: "Michael",
            last: "Turner",
            email: "michael.turner@email.com",
            phone: "+61412345679",
            dob: "19900514",
            typeofid: 1,
            ownership: "2530",
            idnumber: "123456789",
            dlstate: "VIC",
            cardnumber: "AB1234567",
            address1: "18 Cremorne Street",
            city: "Melbourne",
            state: "VIC",
            zip: "3121",
            country: "Australia",
          },
          accounts: {
            settlement: {
              account: {
                accountnumber: "12345678",
                routing: "083004",
                accountname: "Turner Consulting Pty Ltd",
                accountType: 1,
              },
            },
            billing: null,
          },
          attachments: [
            {
              id: 1,
              file_name: "identification_front_id.png",
              file_path: "https://s3/id.png",
              created_at: "2026-01-05T00:00:00.000Z",
              kind: "identification_front",
            },
          ],
          is_complete: false,
          application_status: "pending",
          grouped_missing: { entity: [], member: [], accounts: [], attachments: ["attachments.identification_back"] },
          grouped_invalid: { entity: [], member: [], accounts: [] },
        },
      },
    });

    const result = await fetchSolePayDraft();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.worldpayOnboarding.getDraftStatus);
    expect(result.state.entity.legalName).toBe("Turner Consulting Pty Ltd");
    expect(result.state.entity.type).toBe("1");
    expect(result.state.director.ownershipPercent).toBe("25.3");
    expect(result.state.director.dateOfBirth).toBe("1990-05-14");
    expect(result.state.bankAccounts.settlement.bsb).toBe("083004");
    expect(result.state.bankAccounts.billingSameAsSettlement).toBe(true);
    expect(result.state.documents["id-front"]).toEqual({
      name: "identification_front_id.png",
      uploadedAt: "2026-01-05",
    });
    expect(result.meta.isComplete).toBe(false);
    expect(result.meta.groupedMissing.attachments).toEqual([
      "attachments.identification_back",
    ]);
  });

  it("maps a brand new account with no draft at all to the empty shape", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          draft_exists: false,
          missing: ["entity", "member", "accounts", "attachments"],
          invalid: [],
          grouped_invalid: { entity: [], member: [], accounts: [] },
          is_complete: false,
        },
      },
    });

    const result = await fetchSolePayDraft();
    expect(result.state.entity.name).toBe("");
    expect(result.meta.draftExists).toBe(false);
    expect(result.meta.isComplete).toBe(false);
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "Not authorized" } });
    await expect(fetchSolePayDraft()).rejects.toThrow("Not authorized");
  });
});

describe("saveSolePayDraft — POST /worldpay/merchant/draft, always the full state", () => {
  it("sends a plain JSON body (not the platform's usual encrypted envelope) with entity, address and accounts nested under entity.accounts", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { entity: {}, member: {}, accounts: {}, attachments: [], is_complete: false } },
    });

    const state = baseState();
    await saveSolePayDraft(state);

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.worldpayOnboarding.saveDraft);
    // A plain object, not an encrypted {data: "..."} envelope — the real
    // controller reads req.body directly with no decrypt step.
    expect(body).toMatchObject({
      entity: expect.objectContaining({
        name: "Turner Consulting",
        fulllegalname: "Turner Consulting Pty Ltd",
        abn: "51824753556",
        address1: "18 Cremorne Street",
        public: 1,
      }),
      Members: [expect.objectContaining({ first: "Michael", ownership: "2530" })],
    });
    expect(body.entity.accounts).toEqual([
      {
        account: {
          accountnumber: "12345678",
          routing: "083004",
          accountname: "Turner Consulting Pty Ltd",
          accountType: 1,
        },
      },
      {
        account: {
          accountnumber: "12345678",
          routing: "083004",
          accountname: "Turner Consulting Pty Ltd",
          accountType: 2,
        },
      },
    ]);
  });

  it("sends both settlement and a distinct billing account when they aren't mirrored", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { entity: {}, member: {}, accounts: {}, attachments: [], is_complete: false } },
    });

    const state = baseState({
      bankAccounts: {
        settlement: {
          accountName: "Settlement Co",
          bsb: "083004",
          accountNumber: "11111111",
        },
        billing: {
          accountName: "Billing Co",
          bsb: "062000",
          accountNumber: "22222222",
        },
        billingSameAsSettlement: false,
      },
    });
    await saveSolePayDraft(state);

    const body = apiMock.post.mock.calls[0][1];
    expect(body.entity.accounts).toEqual([
      { account: { accountnumber: "11111111", routing: "083004", accountname: "Settlement Co", accountType: 1 } },
      { account: { accountnumber: "22222222", routing: "062000", accountname: "Billing Co", accountType: 2 } },
    ]);
  });

  it("sends type, typeofid, and the transaction-volume fields as numbers — matching sole-webapp's own buildDraftPayload, not the local string state", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { entity: {}, member: {}, accounts: {}, attachments: [], is_complete: false } },
    });

    await saveSolePayDraft(baseState());

    const body = apiMock.post.mock.calls[0][1];
    expect(body.entity.type).toBe(1);
    expect(body.entity.maxTransaction).toBe(1000);
    expect(body.entity.avgTransaction).toBe(500);
    expect(body.entity.qtyTransactions).toBe(20);
    expect(body.Members[0].typeofid).toBe(1);
  });

  it("defaults typeofid to 1 (Driving Licence) rather than 0/NaN when idType is blank — matching sole-webapp's own `?? 1`", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { entity: {}, member: {}, accounts: {}, attachments: [], is_complete: false } },
    });

    const state = baseState();
    await saveSolePayDraft({
      ...state,
      director: { ...state.director, idType: "" },
    });

    expect(apiMock.post.mock.calls[0][1].Members[0].typeofid).toBe(1);
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Invalid ABN" } });
    await expect(saveSolePayDraft(baseState())).rejects.toThrow("Invalid ABN");
  });
});

describe("uploadSolePayDocuments — POST /worldpay/merchant/draft/attachments", () => {
  it("renames each file with the prefix the backend's inferAttachmentKind keys off, and returns only documents+meta", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          attachments: [
            {
              id: 1,
              file_name: "identification_front_photo.png",
              file_path: "https://s3/photo.png",
              created_at: "2026-01-05T00:00:00.000Z",
              kind: "identification_front",
            },
          ],
          is_complete: false,
          grouped_missing: { entity: [], member: [], accounts: [], attachments: [] },
          grouped_invalid: { entity: [], member: [], accounts: [] },
        },
      },
    });

    const file = new File(["x"], "photo.png", { type: "image/png" });
    const result = await uploadSolePayDocuments({ "id-front": file });

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.worldpayOnboarding.uploadDraftAttachments);
    expect(body).toBeInstanceOf(FormData);
    const uploaded = (body as FormData).get("files") as File;
    expect(uploaded.name).toBe("identification_front_photo.png");
    expect(result.documents["id-front"]).toEqual({
      name: "identification_front_photo.png",
      uploadedAt: "2026-01-05",
    });
    // No `state` on the result — the real response has no entity/member/
    // accounts keys, so mapping through the full draft shape would read
    // those as blank and wipe out everything already in the atom.
    expect((result as Record<string, unknown>).state).toBeUndefined();
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "File too large" } });
    await expect(uploadSolePayDocuments({ "id-front": new File(["x"], "a.png") })).rejects.toThrow(
      "File too large",
    );
  });

  it("uploads the settlement statement a second time under the billing prefix when billing mirrors settlement — Worldpay always requires a billing_bank_statement attachment", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          attachments: [],
          is_complete: false,
          grouped_missing: { entity: [], member: [], accounts: [], attachments: [] },
          grouped_invalid: { entity: [], member: [], accounts: [] },
        },
      },
    });

    const statement = new File(["x"], "statement.pdf", { type: "application/pdf" });
    await uploadSolePayDocuments({ "settlement-statement": statement }, true);

    const [, body] = apiMock.post.mock.calls[0];
    const uploaded = (body as FormData).getAll("files") as File[];
    expect(uploaded.map((f) => f.name)).toEqual([
      "settlement_bank_statement_statement.pdf",
      "billing_bank_statement_statement.pdf",
    ]);
  });

  it("does not duplicate the statement when billing doesn't mirror settlement", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          attachments: [],
          is_complete: false,
          grouped_missing: { entity: [], member: [], accounts: [], attachments: [] },
          grouped_invalid: { entity: [], member: [], accounts: [] },
        },
      },
    });

    const statement = new File(["x"], "statement.pdf", { type: "application/pdf" });
    await uploadSolePayDocuments({ "settlement-statement": statement }, false);

    const [, body] = apiMock.post.mock.calls[0];
    const uploaded = (body as FormData).getAll("files") as File[];
    expect(uploaded.map((f) => f.name)).toEqual(["settlement_bank_statement_statement.pdf"]);
  });
});

describe("submitSolePayDraft — POST /worldpay/merchant/draft/submit", () => {
  const authorization = { authorizedByName: "Jane Director", confirmed: true };

  it("posts the director's authorization and returns the merchant id", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { merchant_id: "mch_123" } },
    });

    const result = await submitSolePayDraft(authorization);

    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.worldpayOnboarding.submitDraft, {
      authorization,
    });
    expect(result.merchantId).toBe("mch_123");
  });

  it("throws with the server's own message when the draft isn't actually complete", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Missing required fields" },
    });
    await expect(submitSolePayDraft(authorization)).rejects.toThrow("Missing required fields");
  });
});
