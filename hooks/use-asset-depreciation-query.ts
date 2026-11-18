"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteAssetDepreciationApi,
  fetchAssetDepreciation,
  saveAssetDepreciationApi,
  type AssetDepreciation,
} from "@/lib/assets";
import { invalidateAssetQueries } from "@/hooks/use-assets-query";

/** One asset's depreciation record, or `null` if it's never been set up. */
export function useAssetDepreciationQuery(assetId: string | undefined) {
  return useQuery({
    queryKey: ["asset-depreciation", assetId],
    queryFn: () => fetchAssetDepreciation(assetId as string),
    enabled: !!assetId,
  });
}

/** Create-or-update, since `/assets/depreciation` upserts on `asset_id` itself. */
export function useSaveAssetDepreciationMutation(assetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: AssetDepreciation) =>
      saveAssetDepreciationApi(assetId, values),
    // The record, its schedule, the asset, the register and the FY report —
    // refetched behind the caller, not awaited.
    onSuccess: () => {
      void invalidateAssetQueries(queryClient);
    },
  });
}

/** Removes the asset's active depreciation — the endpoint is keyed by asset id. */
export function useDeleteAssetDepreciationMutation(assetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteAssetDepreciationApi(assetId),
    // The record, its schedule, the asset, the register and the FY report —
    // refetched behind the caller, not awaited.
    onSuccess: () => {
      void invalidateAssetQueries(queryClient);
    },
  });
}
