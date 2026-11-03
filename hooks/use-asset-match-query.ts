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
  undoAssetMatchApi,
} from "@/lib/asset-match";

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

function useInvalidateAssetMatch(assetId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["assets"] });
    queryClient.invalidateQueries({
      queryKey: ["asset-possible-matches", assetId],
    });
  };
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
    onSuccess: (_result, { assetId }) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({
        queryKey: ["asset-possible-matches", assetId],
      });
    },
  });
}

export function useMatchAssetToMultipleMutation(assetId: string) {
  const invalidate = useInvalidateAssetMatch(assetId);
  return useMutation({
    mutationFn: (transactionIds: string[]) =>
      matchAssetToMultipleTransactionsApi(assetId, transactionIds),
    onSuccess: invalidate,
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
    mutationFn: (assetId: string) => undoAssetMatchApi(assetId),
    // Not returned: the register refetches behind the caller.
    onSuccess: (_: void, assetId: string) => {
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
      // The one asset's own record carries the matched flag the edit form reads.
      void queryClient.invalidateQueries({ queryKey: ["asset", assetId] });
    },
  };
}

export function useUndoAssetMatchMutation() {
  const queryClient = useQueryClient();
  return useMutation(undoAssetMatchMutationOptions(queryClient));
}

export function useBulkUndoAssetMatchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assetIds: string[]) => bulkUndoAssetMatchesApi(assetIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assets"] }),
  });
}
