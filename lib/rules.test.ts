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
  conditionSentence,
  previewSentence,
  invalidRuleValues,
  isNumericComparison,
  ruleValueError,
  ruleIssues,
  filterRules,
  filterRuleCategories,
  emptyRuleDraft,
  draftFromRule,
  fetchRuleDetail,
  fetchRules,
  createRuleApi,
  updateRuleApi,
  deleteRuleApi,
  fetchRuleCategories,
  ruleComparesFor,
  syncRuleApi,
  fetchRuleSyncStats,
  syncProgressLabel,
  syncProgressPercent,
  signedSyncAmount,
  ALL_RULES_ID,
} = await import("@/lib/rules");

import type { Rule, RuleCategoryOption, RuleDraft } from "@/lib/rules";

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

function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: "1",
    categoryName: "Sales Income",
    accountCategoryName: "Income",
    ...draft(),
    ...overrides,
  };
}

/** A raw `getAll`/add/update/delete list row. */
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

/** A raw `get` (detail) row. */
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

describe("conditionSentence / previewSentence", () => {
  it("joins multiple values and reads the comparison as a verb phrase", () => {
    expect(
      conditionSentence({
        check: "Description",
        compare: "Contain",
        values: ["stripe", "paypal"],
      }),
    ).toBe('Description contains "stripe, paypal"');
  });

  it("falls back to an ellipsis with no values", () => {
    expect(
      conditionSentence({
        check: "Amount",
        compare: "Greater Than",
        values: [],
      }),
    ).toBe('Amount is greater than "…"');
  });

  it("reads the equal-to-or-above/below comparisons out in full", () => {
    expect(
      conditionSentence({
        check: "Amount",
        compare: "Greater Than Equal To",
        values: ["100"],
      }),
    ).toBe('Amount is greater than or equal to "100"');
    expect(
      conditionSentence({
        check: "Amount",
        compare: "Lesser Than Equal To",
        values: ["100"],
      }),
    ).toBe('Amount is less than or equal to "100"');
  });

  it("previewSentence reads as a full sentence with a placeholder value", () => {
    expect(
      previewSentence({
        check: "Description",
        compare: "Contain",
        values: [],
      }),
    ).toBe(
      'If transaction description contains "your value", then categorise it accordingly.',
    );
  });
});

describe("isNumericComparison / ruleValueError", () => {
  it("is numeric for Amount regardless of comparison", () => {
    expect(isNumericComparison("Amount", "Contain")).toBe(true);
  });

  it("is numeric for any of the four ordered comparisons regardless of check", () => {
    expect(isNumericComparison("Description", "Greater Than")).toBe(true);
    expect(isNumericComparison("Description", "Greater Than Equal To")).toBe(
      true,
    );
    expect(isNumericComparison("Description", "Lesser Than")).toBe(true);
    expect(isNumericComparison("Description", "Lesser Than Equal To")).toBe(
      true,
    );
  });

  it("is not numeric for Description + Contain", () => {
    expect(isNumericComparison("Description", "Contain")).toBe(false);
  });

  it("never blocks an empty value", () => {
    expect(ruleValueError("", "Amount", "Greater Than")).toBeUndefined();
  });

  it("rejects a non-numeric value on a numeric comparison", () => {
    expect(ruleValueError("abc", "Amount", "Greater Than")).toBe(
      "Enter a valid number — no letters or negatives.",
    );
  });

  it("accepts a decimal value on a numeric comparison", () => {
    expect(ruleValueError("100.50", "Amount", "Greater Than")).toBeUndefined();
  });

  it("never validates a non-numeric comparison as a number", () => {
    expect(ruleValueError("abc", "Description", "Contain")).toBeUndefined();
  });
});

describe("ruleComparesFor", () => {
  it("offers only Contain/Equal To for Description, in that order", () => {
    expect(ruleComparesFor("Description")).toEqual(["Contain", "Equal To"]);
  });

  it("offers the full numeric set for Amount, in that order", () => {
    expect(ruleComparesFor("Amount")).toEqual([
      "Equal To",
      "Greater Than",
      "Greater Than Equal To",
      "Lesser Than",
      "Lesser Than Equal To",
    ]);
  });
});

describe("ruleIssues", () => {
  it("passes a fully valid Credit draft", () => {
    expect(ruleIssues(draft())).toEqual([]);
  });

  it("requires a non-blank name, but a single character is valid — sole-webapp's own schema has no minimum length", () => {
    expect(ruleIssues(draft({ name: "" })).map((i) => i.key)).toContain(
      "name",
    );
    expect(ruleIssues(draft({ name: "   " })).map((i) => i.key)).toContain(
      "name",
    );
    expect(ruleIssues(draft({ name: "A" })).map((i) => i.key)).not.toContain(
      "name",
    );
  });

  it("requires at least one value", () => {
    expect(ruleIssues(draft({ values: [] })).map((i) => i.key)).toContain(
      "values",
    );
  });

  it("flags text values left behind when the check switches to Amount", () => {
    const issue = ruleIssues(
      draft({ check: "Amount", values: ["100", "uber eats"] }),
    ).find((i) => i.key === "values");
    expect(issue?.message).toContain("uber eats");
  });

  it("flags text values when the comparison switches to Greater Than", () => {
    expect(
      invalidRuleValues(
        draft({ compare: "Greater Than", values: ["stripe", "12.50"] }),
      ),
    ).toEqual(["stripe"]);
  });

  it("accepts numeric values for an Amount check", () => {
    expect(
      ruleIssues(draft({ check: "Amount", values: ["100", "12.50"] })),
    ).toEqual([]);
  });

  it("requires a category", () => {
    expect(ruleIssues(draft({ categoryId: "" })).map((i) => i.key)).toContain(
      "category",
    );
  });

  it("requires a client for a Credit rule, worded as 'client'", () => {
    const issues = ruleIssues(draft({ clientId: null, clientName: "" }));
    expect(issues.find((i) => i.key === "client")?.message).toBe(
      "Select a client for this rule.",
    );
  });

  it("requires a supplier for a Debit rule, worded as 'supplier'", () => {
    const issues = ruleIssues(
      draft({
        type: "Debit (expense)",
        clientId: null,
        clientName: "",
        assignName: "Office chair",
      }),
    );
    expect(issues.find((i) => i.key === "client")?.message).toBe(
      "Select a supplier for this rule.",
    );
  });

  it("does not require assignName for a Credit rule", () => {
    expect(
      ruleIssues(draft({ type: "Credit (income)", assignName: "" })),
    ).toEqual([]);
  });

  it("requires assignName for a Debit rule", () => {
    const issues = ruleIssues(
      draft({ type: "Debit (expense)", assignName: "" }),
    );
    expect(issues.find((i) => i.key === "assignName")?.message).toBe(
      "Enter the expense/asset name.",
    );
  });

  it("is satisfied once assignName is filled in for a Debit rule", () => {
    expect(
      ruleIssues(
        draft({ type: "Debit (expense)", assignName: "Office chair" }),
      ),
    ).toEqual([]);
  });
});

describe("filterRules", () => {
  const rules = [
    rule({ id: "1", name: "Stripe payouts", type: "Credit (income)" }),
    rule({
      id: "2",
      name: "Adobe subscription",
      type: "Debit (expense)",
      categoryName: "Software",
      accountCategoryName: "Expenses",
      check: "Description",
      compare: "Contain",
      values: ["adobe"],
    }),
  ];

  it("returns everything for 'All' and an empty query", () => {
    expect(filterRules(rules, "All", "").map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("filters to Credit-typed rules for 'Income'", () => {
    expect(filterRules(rules, "Income", "").map((r) => r.id)).toEqual(["1"]);
  });

  it("filters to Debit-typed rules for 'Expense'", () => {
    expect(filterRules(rules, "Expense", "").map((r) => r.id)).toEqual(["2"]);
  });

  it("matches the search term against the name", () => {
    expect(filterRules(rules, "All", "stripe").map((r) => r.id)).toEqual(["1"]);
  });

  it("matches the search term against the subcategory or category name", () => {
    expect(filterRules(rules, "All", "software").map((r) => r.id)).toEqual([
      "2",
    ]);
    expect(filterRules(rules, "All", "expenses").map((r) => r.id)).toEqual([
      "2",
    ]);
  });

  it("matches the search term against the condition sentence", () => {
    expect(filterRules(rules, "All", "adobe").map((r) => r.id)).toEqual(["2"]);
  });
});

describe("filterRuleCategories", () => {
  const categories: RuleCategoryOption[] = [
    { id: "1", name: "Sales Income", parentName: "Income" },
    { id: "2", name: "Accounts Receivable", parentName: "Income" },
    { id: "3", name: "General Income", parentName: "Income" },
    { id: "4", name: "Software", parentName: "Expenses" },
    { id: "5", name: "Bank Fees", parentName: "Assets" },
    { id: "6", name: "GST Receivable", parentName: "Assets" },
    { id: "7", name: "Accounts Payable", parentName: "Liabilities" },
    { id: "8", name: "Owner Capital Input", parentName: "Capital" },
    { id: "9", name: "Drawings", parentName: "Capital" },
  ];

  it("offers Income + Liabilities (+ the credit-side Capital entry) for a Credit rule", () => {
    const result = filterRuleCategories(categories, "Credit (income)");
    expect(result.map((c) => c.name)).toEqual([
      "Sales Income",
      "Accounts Payable",
      "Owner Capital Input",
    ]);
  });

  it("offers Expenses + Assets + Liabilities (+ the debit-side Capital entry) for a Debit rule", () => {
    const result = filterRuleCategories(categories, "Debit (expense)");
    expect(result.map((c) => c.name)).toEqual([
      "Software",
      "Bank Fees",
      "Accounts Payable",
      "Drawings",
    ]);
  });

  it("drops the Income blocklist (Accounts Receivable, General Income) even though they sit under an included parent", () => {
    const result = filterRuleCategories(categories, "Credit (income)");
    expect(result.map((c) => c.name)).not.toContain("Accounts Receivable");
    expect(result.map((c) => c.name)).not.toContain("General Income");
  });

  it("drops the Assets blocklist (GST Receivable) for a Debit rule", () => {
    const result = filterRuleCategories(categories, "Debit (expense)");
    expect(result.map((c) => c.name)).not.toContain("GST Receivable");
  });

  it("never offers the other side's single Capital entry", () => {
    expect(
      filterRuleCategories(categories, "Credit (income)").map((c) => c.name),
    ).not.toContain("Drawings");
    expect(
      filterRuleCategories(categories, "Debit (expense)").map((c) => c.name),
    ).not.toContain("Owner Capital Input");
  });

  it("matches parent and subcategory names case-insensitively", () => {
    const messyCase: RuleCategoryOption[] = [
      { id: "1", name: "sales income", parentName: "INCOME" },
    ];
    expect(filterRuleCategories(messyCase, "Credit (income)")).toHaveLength(1);
  });
});

describe("emptyRuleDraft / draftFromRule", () => {
  it("defaults to a valid-shaped, empty Credit draft", () => {
    expect(emptyRuleDraft()).toMatchObject({
      type: "Credit (income)",
      check: "Description",
      compare: "Contain",
      values: [],
      categoryId: "",
      clientId: null,
      clientName: "",
      assignName: "",
      gst: true,
    });
  });

  it("carries every editable field over from a real rule, independently of it (no shared array reference)", () => {
    const source = rule({ values: ["stripe"], assignName: "Office chair" });
    const result = draftFromRule(source);
    expect(result).toMatchObject({
      name: source.name,
      type: source.type,
      check: source.check,
      compare: source.compare,
      values: ["stripe"],
      categoryId: source.categoryId,
      clientId: source.clientId,
      clientName: source.clientName,
      assignName: "Office chair",
      gst: source.gst,
    });
    expect(result.values).not.toBe(source.values);
  });
});

describe("fetchRuleDetail", () => {
  it("POSTs an encrypted {id} body to the get endpoint", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { rule: apiDetailRow() } },
    });

    await fetchRuleDetail("1");

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.matchingRules.get);
    expect(decryptedFieldsFromBody(body)).toEqual({ id: "1" });
  });

  it("maps every field, including the JSON-array condition_val", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { rule: apiDetailRow() } },
    });

    const result = await fetchRuleDetail("1");

    expect(result).toMatchObject({
      id: "1",
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
    });
  });

  it("falls back to a single value when condition_val isn't JSON", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: { rule: apiDetailRow({ condition_val: "just one thing" }) },
      },
    });

    const result = await fetchRuleDetail("1");
    expect(result.values).toEqual(["just one thing"]);
  });

  it("maps GREATER EQUAL and LESSER EQUAL to their own distinct compare values — a lossless round trip, not collapsed to GREATER/LESSER", async () => {
    apiMock.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          rule: apiDetailRow({
            condition_type: "AMOUNT",
            condition: "GREATER EQUAL",
            condition_val: "100",
          }),
        },
      },
    });
    const greaterEqual = await fetchRuleDetail("1");
    expect(greaterEqual.check).toBe("Amount");
    expect(greaterEqual.compare).toBe("Greater Than Equal To");

    apiMock.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          rule: apiDetailRow({
            condition_type: "AMOUNT",
            condition: "LESSER EQUAL",
            condition_val: "100",
          }),
        },
      },
    });
    const lesserEqual = await fetchRuleDetail("1");
    expect(lesserEqual.check).toBe("Amount");
    expect(lesserEqual.compare).toBe("Lesser Than Equal To");
  });

  it("maps a Debit rule's real assign_name into assignName, not clientName", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          rule: apiDetailRow({
            transaction_type: "D",
            client: { id: 9001, name: "Acme Supplies" },
            assign_name: "Office chair",
          }),
        },
      },
    });

    const result = await fetchRuleDetail("1");
    expect(result.type).toBe("Debit (expense)");
    expect(result.clientName).toBe("Acme Supplies");
    expect(result.assignName).toBe("Office chair");
  });

  it("coerces gst_include from a truthy/falsy number", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { rule: apiDetailRow({ gst_include: 0 }) } },
    });
    const result = await fetchRuleDetail("1");
    expect(result.gst).toBe(false);
  });

  it("throws with the server's own message when not found", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Matching rule not found." },
    });
    await expect(fetchRuleDetail("999")).rejects.toThrow(
      "Matching rule not found.",
    );
  });
});

describe("fetchRules", () => {
  it("fetches the list with no params, then hydrates each row from its own detail", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          rules: [
            apiListRow({ id: 1 }),
            apiListRow({
              id: 2,
              name: "Adobe subscription",
              transaction_type: "D",
              client_name: "Acme Supplies",
              account_category_name: "Expenses",
              acccount_subcategory_name: "Software",
            }),
          ],
        },
      },
    });

    apiMock.post.mockImplementation((_url, body) => {
      const { id } = decryptedFieldsFromBody(body);
      if (id === "1") {
        return Promise.resolve({
          data: { success: true, data: { rule: apiDetailRow({ id: 1 }) } },
        });
      }
      return Promise.resolve({
        data: {
          success: true,
          data: {
            rule: apiDetailRow({
              id: 2,
              name: "Adobe subscription",
              transaction_type: "D",
              condition_val: '["adobe"]',
              account_subcategory_id: 700,
              client_id: 9001,
              client: { id: 9001, name: "Acme Supplies" },
              assign_name: "Design software",
            }),
          },
        },
      });
    });

    const result = await fetchRules();

    expect(apiMock.get).toHaveBeenCalledTimes(1);
    expect(apiMock.get.mock.calls[0][0]).toBe(apiRoutes.matchingRules.getAll);
    expect(apiMock.get.mock.calls[0][1]).toBeUndefined();

    expect(result).toHaveLength(2);
    // Row 1: detail's condition fields merged with the list row's display names.
    expect(result[0]).toMatchObject({
      id: "1",
      values: ["stripe"],
      categoryName: "Sales Income",
      accountCategoryName: "Income",
    });
    // Row 2: same merge, for the Debit row with its own assignName.
    expect(result[1]).toMatchObject({
      id: "2",
      type: "Debit (expense)",
      values: ["adobe"],
      categoryName: "Software",
      accountCategoryName: "Expenses",
      assignName: "Design software",
    });
  });

  it("treats a reported empty list as genuinely empty, not an error", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: false,
        message: "No matching rules found",
        data: { rules: [] },
      },
    });
    const result = await fetchRules();
    expect(result).toEqual([]);
  });

  it("keeps a row's list-projection fields if its own detail fetch fails", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { rules: [apiListRow({ id: 1 })] } },
    });
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Matching rule not found." },
    });

    const result = await fetchRules();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "1",
      name: "Stripe payouts",
      categoryName: "Sales Income",
      // Condition fields default, since the detail call that would carry
      // them failed.
      values: [],
    });
  });
});

describe("createRuleApi", () => {
  it("POSTs the encrypted draft fields, mapped to the real backend's vocabulary", async () => {
    apiMock.post.mockResolvedValueOnce({
      data: { success: true, data: { rules: [apiListRow()] } },
    });
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { rule: apiDetailRow() } },
    });

    await createRuleApi(draft());

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.matchingRules.add);
    expect(decryptedFieldsFromBody(body)).toEqual({
      transaction_type: "C",
      name: "Stripe payouts",
      condition_type: "DESCRIPTION",
      condition: "CONTAIN",
      condition_val: JSON.stringify(["stripe"]),
      account_subcategory_id: "501",
      client_id: "44231",
      assign_name: "",
      gst_include: 1,
    });
  });

  it("maps Amount's own 'equal to or above/below' comparisons to their own distinct codes, not collapsed to GREATER/LESSER", async () => {
    apiMock.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: { rules: [apiListRow({ transaction_type: "D" })] },
      },
    });
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: { rule: apiDetailRow({ transaction_type: "D" }) },
      },
    });

    await createRuleApi(
      draft({
        type: "Debit (expense)",
        check: "Amount",
        compare: "Greater Than Equal To",
        values: ["100"],
      }),
    );

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.condition_type).toBe("AMOUNT");
    expect(fields.condition).toBe("GREATER EQUAL");
  });

  it("sends the Debit-only assign_name for a Debit rule, and blanks it for Credit", async () => {
    apiMock.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: { rules: [apiListRow({ transaction_type: "D" })] },
      },
    });
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: { rule: apiDetailRow({ transaction_type: "D" }) },
      },
    });

    await createRuleApi(
      draft({ type: "Debit (expense)", assignName: "Office chair" }),
    );

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.transaction_type).toBe("D");
    expect(fields.assign_name).toBe("Office chair");
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "name is required." },
    });
    await expect(createRuleApi(draft())).rejects.toThrow("name is required.");
  });
});

describe("updateRuleApi", () => {
  it("POSTs the id alongside the same encrypted fields", async () => {
    apiMock.post.mockResolvedValueOnce({
      data: { success: true, data: { rules: [apiListRow()] } },
    });
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { rule: apiDetailRow() } },
    });

    await updateRuleApi("1", draft());

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.matchingRules.update);
    const fields = decryptedFieldsFromBody(body);
    expect(fields.id).toBe("1");
    expect(fields.name).toBe("Stripe payouts");
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Invalid client_id for this user." },
    });
    await expect(updateRuleApi("1", draft())).rejects.toThrow(
      "Invalid client_id for this user.",
    );
  });
});

describe("deleteRuleApi", () => {
  it("POSTs just the encrypted id", async () => {
    apiMock.post.mockResolvedValueOnce({
      data: { success: true, data: { rules: [] } },
    });

    const result = await deleteRuleApi("1");

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.matchingRules.delete);
    expect(decryptedFieldsFromBody(body)).toEqual({ id: "1" });
    expect(result).toEqual([]);
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Matching rule not found." },
    });
    await expect(deleteRuleApi("999")).rejects.toThrow(
      "Matching rule not found.",
    );
  });
});

describe("fetchRuleCategories", () => {
  it("flattens every subcategory, tagged with its parent category name", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          account_categories: [
            {
              account_category_id: 4,
              name: "Income",
              account_subcategories: [
                { account_subcategory_id: 501, name: "Sales Income" },
                { account_subcategory_id: 502, name: "Interest Income" },
              ],
            },
            {
              account_category_id: 1,
              name: "Expenses",
              account_subcategories: [
                { account_subcategory_id: 700, name: "Software" },
              ],
            },
          ],
        },
      },
    });

    const result = await fetchRuleCategories();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.accountCategory.list);
    expect(result).toEqual([
      { id: "501", name: "Sales Income", parentName: "Income" },
      { id: "502", name: "Interest Income", parentName: "Income" },
      { id: "700", name: "Software", parentName: "Expenses" },
    ]);
  });

  it("returns an empty list when the response carries none", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    expect(await fetchRuleCategories()).toEqual([]);
  });
});

describe("syncRuleApi", () => {
  it("sends an encrypted {rule_id} body for a single rule", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: { matched: 3, total_matched: 10, total_unmatched: 2 },
      },
    });

    const result = await syncRuleApi("1");

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.matchingRules.matchTransSync);
    expect(decryptedFieldsFromBody(body)).toEqual({ rule_id: "1" });
    expect(result).toEqual({ matched: 3, totalMatched: 10, totalUnmatched: 2 });
  });

  it("sends an encrypted empty body to run every rule at once", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: { matched: 8, total_matched: 8, total_unmatched: 0 },
      },
    });

    await syncRuleApi(null);

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields).toEqual({});
  });

  it("defaults every figure to 0 when the response carries none", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    const result = await syncRuleApi("1");
    expect(result).toEqual({ matched: 0, totalMatched: 0, totalUnmatched: 0 });
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: false,
        message: "user_id, business_id and tenant_id are required.",
      },
    });
    await expect(syncRuleApi(null)).rejects.toThrow(
      "user_id, business_id and tenant_id are required.",
    );
  });
});

describe("fetchRuleSyncStats", () => {
  it("maps the stats and the recently-matched transactions", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          auto_match_count: 12,
          matched: 20,
          unmatched: 5,
          total: 25,
          matched_details: [
            {
              id: 1,
              transaction_id: 501,
              description: "Stripe payout",
              amount: "430.00",
              type: "credit",
              client_name: "Acme Pty Ltd",
              category_name: "Owner Capital Input",
            },
            {
              id: 2,
              description: "McDonalds",
              amount: 22,
              type: "debit",
              client_name: null,
              category_name: "Inventory",
            },
          ],
        },
      },
    });

    const result = await fetchRuleSyncStats();

    expect(apiMock.get).toHaveBeenCalledWith(
      apiRoutes.matchingRules.matchTransSyncStats,
    );
    expect(result.autoMatchCount).toBe(12);
    expect(result.matched).toBe(20);
    expect(result.unmatched).toBe(5);
    expect(result.total).toBe(25);
    expect(result.recentlyMatched).toEqual([
      {
        id: "501",
        description: "Stripe payout",
        type: "credit",
        categoryName: "Owner Capital Input",
        clientName: "Acme Pty Ltd",
        amount: 430,
      },
      {
        id: "2",
        description: "McDonalds",
        type: "debit",
        categoryName: "Inventory",
        clientName: "",
        amount: 22,
      },
    ]);
  });

  it("falls back to the detail's own id when transaction_id is absent", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { matched_details: [{ id: 9, description: "x", amount: 1 }] },
      },
    });
    const result = await fetchRuleSyncStats();
    expect(result.recentlyMatched[0].id).toBe("9");
  });

  it("defaults every figure to 0 and the list to empty with no data at all", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    const result = await fetchRuleSyncStats();
    expect(result).toEqual({
      autoMatchCount: 0,
      matched: 0,
      unmatched: 0,
      total: 0,
      recentlyMatched: [],
    });
  });
});

describe("syncProgressPercent", () => {
  it("is matched/total as a percent to at most 2 decimals", () => {
    expect(syncProgressPercent({ matched: 1, total: 4 })).toBe(25);
    expect(syncProgressPercent({ matched: 14, total: 10759 })).toBe(0.13);
    expect(syncProgressPercent({ matched: 337, total: 882 })).toBe(38.21);
  });

  it("is 0 when total is 0, not NaN or Infinity", () => {
    expect(syncProgressPercent({ matched: 0, total: 0 })).toBe(0);
  });
});

describe("syncProgressLabel", () => {
  it("shows up to 2 decimals, only when needed", () => {
    expect(syncProgressLabel({ matched: 1, total: 4 })).toBe("25%");
    expect(syncProgressLabel({ matched: 1, total: 3 })).toBe("33.33%");
    expect(syncProgressLabel({ matched: 337, total: 882 })).toBe("38.21%");
    expect(syncProgressLabel({ matched: 14, total: 10759 })).toBe("0.13%");
  });

  it("never shows 0% once something has matched", () => {
    expect(syncProgressLabel({ matched: 1, total: 1_000_000 })).toBe("<0.01%");
  });

  it("never shows 100% while anything is left", () => {
    expect(syncProgressLabel({ matched: 999_999, total: 1_000_000 })).toBe(
      ">99.99%",
    );
  });

  it("is 0% for none and 100% for all", () => {
    expect(syncProgressLabel({ matched: 0, total: 10759 })).toBe("0%");
    expect(syncProgressLabel({ matched: 0, total: 0 })).toBe("0%");
    expect(syncProgressLabel({ matched: 5, total: 5 })).toBe("100%");
  });
});

describe("signedSyncAmount", () => {
  it("prefixes a credit with +", () => {
    expect(signedSyncAmount({ type: "credit", amount: 430 })).toBe("+$430.00");
  });

  it("prefixes a debit with -, using the absolute value", () => {
    expect(signedSyncAmount({ type: "debit", amount: -22 })).toBe("-$22.00");
  });
});

describe("ALL_RULES_ID", () => {
  it("is a stable sentinel, distinct from any real rule id", () => {
    expect(ALL_RULES_ID).toBe("__all__");
  });
});
