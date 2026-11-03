"use client";

import * as React from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  assetAdvancedFilterCount,
  assetFiltersToApi,
  fetchAssets,
  type Asset,
  type AssetAdvancedFilters,
} from "@/lib/assets";
import { useAssetsStore } from "@/stores/assets";
import { useAssetRegistryQuery } from "@/hooks/use-asset-registry-query";
import { createBulkAssets } from "@/lib/bulk-records";
import {
  assetPayloads,
  type AssetCategoryOption,
} from "@/lib/asset-bulk-import";
import type { BulkRow } from "@/lib/bulk-import";

/**
 * Loads every asset and mirrors it into the shared store.
 *
 * Waits on the registry (`useAssetRegistryQuery`) rather than fetching in
 * parallel: an asset's `brand`/`assetType` are resolved from
 * `asset_brand_id`/`asset_type_id` at map time, so mapping before the
 * registry is loaded would show every asset with an empty make and type.
 */
export function useAssetsQuery() {
  const setAssets = useAssetsStore((state) => state.setAssets);
  const registryQuery = useAssetRegistryQuery();
  const registry = registryQuery.data;

  const query = useQuery({
    queryKey: ["assets"],
    queryFn: () => fetchAssets(registry ?? { brands: [], types: [] }),
    enabled: !!registry,
  });

  React.useEffect(() => {
    if (query.data) setAssets(query.data);
  }, [query.data, setAssets]);

  return query;
}

/**
 * The assets matching the "Filter by" dialog, as the server answers them.
 *
 * While nothing is filtering this asks for nothing: the register is already on
 * its way through `useAssetsQuery`, and a second identical request would only
 * be a second copy of it. It's keyed under `["assets", …]`, so anything that
 * invalidates the register (`useInvalidateAssets`) refreshes this too.
 *
 * The previous answer stays on screen while a changed filter is in flight
 * (`isPlaceholderData`), so applying one dims the list rather than blanking it.
 */
export function useFilteredAssetsQuery(filters: AssetAdvancedFilters): {
  /** Null while no filter is applied — the caller should use the full register. */
  assets: Asset[] | null;
  isLoading: boolean;
  isPlaceholderData: boolean;
  isError: boolean;
} {
  const registryQuery = useAssetRegistryQuery();
  const registry = registryQuery.data;
  const active = assetAdvancedFilterCount(filters) > 0;

  const query = useQuery({
    queryKey: ["assets", "filtered", assetFiltersToApi(filters)],
    queryFn: () => fetchAssets(registry ?? { brands: [], types: [] }, filters),
    enabled: active && !!registry,
    placeholderData: keepPreviousData,
  });

  return {
    assets: active ? (query.data ?? []) : null,
    isLoading: active && query.isLoading,
    isPlaceholderData: active && query.isPlaceholderData,
    isError: active && query.isError,
  };
}

/** Invalidates the assets list — call after any create/update/delete succeeds. */
export function useInvalidateAssets() {
  const queryClient = useQueryClient();
  return React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["assets"] }),
    [queryClient],
  );
}

/** The bulk importer's write — one batch, through `/assets/bulk/create`. */
export function useBulkCreateAssetsMutation(
  categories: readonly AssetCategoryOption[],
) {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: (rows: BulkRow[]) =>
      createBulkAssets(assetPayloads(rows, categories)),
    onSuccess: invalidate,
  });
}
