"use client";

import * as React from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
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
 *
 * Until the register lands the query is disabled, so its own `isLoading` is
 * false for that whole first stretch — a screen must read the store's
 * `hydrated` flag, not this query's `isLoading`, to know it is still waiting.
 */
export function useAssetsQuery() {
  const setAssets = useAssetsStore((state) => state.setAssets);
  const registryQuery = useAssetRegistryQuery();
  const registry = registryQuery.data;

  const query = useQuery({
    queryKey: ["assets"],
    queryFn: () => fetchAssets(registry ?? { brands: [], types: [] }),
    // Once the registry has answered, either way: if it failed, the register
    // still loads (with blank makes and types) rather than never loading.
    enabled: registryQuery.isSuccess || registryQuery.isError,
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
    // Same rule as the unfiltered register: once the registry has answered,
    // either way — a failed registry mustn't leave a filter loading forever.
    enabled: active && (registryQuery.isSuccess || registryQuery.isError),
    placeholderData: keepPreviousData,
  });

  return {
    assets: active ? (query.data ?? []) : null,
    isLoading: active && query.isLoading,
    isPlaceholderData: active && query.isPlaceholderData,
    isError: active && query.isError,
  };
}

/**
 * Every cached view an asset write can change, by key prefix: the register
 * (and its filtered views), each asset's detail, depreciation records and
 * schedules (`["asset-depreciation", id, …]`) and the FY depreciation report.
 * A save can change the cost, life or method these are all worked out from.
 */
export function invalidateAssetQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["assets"] }),
    queryClient.invalidateQueries({ queryKey: ["asset"] }),
    queryClient.invalidateQueries({ queryKey: ["asset-depreciation"] }),
    queryClient.invalidateQueries({ queryKey: ["asset-depreciation-report"] }),
  ]);
}

/** Invalidates the asset queries — call after any create/update/delete succeeds. */
export function useInvalidateAssets() {
  const queryClient = useQueryClient();
  return React.useCallback(
    () => invalidateAssetQueries(queryClient),
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
