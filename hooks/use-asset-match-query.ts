"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import {
  bulkUndoAssetMatchesApi,
  fetchPossibleAssetMatches,
  matchAssetToMultipleTransactionsApi,
  matchAssetToTransactionApi,
  undoAssetCashPaymentApi,
  undoAssetMatchApi,
} from "@/lib/asset-match";

/**
 * An asset id — undo its latest match — or an asset id and the one matched
 * journal entry to take off, for an asset matched to several transactions.
 */
export type UndoAssetMatchVariables =
  | string
  | { assetId: string; journalEntryId?: string };

function undoTarget(variables: UndoAssetMatchVariables) {
  return typeof variables === "string" ? { assetId: variables } : variables;
}

/**
 * Candidate bank transactions for one asset, fetched fresh each time the
 * dialog opens. `multipleMatchMode` widens the list for the "Assign to
 * Multiple" tab — pass a different value and this refetches under its own
 * cache key rather than reusing the narrower single-match list.
 */
export function usePossibleAssetMatchesQuery(
  assetId: string | undefined,
  multipleMatchMode = false,
) {
  return useQuery({
    queryKey: ["asset-possible-matches", assetId, multipleMatchMode],
    queryFn: () => fetchPossibleAssetMatches(assetId as string, multipleMatchMode),
    enabled: !!assetId,
    // A candidate list is stale the moment it's fetched — another tab could
    // reconcile the same transaction first — so it's never worth caching.
    staleTime: 0,
  });
}

/**
 * After a match changes: the register, each affected asset's own record (the
 * matched flag the edit form, the edit gate and the View dialog read) and its
 * candidate list.
 */
function invalidateAssetMatch(queryClient: QueryClient, assetIds: string[]) {
  void queryClient.invalidateQueries({ queryKey: ["assets"] });
  for (const assetId of assetIds) {
    void queryClient.invalidateQueries({ queryKey: ["asset", assetId] });
    void queryClient.invalidateQueries({
      queryKey: ["asset-possible-matches", assetId],
    });
  }
}

export function useMatchAssetMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      assetId,
      bankTransactionId,
    }: {
      assetId: string;
      bankTransactionId: string;
    }) => matchAssetToTransactionApi(assetId, bankTransactionId),
    onSuccess: (_result, { assetId }) => invalidateAssetMatch(queryClient, [assetId]),
  });
}

export function useMatchAssetToMultipleMutation(assetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (transactionIds: string[]) =>
      matchAssetToMultipleTransactionsApi(assetId, transactionIds),
    onSuccess: () => invalidateAssetMatch(queryClient, [assetId]),
  });
}

/**
 * The undo's mutation options, apart from the hook so the one thing worth
 * pinning can be tested: the call resolves as soon as the server answers, not
 * when the register has finished reloading. Whatever follows the undo (opening
 * the edit form, say) waits only on the undo.
 */
export function undoAssetMatchMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (variables: UndoAssetMatchVariables) => {
      const { assetId, journalEntryId } = undoTarget(variables);
      return undoAssetMatchApi(assetId, journalEntryId);
    },
    // Not returned: the register refetches behind the caller.
    onSuccess: (_: void, variables: UndoAssetMatchVariables) => {
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
      // The one asset's own record carries the matched flag the edit form reads.
      void queryClient.invalidateQueries({
        queryKey: ["asset", undoTarget(variables).assetId],
      });
    },
  };
}

export function useUndoAssetMatchMutation() {
  const queryClient = useQueryClient();
  return useMutation(undoAssetMatchMutationOptions(queryClient));
}

/** Undoes a paid-with-cash asset's cash payment (and its cash transaction). */
export function useUndoAssetCashPaymentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) => undoAssetCashPaymentApi(assetId),
    onSuccess: (_: void, assetId: string) => {
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
      void queryClient.invalidateQueries({ queryKey: ["asset", assetId] });
    },
  });
}

export function useBulkUndoAssetMatchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assetIds: string[]) => bulkUndoAssetMatchesApi(assetIds),
    onSuccess: (_result, assetIds) => invalidateAssetMatch(queryClient, assetIds),
  });
}
