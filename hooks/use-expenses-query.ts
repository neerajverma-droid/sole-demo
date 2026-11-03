"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createExpenseApi,
  fetchExpenses,
  fetchExpensesPage,
  fetchExpenseSummary,
  updateExpenseApi,
  type ExpenseDraft,
  type ExpenseListFilters,
  type ExpensePeriod,
} from "@/lib/expenses";
import { useExpensesStore } from "@/stores/expenses";
import { createBulkExpenses } from "@/lib/bulk-records";
import { useCountryContext } from "@/hooks/use-country-context";
import { documentTax } from "@/lib/country-context";
import {
  expensePayloads,
  type ExpenseCategoryOption,
} from "@/lib/expense-import";
import type { BulkRow } from "@/lib/bulk-import";

/**
 * Loads the account's complete expense list and mirrors it into the shared
 * store. `enabled: false` (defaults to on) is for a caller that only needs
 * this as a fallback under some other condition — the expenses listing's own
 * category/supplier filters, which can't be pushed down to the server, only
 * turn this on while one of them is actually in play, so the default view
 * doesn't pull hundreds of rows just to sit unused.
 */
export function useExpensesQuery(options: { enabled?: boolean } = {}) {
  const setExpenses = useExpensesStore((state) => state.setExpenses);

  const query = useQuery({
    queryKey: ["expenses"],
    queryFn: fetchExpenses,
    enabled: options.enabled ?? true,
  });

  React.useEffect(() => {
    if (query.data) setExpenses(query.data);
  }, [query.data, setExpenses]);

  return query;
}

/**
 * The listing screen's own real page — separate from `useExpensesQuery`
 * above, which every other screen reading `useExpensesStore` still relies on
 * for its complete-list totals. Changing the page, its size, or a filter all
 * refetch, same as the invoice list's own paginated query.
 */
export function useExpensesListQuery(
  page: number,
  pageSize: number,
  filters: ExpenseListFilters,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["expenses-page", page, pageSize, filters],
    queryFn: () => fetchExpensesPage(page, pageSize, filters),
    enabled: options.enabled ?? true,
  });
}

/**
 * The stat cards' real totals and period-over-period change — decoupled from
 * the list fetch, same as super-contributions' matrix, since the counts
 * still come from the local list while the amounts and deltas come from here.
 */
export function useExpenseSummaryQuery(period: ExpensePeriod) {
  return useQuery({
    queryKey: ["expense-summary", period],
    queryFn: () => fetchExpenseSummary(period),
  });
}

export function useInvalidateExpenses() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    // A bare prefix — matches every page/size/filter combination cached
    // under it, same as invalidating ["expenses"] above matches every period.
    queryClient.invalidateQueries({ queryKey: ["expenses-page"] });
    queryClient.invalidateQueries({ queryKey: ["expense-summary"] });
  };
}

export function useCreateExpenseMutation() {
  const invalidate = useInvalidateExpenses();
  return useMutation({
    mutationFn: ({ draft, files }: { draft: ExpenseDraft; files?: File[] }) =>
      createExpenseApi(draft, files),
    onSuccess: invalidate,
  });
}

export function useUpdateExpenseMutation() {
  const invalidate = useInvalidateExpenses();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: ExpenseDraft }) =>
      updateExpenseApi(id, draft),
    onSuccess: invalidate,
  });
}

/** The bulk importer's write, alongside the single-expense create above. */
export function useBulkCreateExpensesMutation(
  categories: readonly ExpenseCategoryOption[],
) {
  const invalidate = useInvalidateExpenses();
  // The import splits GST out itself, so it needs the business's rate per row date.
  const { country } = useCountryContext();
  return useMutation({
    mutationFn: (rows: BulkRow[]) =>
      createBulkExpenses(expensePayloads(rows, categories, (date) => documentTax(country, date).rate)),
    onSuccess: invalidate,
  });
}
