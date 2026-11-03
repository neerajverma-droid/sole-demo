import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";
import {
  budgetActual,
  budgetStatus,
  goalStatus,
  planGap,
  planPaybackMonths,
  planRoi,
  planStatus,
  goalIssues,
  budgetAutoEndDate,
  walletMovementIssue,
} from "@/lib/planner";

// Hoisted so the mock factory below — which vitest lifts above the imports —
// can reach it; the static `@/lib/planner` import pulls axiosInstance in early.
const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

// Imported after the mock so the module's own axios import resolves to it.
const {
  toGoal,
  toBudget,
  toPlan,
  budgetPayload,
  fetchGoals,
  fetchPlans,
  savePlan,
  addGoalAllocation,
  fetchPlannerOverview,
  fetchPlannerBankAccounts,
  fetchFundingSummary,
  fetchCashWallet,
  fundingSourcesFromSummary,
  withdrawFromCashWallet,
  removeCashWalletMovement,
  fetchBudgetExpenses,
  fetchAvailableBudgetExpenses,
  attachBudgetExpense,
  detachBudgetExpense,
} = await import("@/lib/planner-api");

/**
 * The fields a write actually sent, decrypted.
 *
 * Every planner POST ciphers its body into a single `data` string, so asserting
 * on the raw body would only ever see the ciphertext. Unwrapping here keeps the
 * assertions about the payload rather than about the envelope.
 */
function sentFields(body: unknown): Record<string, unknown> {
  const envelope = body as { data?: string };
  if (typeof envelope?.data !== "string") {
    throw new Error("Body was not an encrypted { data } envelope");
  }
  return decryptPayload(envelope.data) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ *
 * Goals
 * ------------------------------------------------------------------ */

describe("toGoal", () => {
  const row = {
    id: 12,
    name: "September BAS",
    goal_type: "tax_set_aside",
    target_amount: "6400.00",
    target_date: "2026-10-28T00:00:00.000Z",
    allocated_amount: "1200",
    remaining: "5200",
    computed_status: "behind",
    created_at: "2026-07-01T09:13:00.000Z",
    allocations: [
      {
        id: 3,
        amount: "1200",
        note: "July GST collected",
        allocated_date: "2026-07-15",
        source_type: "bank",
        bank_account_id: 8,
        bank_account_name: "ANZ Business",
      },
    ],
  };

  it("maps the API's goal_type back to its display label", () => {
    expect(toGoal(row).type).toBe("Tax set-aside");
  });

  it("keeps money as typed text and dates as plain days", () => {
    const goal = toGoal(row);
    expect(goal.targetAmount).toBe("6400");
    expect(goal.targetDate).toBe("2026-10-28");
    expect(goal.created).toBe("2026-07-01");
  });

  it("names the account a bank allocation was drawn from", () => {
    expect(toGoal(row).allocations[0].source).toBe("ANZ Business");
  });

  it("reads a cash allocation as coming from the wallet", () => {
    const cash = toGoal({
      ...row,
      allocations: [{ id: 4, amount: "50", source_type: "cash" }],
    });
    expect(cash.allocations[0].source).toBe("Cash wallet");
  });

  it("falls back to Other for a goal type it doesn't recognise", () => {
    expect(toGoal({ ...row, goal_type: "something_new" }).type).toBe("Other");
  });

  it("carries the server's status, which goalStatus then prefers", () => {
    const goal = toGoal(row);
    expect(goal.computedStatus).toBe("Behind");
    // Local pacing would call this on track — a week in, nothing due yet — so
    // this only passes if the server's answer wins.
    expect(goalStatus(goal, "2026-07-08")).toBe("Behind");
  });

  it("falls back to the local calculation when the server sent no status", () => {
    const goal = toGoal({ ...row, computed_status: null });
    expect(goal.computedStatus).toBeNull();
    expect(goalStatus(goal, "2026-07-08")).toBe("On track");
  });
});

describe("fetchGoals", () => {
  it("reads rows out of a { data: [...] } envelope", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [{ id: 1, name: "Buffer" }] },
    });
    const goals = await fetchGoals();
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.plannerGoal.list);
    expect(goals).toHaveLength(1);
    expect(goals[0].name).toBe("Buffer");
  });

  it("reads rows out of a bare array too", async () => {
    apiMock.get.mockResolvedValue({ data: [{ id: 2, name: "Van" }] });
    expect(await fetchGoals()).toHaveLength(1);
  });

  it("returns nothing rather than throwing on an unexpected shape", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });
    expect(await fetchGoals()).toEqual([]);
  });
});

describe("addGoalAllocation", () => {
  it("sends a bank source with the account it draws on", async () => {
    apiMock.post.mockResolvedValue({ data: { data: { id: 12 } } });
    await addGoalAllocation("12", {
      amount: 500,
      note: "",
      sourceType: "bank",
      bankAccountId: 8,
      bankAccountName: "ANZ Business",
    });

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.plannerGoal.addAllocation("12"));
    expect(sentFields(body)).toMatchObject({
      amount: 500,
      source_type: "bank",
      bank_account_id: 8,
      bank_account_name: "ANZ Business",
    });
  });

  it("omits an empty note rather than sending it as an empty string", async () => {
    // Encryption turns null into "", which the API reads differently from an
    // absent key — so a blank note is dropped before it is ciphered.
    apiMock.post.mockResolvedValue({ data: { data: { id: 12 } } });
    await addGoalAllocation("12", {
      amount: 500,
      note: "",
      sourceType: "cash",
    });
    expect(sentFields(apiMock.post.mock.calls[0][1])).not.toHaveProperty("note");
  });

  it("sends a cash source with no bank fields at all", async () => {
    apiMock.post.mockResolvedValue({ data: { data: { id: 12 } } });
    await addGoalAllocation("12", {
      amount: 50,
      note: "Petty cash",
      sourceType: "cash",
    });

    const body = sentFields(apiMock.post.mock.calls[0][1]);
    expect(body.source_type).toBe("cash");
    expect(body).not.toHaveProperty("bank_account_id");
    expect(body.note).toBe("Petty cash");
  });
});

/* ------------------------------------------------------------------ *
 * Budgets
 * ------------------------------------------------------------------ */

describe("toBudget", () => {
  const names = new Map([
    [41, "Subscriptions"],
    [42, "Motor Vehicle Expenses"],
  ]);

  const row = {
    id: 7,
    name: "Software & subscriptions",
    amount: "700",
    period_type: "six_monthly",
    start_date: "2026-01-01",
    end_date: "2026-07-01",
    alert_threshold_percent: 90,
    notes: "",
    category_ids: [41, 99],
    spent: "310.50",
    computed_status: "near_limit",
  };

  it("maps period_type back to its display label", () => {
    expect(toBudget(row, names).period).toBe("6 months");
  });

  it("resolves category ids to names, dropping ones it can't place", () => {
    expect(toBudget(row, names).categories).toEqual(["Subscriptions"]);
  });

  it("keeps every id, so saving back can't detach an unresolved category", () => {
    expect(toBudget(row, names).categoryIds).toEqual([41, 99]);
  });

  it("accepts account_subcategory_ids as the ids field", () => {
    const alt = toBudget(
      { ...row, category_ids: undefined, account_subcategory_ids: [42] },
      names,
    );
    expect(alt.categories).toEqual(["Motor Vehicle Expenses"]);
  });

  it("prefers the server's spend over reading the ledger", () => {
    const budget = toBudget(row, names);
    const expenses = [
      {
        id: "e1",
        date: "2026-02-01",
        category: "Subscriptions",
        amount: 9999,
      },
    ] as unknown as Parameters<typeof budgetActual>[1];

    expect(budget.serverSpent).toBe(310.5);
    expect(budgetActual(budget, expenses, "2026-03-01")).toBe(310.5);
  });

  it("prefers the server's status over the threshold calculation", () => {
    const budget = toBudget(row, names);
    expect(budgetStatus(budget, [], "2026-03-01")).toBe("Nearly spent");
  });

  it("reads the ledger when the server sent no spend figure", () => {
    const budget = toBudget({ ...row, spent: undefined }, names);
    const expenses = [
      { id: "e1", date: "2026-02-01", category: "Subscriptions", amount: 120 },
      // Outside the budget's window, so it must not count.
      { id: "e2", date: "2025-12-31", category: "Subscriptions", amount: 500 },
    ] as unknown as Parameters<typeof budgetActual>[1];

    expect(budgetActual(budget, expenses, "2026-03-01")).toBe(120);
  });

  it("falls back to the default threshold when the API sent none", () => {
    expect(
      toBudget({ ...row, alert_threshold_percent: null }, names).alertThreshold,
    ).toBe("80");
  });

  it("has no spend badge for a status that describes the budget's life stage", () => {
    expect(
      toBudget({ ...row, computed_status: "upcoming" }, names).computedStatus,
    ).toBeNull();
  });
});

describe("budgetPayload", () => {
  const ids = new Map([["Subscriptions", 41]]);

  const draft = {
    name: "  Software  ",
    amount: "700",
    alertThreshold: "90",
    period: "Quarterly" as const,
    startDate: "2026-01-01",
    endDate: "2026-04-01",
    categories: ["Subscriptions"],
    categoryIds: [41],
    notes: "",
  };

  it("sends the API's period_type and trims the name", () => {
    const payload = budgetPayload(draft, ids);
    expect(payload.period_type).toBe("quarterly");
    expect(payload.name).toBe("Software");
    expect(payload.amount).toBe(700);
  });

  it("repeats on the period, and on 'none' for a custom one", () => {
    expect(budgetPayload(draft, ids).repeat_frequency).toBe("quarterly");
    expect(
      budgetPayload({ ...draft, period: "Custom" }, ids).repeat_frequency,
    ).toBe("none");
  });

  it("resolves category names to ids", () => {
    expect(budgetPayload(draft, ids).category_ids).toEqual([41]);
  });

  it("keeps the ids the budget already had when the names can't be resolved", () => {
    // The catalogue hadn't loaded, so nothing resolves — the budget's own ids
    // must survive rather than the categories being dropped.
    expect(budgetPayload(draft, new Map()).category_ids).toEqual([41]);
  });

  it("sends a blank end date as null", () => {
    expect(budgetPayload({ ...draft, endDate: "" }, ids).end_date).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Expense plans
 * ------------------------------------------------------------------ */

describe("toPlan", () => {
  const row = {
    id: 4,
    name: "Two truck expansion",
    plan_type: "Asset Purchase",
    funding_source: "Equipment and Vehicle Finance",
    planned_start_date: "2026-07-01",
    planned_end_date: "2027-01-01",
    expected_revenue: "102000",
    computed_status: "funding_gap",
    lines: [
      {
        id: 9,
        name: "Truck deposit",
        planned_amount: "22000",
        actual_amount: "8000",
        ledger_source: "Motor Vehicle Expenses",
        line_status: "Confirmed",
      },
      { id: null, name: "Signage", planned_amount: "2000" },
    ],
  };

  it("keeps plan type and funding source as the API stores them", () => {
    const plan = toPlan(row);
    expect(plan.type).toBe("Asset Purchase");
    expect(plan.fundingSource).toBe("Equipment and Vehicle Finance");
  });

  it("falls back to the first option for values it doesn't recognise", () => {
    const plan = toPlan({ ...row, plan_type: "Gone", funding_source: "Gone" });
    expect(plan.type).toBe("Expansion");
    expect(plan.fundingSource).toBe("Cash");
  });

  it("gives a line with no id a stable key of its own", () => {
    expect(toPlan(row).lines[1].id).toBe("new-1");
  });

  it("defaults an unknown line status to Planned", () => {
    expect(toPlan(row).lines[1].status).toBe("Planned");
  });

  it("carries the server's status, which planStatus then prefers", () => {
    const plan = toPlan(row);
    expect(plan.computedStatus).toBe("Funding gap");
    // Locally this would be on track — revenue far exceeds the $24k of lines.
    expect(planStatus(plan)).toBe("Funding gap");
  });

  it("reads the gap as planned less actual", () => {
    // 22000 + 2000 planned, 8000 actual.
    expect(planGap(toPlan(row))).toBe(16000);
  });
});

describe("plan maths", () => {
  /** Six months, $10k of lines, $12k expected back. */
  const plan = {
    lines: [
      {
        id: "1",
        name: "Fit-out",
        planned: "10000",
        actual: "0",
        ledgerSource: "",
        status: "Planned" as const,
      },
    ],
    expectedRevenue: "12000",
    startDate: "2026-01-01",
    endDate: "2026-07-01",
  };

  it("annualises ROI from the plan's own window", () => {
    // 20% over six months is 40% a year.
    expect(planRoi(plan)).toBeCloseTo(40, 6);
  });

  it("pays back at the rate the window implies", () => {
    // $12k over six months is $2k a month, so $10k takes five.
    expect(planPaybackMonths(plan)).toBeCloseTo(5, 6);
  });

  it("has no ROI or payback without a revenue figure", () => {
    const blank = { ...plan, expectedRevenue: "" };
    expect(planRoi(blank)).toBeNull();
    expect(planPaybackMonths(blank)).toBeNull();
  });

  it("has no payback without a window to imply a rate", () => {
    expect(planPaybackMonths({ ...plan, endDate: "" })).toBeNull();
  });

  it("calls a plan that won't earn its cost back a funding gap", () => {
    expect(planStatus({ ...plan, expectedRevenue: "9000" })).toBe(
      "Funding gap",
    );
    expect(planStatus(plan)).toBe("On track");
  });

  it("treats a plan with no revenue entered as a funding gap", () => {
    expect(planStatus({ ...plan, expectedRevenue: "" })).toBe("Funding gap");
  });
});

describe("savePlan", () => {
  const draft = {
    name: "Workshop tooling",
    type: "Asset Purchase" as const,
    fundingSource: "Cash" as const,
    startDate: "2026-08-01",
    endDate: "2026-10-31",
    expectedRevenue: "14500",
    lines: [
      {
        id: "line-3",
        name: "Bench saw",
        planned: "5400",
        actual: "",
        ledgerSource: "",
        status: "Planned" as const,
      },
      {
        id: "88",
        name: "Dust extraction",
        planned: "2200",
        actual: "2200",
        ledgerSource: "",
        status: "Confirmed" as const,
      },
    ],
  };

  it("encrypts the create body and drops an absent expected revenue", async () => {
    // Encryption turns null into "", and the API parses "" as 0 — which would
    // report a plan with no revenue figure as returning nothing at all. The key
    // has to be absent, which the API reads as null.
    apiMock.post.mockResolvedValue({ data: { data: { id: 55 } } });
    apiMock.put.mockResolvedValue({ data: { data: { id: 55, lines: [] } } });

    await savePlan(null, { ...draft, expectedRevenue: "" });

    const fields = sentFields(apiMock.post.mock.calls[0][1]);
    expect(fields).not.toHaveProperty("expected_revenue");
    expect(fields).toMatchObject({
      name: "Workshop tooling",
      plan_type: "Asset Purchase",
      funding_source: "Cash",
    });
  });

  it("creates the plan, then saves its lines against the new id", async () => {
    apiMock.post.mockResolvedValue({ data: { data: { id: 55 } } });
    apiMock.put.mockResolvedValue({ data: { data: { id: 55, lines: [] } } });

    await savePlan(null, draft);

    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.expensePlan.add);
    expect(apiMock.put.mock.calls[0][0]).toBe(
      apiRoutes.expensePlan.upsertLines("55"),
    );
  });

  it("updates an existing plan rather than creating a second one", async () => {
    apiMock.put.mockResolvedValue({ data: { data: { id: 55, lines: [] } } });

    await savePlan("55", draft);

    expect(apiMock.post).not.toHaveBeenCalled();
    expect(apiMock.put.mock.calls[0][0]).toBe(
      apiRoutes.expensePlan.update("55"),
    );
  });

  it("sends locally-minted line ids as null, and keeps real ones", async () => {
    apiMock.put.mockResolvedValue({ data: { data: { id: 55, lines: [] } } });

    await savePlan("55", draft);

    const { lines } = sentFields(apiMock.put.mock.calls[1][1]) as {
      lines: Record<string, unknown>[];
    };
    // Nested in an array, so encryption leaves the nulls alone.
    expect(lines[0]).toMatchObject({ id: null, sort_order: 0 });
    expect(lines[1]).toMatchObject({ id: 88, sort_order: 1 });
  });

  it("sends a blank amount as zero rather than as an empty string", async () => {
    apiMock.put.mockResolvedValue({ data: { data: { id: 55, lines: [] } } });

    await savePlan("55", draft);

    const { lines } = sentFields(apiMock.put.mock.calls[1][1]) as {
      lines: Record<string, unknown>[];
    };
    expect(lines[0].actual_amount).toBe(0);
  });

  it("sends a blank expected revenue as a blank the API reads as null", async () => {
    apiMock.put.mockResolvedValue({ data: { data: { id: 55, lines: [] } } });

    await savePlan("55", { ...draft, expectedRevenue: "" });

    // An update sends the key even when it's empty, so clearing the figure
    // actually clears it. Encryption writes that null as "", which the API
    // normalises back to null rather than parsing as 0.
    expect(sentFields(apiMock.put.mock.calls[0][1]).expected_revenue).toBe("");
  });
});

describe("fetchPlans", () => {
  it("asks the expense-plan list endpoint", async () => {
    apiMock.get.mockResolvedValue({ data: { data: [] } });
    await fetchPlans();
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.expensePlan.list);
  });
});

/* ------------------------------------------------------------------ *
 * Overview, wallet and funding — the Overview tab's figures
 * ------------------------------------------------------------------ */

describe("fetchPlannerOverview", () => {
  const payload = {
    data: {
      data: {
        cash_wallet_balance: "10100",
        goals_summary: {
          total: 4,
          on_track: 2,
          behind: 1,
          complete: 1,
          total_allocated: "6700",
        },
        expense_plans_summary: {
          total: 3,
          on_track: 2,
          with_gap: 1,
          total_funding_gaps: "120000",
          forecast_annual_return: "102000",
          committed_to_plans: "22000",
          plans: [{ id: 1, name: "Two truck expansion", annual_return: "102000" }],
        },
      },
    },
  };

  it("reads every roll-up the Overview tiles quote", async () => {
    apiMock.get.mockResolvedValue(payload);
    const overview = await fetchPlannerOverview();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.plannerOverview.get);
    expect(overview.cashWalletBalance).toBe(10100);
    expect(overview.goals).toEqual({
      total: 4,
      onTrack: 2,
      behind: 1,
      complete: 1,
      totalAllocated: 6700,
    });
    expect(overview.plans.totalFundingGaps).toBe(120000);
    expect(overview.plans.forecastAnnualReturn).toBe(102000);
    expect(overview.plans.committedToPlans).toBe(22000);
    expect(overview.plans.rows).toEqual([
      { id: "1", name: "Two truck expansion", annualReturn: 102000 },
    ]);
  });

  it("reads zeroes rather than throwing when the summaries are absent", async () => {
    apiMock.get.mockResolvedValue({ data: { data: {} } });
    const overview = await fetchPlannerOverview();
    expect(overview.goals.total).toBe(0);
    expect(overview.plans.rows).toEqual([]);
  });
});

describe("fetchPlannerBankAccounts", () => {
  it("scopes the request to the user and maps the balances", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: {
          accounts: [
            {
              id: 8,
              bank_name: "ANZ Business",
              masked_account_number: "•••• 4821",
              balance: "31240",
            },
          ],
        },
      },
    });

    const accounts = await fetchPlannerBankAccounts();

    // No userId: the endpoint takes the owner from the session. Sending one
    // was how any caller could read another user's balances.
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.bankAccounts.list);
    expect(accounts).toEqual([
      { id: "8", name: "ANZ Business", detail: "•••• 4821", balance: 31240 },
    ]);
  });

  it("returns nothing when the feed has no accounts", async () => {
    apiMock.get.mockResolvedValue({ data: { data: {} } });
    expect(await fetchPlannerBankAccounts()).toEqual([]);
  });

  it("handles the 'nothing connected' envelope the API actually returns", async () => {
    // Verbatim from GET /api/bank/accounts with no banks linked: the
    // payload nests a second `success` inside `data` alongside the accounts.
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          success: true,
          total: 0,
          accounts: [],
          message: "No bank accounts connected for this user",
          total_balance: 0,
        },
      },
    });
    expect(await fetchPlannerBankAccounts()).toEqual([]);
  });

  it("never sends a caller-supplied user id", async () => {
    apiMock.get.mockResolvedValue({ data: { data: { accounts: [] } } });
    await fetchPlannerBankAccounts();

    // Exactly one argument — the URL. No params object at all, so there is no
    // id for a caller to tamper with.
    expect(apiMock.get.mock.calls[0]).toHaveLength(1);
  });
});

describe("fetchFundingSummary", () => {
  it("maps the wallet and each account's unspoken-for balance", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: {
          cash: { balance: "10100", allocated: "3000", available: "7100" },
          bank_accounts: [
            { id: 8, bank_name: "ANZ Business", balance: "31240", available: "28040" },
          ],
        },
      },
    });

    const funding = await fetchFundingSummary();
    expect(funding.cash).toEqual({
      balance: 10100,
      allocated: 3000,
      available: 7100,
    });
    expect(funding.bankAccounts[0]).toEqual({
      id: 8,
      name: "ANZ Business",
      balance: 31240,
      available: 28040,
    });
  });
});

describe("fetchCashWallet", () => {
  it("works out available when the API doesn't send it", async () => {
    apiMock.get.mockResolvedValue({
      data: { data: { balance: "500", allocated: "120" } },
    });
    expect(await fetchCashWallet()).toEqual({
      balance: 500,
      allocated: 120,
      available: 380,
    });
  });
});

/* ------------------------------------------------------------------ *
 * Form rules — the reference frontend's validation, ported
 * ------------------------------------------------------------------ */

describe("goalIssues", () => {
  const draft = {
    name: "September BAS",
    type: "Tax set-aside" as const,
    targetAmount: "6400",
    targetDate: "2026-10-28",
  };

  it("accepts a complete goal", () => {
    expect(goalIssues(draft)).toEqual([]);
  });

  it("requires a name, an amount and a date", () => {
    const issues = goalIssues({
      ...draft,
      name: "",
      targetAmount: "",
      targetDate: "",
    });
    expect(issues.map((issue) => issue.key).sort()).toEqual([
      "name",
      "targetAmount",
      "targetDate",
    ]);
  });

  it("refuses a target below what's already allocated", () => {
    const issues = goalIssues({ ...draft, targetAmount: "1000" }, 1200);
    expect(issues[0].key).toBe("targetAmount");
    expect(issues[0].message).toMatch(/already allocated/);
  });

  it("allows a target equal to what's allocated", () => {
    expect(goalIssues({ ...draft, targetAmount: "1200" }, 1200)).toEqual([]);
  });
});

describe("budgetAutoEndDate", () => {
  it("adds the period's span to the start date", () => {
    expect(budgetAutoEndDate("2026-01-01", "Weekly")).toBe("2026-01-08");
    expect(budgetAutoEndDate("2026-01-01", "Monthly")).toBe("2026-02-01");
    expect(budgetAutoEndDate("2026-01-01", "Quarterly")).toBe("2026-04-01");
    expect(budgetAutoEndDate("2026-01-01", "6 months")).toBe("2026-07-01");
    expect(budgetAutoEndDate("2026-01-01", "Yearly")).toBe("2027-01-01");
  });

  it("clamps to the end of a shorter month rather than rolling over", () => {
    // The reference form's addMonths does the same: 31 Jan + 1 month is 28 Feb,
    // not 3 March.
    expect(budgetAutoEndDate("2026-01-31", "Monthly")).toBe("2026-02-28");
  });

  it("has no end date for Custom, or without a start", () => {
    expect(budgetAutoEndDate("2026-01-01", "Custom")).toBe("");
    expect(budgetAutoEndDate("", "Monthly")).toBe("");
  });
});

/* ------------------------------------------------------------------ *
 * Allocations and the cash wallet
 * ------------------------------------------------------------------ */

describe("fundingSourcesFromSummary", () => {
  const summary = {
    cash: { balance: 10100, allocated: 3000, available: 7100 },
    bankAccounts: [
      { id: 8, name: "ANZ Business", balance: 31240, available: 28040 },
    ],
  };

  it("lists the banks first, then the wallet", () => {
    const sources = fundingSourcesFromSummary(summary);
    expect(sources.map((source) => source.name)).toEqual([
      "ANZ Business",
      "Cash wallet",
    ]);
    expect(sources[0].kind).toBe("bank");
    expect(sources[1].kind).toBe("wallet");
  });

  it("carries the bank account id the allocation request identifies it by", () => {
    const sources = fundingSourcesFromSummary(summary);
    expect(sources[0].bankAccountId).toBe(8);
    expect(sources[1].bankAccountId).toBeNull();
  });

  it("takes availability from the API rather than recomputing it", () => {
    // The server nets off every goal in the business; this screen only knows
    // about the ones it loaded, so it must not do this sum itself.
    expect(fundingSourcesFromSummary(summary)[0].available).toBe(28040);
    expect(fundingSourcesFromSummary(summary)[1].available).toBe(7100);
  });
});

describe("cash wallet movements", () => {
  it("withdraws a positive amount from the withdraw endpoint", async () => {
    apiMock.post.mockResolvedValue({ data: { data: { balance: 450 } } });
    await withdrawFromCashWallet(50, "Petty cash");

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.goalFunding.cashWalletWithdraw);
    expect(sentFields(body)).toEqual({ amount: 50, note: "Petty cash" });
  });

  it("drops a blank note rather than ciphering it as an empty string", async () => {
    apiMock.post.mockResolvedValue({ data: { data: { balance: 450 } } });
    await withdrawFromCashWallet(50, "");
    expect(sentFields(apiMock.post.mock.calls[0][1])).toEqual({ amount: 50 });
  });

  it("removes a movement by id and reads back the new balance", async () => {
    apiMock.delete.mockResolvedValue({
      data: { data: { balance: 500, allocated: 120 } },
    });
    const wallet = await removeCashWalletMovement("7");

    expect(apiMock.delete).toHaveBeenCalledWith(
      apiRoutes.goalFunding.cashWalletMovement("7"),
    );
    expect(wallet).toEqual({ balance: 500, allocated: 120, available: 380 });
  });
});

describe("walletMovementIssue", () => {
  it("lets cash in through whatever the amount", () => {
    expect(walletMovementIssue("9999", "in", 100)).toBeUndefined();
  });

  it("caps cash out at what's available, not the balance", () => {
    expect(walletMovementIssue("80", "out", 100)).toBeUndefined();
    expect(walletMovementIssue("120", "out", 100)).toMatch(
      /allocated to goals/,
    );
  });
});

/* ------------------------------------------------------------------ *
 * Budget expenses — linking what counts against a budget
 * ------------------------------------------------------------------ */

describe("fetchBudgetExpenses", () => {
  /** A linked row: the expense nests under `expense`, amount on the link. */
  const linkedRow = {
    id: 501,
    budget_id: 7,
    expense_id: 88,
    amount_allocated: "184.50",
    expense: {
      id: 88,
      name: "Fuel — Shell",
      date: "2026-07-18T00:00:00.000Z",
      price: "220.00",
      business_amount: "200.00",
      paid_with_cash: "yes",
      is_reconciled: "no",
    },
  };

  it("addresses rows by the expense id, not the link id", async () => {
    // Detach is DELETE /budget/:id/expenses/:expenseId, so the id carried on
    // the row has to be the expense's — 88, never the link's 501.
    apiMock.get.mockResolvedValue({ data: { data: { expenses: [linkedRow] } } });
    expect((await fetchBudgetExpenses("7")).expenses[0].id).toBe("88");
  });

  it("counts the allocated amount, not the expense's own price", async () => {
    apiMock.get.mockResolvedValue({ data: { data: { expenses: [linkedRow] } } });
    expect((await fetchBudgetExpenses("7")).expenses[0].amount).toBe(184.5);
  });

  it("reads the API's yes/no flags as booleans", async () => {
    apiMock.get.mockResolvedValue({ data: { data: { expenses: [linkedRow] } } });
    const expense = (await fetchBudgetExpenses("7")).expenses[0];
    expect(expense.paidWithCash).toBe(true);
    expect(expense.reconciled).toBe(false);
  });

  it("keeps the date as a plain day", async () => {
    apiMock.get.mockResolvedValue({ data: { data: { expenses: [linkedRow] } } });
    expect((await fetchBudgetExpenses("7")).expenses[0].date).toBe("2026-07-18");
  });

  it("falls back down the amount chain when nothing was allocated", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: {
          expenses: [{ ...linkedRow, amount_allocated: null }],
        },
      },
    });
    // No allocation and no suggestion, so the business share answers.
    expect((await fetchBudgetExpenses("7")).expenses[0].amount).toBe(200);
  });

  it("falls back to the full price when there's no business share", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: {
          expenses: [
            {
              ...linkedRow,
              amount_allocated: null,
              expense: { ...linkedRow.expense, business_amount: null },
            },
          ],
        },
      },
    });
    expect((await fetchBudgetExpenses("7")).expenses[0].amount).toBe(220);
  });

  it("reports the server's total, not just the page length", async () => {
    apiMock.get.mockResolvedValue({
      data: { data: { expenses: [linkedRow], pagination: { total: 42 } } },
    });
    expect((await fetchBudgetExpenses("7")).total).toBe(42);
  });

  it("asks the budget's own expenses endpoint", async () => {
    apiMock.get.mockResolvedValue({ data: { data: { expenses: [] } } });
    await fetchBudgetExpenses("7");
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.budget.expenses("7"), {
      params: { limit: 100 },
    });
  });
});

describe("fetchAvailableBudgetExpenses", () => {
  /** An available row: flat, with the amount the API would allocate. */
  const availableRow = {
    id: 91,
    name: "Adobe subscription",
    date: "2026-07-02",
    price: "89.00",
    business_amount: "89.00",
    suggested_amount: "89.00",
    paid_with_cash: false,
    is_reconciled: true,
  };

  it("reads a flat row as the same shape as a linked one", async () => {
    apiMock.get.mockResolvedValue({
      data: { data: { expenses: [availableRow] } },
    });
    expect((await fetchAvailableBudgetExpenses("7", "")).expenses[0]).toEqual({
      id: "91",
      name: "Adobe subscription",
      date: "2026-07-02",
      amount: 89,
      paidWithCash: false,
      reconciled: true,
    });
  });

  it("omits the search param entirely when nothing was typed", async () => {
    apiMock.get.mockResolvedValue({ data: { data: { expenses: [] } } });
    await fetchAvailableBudgetExpenses("7", "   ");
    expect(apiMock.get).toHaveBeenCalledWith(
      apiRoutes.budget.availableExpenses("7"),
      { params: { limit: 100 } },
    );
  });

  it("trims the search before sending it", async () => {
    apiMock.get.mockResolvedValue({ data: { data: { expenses: [] } } });
    await fetchAvailableBudgetExpenses("7", "  adobe ");
    expect(apiMock.get.mock.calls[0][1].params.search).toBe("adobe");
  });
});

describe("attachBudgetExpense / detachBudgetExpense", () => {
  it("posts the expense id as a number", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await attachBudgetExpense("7", "88");
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.budget.expenses("7"));
    expect(sentFields(body)).toEqual({ expense_id: 88 });
  });

  it("deletes by budget and expense id", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });
    await detachBudgetExpense("7", "88");
    expect(apiMock.delete).toHaveBeenCalledWith(
      apiRoutes.budget.expense("7", "88"),
    );
  });
});
