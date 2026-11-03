/**
 * A client refund's bank fields follow the business's country: Australia
 * asks for a BSB and a 6–10 digit account number exactly as it always has;
 * New Zealand has no BSB at all, and its one account number is checked
 * against its own format.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/axiosInstance", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const { FALLBACK_COUNTRY_CONTEXT, mapCountryContext } =
  await import("@/lib/country-context");
const {
  AU_REFUND_BANK_RULES,
  emptyRefundDraft,
  refundBankRules,
  refundIssues,
} = await import("@/lib/refunds");

const AU = FALLBACK_COUNTRY_CONTEXT;

const NZ = mapCountryContext({
  country_iso2: "NZ",
  country_name: "New Zealand",
  currency: "NZD",
  locale: "en-NZ",
  tax: { type: "GST", standard_rate: 15, standard_code: "GST", rates: [] },
  labels: { tax: "GST", business_id: "NZBN", bank_branch: null },
  bank_account_schema: [
    {
      key: "account_number",
      label: "Account number",
      required: true,
      pattern: "^\\d{2}-?\\d{4}-?\\d{7}-?\\d{2,3}$",
      mask: "99-9999-9999999-999",
    },
  ],
});

/** A complete refund apart from the bank fields under test. */
function draftWith(bank: { bsb: string; accountNumber: string }) {
  return {
    ...emptyRefundDraft("CRN-1", "2026-10-01"),
    clientName: "Harbourline Studio",
    amount: "110",
    gstAmount: "10.00",
    bank: { accountName: "Harbourline Studio", ...bank },
  };
}

const bankIssues = (
  draft: ReturnType<typeof draftWith>,
  rules?: Parameters<typeof refundIssues>[2],
) =>
  refundIssues(draft, "GST", rules).filter((issue) =>
    ["bsb", "accountNumber"].includes(issue.key),
  );

describe("refundIssues — Australia (the default)", () => {
  it("still requires a BSB when no rules are passed", () => {
    expect(
      bankIssues(draftWith({ bsb: "", accountNumber: "12345678" })),
    ).toEqual([{ key: "bsb", message: "Enter a BSB." }]);
  });

  it("keeps the 6-digit BSB and 6–10 digit account rules and wording", () => {
    expect(bankIssues(draftWith({ bsb: "083", accountNumber: "123" }))).toEqual(
      [
        { key: "bsb", message: "BSB must be 6 digits." },
        {
          key: "accountNumber",
          message: "Account number must be 6 to 10 digits.",
        },
      ],
    );
    expect(bankIssues(draftWith({ bsb: "", accountNumber: "" }))).toEqual([
      { key: "bsb", message: "Enter a BSB." },
      { key: "accountNumber", message: "Enter an account number." },
    ]);
    expect(
      bankIssues(draftWith({ bsb: "083-004", accountNumber: "12345678" })),
    ).toEqual([]);
  });

  it("gives identical results from the AU country context", () => {
    const rules = refundBankRules(AU);
    expect(rules.branch?.label).toBe("BSB");
    expect(rules.branch?.hint).toBe(AU_REFUND_BANK_RULES.branch?.hint);
    expect(rules.branch?.placeholder).toBe("083-004");
    expect(rules.account.hint).toBe("6 to 10 digits.");
    for (const bank of [
      { bsb: "", accountNumber: "" },
      { bsb: "083", accountNumber: "123" },
      { bsb: "083-004", accountNumber: "1234-5678" },
      { bsb: "083004", accountNumber: "12345678" },
    ]) {
      expect(refundIssues(draftWith(bank), "GST", rules)).toEqual(
        refundIssues(draftWith(bank), "GST"),
      );
    }
  });

  it("asks for nothing on a credit note", () => {
    const draft = {
      ...draftWith({ bsb: "", accountNumber: "" }),
      type: "Credit note" as const,
    };
    expect(bankIssues(draft)).toEqual([]);
  });
});

describe("refundIssues — New Zealand", () => {
  const rules = refundBankRules(NZ);

  it("has no BSB field at all", () => {
    expect(rules.branch).toBeNull();
    expect(
      bankIssues(
        draftWith({ bsb: "", accountNumber: "12-3456-7890123-00" }),
        rules,
      ),
    ).toEqual([]);
  });

  it("accepts the NZ account format, with or without dashes", () => {
    expect(
      bankIssues(
        draftWith({ bsb: "", accountNumber: "123456789012300" }),
        rules,
      ),
    ).toEqual([]);
    expect(
      bankIssues(
        draftWith({ bsb: "", accountNumber: "01-0123-0123456-001" }),
        rules,
      ),
    ).toEqual([]);
  });

  it("rejects an Australian-shaped account number, in NZ terms", () => {
    const issues = bankIssues(
      draftWith({ bsb: "", accountNumber: "12345678" }),
      rules,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].key).toBe("accountNumber");
    expect(issues[0].message).toContain("00-0000-0000000-000");
    expect(issues[0].message).not.toMatch(/BSB/);
  });

  it("still requires the account number", () => {
    expect(
      bankIssues(draftWith({ bsb: "", accountNumber: "" }), rules),
    ).toEqual([{ key: "accountNumber", message: "Enter an account number." }]);
  });

  it("describes the field in NZ terms for the form", () => {
    expect(rules.account.label).toBe("Account number");
    expect(rules.account.placeholder).toBe("00-0000-0000000-000");
    expect(rules.account.hint).toBe("In the form 00-0000-0000000-000.");
  });
});
