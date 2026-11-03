import { beforeEach, describe, expect, it, vi } from "vitest";

// stores/planner imports lib/planner, which pulls axiosInstance in through
// lib/expenses. The store never calls the API; the mock just keeps the real
// client out of the test.
const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const { usePlannerStore } = await import("@/stores/planner");

import type { Budget, ExpensePlan, Goal, WalletMovement } from "@/lib/planner";

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    name: "BAS set-aside",
    type: "Tax set-aside",
    targetAmount: "6400",
    targetDate: "2026-10-28",
    created: "2026-07-01",
    allocations: [],
    computedStatus: null,
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
    expectedRevenue: "",
    lines: [],
    computedStatus: null,
    ...overrides,
  };
}

function budget(id: string): Budget {
  return {
    id,
    name: `Budget ${id}`,
    amount: "100",
    alertThreshold: "80",
    period: "Monthly",
    startDate: "",
    endDate: "",
    categories: [],
    categoryIds: [],
    notes: "",
  };
}

function movement(id: string, amount: number): WalletMovement {
  return { id, date: "2026-06-01", amount, note: "" };
}

beforeEach(() => {
  usePlannerStore.setState({
    goals: [],
    budgets: [],
    plans: [],
    wallet: null,
    walletOpening: 0,
    walletMovements: [],
  });
});

describe("upsertGoal", () => {
  it("replaces an existing goal in place, keeping the list order", () => {
    usePlannerStore.setState({
      goals: [goal({ id: "a" }), goal({ id: "b", name: "old" }), goal({ id: "c" })],
    });

    usePlannerStore.getState().upsertGoal(goal({ id: "b", name: "new" }));

    const goals = usePlannerStore.getState().goals;
    expect(goals.map((g) => g.id)).toEqual(["a", "b", "c"]);
    expect(goals[1].name).toBe("new");
  });

  it("prepends a goal it hasn't seen", () => {
    usePlannerStore.setState({ goals: [goal({ id: "a" })] });

    usePlannerStore.getState().upsertGoal(goal({ id: "z" }));

    expect(usePlannerStore.getState().goals.map((g) => g.id)).toEqual(["z", "a"]);
  });
});

describe("upsertPlan", () => {
  it("replaces an existing plan in place, keeping the list order", () => {
    usePlannerStore.setState({
      plans: [plan({ id: "a" }), plan({ id: "b", name: "old" })],
    });

    usePlannerStore.getState().upsertPlan(plan({ id: "b", name: "new" }));

    const plans = usePlannerStore.getState().plans;
    expect(plans.map((p) => p.id)).toEqual(["a", "b"]);
    expect(plans[1].name).toBe("new");
  });

  it("prepends a plan it hasn't seen", () => {
    usePlannerStore.setState({ plans: [plan({ id: "a" })] });

    usePlannerStore.getState().upsertPlan(plan({ id: "z" }));

    expect(usePlannerStore.getState().plans.map((p) => p.id)).toEqual(["z", "a"]);
  });
});

describe("walletOpening — derived from the wallet and its movements", () => {
  const movements = [movement("m1", 500), movement("m2", -120)];

  it("is 0 while there's no wallet, whatever has moved", () => {
    usePlannerStore.getState().setWalletMovements(movements);
    expect(usePlannerStore.getState().walletOpening).toBe(0);
  });

  it("is the balance less every movement, when movements land first (the query's order)", () => {
    const store = usePlannerStore.getState();
    store.setWalletMovements(movements);
    store.setWallet({ balance: 1000, allocated: 200, available: 800 });

    // 1000 − (500 − 120)
    expect(usePlannerStore.getState().walletOpening).toBe(620);
  });

  it("reaches the same figure when the wallet lands first", () => {
    const store = usePlannerStore.getState();
    store.setWallet({ balance: 1000, allocated: 200, available: 800 });
    expect(usePlannerStore.getState().walletOpening).toBe(1000);

    store.setWalletMovements(movements);
    expect(usePlannerStore.getState().walletOpening).toBe(620);
  });

  it("drops back to 0 when the wallet is cleared", () => {
    const store = usePlannerStore.getState();
    store.setWalletMovements(movements);
    store.setWallet({ balance: 1000, allocated: 0, available: 1000 });
    store.setWallet(null);

    expect(usePlannerStore.getState().walletOpening).toBe(0);
    // The movements themselves are left alone.
    expect(usePlannerStore.getState().walletMovements).toEqual(movements);
  });
});

describe("remove actions", () => {
  it("removeGoal / removeBudget / removePlan drop only the matching id", () => {
    usePlannerStore.setState({
      goals: [goal({ id: "a" }), goal({ id: "b" })],
      budgets: [budget("a"), budget("b")],
      plans: [plan({ id: "a" }), plan({ id: "b" })],
    });

    const store = usePlannerStore.getState();
    store.removeGoal("a");
    store.removeBudget("b");
    store.removePlan("missing");

    const state = usePlannerStore.getState();
    expect(state.goals.map((g) => g.id)).toEqual(["b"]);
    expect(state.budgets.map((b) => b.id)).toEqual(["a"]);
    expect(state.plans.map((p) => p.id)).toEqual(["a", "b"]);
  });
});
