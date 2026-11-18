"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteAssetDisposalApi,
  fetchAssetDisposal,
  recordAssetDisposalApi,
} from "@/lib/assets";
import { invalidateAssetQueries } from "@/hooks/use-assets-query";

/** The disposal record for one asset, or `null` while it's still held. */
export function useAssetDisposalQuery(assetId: string | undefined) {
  return useQuery({
    queryKey: ["asset-disposal", assetId],
    queryFn: () => fetchAssetDisposal(assetId as string),
    enabled: !!assetId,
  });
}

function useInvalidateDisposal(assetId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["asset-disposal", assetId] });
    // Disposal and lost/stolen share one backend row.
    queryClient.invalidateQueries({ queryKey: ["asset-status", assetId] });
    // Disposing stops depreciation, so the schedule and report move too.
    void invalidateAssetQueries(queryClient);
  };
}

export function useRecordAssetDisposalMutation(assetId: string) {
  const invalidate = useInvalidateDisposal(assetId);
  return useMutation({
    mutationFn: (values: { disposedDate: string; saleValue: string }) =>
      recordAssetDisposalApi(assetId, values),
    onSuccess: invalidate,
  });
}

export function useDeleteAssetDisposalMutation(assetId: string) {
  const invalidate = useInvalidateDisposal(assetId);
  return useMutation({
    mutationFn: () => deleteAssetDisposalApi(assetId),
    onSuccess: invalidate,
  });
}
