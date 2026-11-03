import { describe, expect, it, vi, beforeEach } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
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

// Imported after the mock so `lib/rules.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  ruleCategoryParent,
  filterRuleCategories,
  fetchRuleDetail,
  fetchRules,
  createRuleApi,
  updateRuleApi,
  fetchRuleSyncStats,
  syncRuleApi,
} = await import("@/lib/rules");

import type { RuleCategoryOption, RuleDraft } from "@/lib/rules";

function decryptedFieldsFromBody(body: unknown): Record<string, unknown> {
  const asData = body as { data?: string };
  if (typeof asData?.data !== "string") {
    throw new Error("Body was not an encrypted {data} envelope");
  }
  return decryptPayload(asData.data);
}

beforeEach(() => {
  vi.clearAllMocks();
});

function draft(overrides: Partial<RuleDraft> = {}): RuleDraft {
  return {
    name: "Stripe payouts",
    type: "Credit (income)",
    check: "Description",
    compare: "Contain",
    values: ["stripe"],
    categoryId: "501",
    clientId: "44231",
    clientName: "Williams Health Services",
    assignName: "",
    gst: true,
    ...overrides,
  };
}

function apiListRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Stripe payouts",
    transaction_type: "C",
    client_name: "Williams Health Services",
    account_category_id: 4,
    account_category_name: "Income",
    acccount_subcategory_name: "Sales Income",
    ...overrides,
  };
}

function apiDetailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Stripe payouts",
    transaction_type: "C",
    condition_type: "DESCRIPTION",
    condition: "CONTAIN",
    condition_val: '["stripe"]',
    account_subcategory_id: 501,
    client_id: 44231,
    assign_name: "",
    gst_include: 1,
    client: { id: 44231, name: "Williams Health Services" },
    ...overrides,
  };
}

/** Mocks a create/update response (one list row) plus its per-row detail fetch. */
function mockMutationResponse() {
  apiMock.post.mockResolvedValueOnce({
    data: { success: true, data: { rules: [apiListRow()] } },
  });
  apiMock.post.mockResolvedValue({
    data: { success: true, data: { rule: apiDetailRow() } },
  });
}

describe("ruleCategoryParent", () => {
  it("maps each local rule category to its transaction category type", () => {
    expect(ruleCategoryParent("Sales income")).toBe("Income");
    expect(ruleCategoryParent("Consulting income")).toBe("Income");
    expect(ruleCategoryParent("Software")).toBe("Expense");
    expect(ruleCategoryParent("Rent")).toBe("Expense");
    expect(ruleCategoryParent("Office supplies")).toBe("Expense");
    expect(ruleCategoryParent("Disposal of asset")).toBe("Asset");
  });

  it("falls back to Expense for an unknown category rather than undefined", () => {
    expect(ruleCategoryParent("Not a category" as never)).toBe("Expense");
  });
});

describe("filterRuleCategories — the rest of the documented blocklists", () => {
  it("drops every Income-side exclusion for a Credit rule", () => {
    const categories: RuleCategoryOption[] = [
      { id: "1", name: "Account Receivable", parentName: "Income" },
      { id: "2", name: "Accounts Receivable", parentName: "Income" },
      { id: "3", name: "Service Income", parentName: "Income" },
      { id: "4", name: "Sales Revenue", parentName: "Income" },
      { id: "5", name: "General Income", parentName: "Income" },
      { id: "6", name: "Consulting Income", parentName: "Income" },
    ];
    expect(
      filterRuleCategories(categories, "Credit (income)").map((c) => c.name),
    ).toEqual(["Consulting Income"]);
  });

  it("drops every Assets-side exclusion for a Debit rule", () => {
    const categories: RuleCategoryOption[] = [
      { id: "1", name: "Accounts Receivable", parentName: "Assets" },
      { id: "2", name: "Account Receivable", parentName: "Assets" },
      { id: "3", name: "Accumulated Depreciation", parentName: "Assets" },
      { id: "4", name: "GST Receivable", parentName: "Assets" },
      { id: "5", name: "Motor Vehicles", parentName: "Assets" },
    ];
    expect(
      filterRuleCategories(categories, "Debit (expense)").map((c) => c.name),
    ).toEqual(["Motor Vehicles"]);
  });

  it("applies no exclusions within Liabilities, for either type", () => {
    const categories: RuleCategoryOption[] = [
      { id: "1", name: "GST Payable", parentName: "Liabilities" },
      { id: "2", name: "Accounts Receivable", parentName: "Liabilities" },
    ];
    expect(filterRuleCategories(categories, "Credit (income)")).toHaveLength(2);
    expect(filterRuleCategories(categories, "Debit (expense)")).toHaveLength(2);
  });

  it("drops every other Capital subcategory for both types", () => {
    const categories: RuleCategoryOption[] = [
      { id: "1", name: "Retained Earnings", parentName: "Capital" },
      { id: "2", name: "Owner Capital Input", parentName: "Capital" },
      { id: "3", name: "Drawings", parentName: "Capital" },
    ];
    expect(
      filterRuleCategories(categories, "Credit (income)").map((c) => c.name),
    ).toEqual(["Owner Capital Input"]);
    expect(
      filterRuleCategories(categories, "Debit (expense)").map((c) => c.name),
    ).toEqual(["Drawings"]);
  });

  it("doesn't offer Expenses/Assets to a Credit rule, or Income to a Debit rule", () => {
    const categories: RuleCategoryOption[] = [
      { id: "1", name: "Software", parentName: "Expenses" },
      { id: "2", name: "Motor Vehicles", parentName: "Assets" },
      { id: "3", name: "Consulting Income", parentName: "Income" },
    ];
    expect(
      filterRuleCategories(categories, "Credit (income)").map((c) => c.name),
    ).toEqual(["Consulting Income"]);
    expect(
      filterRuleCategories(categories, "Debit (expense)").map((c) => c.name),
    ).toEqual(["Software", "Motor Vehicles"]);
  });

  it("trims surrounding whitespace on both parent and subcategory names", () => {
    const categories: RuleCategoryOption[] = [
      { id: "1", name: "  General Income ", parentName: " Income  " },
      { id: "2", name: " Drawings ", parentName: "  Capital " },
      { id: "3", name: "Software", parentName: " expenses " },
    ];
    expect(filterRuleCategories(categories, "Credit (income)")).toEqual([]);
    expect(
      filterRuleCategories(categories, "Debit (expense)").map((c) => c.id),
    ).toEqual(["2", "3"]);
  });
});

describe("fetchRuleDetail — remaining condition/gst mappings", () => {
  it.each([
    ["EQUAL", "Equal To"],
    ["GREATER", "Greater Than"],
    ["GREATER EQUAL", "Greater Than Equal To"],
    ["LESSER", "Lesser Than"],
    ["LESSER EQUAL", "Lesser Than Equal To"],
    ["CONTAIN", "Contain"],
  ])("reads condition %s back as %s", async (condition, compare) => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { rule: apiDetailRow({ condition }) } },
    });
    expect((await fetchRuleDetail("1")).compare).toBe(compare);
  });

  it("round-trips every check/compare pair losslessly — nothing collapses any more", async () => {
    const pairs = [
      ["Description", "Contain"],
      ["Description", "Equal To"],
      ["Amount", "Equal To"],
      ["Amount", "Greater Than"],
      ["Amount", "Greater Than Equal To"],
      ["Amount", "Lesser Than"],
      ["Amount", "Lesser Than Equal To"],
    ] as const;

    for (const [check, compare] of pairs) {
      apiMock.post.mockReset();
      mockMutationResponse();
      await createRuleApi(draft({ check, compare, values: ["1"] }));
      // Index 0, since the reset just above means this iteration's create
      // call is the first one recorded — the detail-hydration call that
      // follows it inside `createRuleApi` lands at index 1.
      const sent = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);

      apiMock.post.mockReset();
      apiMock.post.mockResolvedValue({
        data: {
          success: true,
          data: {
            rule: apiDetailRow({
              condition_type: sent.condition_type,
              condition: sent.condition,
            }),
          },
        },
      });
      const read = await fetchRuleDetail("1");
      expect([read.check, read.compare]).toEqual([check, compare]);
    }
  });

  it("is true for gst only when gst_include numerically equals 1", async () => {
    for (const [raw, expected] of [
      ["1", true],
      [true, true],
      [1, true],
      [2, false],
      ["0", false],
      [false, false],
    ] as const) {
      apiMock.post.mockResolvedValue({
        data: { success: true, data: { rule: apiDetailRow({ gst_include: raw }) } },
      });
      expect((await fetchRuleDetail("1")).gst).toBe(expected);
    }
  });

  it("throws the generic fallback when the server gives no message", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false } });
    await expect(fetchRuleDetail("1")).rejects.toThrow("Rule not found.");
  });

  it("throws even on success:true when no rule came back", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    await expect(fetchRuleDetail("1")).rejects.toThrow("Rule not found.");
  });
});

describe("fetchRules — never gates on success", () => {
  it("still hydrates the rows when the envelope reports success:false", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: false, data: { rules: [apiListRow()] } },
    });
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { rule: apiDetailRow() } },
    });

    const rules = await fetchRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].values).toEqual(["stripe"]);
  });

  it("is an empty list rather than throwing when the response has no data at all", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    expect(await fetchRules()).toEqual([]);
    expect(apiMock.post).not.toHaveBeenCalled();
  });
});

describe("createRuleApi / updateRuleApi — remaining wire mappings", () => {
  it("trims each value and drops blank ones from condition_val", async () => {
    mockMutationResponse();
    await createRuleApi(draft({ values: ["  stripe ", "", "   ", "payout"] }));
    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.condition_val).toBe(JSON.stringify(["stripe", "payout"]));
  });

  it("trims the rule name", async () => {
    mockMutationResponse();
    await createRuleApi(draft({ name: "  Stripe payouts  " }));
    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.name).toBe("Stripe payouts");
  });

  it("sends gst_include 0 when GST is off", async () => {
    mockMutationResponse();
    await createRuleApi(draft({ gst: false }));
    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.gst_include).toBe(0);
  });

  it.each([
    ["Amount", "Equal To", "AMOUNT", "EQUAL"],
    ["Amount", "Greater Than", "AMOUNT", "GREATER"],
    ["Amount", "Greater Than Equal To", "AMOUNT", "GREATER EQUAL"],
    ["Amount", "Lesser Than", "AMOUNT", "LESSER"],
    ["Amount", "Lesser Than Equal To", "AMOUNT", "LESSER EQUAL"],
    ["Description", "Contain", "DESCRIPTION", "CONTAIN"],
    ["Description", "Equal To", "DESCRIPTION", "EQUAL"],
  ] as const)(
    "maps %s / %s to %s / %s",
    async (check, compare, conditionType, condition) => {
      mockMutationResponse();
      await createRuleApi(draft({ check, compare, values: ["100"] }));
      const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
      expect(fields.condition_type).toBe(conditionType);
      expect(fields.condition).toBe(condition);
    },
  );

  it("blanks assign_name for a Credit rule even if one was typed", async () => {
    mockMutationResponse();
    await createRuleApi(draft({ assignName: "Leftover from a Debit edit" }));
    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.assign_name).toBe("");
  });

  it("sends update through POST, never PATCH", async () => {
    mockMutationResponse();
    await updateRuleApi("7", draft());
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.matchingRules.update);
    expect(apiMock.patch).not.toHaveBeenCalled();
  });
});

describe("syncRuleApi — the generic failure message", () => {
  it("falls back to a generic message when the server gives none", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false } });
    await expect(syncRuleApi(null)).rejects.toThrow("Failed to sync rules.");
  });
});

describe("fetchRuleSyncStats — remaining defaults", () => {
  it("defaults type to debit for anything that isn't exactly 'credit'", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          matched_details: [
            { id: 1, amount: 1, type: "CREDIT" },
            { id: 2, amount: 1, type: null },
            { id: 3, amount: 1 },
            { id: 4, amount: 1, type: "credit" },
          ],
        },
      },
    });
    const result = await fetchRuleSyncStats();
    expect(result.recentlyMatched.map((r) => r.type)).toEqual([
      "debit",
      "debit",
      "debit",
      "credit",
    ]);
  });

  it("still maps the figures when the envelope reports success:false", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: false, data: { matched: 3, total: 4 } },
    });
    const result = await fetchRuleSyncStats();
    expect(result.matched).toBe(3);
    expect(result.total).toBe(4);
  });

  it("reads a non-numeric amount as 0", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { matched_details: [{ id: 1, amount: "abc", type: "debit" }] },
      },
    });
    expect((await fetchRuleSyncStats()).recentlyMatched[0].amount).toBe(0);
  });
});
