"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteAssetDepreciationApi,
  fetchAssetDepreciation,
  saveAssetDepreciationApi,
  type AssetDepreciation,
} from "@/lib/assets";

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-depreciation", assetId] });
      queryClient.invalidateQueries({ queryKey: ["asset", assetId] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}

export function useDeleteAssetDepreciationMutation(assetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (depreciationId: string) =>
      deleteAssetDepreciationApi(depreciationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-depreciation", assetId] });
      queryClient.invalidateQueries({ queryKey: ["asset", assetId] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}
