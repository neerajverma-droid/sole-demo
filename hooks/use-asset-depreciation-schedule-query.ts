"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchAssetDepreciationSchedule } from "@/lib/asset-depreciation-schedule";

/**
 * One asset's stored depreciation schedule, or `null` when none is set up.
 *
 * Keyed under `["asset-depreciation", assetId, …]`, so the settings mutations'
 * `invalidateQueries({ queryKey: ["asset-depreciation", assetId] })` refreshes
 * it too after a save or removal.
 */
export function useAssetDepreciationScheduleQuery(assetId: string | undefined) {
  return useQuery({
    queryKey: ["asset-depreciation", assetId, "schedule"],
    queryFn: () => fetchAssetDepreciationSchedule(assetId as string),
    enabled: !!assetId,
  });
}
