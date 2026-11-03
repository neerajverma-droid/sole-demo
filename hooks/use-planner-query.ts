"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addGoalAllocation as addGoalAllocationApi,
  attachBudgetExpense,
  createBudget as createBudgetApi,
  createGoal as createGoalApi,
  deleteBudget as deleteBudgetApi,
  deleteGoal as deleteGoalApi,
  deletePlan as deletePlanApi,
  detachBudgetExpense,
  fetchAvailableBudgetExpenses,
  fetchBudgetExpenses,
  fetchBudgets,
  fetchCashWallet,
  fetchCashWalletHistory,
  fetchExpenseCategories,
  fetchFundingSummary,
  fetchGoals,
  fetchPlannerBankAccounts,
  fetchPlannerOverview,
  fetchPlans,
  removeCashWalletMovement as removeCashWalletMovementApi,
  removeGoalAllocation as removeGoalAllocationApi,
  savePlan as savePlanApi,
  topUpCashWallet as topUpCashWalletApi,
  updateBudget as updateBudgetApi,
  updateGoal as updateGoalApi,
  withdrawFromCashWallet as withdrawFromCashWalletApi,
} from "@/lib/planner-api";
import type {
  BudgetDraft,
  ExpensePlanDraft,
  GoalDraft,
} from "@/lib/planner";
import { usePlannerStore } from "@/stores/planner";

/**
 * The Business planner's data, loaded once and mirrored into the shared store.
 *
 * Each list is its own query so a tab that isn't open doesn't hold the others
 * up, and so a failure in one doesn't blank the rest — the reference frontend
 * loads them per tab for the same reason. React Query dedupes the underlying
 * requests, so these are safe to call from more than one mounted component.
 */

/** Goals stay fresh for a minute — long enough to cross tabs without refetching. */
const STALE_TIME = 60_000;

export function usePlannerGoalsQuery() {
  const setGoals = usePlannerStore((state) => state.setGoals);

  const query = useQuery({
    queryKey: ["planner", "goals"],
    queryFn: fetchGoals,
    staleTime: STALE_TIME,
  });

  React.useEffect(() => {
    if (query.data) setGoals(query.data);
  }, [query.data, setGoals]);

  return query;
}

export function usePlannerBudgetsQuery() {
  const setBudgets = usePlannerStore((state) => state.setBudgets);

  const query = useQuery({
    queryKey: ["planner", "budgets"],
    queryFn: fetchBudgets,
    staleTime: STALE_TIME,
  });

  React.useEffect(() => {
    if (query.data) setBudgets(query.data.budgets);
  }, [query.data, setBudgets]);

  return query;
}

export function usePlannerPlansQuery() {
  const setPlans = usePlannerStore((state) => state.setPlans);

  const query = useQuery({
    queryKey: ["planner", "plans"],
    queryFn: fetchPlans,
    staleTime: STALE_TIME,
  });

  React.useEffect(() => {
    if (query.data) setPlans(query.data);
  }, [query.data, setPlans]);

  return query;
}

/**
 * The cash wallet and its movement history, which the planner treats as one
 * thing — the balance is only meaningful next to what moved it.
 */
export function useCashWalletQuery() {
  const setWallet = usePlannerStore((state) => state.setWallet);
  const setWalletMovements = usePlannerStore(
    (state) => state.setWalletMovements,
  );

  const query = useQuery({
    queryKey: ["planner", "wallet"],
    queryFn: async () => {
      const [wallet, movements] = await Promise.all([
        fetchCashWallet(),
        fetchCashWalletHistory(),
      ]);
      return { wallet, movements };
    },
    staleTime: STALE_TIME,
  });

  React.useEffect(() => {
    if (!query.data) return;
    // Movements first: the opening balance is derived from both, and setting
    // the wallet last means it's computed against the history that just landed.
    setWalletMovements(query.data.movements);
    setWallet(query.data.wallet);
  }, [query.data, setWallet, setWalletMovements]);

  return query;
}

/** Every account a goal allocation can draw on, with what's left unspoken for. */
export function useGoalFundingQuery() {
  return useQuery({
    queryKey: ["planner", "funding"],
    queryFn: fetchFundingSummary,
    staleTime: STALE_TIME,
  });
}

/** The portfolio roll-up behind the Overview tab's cards. */
export function usePlannerOverviewQuery() {
  return useQuery({
    queryKey: ["planner", "overview"],
    queryFn: fetchPlannerOverview,
    staleTime: STALE_TIME,
  });
}

/**
 * The bank balances the Overview counts as cash.
 *
 * The endpoint identifies the account owner from the session, so nothing has to
 * be read out of the stored profile and there's no id to wait for — which also
 * removes the failure mode where a profile missing `id` left this query
 * disabled and the Overview silently reporting no cash at all.
 */
export function usePlannerBankAccountsQuery() {
  return useQuery({
    queryKey: ["planner", "bank-accounts"],
    queryFn: fetchPlannerBankAccounts,
    staleTime: STALE_TIME,
  });
}

/** The expense categories a budget can cover — the chart of accounts. */
export function usePlannerCategoriesQuery() {
  return useQuery({
    queryKey: ["planner", "categories"],
    queryFn: fetchExpenseCategories,
    // A chart of accounts doesn't move while someone fills in a form.
    staleTime: Infinity,
  });
}

/* ------------------------------------------------------------------ *
 * Mutations
 * ------------------------------------------------------------------ */

/**
 * Re-reads everything the planner shows.
 *
 * Deliberately broad: saving a goal moves the Overview's allocations and its
 * available cash, and saving a plan moves the funding gaps — so anything less
 * than the whole `["planner"]` tree would leave one tab quoting a figure
 * another has already superseded.
 */
function useRefreshPlanner() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["planner"] });
}

export function useSaveGoalMutation() {
  const refresh = useRefreshPlanner();
  const upsertGoal = usePlannerStore((state) => state.upsertGoal);

  return useMutation({
    mutationFn: ({ id, draft }: { id: string | null; draft: GoalDraft }) =>
      id ? updateGoalApi(id, draft) : createGoalApi(draft),
    onSuccess: (goal) => {
      // Into the store first, so the page it saved from shows the server's
      // recomputed figures without waiting for the list to come back.
      upsertGoal(goal);
      refresh();
    },
  });
}

export function useDeleteGoalMutation() {
  const refresh = useRefreshPlanner();
  const removeGoal = usePlannerStore((state) => state.removeGoal);

  return useMutation({
    mutationFn: (id: string) => deleteGoalApi(id),
    onSuccess: (_result, id) => {
      removeGoal(id);
      refresh();
    },
  });
}

/**
 * Saves a budget, resolving its category names to the ids the API stores.
 *
 * The catalogue is fetched here rather than passed in: it's cached for the
 * session, so this costs nothing after the first call, and it means no form has
 * to hold an id lookup it never displays.
 */
export function useSaveBudgetMutation() {
  const refresh = useRefreshPlanner();

  return useMutation({
    mutationFn: async ({
      id,
      draft,
    }: {
      id: string | null;
      draft: BudgetDraft;
    }) => {
      const categories = await fetchExpenseCategories();
      const idsByName = new Map(
        categories.map((category) => [category.name, category.id]),
      );
      if (id) await updateBudgetApi(id, draft, idsByName);
      else await createBudgetApi(draft, idsByName);
    },
    onSuccess: refresh,
  });
}

export function useDeleteBudgetMutation() {
  const refresh = useRefreshPlanner();
  const removeBudget = usePlannerStore((state) => state.removeBudget);

  return useMutation({
    mutationFn: (id: string) => deleteBudgetApi(id),
    onSuccess: (_result, id) => {
      removeBudget(id);
      refresh();
    },
  });
}

export function useSavePlanMutation() {
  const refresh = useRefreshPlanner();
  const upsertPlan = usePlannerStore((state) => state.upsertPlan);

  return useMutation({
    mutationFn: ({
      id,
      draft,
    }: {
      id: string | null;
      draft: ExpensePlanDraft;
    }) => savePlanApi(id, draft),
    onSuccess: (plan) => {
      upsertPlan(plan);
      refresh();
    },
  });
}

export function useDeletePlanMutation() {
  const refresh = useRefreshPlanner();
  const removePlan = usePlannerStore((state) => state.removePlan);

  return useMutation({
    mutationFn: (id: string) => deletePlanApi(id),
    onSuccess: (_result, id) => {
      removePlan(id);
      refresh();
    },
  });
}

/**
 * Earmarks cash against a goal.
 *
 * The API answers with the whole goal, recomputed, so the page shows the new
 * allocated total and status without a second round trip — and the funding
 * summary is re-read because the account it drew on now has less available.
 */
export function useAllocateToGoalMutation() {
  const refresh = useRefreshPlanner();
  const upsertGoal = usePlannerStore((state) => state.upsertGoal);

  return useMutation({
    mutationFn: ({
      goalId,
      allocation,
    }: {
      goalId: string;
      allocation: Parameters<typeof addGoalAllocationApi>[1];
    }) => addGoalAllocationApi(goalId, allocation),
    onSuccess: (goal) => {
      upsertGoal(goal);
      refresh();
    },
  });
}

export function useRemoveAllocationMutation() {
  const refresh = useRefreshPlanner();
  const upsertGoal = usePlannerStore((state) => state.upsertGoal);

  return useMutation({
    mutationFn: ({
      goalId,
      allocationId,
    }: {
      goalId: string;
      allocationId: string;
    }) => removeGoalAllocationApi(goalId, allocationId),
    onSuccess: (goal) => {
      upsertGoal(goal);
      refresh();
    },
  });
}

/**
 * A movement in or out of the cash wallet.
 *
 * One mutation for both directions: the sign of the amount decides which
 * endpoint it goes to, so the wallet form doesn't have to branch and the
 * history stays a single ordered ledger.
 */
export function useWalletMovementMutation() {
  const refresh = useRefreshPlanner();

  return useMutation({
    mutationFn: ({ amount, note }: { amount: number; note: string }) =>
      amount >= 0
        ? topUpCashWalletApi(amount, note)
        : withdrawFromCashWalletApi(Math.abs(amount), note),
    onSuccess: refresh,
  });
}

export function useRemoveWalletMovementMutation() {
  const refresh = useRefreshPlanner();

  return useMutation({
    mutationFn: (id: string) => removeCashWalletMovementApi(id),
    onSuccess: refresh,
  });
}

/* ------------------------------------------------------------------ *
 * Budget expenses
 * ------------------------------------------------------------------ */

/** The expenses already counting against one budget. */
export function useBudgetExpensesQuery(budgetId: string | undefined) {
  return useQuery({
    queryKey: ["planner", "budget-expenses", budgetId],
    queryFn: () => fetchBudgetExpenses(budgetId as string),
    enabled: Boolean(budgetId),
    staleTime: STALE_TIME,
  });
}

/**
 * The expenses that could still be linked, for the picker.
 *
 * Only runs while the picker is open — there's no reason to ask before then,
 * and the answer goes stale as soon as something is linked. The search term is
 * part of the key, so each one is cached separately while the dialog is up.
 */
export function useAvailableBudgetExpensesQuery(
  budgetId: string | undefined,
  search: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["planner", "available-budget-expenses", budgetId, search],
    queryFn: () => fetchAvailableBudgetExpenses(budgetId as string, search),
    enabled: enabled && Boolean(budgetId),
    // The previous search's rows stay on screen while the next one loads, so
    // the list doesn't blank out on every keystroke.
    placeholderData: (previous) => previous,
  });
}

/**
 * Linking and unlinking both move the budget's spend, so they refresh the
 * planner as well as the two expense lists.
 */
function useRefreshBudgetExpenses() {
  const queryClient = useQueryClient();
  return (budgetId: string) => {
    void queryClient.invalidateQueries({
      queryKey: ["planner", "budget-expenses", budgetId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["planner", "available-budget-expenses", budgetId],
    });
    void queryClient.invalidateQueries({ queryKey: ["planner", "budgets"] });
    void queryClient.invalidateQueries({ queryKey: ["planner", "overview"] });
  };
}

export function useAttachBudgetExpenseMutation() {
  const refresh = useRefreshBudgetExpenses();

  return useMutation({
    mutationFn: ({
      budgetId,
      expenseId,
    }: {
      budgetId: string;
      expenseId: string;
    }) => attachBudgetExpense(budgetId, expenseId),
    onSuccess: (_result, { budgetId }) => refresh(budgetId),
  });
}

export function useDetachBudgetExpenseMutation() {
  const refresh = useRefreshBudgetExpenses();

  return useMutation({
    mutationFn: ({
      budgetId,
      expenseId,
    }: {
      budgetId: string;
      expenseId: string;
    }) => detachBudgetExpense(budgetId, expenseId),
    onSuccess: (_result, { budgetId }) => refresh(budgetId),
  });
}
