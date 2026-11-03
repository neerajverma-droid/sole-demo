import { describe, expect, it, vi } from "vitest";

// lib/planner pulls lib/expenses (and through it axiosInstance) in at import
// time. Nothing here makes a request, but mocking keeps the real client — and
// its interceptors — out of a pure-domain test.
const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const {
  // cash
  walletBalance,
  walletTotals,
  cashAccounts,
  cashOnHand,
  fundingSources,
  // goals
  weeksBetween,
  requiredWeekly,
  goalRemaining,
  goalStatus,
  goalStatusVariant,
  goalFullyAllocated,
  allocationMessage,
  pacingLine,
  contributionRule,
  // budgets
  budgetPeriodFromApi,
  budgetAutoEndDate,
  budgetThreshold,
  budgetActual,
  budgetRemaining,
  budgetProgress,
  budgetStatus,
  budgetCategoryLabel,
  budgetSummaryLine,
  budgetStatusVariant,
  budgetIssues,
  // plans
  newBudgetLine,
  lineVariance,
  planRemaining,
  planCommitted,
  planGap,
  planReturn,
  planExpectedRevenue,
  planDurationMonths,
  formatPayback,
  planStatus,
  planStatusVariant,
  ledgerActual,
  planIssues,
  // portfolio
  totalGoalAllocations,
  totalCommitted,
  totalPlannedCost,
  totalFundingGap,
  forecastAnnualReturn,
  availableCash,
  isOverAllocated,
  goalStatusCounts,
  planStatusCounts,
  // formatting
  signedMoney,
  formatOrDash,
  formatGoalDate,
  goalSummaryLine,
  formatPercent,
  // validation
  amountFieldError,
  allocationIssue,
  goalIssues,
  walletMovementIssue,
  // drafts
  emptyGoalDraft,
  draftFromGoal,
  emptyBudgetDraft,
  draftFromBudget,
  emptyPlanDraft,
  draftFromPlan,
} = await import("@/lib/planner");

import type {
  BankAccountBalance,
  Budget,
  BudgetDraft,
  ExpensePlan,
  ExpensePlanDraft,
  Goal,
  GoalAllocation,
  PlanBudgetLine,
  WalletMovement,
} from "@/lib/planner";

type Expenses = Parameters<typeof budgetActual>[1];

/*
 * Dates below sit in June/July on purpose: `weeksBetween` measures in local
 * time, and a DST change inside the window (Oct/Apr in AU, Mar/Oct in the EU,
 * Mar/Nov in the US) would add an hour and tip a `Math.ceil` into an extra
 * week. Midwinter/midsummer is DST-free in every zone the suite runs in.
 */

function allocation(amount: number, source = "Cash wallet"): GoalAllocation {
  return { id: `a-${amount}`, date: "2026-06-01", amount, source, note: "" };
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    name: "Winter buffer",
    type: "Buffer",
    targetAmount: "1000",
    targetDate: "2026-06-29",
    created: "2026-06-01",
    allocations: [],
    computedStatus: null,
    ...overrides,
  };
}

function budget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: "b1",
    name: "Software",
    amount: "1000",
    alertThreshold: "80",
    period: "Monthly",
    startDate: "2026-06-01",
    endDate: "2026-06-30",
    categories: ["Subscriptions"],
    categoryIds: [7],
    notes: "",
    serverSpent: null,
    computedStatus: null,
    ...overrides,
  };
}

function expenses(
  ...rows: { date: string; amount: number; category?: string }[]
): Expenses {
  return rows.map((row, index) => ({
    id: `e${index}`,
    category: "Subscriptions",
    ...row,
  })) as unknown as Expenses;
}

function line(overrides: Partial<PlanBudgetLine> = {}): PlanBudgetLine {
  return {
    id: "l1",
    name: "Van deposit",
    planned: "10000",
    actual: "",
    ledgerSource: "",
    status: "Planned",
    ...overrides,
  };
}

function plan(overrides: Partial<ExpensePlan> = {}): ExpensePlan {
  return {
    id: "p1",
    name: "Second van",
    type: "Expansion",
    fundingSource: "Cash",
    startDate: "2026-01-01",
    endDate: "2026-07-01",
    expectedRevenue: "12000",
    lines: [line()],
    computedStatus: null,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ *
 * Cash
 * ------------------------------------------------------------------ */

describe("wallet arithmetic", () => {
  const movements: WalletMovement[] = [
    { id: "m1", date: "2026-06-01", amount: 50, note: "" },
    { id: "m2", date: "2026-06-02", amount: -30, note: "" },
    { id: "m3", date: "2026-06-03", amount: 0, note: "" },
  ];

  it("walletBalance is the opening plus every signed movement", () => {
    expect(walletBalance(100, movements)).toBe(120);
    expect(walletBalance(100, [])).toBe(100);
  });

  it("walletTotals splits cash in from cash out, reporting out as a positive figure", () => {
    expect(walletTotals(movements)).toEqual({ in: 50, out: 30 });
  });
});

describe("cash accounts", () => {
  const banks: BankAccountBalance[] = [
    { id: "1", name: "ANZ Business", detail: "••4821", balance: 5000 },
    { id: "2", name: "NAB Savings", detail: "••0099", balance: 2000 },
  ];

  it("cashAccounts lists the banks first, then the wallet as a detail-less account", () => {
    expect(cashAccounts(300, banks)).toEqual([
      { name: "ANZ Business", detail: "••4821", balance: 5000, kind: "bank" },
      { name: "NAB Savings", detail: "••0099", balance: 2000, kind: "bank" },
      { name: "Cash wallet", detail: "", balance: 300, kind: "wallet" },
    ]);
  });

  it("cashAccounts with no banks is just the wallet", () => {
    expect(cashAccounts(0)).toEqual([
      { name: "Cash wallet", detail: "", balance: 0, kind: "wallet" },
    ]);
  });

  it("cashOnHand totals the banks and the wallet together", () => {
    expect(cashOnHand(300, banks)).toBe(7300);
  });

  it("fundingSources nets off allocations by source name, across every goal, floored at zero", () => {
    const goals = [
      goal({ allocations: [allocation(1000, "ANZ Business"), allocation(100)] }),
      goal({
        id: "g2",
        allocations: [allocation(1500, "ANZ Business"), allocation(9000, "NAB Savings")],
      }),
    ];

    const sources = fundingSources(300, goals, banks);

    expect(sources.map((s) => [s.name, s.available])).toEqual([
      ["ANZ Business", 2500],
      // Earmarked past its balance: nothing available, not a negative.
      ["NAB Savings", 0],
      ["Cash wallet", 200],
    ]);
    // The balance itself is untouched — only `available` is netted.
    expect(sources[0].balance).toBe(5000);
  });
});

/* ------------------------------------------------------------------ *
 * Goals
 * ------------------------------------------------------------------ */

describe("weeksBetween", () => {
  it("rounds part weeks up and never goes negative", () => {
    expect(weeksBetween("2026-06-01", "2026-06-29")).toBe(4);
    expect(weeksBetween("2026-06-01", "2026-06-02")).toBe(1);
    expect(weeksBetween("2026-06-29", "2026-06-01")).toBe(0);
  });

  it("is 0 when either date is missing", () => {
    expect(weeksBetween("", "2026-06-29")).toBe(0);
    expect(weeksBetween("2026-06-01", "")).toBe(0);
  });
});

describe("requiredWeekly", () => {
  it("divides what's left by the whole weeks remaining", () => {
    const g = goal({ allocations: [allocation(200)] });
    expect(requiredWeekly(g, "2026-06-01")).toBe(200);
  });

  it("is null — not zero — for a goal with no target or no date", () => {
    expect(requiredWeekly(goal({ targetAmount: "" }), "2026-06-01")).toBeNull();
    expect(requiredWeekly(goal({ targetDate: "" }), "2026-06-01")).toBeNull();
  });

  it("is 0 once the target is fully allocated", () => {
    expect(requiredWeekly(goal({ allocations: [allocation(1000)] }), "2026-06-01")).toBe(0);
  });

  it("is null once the target date has passed with money still to find", () => {
    expect(requiredWeekly(goal(), "2026-07-10")).toBeNull();
  });
});

describe("goalRemaining / goalFullyAllocated", () => {
  it("goalRemaining is clamped at zero when over-allocated", () => {
    expect(goalRemaining(goal({ allocations: [allocation(1500)] }))).toBe(0);
    expect(goalRemaining(goal({ allocations: [allocation(250)] }))).toBe(750);
  });

  it("a $0 target is never 'fully allocated', even with nothing left on it", () => {
    expect(goalFullyAllocated(goal({ targetAmount: "0" }))).toBe(false);
    expect(goalFullyAllocated(goal({ allocations: [allocation(1000)] }))).toBe(true);
    expect(goalFullyAllocated(goal({ allocations: [allocation(999)] }))).toBe(false);
  });
});

describe("goalStatus — the local pacing path", () => {
  // Four-week window (1 → 29 June); two weeks in, half the target is due.
  const midway = "2026-06-15";

  it("is null for an unmeasurable goal, even when the server sent a status", () => {
    expect(
      goalStatus(goal({ targetDate: "", computedStatus: "Behind" }), midway),
    ).toBeNull();
  });

  it("is Complete once allocations reach the target", () => {
    expect(goalStatus(goal({ allocations: [allocation(1000)] }), midway)).toBe("Complete");
  });

  it("is On track when progress keeps pace with the elapsed share of the window", () => {
    expect(goalStatus(goal({ allocations: [allocation(500)] }), midway)).toBe("On track");
  });

  it("is Behind when progress trails the elapsed share", () => {
    expect(goalStatus(goal({ allocations: [allocation(400)] }), midway)).toBe("Behind");
  });

  it("is Behind past the target date, whatever the pace was", () => {
    expect(goalStatus(goal({ allocations: [allocation(900)] }), "2026-07-01")).toBe("Behind");
  });

  it("is Behind for a zero-length window (created on its target date)", () => {
    expect(
      goalStatus(goal({ created: "2026-06-29" }), "2026-06-29"),
    ).toBe("Behind");
  });
});

describe("goalStatusVariant", () => {
  it("is success for Complete and On track, warning for Behind", () => {
    expect(goalStatusVariant("Complete")).toBe("success");
    expect(goalStatusVariant("On track")).toBe("success");
    expect(goalStatusVariant("Behind")).toBe("warning");
  });
});

describe("allocationMessage", () => {
  it("asks for a target first when there isn't one", () => {
    expect(allocationMessage(goal({ targetAmount: "" }))).toEqual({
      text: "Set a target amount to start allocating.",
      tone: "muted",
    });
  });

  it("reads as fully allocated, in the success tone, once met", () => {
    expect(allocationMessage(goal({ allocations: [allocation(1000)] }))).toEqual({
      text: "Goal is fully allocated.",
      tone: "success",
    });
  });

  it("otherwise says how much is left", () => {
    expect(allocationMessage(goal({ allocations: [allocation(400)] }))).toEqual({
      text: "$600.00 left to allocate.",
      tone: "muted",
    });
  });
});

describe("pacingLine", () => {
  it("quotes the weekly figure and the target date", () => {
    expect(pacingLine(goal({ allocations: [allocation(200)] }), "2026-06-01")).toBe(
      "Set aside $200.00/wk until 29/06/2026 to stay on track.",
    );
  });

  it("is null when the goal is met, unmeasurable, or overdue", () => {
    expect(pacingLine(goal({ allocations: [allocation(1000)] }), "2026-06-01")).toBeNull();
    expect(pacingLine(goal({ targetAmount: "" }), "2026-06-01")).toBeNull();
    expect(pacingLine(goal(), "2026-07-10")).toBeNull();
  });
});

describe("contributionRule", () => {
  it("explains what's missing on an unmeasurable goal", () => {
    expect(contributionRule(goal({ targetDate: "" }), "2026-06-01")).toBe(
      "Set a target amount and date, and Sole works out what to put aside each week.",
    );
  });

  it("says the date has passed, and what's still unallocated", () => {
    expect(contributionRule(goal({ allocations: [allocation(400)] }), "2026-07-10")).toBe(
      "The target date has passed. $600.00 is still unallocated.",
    );
  });

  it("says nothing more is needed once fully allocated", () => {
    expect(contributionRule(goal({ allocations: [allocation(1000)] }), "2026-06-01")).toBe(
      "The target is fully allocated — nothing more needs to go aside.",
    );
  });

  it("spells out remaining over weeks, pluralising the week count", () => {
    expect(contributionRule(goal({ allocations: [allocation(200)] }), "2026-06-01")).toBe(
      "$800.00 over 4 weeks is $200.00 a week.",
    );
    expect(
      contributionRule(goal({ targetDate: "2026-06-05" }), "2026-06-01"),
    ).toBe("$1,000.00 over 1 week is $1,000.00 a week.");
  });
});

/* ------------------------------------------------------------------ *
 * Budgets
 * ------------------------------------------------------------------ */

describe("budgetPeriodFromApi", () => {
  it("maps the API enum back to its label, falling back to Monthly", () => {
    expect(budgetPeriodFromApi("six_monthly")).toBe("6 months");
    expect(budgetPeriodFromApi("custom")).toBe("Custom");
    expect(budgetPeriodFromApi("fortnightly")).toBe("Monthly");
    expect(budgetPeriodFromApi(null)).toBe("Monthly");
  });
});

describe("budgetAutoEndDate — the spans not already covered", () => {
  it("Weekly adds seven days", () => {
    expect(budgetAutoEndDate("2026-06-28", "Weekly")).toBe("2026-07-05");
  });

  it("Quarterly crosses a year end and clamps to the shorter month", () => {
    expect(budgetAutoEndDate("2026-11-30", "Quarterly")).toBe("2027-02-28");
  });

  it("Yearly from a leap day lands on 28 Feb", () => {
    expect(budgetAutoEndDate("2028-02-29", "Yearly")).toBe("2029-02-28");
  });

  it("6 months adds six calendar months", () => {
    expect(budgetAutoEndDate("2026-01-15", "6 months")).toBe("2026-07-15");
  });
});

describe("budgetThreshold", () => {
  it("reads the typed percentage as a fraction", () => {
    expect(budgetThreshold({ alertThreshold: "50" })).toBe(0.5);
    expect(budgetThreshold({ alertThreshold: "100" })).toBe(1);
  });

  it("falls back to 80% for blank, zero, negative or over-100 values", () => {
    for (const alertThreshold of ["", "0", "-5", "101", "abc"]) {
      expect(budgetThreshold({ alertThreshold })).toBe(0.8);
    }
  });
});

describe("budgetActual — the ledger window", () => {
  it("counts only the budget's own categories", () => {
    const ledger = expenses(
      { date: "2026-06-10", amount: 100 },
      { date: "2026-06-10", amount: 999, category: "Fuel" },
    );
    expect(budgetActual(budget(), ledger, "2026-06-15")).toBe(100);
  });

  it("derives the end from the period when the end date is blank (inclusive)", () => {
    // Monthly from 1 June auto-ends 1 July.
    const ledger = expenses(
      { date: "2026-07-01", amount: 40 },
      { date: "2026-07-02", amount: 500 },
    );
    expect(budgetActual(budget({ endDate: "" }), ledger, "2026-06-15")).toBe(40);
  });

  it("runs open-ended for a Custom budget with a start but no end", () => {
    const ledger = expenses({ date: "2031-01-01", amount: 75 });
    expect(
      budgetActual(budget({ period: "Custom", endDate: "" }), ledger, "2026-06-15"),
    ).toBe(75);
  });

  it("falls back to the current calendar quarter / year / month with no start date", () => {
    const ledger = expenses(
      { date: "2026-01-05", amount: 1 },
      { date: "2026-06-30", amount: 10 },
      { date: "2026-07-01", amount: 100 },
      { date: "2026-08-02", amount: 1000 },
    );
    const undated = { startDate: "", endDate: "" };
    const today = "2026-08-15";

    expect(budgetActual(budget({ ...undated, period: "Quarterly" }), ledger, today)).toBe(1100);
    expect(budgetActual(budget({ ...undated, period: "Yearly" }), ledger, today)).toBe(1111);
    expect(budgetActual(budget({ ...undated, period: "Monthly" }), ledger, today)).toBe(1000);
  });
});

describe("budgetRemaining / budgetProgress", () => {
  const over = expenses({ date: "2026-06-10", amount: 1250 });

  it("budgetRemaining goes negative on an overspend", () => {
    expect(budgetRemaining(budget(), over, "2026-06-15")).toBe(-250);
  });

  it("budgetProgress is capped at 1, and 0 for a budget with no amount", () => {
    expect(budgetProgress(budget(), over, "2026-06-15")).toBe(1);
    expect(budgetProgress(budget({ amount: "" }), over, "2026-06-15")).toBe(0);
    expect(
      budgetProgress(budget(), expenses({ date: "2026-06-10", amount: 250 }), "2026-06-15"),
    ).toBe(0.25);
  });
});

describe("budgetStatus — the threshold path (no server status)", () => {
  const spend = (amount: number) => expenses({ date: "2026-06-10", amount });
  const today = "2026-06-15";

  it("is null for a budget with no amount", () => {
    expect(budgetStatus(budget({ amount: "0" }), spend(10), today)).toBeNull();
  });

  it("is Over budget only past 100% — exactly spent is Nearly spent", () => {
    expect(budgetStatus(budget(), spend(1000.01), today)).toBe("Over budget");
    expect(budgetStatus(budget(), spend(1000), today)).toBe("Nearly spent");
  });

  it("moves the Nearly-spent line with the typed threshold", () => {
    const half = budget({ alertThreshold: "50" });
    expect(budgetStatus(half, spend(500), today)).toBe("Nearly spent");
    expect(budgetStatus(half, spend(499), today)).toBe("Within budget");
    // The same 500 is comfortably within the default 80%.
    expect(budgetStatus(budget(), spend(500), today)).toBe("Within budget");
  });
});

describe("budgetCategoryLabel / budgetSummaryLine / budgetStatusVariant", () => {
  it("labels none, one, or a count of categories", () => {
    expect(budgetCategoryLabel({ categories: [] })).toBe("No categories");
    expect(budgetCategoryLabel({ categories: ["Subscriptions"] })).toBe("Subscriptions");
    expect(budgetCategoryLabel({ categories: ["A", "B", "C"] })).toBe("3 categories");
  });

  it("summarises amount, period and categories in lower case", () => {
    const draft = draftFromBudget(budget({ amount: "700", categories: ["A", "B", "C"] }));
    expect(budgetSummaryLine(draft)).toBe("$700.00 monthly · 3 categories");
    expect(
      budgetSummaryLine({ ...draft, amount: "", period: "6 months", categories: ["Subscriptions"] }),
    ).toBe("No amount 6 months · subscriptions");
  });

  it("maps each status to its badge variant", () => {
    expect(budgetStatusVariant("Over budget")).toBe("danger");
    expect(budgetStatusVariant("Nearly spent")).toBe("warning");
    expect(budgetStatusVariant("Within budget")).toBe("success");
  });
});

describe("budgetIssues", () => {
  const complete: BudgetDraft = draftFromBudget(budget());

  it("a complete draft has no issues — and a calendar period doesn't need dates", () => {
    expect(budgetIssues(complete)).toEqual([]);
    expect(budgetIssues({ ...complete, startDate: "", endDate: "" })).toEqual([]);
  });

  it("flags name, amount, threshold and categories with their messages, in field order", () => {
    expect(
      budgetIssues({
        ...complete,
        name: " x ",
        amount: "",
        alertThreshold: "  ",
        categories: [],
      }),
    ).toEqual([
      { key: "name", message: "Name this budget." },
      { key: "amount", message: "Enter an amount." },
      { key: "alertThreshold", message: "Enter an alert threshold." },
      { key: "categories", message: "Assign at least one category." },
    ]);
  });

  it("reports a malformed amount with the format error rather than 'Enter an amount.'", () => {
    expect(budgetIssues({ ...complete, amount: "12.345" })).toEqual([
      { key: "amount", message: "Enter a valid amount — no letters or negatives." },
    ]);
  });

  it("requires the threshold to be a whole percentage from 1 to 100", () => {
    const message = "Enter a whole percentage between 1 and 100.";
    for (const alertThreshold of ["0", "101", "80.5", "-5", "abc"]) {
      expect(budgetIssues({ ...complete, alertThreshold })).toEqual([
        { key: "alertThreshold", message },
      ]);
    }
    expect(budgetIssues({ ...complete, alertThreshold: "1" })).toEqual([]);
    expect(budgetIssues({ ...complete, alertThreshold: "100" })).toEqual([]);
  });

  it("requires both dates for a Custom period", () => {
    expect(
      budgetIssues({ ...complete, period: "Custom", startDate: "", endDate: "" }),
    ).toEqual([
      { key: "startDate", message: "Choose a start date." },
      { key: "endDate", message: "Choose an end date." },
    ]);
  });

  it("refuses a Custom end date before its start", () => {
    expect(
      budgetIssues({
        ...complete,
        period: "Custom",
        startDate: "2026-06-10",
        endDate: "2026-06-09",
      }),
    ).toEqual([
      { key: "endDate", message: "The end date can't precede the start date." },
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * Expense plans
 * ------------------------------------------------------------------ */

describe("newBudgetLine", () => {
  it("mints a blank Planned line with a fresh local line- id each time", () => {
    const a = newBudgetLine();
    const b = newBudgetLine();
    expect(a).toEqual({
      id: expect.stringMatching(/^line-\d+$/),
      name: "",
      planned: "",
      actual: "",
      ledgerSource: "",
      status: "Planned",
    });
    expect(b.id).not.toBe(a.id);
  });
});

describe("line and plan figures", () => {
  const overspent = plan({
    lines: [
      line({ id: "l1", planned: "500", actual: "650" }),
      line({ id: "l2", planned: "1000", actual: "200" }),
    ],
  });

  it("lineVariance is planned less actual, with blanks reading as zero", () => {
    expect(lineVariance({ planned: "500", actual: "650" })).toBe(-150);
    expect(lineVariance({ planned: "", actual: "" })).toBe(0);
  });

  it("planCommitted is the actuals; planRemaining can go negative where planGap can't", () => {
    expect(planCommitted(overspent)).toBe(850);
    expect(planRemaining(overspent)).toBe(650);

    const blownOut = plan({ lines: [line({ planned: "500", actual: "900" })] });
    expect(planRemaining(blownOut)).toBe(-400);
    expect(planGap(blownOut)).toBe(0);
  });

  it("planExpectedRevenue is null for blank or non-numeric text; planReturn reads that as 0", () => {
    expect(planExpectedRevenue({ expectedRevenue: "" })).toBeNull();
    expect(planExpectedRevenue({ expectedRevenue: "abc" })).toBeNull();
    expect(planExpectedRevenue({ expectedRevenue: "0" })).toBe(0);
    expect(planReturn({ expectedRevenue: "" })).toBe(0);
    expect(planReturn({ expectedRevenue: "1200" })).toBe(1200);
  });
});

describe("planDurationMonths", () => {
  it("counts calendar months between the dates", () => {
    expect(planDurationMonths({ startDate: "2026-01-15", endDate: "2026-07-15" })).toBe(6);
  });

  it("is never less than 1 inside a single month", () => {
    expect(planDurationMonths({ startDate: "2026-06-01", endDate: "2026-06-20" })).toBe(1);
  });

  it("is null without both dates, or when the end isn't after the start", () => {
    expect(planDurationMonths({ startDate: "", endDate: "2026-06-20" })).toBeNull();
    expect(planDurationMonths({ startDate: "2026-06-20", endDate: "2026-06-20" })).toBeNull();
    expect(planDurationMonths({ startDate: "2026-06-20", endDate: "2026-06-01" })).toBeNull();
  });
});

describe("formatPayback", () => {
  // Six-month window throughout, so revenue / 6 is the monthly rate.
  it("reads 'No payback' with no revenue or no window", () => {
    expect(formatPayback(plan({ expectedRevenue: "" }))).toBe("No payback");
    expect(formatPayback(plan({ endDate: "" }))).toBe("No payback");
  });

  it("reads 'Under a month' when a month's revenue already covers the cost", () => {
    expect(formatPayback(plan({ lines: [line({ planned: "1000" })] }))).toBe("Under a month");
  });

  it("shows one decimal under ten months and whole months from ten up", () => {
    expect(formatPayback(plan())).toBe("5.0 months");
    expect(formatPayback(plan({ lines: [line({ planned: "30000" })] }))).toBe("15 months");
  });
});

describe("planStatus / planStatusVariant", () => {
  it("is On track when revenue covers the cost, or when there's no cost at all", () => {
    expect(planStatus(plan({ expectedRevenue: "10000" }))).toBe("On track");
    expect(planStatus(plan({ lines: [line({ planned: "" })], expectedRevenue: "" }))).toBe(
      "On track",
    );
  });

  it("maps each status to its badge variant", () => {
    expect(planStatusVariant("Funding gap")).toBe("danger");
    expect(planStatusVariant("Review")).toBe("warning");
    expect(planStatusVariant("On track")).toBe("success");
  });
});

describe("ledgerActual", () => {
  const ledger = expenses(
    { date: "2026-05-31", amount: 1, category: "Signage" },
    { date: "2026-06-01", amount: 10, category: "Signage" },
    { date: "2026-06-30", amount: 100, category: "Signage" },
    { date: "2026-07-01", amount: 1000, category: "Signage" },
    { date: "2026-06-15", amount: 9999, category: "Fuel" },
  );

  it("sums one category inside an inclusive window", () => {
    expect(ledgerActual(ledger, "Signage", "2026-06-01", "2026-06-30")).toBe(110);
  });

  it("treats a blank bound as open", () => {
    expect(ledgerActual(ledger, "Signage", "", "2026-06-30")).toBe(111);
    expect(ledgerActual(ledger, "Signage", "2026-06-01", "")).toBe(1110);
    expect(ledgerActual(ledger, "Signage", "", "")).toBe(1111);
  });
});

describe("planIssues", () => {
  const complete: ExpensePlanDraft = draftFromPlan(plan());

  it("a complete draft has no issues", () => {
    expect(planIssues(complete)).toEqual([]);
  });

  it("flags name, both dates and revenue format", () => {
    expect(
      planIssues({
        ...complete,
        name: "x",
        startDate: "",
        endDate: "",
        expectedRevenue: "12k",
      }),
    ).toEqual([
      { key: "name", message: "Name this plan." },
      { key: "startDate", message: "Choose a planned start date." },
      { key: "endDate", message: "Choose a planned end date." },
      { key: "expectedRevenue", message: "Enter a valid amount — no letters or negatives." },
    ]);
  });

  it("refuses an end date before the start", () => {
    expect(
      planIssues({ ...complete, startDate: "2026-06-10", endDate: "2026-06-01" }),
    ).toEqual([
      { key: "endDate", message: "The end date can't precede the start date." },
    ]);
  });

  it("needs at least one line with both a name and a planned amount", () => {
    expect(
      planIssues({ ...complete, lines: [line({ planned: "" }), line({ id: "l2", name: " ", planned: "" })] }),
    ).toEqual([
      {
        key: "lines",
        message: "Add at least one budget line with a name and a planned amount.",
      },
    ]);
  });

  it("keys per-line problems by the line's id", () => {
    const issues = planIssues({
      ...complete,
      lines: [
        line({ id: "ok" }),
        line({ id: "bad", planned: "abc", actual: "-5" }),
        line({ id: "nameless", name: "", planned: "", actual: "250" }),
      ],
    });
    expect(issues).toEqual([
      { key: "planned-bad", message: "Enter a valid amount — no letters or negatives." },
      { key: "actual-bad", message: "Enter a valid amount — no letters or negatives." },
      { key: "name-nameless", message: "Name this budget line." },
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * Portfolio
 * ------------------------------------------------------------------ */

describe("portfolio roll-ups", () => {
  const goals = [
    goal({ allocations: [allocation(300), allocation(200)] }),
    goal({ id: "g2", allocations: [allocation(1000)] }),
  ];
  const plans = [
    plan({ lines: [line({ planned: "10000", actual: "4000" })], expectedRevenue: "12000" }),
    plan({
      id: "p2",
      lines: [line({ planned: "5000", actual: "6000" })],
      expectedRevenue: "",
    }),
  ];

  it("totals goal allocations, commitments, planned cost and funding gaps", () => {
    expect(totalGoalAllocations(goals)).toBe(1500);
    expect(totalCommitted(plans)).toBe(10000);
    expect(totalPlannedCost(plans)).toBe(15000);
    // The overspent plan contributes no gap, not a negative one.
    expect(totalFundingGap(plans)).toBe(6000);
  });

  it("forecastAnnualReturn nets revenue against cost and can go negative", () => {
    // (12000 − 10000) + (0 − 5000)
    expect(forecastAnnualReturn(plans)).toBe(-3000);
  });

  it("availableCash takes allocations and commitments off cash on hand, floored at zero", () => {
    const banks: BankAccountBalance[] = [
      { id: "1", name: "ANZ", detail: "", balance: 20000 },
    ];
    expect(availableCash(500, goals, plans, banks)).toBe(9000);
    expect(availableCash(500, goals, plans)).toBe(0);
  });

  it("isOverAllocated only once earmarks exceed what's held", () => {
    expect(isOverAllocated(11500, goals, plans)).toBe(false);
    expect(isOverAllocated(11499, goals, plans)).toBe(true);
  });

  it("goalStatusCounts puts an unmeasurable goal in draft", () => {
    expect(
      goalStatusCounts(
        [
          goal({ allocations: [allocation(1000)] }),
          goal({ allocations: [allocation(500)] }),
          goal({ allocations: [allocation(100)] }),
          goal({ targetDate: "" }),
          goal({ computedStatus: "Behind", allocations: [allocation(900)] }),
        ],
        "2026-06-15",
      ),
    ).toEqual({ complete: 1, onTrack: 1, behind: 2, draft: 1 });
  });

  it("planStatusCounts never counts a Review — nothing produces one locally", () => {
    // Documented dead branch: "Review" is in the PlanStatus union but neither
    // planStatus nor the API mapper produces it, so `review` stays 0 unless a
    // record is hand-built with it.
    expect(planStatusCounts(plans)).toEqual({ onTrack: 1, review: 0, fundingGap: 1 });
    expect(
      planStatusCounts([plan({ expectedRevenue: "20000" }), plan({ computedStatus: "Review" })]),
    ).toEqual({ onTrack: 1, review: 1, fundingGap: 0 });
  });
});

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

describe("formatting", () => {
  it("signedMoney puts a true minus (U+2212) before the dollar sign", () => {
    expect(signedMoney(-20100)).toBe("−$20,100.00");
    expect(signedMoney(20100)).toBe("$20,100.00");
    expect(signedMoney(0)).toBe("$0.00");
  });

  it("formatOrDash shows an em dash only for null", () => {
    expect(formatOrDash(null)).toBe("—");
    expect(formatOrDash(0)).toBe("$0.00");
  });

  it("formatGoalDate reads 'No date set' for a blank date", () => {
    expect(formatGoalDate("")).toBe("No date set");
    expect(formatGoalDate("2026-06-30")).toBe("30/06/2026");
  });

  it("goalSummaryLine joins target and date, dropping 'by' when there's no date", () => {
    expect(goalSummaryLine({ targetAmount: "12000", targetDate: "2027-06-30" })).toBe(
      "$12,000.00 by 30/06/2027",
    );
    expect(goalSummaryLine({ targetAmount: "12000", targetDate: "" })).toBe("$12,000.00");
    expect(goalSummaryLine({ targetAmount: "", targetDate: "2027-06-30" })).toBe(
      "No target by 30/06/2027",
    );
  });

  it("formatPercent rounds, signs positives with +, and uses the U+2212 minus", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(12.4)).toBe("+12%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(-0.4)).toBe("0%");
    expect(formatPercent(-7.6)).toBe("−8%");
  });
});

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

describe("amountFieldError", () => {
  it("accepts blank and up-to-two-decimal amounts, trimmed", () => {
    for (const value of ["", "   ", "0", "12", "12.5", " 12.50 "]) {
      expect(amountFieldError(value)).toBeUndefined();
    }
  });

  it("rejects letters, negatives, exponents and a third decimal", () => {
    for (const value of ["abc", "-5", "1e3", "12.345", "1,000", "12."]) {
      expect(amountFieldError(value)).toBe("Enter a valid amount — no letters or negatives.");
    }
  });
});

describe("allocationIssue", () => {
  it("reports the format error first", () => {
    expect(allocationIssue("ten", 100)).toBe("Enter a valid amount — no letters or negatives.");
  });

  it("says nothing for blank or zero", () => {
    expect(allocationIssue("", 100)).toBeUndefined();
    expect(allocationIssue("0", 100)).toBeUndefined();
  });

  it("caps at the account's available amount, inclusive", () => {
    expect(allocationIssue("100", 100)).toBeUndefined();
    expect(allocationIssue("100.01", 100)).toBe("Only $100.00 is available in that account.");
  });
});

describe("goalIssues — messages", () => {
  const draft = draftFromGoal(goal());

  it("uses the format error ahead of 'Enter a target amount.'", () => {
    expect(goalIssues({ ...draft, targetAmount: "-5" })).toEqual([
      { key: "targetAmount", message: "Enter a valid amount — no letters or negatives." },
    ]);
  });

  it("quotes the allocated figure when the target is moved below it", () => {
    expect(goalIssues({ ...draft, targetAmount: "400" }, 500)).toEqual([
      { key: "targetAmount", message: "Target can't be less than the $500.00 already allocated." },
    ]);
  });

  it("flags every field in order with its message", () => {
    expect(goalIssues({ ...draft, name: "", targetAmount: "", targetDate: "" })).toEqual([
      { key: "name", message: "Name this goal." },
      { key: "targetAmount", message: "Enter a target amount." },
      { key: "targetDate", message: "Choose a target date." },
    ]);
  });
});

describe("walletMovementIssue — format first", () => {
  it("reports a malformed amount before any cap", () => {
    expect(walletMovementIssue("-20", "out", 1000)).toBe(
      "Enter a valid amount — no letters or negatives.",
    );
    expect(walletMovementIssue("", "out", 0)).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ *
 * Drafts
 * ------------------------------------------------------------------ */

describe("drafts", () => {
  it("emptyGoalDraft defaults to a Buffer with no date (never 'today')", () => {
    expect(emptyGoalDraft()).toEqual({
      name: "",
      type: "Buffer",
      targetAmount: "",
      targetDate: "",
    });
  });

  it("draftFromGoal keeps only the four editable fields", () => {
    const source = goal({ computedStatus: "Behind", allocations: [allocation(5)] });
    expect(draftFromGoal(source)).toEqual({
      name: source.name,
      type: source.type,
      targetAmount: source.targetAmount,
      targetDate: source.targetDate,
    });
  });

  it("emptyBudgetDraft starts today, Monthly, with the default threshold and an auto end date", () => {
    expect(emptyBudgetDraft("2026-06-15")).toEqual({
      name: "",
      amount: "",
      alertThreshold: "80",
      period: "Monthly",
      startDate: "2026-06-15",
      endDate: "2026-07-15",
      categories: [],
      categoryIds: [],
      notes: "",
    });
  });

  it("draftFromBudget drops the server figures and copies the arrays", () => {
    const source = budget({
      serverSpent: 10,
      computedStatus: "Over budget",
      repeatEnabled: true,
      repeatFrequency: "monthly",
    });
    const draft = draftFromBudget(source);

    expect(draft).not.toHaveProperty("serverSpent");
    expect(draft).not.toHaveProperty("computedStatus");
    expect(draft).not.toHaveProperty("id");
    expect(draft.repeatEnabled).toBe(true);
    expect(draft.repeatFrequency).toBe("monthly");

    draft.categories.push("Fuel");
    draft.categoryIds.push(99);
    expect(source.categories).toEqual(["Subscriptions"]);
    expect(source.categoryIds).toEqual([7]);
  });

  it("emptyPlanDraft starts today with one blank local line", () => {
    const draft = emptyPlanDraft("2026-06-15");
    expect(draft).toMatchObject({
      name: "",
      type: "Expansion",
      fundingSource: "Cash",
      startDate: "2026-06-15",
      endDate: "",
      expectedRevenue: "",
    });
    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0].id).toMatch(/^line-/);
  });

  it("draftFromPlan clones each line, so editing the draft can't touch the saved plan", () => {
    const source = plan({ computedStatus: "Funding gap" });
    const draft = draftFromPlan(source);

    expect(draft).not.toHaveProperty("id");
    expect(draft).not.toHaveProperty("computedStatus");
    expect(draft.lines).toEqual(source.lines);
    expect(draft.lines[0]).not.toBe(source.lines[0]);

    draft.lines[0].planned = "1";
    expect(source.lines[0].planned).toBe("10000");
  });
});
