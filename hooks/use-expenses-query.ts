"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

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
  // Resolves once whatever is on screen has refetched. Most callers fire and
  // forget; the bulk import waits on it.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["expenses"] }),
      // A bare prefix — matches every page/size/filter combination cached
      // under it, same as invalidating ["expenses"] above matches every period.
      queryClient.invalidateQueries({ queryKey: ["expenses-page"] }),
      queryClient.invalidateQueries({ queryKey: ["expense-summary"] }),
      // Each expense's own detail too — the view dialog and the edit form read
      // it, and it carries what the list doesn't (attachments, the GST split).
      queryClient.invalidateQueries({ queryKey: ["expense"] }),
    ]);
}

/**
 * An attachment added to or removed from an expense being edited. Those save
 * straight away rather than on Save, so going back without saving must still
 * find the expense changed: its detail is marked stale (not refetched — the
 * open form has already taken its copy, and keeps its own attachment rows),
 * and the Expenses screen behind the form reloads fresh.
 */
export function markExpenseChanged(queryClient: QueryClient, expenseId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["expense", expenseId], refetchType: "none" }),
    resetExpensesListCache(queryClient),
  ]);
}

/**
 * After a create or edit on the full-page form, the list is cleared rather
 * than just marked stale. Marked stale, the list came back showing the page it
 * had before — no new row, no sign it was loading — until a background
 * refetch quietly swapped it. Cleared, it has nothing to show and loads
 * fresh, under its skeleton. In-place actions on the list itself (delete,
 * match) keep the quiet invalidate, so a row action doesn't blank the table.
 */
export function resetExpensesListCache(queryClient: QueryClient) {
  // Only what's off screen — the Expenses screen, while the form is open — so
  // nothing currently visible ever blanks. The list's two queries (the page,
  // and the complete list it switches to for a supplier sort or filter) and
  // the stat cards' summary, so the cards load under their skeleton with the
  // list rather than showing the totals from before the save.
  return Promise.all([
    queryClient.resetQueries({ queryKey: ["expenses-page"], type: "inactive" }),
    queryClient.resetQueries({ queryKey: ["expenses"], type: "inactive" }),
    queryClient.resetQueries({ queryKey: ["expense-summary"], type: "inactive" }),
  ]);
}

function useResetExpensesList() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateExpenses();
  return () => {
    invalidate();
    return resetExpensesListCache(queryClient);
  };
}

export function useCreateExpenseMutation() {
  const invalidate = useResetExpensesList();
  return useMutation({
    mutationFn: ({ draft, files }: { draft: ExpenseDraft; files?: File[] }) =>
      createExpenseApi(draft, files),
    onSuccess: invalidate,
  });
}

export function useUpdateExpenseMutation() {
  const invalidate = useResetExpensesList();
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
  const queryClient = useQueryClient();
  const invalidate = useInvalidateExpenses();
  // The import splits GST out itself, so it needs the business's rate per row date.
  const { country } = useCountryContext();
  return useMutation({
    mutationFn: (rows: BulkRow[]) =>
      createBulkExpenses(expensePayloads(rows, categories, (date) => documentTax(country, date).rate)),
    // Held until the list behind the dialog has reloaded, so the wizard only
    // reports Done once the imported expenses are actually in the table and
    // the stat cards — not a beat before, with the old page still showing.
    onSuccess: () => Promise.all([invalidate(), resetExpensesListCache(queryClient)]),
  });
}
