"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import * as React from "react";

import {
  createAssetApi,
  fetchAssetDetails,
  syncAssetDocumentsApi,
  updateAssetApi,
  type Asset,
  type AssetDraft,
  type AssetSaveOptions,
} from "@/lib/assets";
import { useAssetRegistryQuery } from "@/hooks/use-asset-registry-query";
import { useAssetsQuery, useInvalidateAssets } from "@/hooks/use-assets-query";
import { useAssetRegistryStore } from "@/stores/asset-registry";
import { useAssetsStore } from "@/stores/assets";

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
 * One asset for the lifecycle screens (depreciation, disposal, insurance,
 * status), opened from the register or straight from a URL.
 *
 * The register's copy when it has one; otherwise the asset is fetched on its
 * own, so a refresh or a direct link isn't told "not found" just because the
 * register hasn't landed yet (or is stale). `loading` stays true until the
 * asset turns up or both sources have answered without it.
 */
export function useRegisterAsset(assetId: string): {
  asset: Asset | undefined;
  loading: boolean;
} {
  const assetsQuery = useAssetsQuery();
  const registryQuery = useAssetRegistryQuery();
  const hydrated = useAssetsStore((state) => state.hydrated);
  const listed = useAssetsStore((state) =>
    state.assets.find((entry) => entry.id === assetId),
  );
  const detail = useAssetQuery(listed ? undefined : assetId);
  const asset = listed ?? detail.data;
  const registerSettled = hydrated || assetsQuery.isError;
  // The detail fetch waits on the registry, so a failed registry settles it.
  const detailSettled = detail.isSuccess || detail.isError || registryQuery.isError;
  return { asset, loading: !asset && !(registerSettled && detailSettled) };
}

export type SaveAssetResult = {
  /**
   * Documents that couldn't be attached or removed after an update — the
   * asset itself saved, so these are reported rather than thrown.
   */
  documentFailures: string[];
};

/**
 * Create and update, sharing one shape: both need the current registry
 * snapshot to resolve `asset_brand_id`/`asset_type_id`, and both leave the
 * asset list stale until it's told otherwise — sole-ocr's create/update
 * responses carry no updated asset back (`data: {}`), so a refetch is the
 * only way to see the result, not a returned object to merge in.
 *
 * An update takes the asset as it was loaded (`original`): its category and
 * account decide whether the account is re-resolved, and its documents are
 * what the form's document list is diffed against — `/assets/update` doesn't
 * take files, so added ones are attached and removed ones deleted afterwards.
 */
export function useSaveAssetMutation() {
  const brandRecords = useAssetRegistryStore((state) => state.brandRecords);
  const typeRecords = useAssetRegistryStore((state) => state.typeRecords);
  const invalidateAssets = useInvalidateAssets();

  return React.useCallback(
    async (
      draft: AssetDraft,
      original?: Asset,
      options: AssetSaveOptions & {
        /** The id being edited. With one, a missing `original` is an error, never a create. */
        assetId?: string;
      } = {},
    ): Promise<SaveAssetResult> => {
      const registry = { brands: brandRecords, types: typeRecords };
      let documentFailures: string[] = [];
      if (options.assetId && original?.id !== options.assetId) {
        throw new Error("This asset hasn't loaded — reload the page and try again.");
      }
      if (original) {
        await updateAssetApi(original.id, draft, registry, original, options);
        const sync = await syncAssetDocumentsApi(
          original.id,
          original.documents,
          draft.documents,
        );
        documentFailures = sync.failures;
      } else {
        await createAssetApi(draft, registry, options);
      }
      // The asset's own record, the register, its depreciation and the report.
      await invalidateAssets();
      return { documentFailures };
    },
    [brandRecords, typeRecords, invalidateAssets],
  );
}
