"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ExpenseDraft } from "@/lib/expenses";
import {
  fetchProjectExpenseView,
  assignExpensesToProjectApi,
  createProjectExpenseApi,
  fetchProjectExpenseSummary,
  fetchProjectExpenses,
  fetchProjectJobOptions,
  fetchUnassignedExpenses,
  updateProjectExpenseApi,
} from "@/lib/project-expenses";

export function useProjectExpensesQuery(projectId: string, page: number, pageSize: number) {
  return useQuery({
    queryKey: ["project-expenses", projectId, "list", page, pageSize],
    queryFn: () => fetchProjectExpenses(projectId, page, pageSize),
    placeholderData: keepPreviousData,
  });
}

export function useProjectExpenseSummaryQuery(projectId: string) {
  return useQuery({
    queryKey: ["project-expenses", projectId, "summary"],
    queryFn: () => fetchProjectExpenseSummary(projectId),
  });
}

/** Expenses not on any project — keyed under the project only so one invalidation covers it. */
export function useUnassignedExpensesQuery(
  projectId: string,
  page: number,
  pageSize: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["project-expenses", projectId, "unassigned", page, pageSize],
    queryFn: () => fetchUnassignedExpenses(page, pageSize),
    enabled,
    placeholderData: keepPreviousData,
    // Another tab or screen may have filed some of these since.
    staleTime: 0,
  });
}

export function useProjectExpenseJobsQuery(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ["project-expenses", projectId, "jobs"],
    queryFn: () => fetchProjectJobOptions(projectId),
    enabled,
  });
}

/**
 * Everything an expense write can change: this tab, the project header's
 * budget and stats, and the main Expenses screen's list and cards.
 */
export function useInvalidateProjectExpenses(projectId: string) {
  const queryClient = useQueryClient();
  return (expenseId?: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["project-expenses", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["project"] }),
      queryClient.invalidateQueries({ queryKey: ["project-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["expenses"] }),
      queryClient.invalidateQueries({ queryKey: ["expenses-page"] }),
      queryClient.invalidateQueries({ queryKey: ["expense-summary"] }),
      ...(expenseId
        ? [queryClient.invalidateQueries({ queryKey: ["expense", expenseId] })]
        : []),
    ]);
}

export function useAssignExpensesToProjectMutation(projectId: string) {
  const invalidate = useInvalidateProjectExpenses(projectId);
  return useMutation({
    mutationFn: (input: { expenseIds: string[]; projectJobId: string | null }) =>
      assignExpensesToProjectApi({ projectId, ...input }),
    onSuccess: () => invalidate(),
  });
}

export function useCreateProjectExpenseMutation(projectId: string) {
  const invalidate = useInvalidateProjectExpenses(projectId);
  return useMutation({
    mutationFn: (input: { draft: ExpenseDraft; files: File[]; projectJobId: string | null }) =>
      createProjectExpenseApi({ projectId, ...input }),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateProjectExpenseMutation(projectId: string) {
  const invalidate = useInvalidateProjectExpenses(projectId);
  return useMutation({
    mutationFn: (input: { id: string; draft: ExpenseDraft }) =>
      updateProjectExpenseApi({ projectId, ...input }),
    onSuccess: (_data, input) => invalidate(input.id),
  });
}

/** One expense as the project's View shows it — fetched fresh on open, as before. */
export function useProjectExpenseViewQuery(expenseId: string | null) {
  return useQuery({
    queryKey: ["expense", expenseId, "project-view"],
    queryFn: () => fetchProjectExpenseView(expenseId as string),
    enabled: !!expenseId,
  });
}
