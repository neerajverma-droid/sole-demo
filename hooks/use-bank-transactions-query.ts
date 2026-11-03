"use client";

import * as React from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { apiErrorMessage } from "@/lib/api-error";
import {
  SUGGESTIONS_PAGE_SIZE,
  approveAllApi,
  fetchSuggestionsCount,
  fetchSuggestionsPage,
  rejectSuggestionsApi,
  type ApprovalRow,
  approveTransactionApi,
  bulkMatchApi,
  markTransactionsApi,
  deleteUnmatchedTransactionApi,
  deleteUnmatchedTransactionsApi,
  fetchTransactionBalances,
  fetchTransactionsPage,
  markTransactionApi,
  undoMarkTransactionApi,
  undoMatchEntryApi,
  unmatchTransactionApi,
  unmatchTransactionsApi,
  type ApprovalInput,
  type BulkMatchInput,
  type MarkKind,
  type TransactionListParams,
} from "@/lib/bank-transactions";
import type { Transaction } from "@/lib/transactions";
import { useTransactionsStore } from "@/stores/transactions";

/** Every query this screen owns sits under this, so one invalidation refreshes all. */
export const BANK_TRANSACTIONS_KEY = ["bank-transactions"] as const;

/**
 * The page on show, mirrored into the store the row dialogs read. The year
 * label is read against the business's own financial year unless the caller
 * says otherwise.
 */
export function useBankTransactionsPage(listParams: TransactionListParams) {
  const setTransactions = useTransactionsStore(
    (state) => state.setTransactions,
  );
  const fiscalYearStart = useFiscalYearStart();
  const params: TransactionListParams = {
    fiscalYearStart,
    ...listParams,
  };

  const query = useQuery({
    queryKey: [...BANK_TRANSACTIONS_KEY, "page", params],
    queryFn: () => fetchTransactionsPage(params),
    /*
     * Paging keeps the old rows on screen until the next page lands. Anything
     * else — another tab, year, search or filter — is a different list, so
     * the table goes back to loading rather than showing the old one.
     */
    placeholderData: (previous, previousQuery) => {
      const before = previousQuery?.queryKey[2] as
        | TransactionListParams
        | undefined;
      const sameList =
        !!before &&
        before.tab === params.tab &&
        before.period === params.period &&
        before.fiscalYearStart?.month === params.fiscalYearStart?.month &&
        before.fiscalYearStart?.day === params.fiscalYearStart?.day &&
        before.search === params.search &&
        before.pageSize === params.pageSize &&
        !!before.personal === !!params.personal &&
        !!before.transfer === !!params.transfer &&
        JSON.stringify(before.filters ?? {}) ===
          JSON.stringify(params.filters ?? {});
      return sameList ? previous : undefined;
    },
  });

  React.useEffect(() => {
    if (query.data) setTransactions(query.data.rows);
  }, [query.data, setTransactions]);

  const { isError, error, errorUpdatedAt } = query;
  React.useEffect(() => {
    if (!isError) return;
    toast.error(apiErrorMessage(error, error?.message || "Couldn't load transactions."), {
      id: `bank-transactions-error-${errorUpdatedAt}`,
    });
  }, [isError, error, errorUpdatedAt]);

  return query;
}

export function useBankTransactionBalances(period: string) {
  const fiscalYearStart = useFiscalYearStart();
  return useQuery({
    queryKey: [
      ...BANK_TRANSACTIONS_KEY,
      "balances",
      period,
      fiscalYearStart.month,
      fiscalYearStart.day,
    ],
    queryFn: () => fetchTransactionBalances(period, fiscalYearStart),
  });
}

function useActionMutation<T>(
  action: (input: T) => Promise<string>,
  success: (input: T) => string,
  failure: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: (_, input) => {
      toast.success(success(input));
      void queryClient.invalidateQueries({ queryKey: BANK_TRANSACTIONS_KEY });
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, error.message || failure));
    },
  });
}

export function useMarkTransaction() {
  return useActionMutation(
    ({ row, kind }: { row: Transaction; kind: MarkKind }) =>
      markTransactionApi(row.id, kind),
    ({ kind }) => `This transaction has been marked as ${kind}.`,
    "Couldn't mark the transaction.",
  );
}

export function useUndoMarkTransaction() {
  return useActionMutation(
    ({ row, kind }: { row: Transaction; kind: MarkKind }) =>
      undoMarkTransactionApi(row.id, kind),
    ({ row }) => `${row.reference} is back in Unmatched.`,
    "Couldn't undo the transaction.",
  );
}

export function useUnmatchTransaction() {
  return useActionMutation(
    (row: Transaction) => unmatchTransactionApi(row.id),
    (row) => `${row.reference} unmatched`,
    "Couldn't unmatch the transaction.",
  );
}

export function useDeleteTransaction() {
  return useActionMutation(
    (row: Transaction) => deleteUnmatchedTransactionApi(row.id),
    () => "Transaction deleted",
    "Couldn't delete the transaction.",
  );
}

/** Bulk delete — only rows that didn't come from the bank feed. */
export function useBulkDelete() {
  return useActionMutation(
    (ids: string[]) => deleteUnmatchedTransactionsApi(ids),
    (ids) =>
      `${ids.length} ${ids.length === 1 ? "transaction" : "transactions"} deleted`,
    "Couldn't delete the transactions.",
  );
}

export function useBulkUnmatch() {
  return useActionMutation(
    (ids: string[]) => unmatchTransactionsApi(ids),
    (ids) =>
      `${ids.length} ${ids.length === 1 ? "transaction" : "transactions"} unmatched`,
    "Couldn't undo the match.",
  );
}

export function useUndoMatchEntry() {
  return useActionMutation(
    (line: { entryId: string; label: string }) => undoMatchEntryApi(line.entryId),
    (line) => `${line.label} unmatched`,
    "Couldn't undo the match.",
  );
}

/** Approve one unmatched row — it moves to Matched on success. */
export function useApproveTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ApprovalInput) => approveTransactionApi(input),
    onSuccess: (message) => {
      toast.success(message || "Transaction approved successfully.");
      void queryClient.invalidateQueries({ queryKey: BANK_TRANSACTIONS_KEY });
    },
    onError: (error) => {
      toast.error(
        apiErrorMessage(error, error.message || "Failed to approve transaction."),
      );
    },
  });
}

/** Bulk Personal / Bulk Transfer — the lines move to Matched. */
export function useBulkMark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids: string[]; kind: MarkKind }) =>
      markTransactionsApi(input.ids, input.kind),
    onSuccess: (message, input) => {
      toast.success(
        message ||
          `${input.ids.length} transactions marked as ${input.kind}.`,
      );
      void queryClient.invalidateQueries({ queryKey: BANK_TRANSACTIONS_KEY });
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, error.message || "Couldn't mark the transactions."));
    },
  });
}

/** Bulk Match — every selected line against one account and counterparty. */
export function useBulkMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkMatchInput) => bulkMatchApi(input),
    onSuccess: (message) => {
      toast.success(message || "Transactions matched successfully.");
      void queryClient.invalidateQueries({ queryKey: BANK_TRANSACTIONS_KEY });
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, error.message || "Couldn't match the transactions."));
    },
  });
}

/** The banner's count — every unmatched line waiting for review. */
export function useSuggestionsCount() {
  return useQuery({
    queryKey: [...BANK_TRANSACTIONS_KEY, "suggestions-count"],
    queryFn: fetchSuggestionsCount,
  });
}

/** The review's rows, 25 at a time as the list scrolls — only while open. */
export function useSuggestions(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...BANK_TRANSACTIONS_KEY, "suggestions"],
    queryFn: ({ pageParam }) => fetchSuggestionsPage(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      pages.length * SUGGESTIONS_PAGE_SIZE < last.total ? pages.length + 1 : undefined,
    enabled,
  });
}

export function useApproveAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rows: ApprovalRow[]) => approveAllApi(rows),
    onSuccess: (message) => {
      toast.success(message || "Transactions approved successfully.");
      void queryClient.invalidateQueries({ queryKey: BANK_TRANSACTIONS_KEY });
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, error.message || "Failed to approve transactions."));
    },
  });
}

export function useRejectSuggestions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => rejectSuggestionsApi(ids),
    onSuccess: (message) => {
      toast.success(message || "Suggestions rejected successfully.");
      void queryClient.invalidateQueries({ queryKey: BANK_TRANSACTIONS_KEY });
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, error.message || "Couldn't reject the suggestions."));
    },
  });
}
