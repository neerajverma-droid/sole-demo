"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createAssetInsuranceApi,
  deleteAssetInsuranceApi,
  fetchAssetInsurance,
  sendAssetInsuranceReportApi,
  updateAssetInsuranceApi,
  type AssetInsurance,
} from "@/lib/assets";

/** Every policy held against one asset. */
export function useAssetInsuranceQuery(assetId: string | undefined) {
  return useQuery({
    queryKey: ["asset-insurance", assetId],
    queryFn: () => fetchAssetInsurance(assetId as string),
    enabled: !!assetId,
  });
}

function useInvalidateInsurance(assetId: string) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ["asset-insurance", assetId] });
}

export function useCreateAssetInsuranceMutation(assetId: string) {
  const invalidate = useInvalidateInsurance(assetId);
  return useMutation({
    mutationFn: (record: AssetInsurance) => createAssetInsuranceApi(assetId, record),
    onSuccess: invalidate,
  });
}

export function useUpdateAssetInsuranceMutation(assetId: string) {
  const invalidate = useInvalidateInsurance(assetId);
  return useMutation({
    mutationFn: (record: AssetInsurance) => updateAssetInsuranceApi(record),
    onSuccess: invalidate,
  });
}

export function useDeleteAssetInsuranceMutation(assetId: string) {
  const invalidate = useInvalidateInsurance(assetId);
  return useMutation({
    mutationFn: (recordId: string) => deleteAssetInsuranceApi(recordId),
    onSuccess: invalidate,
  });
}

export function useSendAssetInsuranceReportMutation() {
  return useMutation({
    mutationFn: (recordId: string) => sendAssetInsuranceReportApi(recordId),
  });
}
