"use client";

import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import * as React from "react";

import {
  createAssetApi,
  fetchAssetDetails,
  updateAssetApi,
  type Asset,
  type AssetDraft,
} from "@/lib/assets";
import { useAssetRegistryQuery } from "@/hooks/use-asset-registry-query";
import { useInvalidateAssets } from "@/hooks/use-assets-query";
import { useAssetRegistryStore } from "@/stores/asset-registry";

/**
 * One asset's full record, brand/type/model/serial and inventory linkage
 * included — what the edit form and the view dialog need but the register's
 * own list call doesn't carry. Waits on the registry for the same reason
 * `useAssetsQuery` does: brand/type are resolved from their ids at map time.
 */
export function useAssetQuery(assetId: string | undefined): UseQueryResult<Asset> {
  const registryQuery = useAssetRegistryQuery();
  const registry = registryQuery.data;

  return useQuery({
    queryKey: ["asset", assetId],
    queryFn: () => fetchAssetDetails(assetId as string, registry!),
    enabled: !!assetId && !!registry,
  });
}

/**
 * Create and update, sharing one shape: both need the current registry
 * snapshot to resolve `asset_brand_id`/`asset_type_id`, and both leave the
 * asset list stale until it's told otherwise — sole-ocr's create/update
 * responses carry no updated asset back (`data: {}`), so a refetch is the
 * only way to see the result, not a returned object to merge in.
 */
export function useSaveAssetMutation() {
  const brandRecords = useAssetRegistryStore((state) => state.brandRecords);
  const typeRecords = useAssetRegistryStore((state) => state.typeRecords);
  const invalidateAssets = useInvalidateAssets();
  const queryClient = useQueryClient();

  return React.useCallback(
    async (draft: AssetDraft, editingId?: string) => {
      const registry = { brands: brandRecords, types: typeRecords };
      if (editingId) {
        await updateAssetApi(editingId, draft, registry);
        await queryClient.invalidateQueries({ queryKey: ["asset", editingId] });
      } else {
        await createAssetApi(draft, registry);
      }
      await invalidateAssets();
    },
    [brandRecords, typeRecords, invalidateAssets, queryClient],
  );
}
