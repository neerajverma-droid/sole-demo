import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";

/*
 * Companion to lib/planner-api.test.ts: the exports and branches that file
 * doesn't reach (see docs/testing-business-planner.md → Gaps). Same harness —
 * a hoisted axios mock and the module loaded after it.
 */
const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const {
  plannerToday,
  createGoal,
  updateGoal,
  deleteGoal,
  addGoalAllocation,
  removeGoalAllocation,
  toBudget,
  createBudget,
  updateBudget,
  deleteBudget,
  fetchBudgetExpenses,
  fetchPlans,
  savePlan,
  deletePlan,
  fetchCashWalletHistory,
  topUpCashWallet,
  setCashWalletBalance,
  fetchGoals,
} = await import("@/lib/planner-api");

import type { BudgetDraft, ExpensePlanDraft, GoalDraft } from "@/lib/planner";

/** The decrypted fields of an encrypted `{ data }` body. */
function sentFields(body: unknown): Record<string, unknown> {
  const envelope = body as { data?: string };
  if (typeof envelope?.data !== "string") {
    throw new Error("Body was not an encrypted { data } envelope");
  }
  return decryptPayload(envelope.data) as Record<string, unknown>;
}

/**
 * `fetchExpenseCategories` caches its promise at module level for the session,
 * so any test that depends on what that call does needs a fresh copy of the
 * module. The axios mock above stays registered across the reset.
 */
async function freshPlannerApi() {
  vi.resetModules();
  return import("@/lib/planner-api");
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

const GOAL_DRAFT: GoalDraft = {
  name: "  September BAS  ",
  type: "Tax set-aside",
  targetAmount: "6400.50",
  targetDate: "2026-10-28",
};

const API_GOAL = {
  id: 12,
  name: "September BAS",
  goal_type: "tax_set_aside",
  target_amount: "6400.50",
  target_date: "2026-10-28",
  created_at: "2026-07-01T09:13:00.000Z",
  computed_status: "on_track",
  allocations: [],
};

/* ------------------------------------------------------------------ *
 * plannerToday
 * ------------------------------------------------------------------ */

describe("plannerToday", () => {
  it("is the viewer's local calendar day, not the UTC one", () => {
    vi.useFakeTimers();
    // 11:30pm local on 30 June — in any zone east of UTC the UTC date is
    // still the 30th, and west of it already 1 July; local must win either way.
    vi.setSystemTime(new Date(2026, 5, 30, 23, 30));
    expect(plannerToday()).toBe("2026-06-30");

    vi.setSystemTime(new Date(2026, 6, 1, 0, 15));
    expect(plannerToday()).toBe("2026-07-01");
  });
});

/* ------------------------------------------------------------------ *
 * Goal writes
 * ------------------------------------------------------------------ */

describe("createGoal / updateGoal / deleteGoal", () => {
  it("createGoal POSTs the four goal fields, trimmed and typed, and maps the reply", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: API_GOAL } });

    const goal = await createGoal(GOAL_DRAFT);

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.plannerGoal.add);
    expect(sentFields(body)).toEqual({
      name: "September BAS",
      goal_type: "tax_set_aside",
      target_amount: 6400.5,
      target_date: "2026-10-28",
    });
    expect(goal).toMatchObject({ id: "12", type: "Tax set-aside", computedStatus: "On track" });
  });

  it("createGoal resolves an id-less goal, rather than throwing, when the reply has no data", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "nope" } });

    const goal = await createGoal(GOAL_DRAFT);

    expect(goal.id).toBe("");
    expect(goal.allocations).toEqual([]);
  });

  it("updateGoal PUTs the same payload to the goal's own URL", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true, data: API_GOAL } });

    const goal = await updateGoal("12", GOAL_DRAFT);

    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(apiRoutes.plannerGoal.update("12"));
    expect(sentFields(body)).toEqual({
      name: "September BAS",
      goal_type: "tax_set_aside",
      target_amount: 6400.5,
      target_date: "2026-10-28",
    });
    expect(goal.id).toBe("12");
  });

  it("deleteGoal DELETEs the goal's URL with no body", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });

    await deleteGoal("12");

    expect(apiMock.delete).toHaveBeenCalledWith(apiRoutes.plannerGoal.delete("12"));
  });
});

describe("goal allocations", () => {
  it("removeGoalAllocation DELETEs the allocation and returns the recomputed goal", async () => {
    apiMock.delete.mockResolvedValue({
      data: { success: true, data: { ...API_GOAL, computed_status: "behind" } },
    });

    const goal = await removeGoalAllocation("12", "3");

    expect(apiMock.delete).toHaveBeenCalledWith(
      apiRoutes.plannerGoal.deleteAllocation("12", "3"),
    );
    expect(goal.computedStatus).toBe("Behind");
  });

  it("a bank allocation with no account name sends bank_account_name as an empty string", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: API_GOAL } });

    await addGoalAllocation("12", { amount: 100, note: "", sourceType: "bank", bankAccountId: 8 });

    const fields = sentFields(apiMock.post.mock.calls[0][1]);
    expect(fields.source_type).toBe("bank");
    expect(fields.bank_account_id).toBe(8);
    expect(fields.bank_account_name).toBe("");
  });

  it("a bank allocation with a null account id drops the key rather than sending ''", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: API_GOAL } });

    await addGoalAllocation("12", {
      amount: 100,
      note: "",
      sourceType: "bank",
      bankAccountId: null,
      bankAccountName: "ANZ",
    });

    const fields = sentFields(apiMock.post.mock.calls[0][1]);
    expect(fields).not.toHaveProperty("bank_account_id");
    expect(fields.bank_account_name).toBe("ANZ");
  });
});

/* ------------------------------------------------------------------ *
 * Budgets
 * ------------------------------------------------------------------ */

const BUDGET_DRAFT: BudgetDraft = {
  name: " Software ",
  amount: "700",
  alertThreshold: "75",
  period: "Monthly",
  startDate: "2026-06-01",
  endDate: "",
  categories: ["Subscriptions"],
  categoryIds: [],
  notes: "",
};

const IDS_BY_NAME = new Map([["Subscriptions", 41]]);

describe("toBudget — inline category names", () => {
  it("falls back to the row's own categories[].name when the catalogue doesn't know the id", () => {
    const budget = toBudget(
      {
        id: 3,
        categories: [
          { id: 41, name: "Subscriptions" },
          { id: 42, name: "Fuel" },
        ],
      },
      new Map([[41, "Software subscriptions"]]),
    );

    // The catalogue wins where it has a name; the row's own fills the rest.
    expect(budget.categories).toEqual(["Software subscriptions", "Fuel"]);
    expect(budget.categoryIds).toEqual([41, 42]);
  });
});

describe("createBudget / updateBudget / deleteBudget", () => {
  it("create POSTs the payload and omits a blank end date entirely", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await createBudget(BUDGET_DRAFT, IDS_BY_NAME);

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.budget.add);
    const fields = sentFields(body);
    expect(fields).not.toHaveProperty("end_date");
    expect(fields).toMatchObject({
      name: "Software",
      amount: 700,
      period_type: "monthly",
      start_date: "2026-06-01",
      repeat_frequency: "monthly",
      alert_threshold_percent: 75,
      category_ids: [41],
    });
    // Top-level booleans are stringified by encryptPayload.
    expect(fields.repeat_enabled).toBe("false");
  });

  it("update PUTs to the route with the id concatenated, and sends a blank end date as ''", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });

    await updateBudget("9", { ...BUDGET_DRAFT, repeatEnabled: true }, IDS_BY_NAME);

    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(apiRoutes.budget.update + "9");
    const fields = sentFields(body);
    expect(fields.end_date).toBe("");
    expect(fields.repeat_enabled).toBe("true");
  });

  it("delete DELETEs the route with the id concatenated", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });

    await deleteBudget("9");

    expect(apiMock.delete).toHaveBeenCalledWith(apiRoutes.budget.delete + "9");
  });

  it("doesn't read success — a success:false reply still resolves", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Invalid" } });
    await expect(createBudget(BUDGET_DRAFT, IDS_BY_NAME)).resolves.toBeUndefined();
  });
});

describe("fetchExpenseCategories (fresh module per test — it caches)", () => {
  const CATALOGUE = {
    data: {
      success: true,
      data: {
        account_categories: [
          {
            account_category_id: 1,
            name: "Expenses",
            account_subcategories: [
              { account_subcategory_id: 41, account_subcategory_name: "Subscriptions" },
              { id: "42", name: "Fuel" },
              { account_subcategory_id: 43, account_subcategory_name: "" },
            ],
          },
          {
            account_category_id: "1",
            account_subcategories: [{ account_subcategory_id: 44, account_subcategory_name: "Rent" }],
          },
          {
            account_category_id: 2,
            name: "Income",
            account_subcategories: [{ account_subcategory_id: 50, account_subcategory_name: "Sales" }],
          },
        ],
      },
    },
  };

  it("keeps only the Expenses category's subcategories, with id/name fallbacks, dropping nameless ones", async () => {
    const { fetchExpenseCategories } = await freshPlannerApi();
    apiMock.get.mockResolvedValue(CATALOGUE);

    expect(await fetchExpenseCategories()).toEqual([
      { id: 41, name: "Subscriptions" },
      { id: 42, name: "Fuel" },
      { id: 44, name: "Rent" },
    ]);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.accountCategory.list);
  });

  it("is fetched once per session", async () => {
    const { fetchExpenseCategories } = await freshPlannerApi();
    apiMock.get.mockResolvedValue(CATALOGUE);

    await fetchExpenseCategories();
    await fetchExpenseCategories();

    expect(apiMock.get).toHaveBeenCalledTimes(1);
  });

  it("resolves [] on failure and clears the cache so the next call retries", async () => {
    const { fetchExpenseCategories } = await freshPlannerApi();
    apiMock.get.mockRejectedValueOnce(new Error("Network Error"));
    apiMock.get.mockResolvedValueOnce(CATALOGUE);

    expect(await fetchExpenseCategories()).toEqual([]);
    expect(await fetchExpenseCategories()).toHaveLength(3);
    expect(apiMock.get).toHaveBeenCalledTimes(2);
  });
});

describe("fetchBudgets", () => {
  it("loads the catalogue first, then stats and list, resolving names and month figures", async () => {
    const { fetchBudgets } = await freshPlannerApi();
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === apiRoutes.accountCategory.list) {
        return {
          data: {
            data: {
              account_categories: [
                {
                  account_category_id: 1,
                  account_subcategories: [
                    { account_subcategory_id: 41, account_subcategory_name: "Subscriptions" },
                  ],
                },
              ],
            },
          },
        };
      }
      if (url === apiRoutes.budget.stats) {
        return {
          data: {
            data: [
              { month: "2026-06", budgeted: 700, spent: 200, remaining: 450 },
              { month: "2026-07", total_budgeted: "700", total_spent: "300" },
            ],
          },
        };
      }
      if (url === apiRoutes.budget.list) {
        return { data: [{ id: 3, name: "Software", category_ids: [41] }] };
      }
      throw new Error(`unexpected GET ${url}`);
    });

    const { budgets, monthStats } = await fetchBudgets();

    const urls = apiMock.get.mock.calls.map(([url]) => url);
    expect(urls[0]).toBe(apiRoutes.accountCategory.list);
    expect(urls.slice(1).sort()).toEqual([apiRoutes.budget.list, apiRoutes.budget.stats].sort());
    const listCall = apiMock.get.mock.calls.find(([url]) => url === apiRoutes.budget.list);
    expect(listCall?.[1]).toEqual({ params: { limit: 100 } });

    expect(budgets).toHaveLength(1);
    expect(budgets[0].categories).toEqual(["Subscriptions"]);
    expect(monthStats).toEqual([
      // An explicit remaining is kept, even when it isn't budgeted − spent.
      { month: "2026-06", budgeted: 700, spent: 200, remaining: 450 },
      // total_* fallbacks, and remaining derived when absent.
      { month: "2026-07", budgeted: 700, spent: 300, remaining: 400 },
    ]);
  });
});

describe("fetchBudgetExpenses — bare-array fallback", () => {
  it("reads a bare array of rows when there's no data.expenses, totalling by length", async () => {
    apiMock.get.mockResolvedValue({
      data: [
        { id: 88, name: "Canva", date: "2026-06-03T00:00:00Z", price: "30" },
        { id: 89, price: "12", business_amount: "6" },
      ],
    });

    const list = await fetchBudgetExpenses("7");

    expect(list.total).toBe(2);
    expect(list.expenses).toEqual([
      { id: "88", name: "Canva", date: "2026-06-03", amount: 30, paidWithCash: false, reconciled: false },
      { id: "89", name: "Expense", date: "", amount: 6, paidWithCash: false, reconciled: false },
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * Plans
 * ------------------------------------------------------------------ */

describe("fetchPlans / deletePlan", () => {
  it("fetchPlans maps every row, from a bare array as well as an envelope", async () => {
    apiMock.get.mockResolvedValueOnce({ data: [{ id: 5, name: "Van", plan_type: "Client job" }] });
    apiMock.get.mockResolvedValueOnce({ data: { data: [{ id: 6, name: "Fitout" }] } });

    expect((await fetchPlans()).map((p) => [p.id, p.name, p.type])).toEqual([
      ["5", "Van", "Client job"],
    ]);
    expect((await fetchPlans()).map((p) => p.id)).toEqual(["6"]);
  });

  it("deletePlan DELETEs the plan's URL", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });
    await deletePlan("5");
    expect(apiMock.delete).toHaveBeenCalledWith(apiRoutes.expensePlan.delete("5"));
  });
});

describe("savePlan — create with no id in the reply", () => {
  const draft: ExpensePlanDraft = {
    name: "Van",
    type: "Expansion",
    fundingSource: "Cash",
    startDate: "2026-01-01",
    endDate: "2026-07-01",
    expectedRevenue: "",
    lines: [],
  };

  it("still PUTs the lines, to an id-less URL — there is no guard", async () => {
    // Pinned as documented ("untested" in the doc's Gaps): a create whose reply
    // carries no id leaves planId as "", and the lines call goes to
    // /expense-plan//lines rather than failing early.
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    apiMock.put.mockResolvedValue({ data: { success: true, data: {} } });

    await savePlan(null, draft);

    expect(apiMock.put.mock.calls[0][0]).toBe(apiRoutes.expensePlan.upsertLines(""));
    expect(sentFields(apiMock.put.mock.calls[0][1])).toEqual({ lines: [] });
  });
});

/* ------------------------------------------------------------------ *
 * Cash wallet
 * ------------------------------------------------------------------ */

describe("fetchCashWalletHistory", () => {
  it("dates a movement by movement_date, falling back to created_at", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: [
          { id: 1, amount: "250", note: "Float", movement_date: "2026-06-02", created_at: "2026-06-05T01:00:00Z" },
          { id: 2, amount: "-40", note: null, created_at: "2026-06-07T03:00:00Z" },
        ],
      },
    });

    expect(await fetchCashWalletHistory()).toEqual([
      { id: "1", date: "2026-06-02", amount: 250, note: "Float" },
      { id: "2", date: "2026-06-07", amount: -40, note: "" },
    ]);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.goalFunding.cashWalletHistory);
  });
});

describe("topUpCashWallet / setCashWalletBalance", () => {
  it("top-up POSTs {amount, note}, dropping a blank note, and maps the new wallet", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { balance: "1250", allocated: "200" } },
    });

    const wallet = await topUpCashWallet(250, "");

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.goalFunding.cashWalletTopup);
    expect(sentFields(body)).toEqual({ amount: 250 });
    expect(wallet).toEqual({ balance: 1250, allocated: 200, available: 1050 });
  });

  it("top-up keeps a real note", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    await topUpCashWallet(10, "Till float");
    expect(sentFields(apiMock.post.mock.calls[0][1])).toEqual({ amount: 10, note: "Till float" });
  });

  it("setCashWalletBalance PUTs {balance} to the wallet URL", async () => {
    apiMock.put.mockResolvedValue({
      data: { success: true, data: { balance: 900, allocated: 100, available: 800 } },
    });

    const wallet = await setCashWalletBalance(900);

    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(apiRoutes.goalFunding.cashWallet);
    expect(sentFields(body)).toEqual({ balance: 900 });
    expect(wallet).toEqual({ balance: 900, allocated: 100, available: 800 });
  });
});

describe("no function reads success", () => {
  it("fetchGoals on a success:false envelope resolves [] rather than throwing", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "Unauthorised" } });
    await expect(fetchGoals()).resolves.toEqual([]);
  });
});
