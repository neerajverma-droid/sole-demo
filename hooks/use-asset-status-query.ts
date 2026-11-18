"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteAssetStatusApi,
  fetchAssetStatus,
  markAssetReturnedApi,
  reportAssetStatusApi,
  type ReportAssetStatusValues,
} from "@/lib/assets";
import { invalidateAssetQueries } from "@/hooks/use-assets-query";

/** The asset's current lost/damaged/stolen report, or `null` if none. */
export function useAssetStatusQuery(assetId: string | undefined) {
  return useQuery({
    queryKey: ["asset-status", assetId],
    queryFn: () => fetchAssetStatus(assetId as string),
    enabled: !!assetId,
  });
}

function useInvalidateAssetStatus(assetId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["asset-status", assetId] });
    // Disposal and lost/stolen share one backend row.
    queryClient.invalidateQueries({ queryKey: ["asset-disposal", assetId] });
    // A report pauses depreciation and "returned" resumes it.
    void invalidateAssetQueries(queryClient);
  };
}

export function useReportAssetStatusMutation(assetId: string) {
  const invalidate = useInvalidateAssetStatus(assetId);
  return useMutation({
    mutationFn: (values: ReportAssetStatusValues) =>
      reportAssetStatusApi(assetId, values),
    onSuccess: invalidate,
  });
}

export function useMarkAssetReturnedMutation(assetId: string) {
  const invalidate = useInvalidateAssetStatus(assetId);
  return useMutation({
    mutationFn: () => markAssetReturnedApi(assetId),
    onSuccess: invalidate,
  });
}

export function useDeleteAssetStatusMutation(assetId: string) {
  const invalidate = useInvalidateAssetStatus(assetId);
  return useMutation({
    mutationFn: () => deleteAssetStatusApi(assetId),
    onSuccess: invalidate,
  });
}
