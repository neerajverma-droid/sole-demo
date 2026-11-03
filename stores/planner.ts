import { create } from "zustand";

import type { CashWallet } from "@/lib/planner-api";
import {
  walletBalance,
  type Budget,
  type ExpensePlan,
  type Goal,
  type WalletMovement,
} from "@/lib/planner";

/**
 * The client's view of the Business planner: savings goals, category budgets and
 * expense plans, plus the cash wallet.
 *
 * Everything here is a cache of what the API returned — the queries in
 * hooks/use-planner-query.ts fill it, and the screens read it so that the tabs,
 * the overview and the detail pages can't quote different figures for the same
 * record. Nothing is seeded: an empty store means nothing has loaded yet, not
 * that the business has no goals.
 *
 * Progress, required weekly, ROI, payback and funding gaps are derived in
 * lib/planner from these records, except where the API sent its own computed
 * figure — those are carried on the record and preferred, so a saved goal's
 * status is the server's answer rather than a second opinion.
 */
type PlannerState = {
  goals: Goal[];
  budgets: Budget[];
  plans: ExpensePlan[];

  /**
   * Cash held outside the bank feed, as the API reports it: the balance, what's
   * already earmarked against goals, and what's left to earmark.
   */
  wallet: CashWallet | null;
  /**
   * What the wallet opened with, derived as the balance less everything that has
   * moved since. The wallet page shows it as the starting point of its history,
   * and deriving it means it can't disagree with the balance above.
   */
  walletOpening: number;
  walletMovements: WalletMovement[];

  setGoals: (goals: Goal[]) => void;
  setBudgets: (budgets: Budget[]) => void;
  setPlans: (plans: ExpensePlan[]) => void;
  setWallet: (wallet: CashWallet | null) => void;
  setWalletMovements: (movements: WalletMovement[]) => void;

  /** Replaces one goal in place, for a detail page that just saved. */
  upsertGoal: (goal: Goal) => void;
  upsertPlan: (plan: ExpensePlan) => void;

  /**
   * Drops a record the API has just deleted, so the list it was in updates
   * without waiting for the refetch. Creates and edits go through the API and
   * come back via `upsertGoal`/`upsertPlan` and the refetch — there is
   * deliberately no local "add" or "update", since a record this store invented
   * would vanish the moment anything reloaded.
   */
  removeGoal: (id: string) => void;
  removeBudget: (id: string) => void;
  removePlan: (id: string) => void;
};

/** The opening balance implied by where the wallet is now and what has moved. */
function openingFrom(
  wallet: CashWallet | null,
  movements: WalletMovement[],
): number {
  if (!wallet) return 0;
  return movements.reduce(
    (balance, movement) => balance - movement.amount,
    wallet.balance,
  );
}

export const usePlannerStore = create<PlannerState>()((set) => ({
  goals: [],
  budgets: [],
  plans: [],
  wallet: null,
  walletOpening: 0,
  walletMovements: [],

  setGoals: (goals) => set({ goals }),
  setBudgets: (budgets) => set({ budgets }),
  setPlans: (plans) => set({ plans }),
  setWallet: (wallet) =>
    set((state) => ({
      wallet,
      walletOpening: openingFrom(wallet, state.walletMovements),
    })),
  setWalletMovements: (movements) =>
    set((state) => ({
      walletMovements: movements,
      walletOpening: openingFrom(state.wallet, movements),
    })),

  upsertGoal: (goal) =>
    set((state) => ({
      goals: state.goals.some((existing) => existing.id === goal.id)
        ? state.goals.map((existing) =>
            existing.id === goal.id ? goal : existing,
          )
        : [goal, ...state.goals],
    })),
  upsertPlan: (plan) =>
    set((state) => ({
      plans: state.plans.some((existing) => existing.id === plan.id)
        ? state.plans.map((existing) =>
            existing.id === plan.id ? plan : existing,
          )
        : [plan, ...state.plans],
    })),

  removeGoal: (id) =>
    set((state) => ({ goals: state.goals.filter((goal) => goal.id !== id) })),

  removeBudget: (id) =>
    set((state) => ({
      budgets: state.budgets.filter((budget) => budget.id !== id),
    })),

  removePlan: (id) =>
    set((state) => ({ plans: state.plans.filter((plan) => plan.id !== id) })),
}));

/**
 * The wallet balance. A hook so every screen reads one figure — the Overview's
 * available cash, the goal form's funding sources and the wallet page can't
 * disagree about how much cash is on hand.
 *
 * The API's balance is the answer once the wallet has loaded. Before that it
 * falls back to the opening balance plus what has moved, which is the same
 * arithmetic the server does.
 */
export function useWalletBalance(): number {
  return usePlannerStore((state) =>
    state.wallet
      ? state.wallet.balance
      : walletBalance(state.walletOpening, state.walletMovements),
  );
}
