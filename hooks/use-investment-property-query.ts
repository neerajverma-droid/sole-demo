"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createPropertyApi,
  deletePropertyApi,
  disposePropertyApi,
  fetchCapitalSnapshot,
  fetchExpenseBreakdown,
  fetchIncomeExpense,
  fetchKeyActions,
  fetchPortfolioSummary,
  fetchProperty,
  fetchPropertyComparison,
  fetchPropertiesPage,
  fetchPropertySummary,
  fetchRentCollection,
  updatePropertyApi,
  type DisposeDraft,
  type PortfolioFilters,
  type PropertyDraft,
  type PropertyListParams,
} from "@/lib/investment-property";

export const INVESTMENT_KEY = "investment-property";

export function usePropertiesQuery(params: PropertyListParams) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "list", params],
    queryFn: () => fetchPropertiesPage(params),
    placeholderData: keepPreviousData,
  });
}

export function usePropertyQuery(id: string) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "detail", id],
    queryFn: () => fetchProperty(id),
    enabled: !!id,
    refetchOnMount: "always",
  });
}

export function usePropertySummaryQuery(id: string, year: number) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "property-summary", id, year],
    queryFn: () => fetchPropertySummary(id, year),
    enabled: !!id,
  });
}

export function usePortfolioSummaryQuery(filters: PortfolioFilters) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "portfolio", "summary", filters],
    queryFn: () => fetchPortfolioSummary(filters),
    placeholderData: keepPreviousData,
  });
}

export function useExpenseBreakdownQuery(filters: PortfolioFilters) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "portfolio", "expense-breakdown", filters],
    queryFn: () => fetchExpenseBreakdown(filters),
    placeholderData: keepPreviousData,
  });
}

export function useIncomeExpenseQuery(filters: PortfolioFilters) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "portfolio", "income-expense", filters],
    queryFn: () => fetchIncomeExpense(filters),
    placeholderData: keepPreviousData,
  });
}

export function useRentCollectionQuery(filters: PortfolioFilters) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "portfolio", "rent-collection", filters],
    queryFn: () => fetchRentCollection(filters),
    placeholderData: keepPreviousData,
  });
}

export function useKeyActionsQuery(filters: PortfolioFilters) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "portfolio", "key-actions", filters],
    queryFn: () => fetchKeyActions(filters),
    placeholderData: keepPreviousData,
  });
}

export function useCapitalSnapshotQuery(filters: PortfolioFilters) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "portfolio", "capital-snapshot", filters],
    queryFn: () => fetchCapitalSnapshot(filters),
    placeholderData: keepPreviousData,
  });
}

export function usePropertyComparisonQuery(filters: PortfolioFilters) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "portfolio", "comparison", filters],
    queryFn: () => fetchPropertyComparison(filters),
    placeholderData: keepPreviousData,
  });
}

function useInvalidateInvestment() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [INVESTMENT_KEY] });
}

export function useCreatePropertyMutation() {
  const invalidate = useInvalidateInvestment();
  return useMutation({
    mutationFn: (draft: PropertyDraft) => createPropertyApi(draft),
    onSuccess: invalidate,
  });
}

export function useUpdatePropertyMutation() {
  const invalidate = useInvalidateInvestment();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: PropertyDraft }) =>
      updatePropertyApi(id, draft),
    onSuccess: invalidate,
  });
}

export function useDeletePropertyMutation() {
  const invalidate = useInvalidateInvestment();
  return useMutation({
    mutationFn: (id: string) => deletePropertyApi(id),
    onSuccess: invalidate,
  });
}

export function useDisposePropertyMutation() {
  const invalidate = useInvalidateInvestment();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: DisposeDraft }) =>
      disposePropertyApi(id, draft),
    onSuccess: invalidate,
  });
}
