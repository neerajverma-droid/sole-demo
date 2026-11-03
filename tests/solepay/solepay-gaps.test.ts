import { describe, expect, it, vi } from "vitest";

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
  SOLEPAY_STEPS,
  actionsRequired,
  requiredDocumentSlots,
  stepsDone,
} = await import("@/lib/solepay");

import type { SolePayDocuments, SolePayOnboarding } from "@/lib/solepay";

const uploaded = { name: "file.pdf", uploadedAt: "2026-01-01" };

const allDocuments: SolePayDocuments = {
  "id-front": uploaded,
  "id-back": uploaded,
  "settlement-statement": uploaded,
  "billing-statement": null,
  "trust-agreement": null,
};

function completeState(overrides: Partial<SolePayOnboarding> = {}): SolePayOnboarding {
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
    documents: allDocuments,
    ...overrides,
  };
}

describe("stepsDone — derived from the answers, Overview always counted", () => {
  it("is only Overview for a brand-new, empty onboarding", () => {
    expect(stepsDone(EMPTY_SOLEPAY_ONBOARDING)).toEqual(["overview"]);
  });

  it("is every step, in tracker order, once everything is answered", () => {
    expect(stepsDone(completeState())).toEqual([
      "overview",
      "entity",
      "directors",
      "accounts",
      "documents",
    ]);
  });

  it("leaves out just the step that's incomplete, without unticking the ones after it", () => {
    const state = completeState({
      director: { ...completeState().director, idNumber: "" },
    });
    expect(stepsDone(state)).toEqual(["overview", "entity", "accounts", "documents"]);
  });

  it("re-checks documents against the entity type — a Trustee also needs the trust agreement", () => {
    const state = completeState({
      entity: { ...completeState().entity, type: "4" },
    });
    expect(stepsDone(state)).not.toContain("documents");
  });

  it("re-checks documents against billing mirroring — un-mirrored billing needs its own statement", () => {
    const base = completeState();
    const state = completeState({
      bankAccounts: {
        ...base.bankAccounts,
        billingSameAsSettlement: false,
        billing: { accountName: "Billing Co", bsb: "062000", accountNumber: "22222222" },
      },
    });
    const done = stepsDone(state);
    expect(done).toContain("accounts");
    expect(done).not.toContain("documents");
  });
});

describe("actionsRequired — the header pill's count", () => {
  it("is every step but Overview for an empty onboarding", () => {
    expect(actionsRequired(EMPTY_SOLEPAY_ONBOARDING)).toBe(SOLEPAY_STEPS.length - 1);
    expect(actionsRequired(EMPTY_SOLEPAY_ONBOARDING)).toBe(4);
  });

  it("is 0 once every step is complete", () => {
    expect(actionsRequired(completeState())).toBe(0);
  });

  it("counts each incomplete step once", () => {
    const state = completeState({ documents: { ...allDocuments, "id-back": null } });
    expect(actionsRequired(state)).toBe(1);
  });
});

describe("requiredDocumentSlots — doc vs source", () => {
  // docs/testing-coverage.md says Billing Bank Statement is unconditional and
  // the Settlement statement drops away when accounts are mirrored. The source
  // (and lib/solepay.test.ts) does the opposite: settlement is always required,
  // billing drops when mirrored. Unverified against sole-webapp's WorldpayDocuments.js.
  it.todo(
    "requires billing-statement unconditionally and drops settlement-statement when mirrored (per doc; source does the reverse)",
  );

  it("currently: settlement is always required, billing only when not mirrored", () => {
    expect(requiredDocumentSlots(true, "1", "1")).toEqual([
      "id-front",
      "settlement-statement",
      "id-back",
    ]);
    expect(requiredDocumentSlots(false, "1", "1")).toEqual([
      "id-front",
      "settlement-statement",
      "id-back",
      "billing-statement",
    ]);
  });
});
