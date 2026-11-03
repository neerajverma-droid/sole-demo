"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createAccountApi,
  createCategoryApi,
  fetchChart,
  fetchChartCountries,
  restoreAccountApi,
  restoreCategoryApi,
  retireAccountApi,
  retireCategoryApi,
  updateAccountApi,
  updateCategoryApi,
  type AccountInput,
  type CategoryInput,
} from "@/lib/admin/chart-of-accounts";

/**
 * The shared chart of accounts, for the admin console.
 *
 * Every write invalidates the whole chart rather than patching a row: a retire
 * changes a category's "can this be retired" state, a rename changes what a
 * country calls it, and the posting counts come from the same response. One
 * refetch of a list this small is cheaper than keeping four derived things in
 * step by hand.
 */

const CHART_KEY = ["admin", "chart-of-accounts"] as const;

export function useAdminChartQuery(params: { includeDeleted: boolean; country: string | null }) {
  return useQuery({
    queryKey: [...CHART_KEY, params],
    queryFn: () => fetchChart(params),
    staleTime: 60_000,
  });
}

/** Every registry country, including drafts — an account can be scoped to one before it launches. */
export function useAdminChartCountriesQuery() {
  return useQuery({
    queryKey: [...CHART_KEY, "countries"],
    queryFn: fetchChartCountries,
    staleTime: 60 * 60_000,
  });
}

function useInvalidateChart() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: CHART_KEY });
}

export function useCreateAccountMutation() {
  const invalidate = useInvalidateChart();
  return useMutation({ mutationFn: (input: AccountInput) => createAccountApi(input), onSuccess: invalidate });
}

export function useUpdateAccountMutation() {
  const invalidate = useInvalidateChart();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: AccountInput }) => updateAccountApi(id, input),
    onSuccess: invalidate,
  });
}

export function useRetireAccountMutation() {
  const invalidate = useInvalidateChart();
  return useMutation({ mutationFn: (id: number) => retireAccountApi(id), onSuccess: invalidate });
}

export function useRestoreAccountMutation() {
  const invalidate = useInvalidateChart();
  return useMutation({ mutationFn: (id: number) => restoreAccountApi(id), onSuccess: invalidate });
}

export function useCreateCategoryMutation() {
  const invalidate = useInvalidateChart();
  return useMutation({ mutationFn: (input: CategoryInput) => createCategoryApi(input), onSuccess: invalidate });
}

export function useUpdateCategoryMutation() {
  const invalidate = useInvalidateChart();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: CategoryInput }) => updateCategoryApi(id, input),
    onSuccess: invalidate,
  });
}

export function useRetireCategoryMutation() {
  const invalidate = useInvalidateChart();
  return useMutation({ mutationFn: (id: number) => retireCategoryApi(id), onSuccess: invalidate });
}

export function useRestoreCategoryMutation() {
  const invalidate = useInvalidateChart();
  return useMutation({ mutationFn: (id: number) => restoreCategoryApi(id), onSuccess: invalidate });
}
