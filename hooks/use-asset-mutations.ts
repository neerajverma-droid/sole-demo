"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  assetValue,
  attachAssetDocumentApi,
  createAssetApi,
  deleteAssetDocumentApi,
  deleteAssetsApi,
  type Asset,
  type AssetDraft,
  type AssetFile,
  type BulkDeleteResult,
} from "@/lib/assets";
import { useInvalidateAssets } from "@/hooks/use-assets-query";
import { useAssetRegistryStore } from "@/stores/asset-registry";

/** Attaches one supporting document to an existing asset. */
export function useAttachAssetDocumentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, file }: { assetId: string; file: AssetFile }) =>
      attachAssetDocumentApi(assetId, file),
    onSuccess: (_data, { assetId }) => {
      queryClient.invalidateQueries({ queryKey: ["asset", assetId] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}

export function useDeleteAssetDocumentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId }: { assetId: string; documentId: string }) =>
      deleteAssetDocumentApi(documentId),
    onSuccess: (_data, { assetId }) => {
      queryClient.invalidateQueries({ queryKey: ["asset", assetId] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}

/**
 * Deletes one or more assets. Some may come back in `skippedIds` — reconciled
 * or inventory-linked assets aren't deleted server-side — so the caller gets
 * the full split rather than a bare success/fail.
 */
export function useDeleteAssetsMutation() {
  const invalidateAssets = useInvalidateAssets();
  return useMutation<BulkDeleteResult, Error, string[]>({
    mutationFn: (ids: string[]) => deleteAssetsApi(ids),
    onSuccess: () => invalidateAssets(),
  });
}

/**
 * A copy of an existing asset, created fresh on the server rather than
 * spliced into the local store — `createAssetApi` doesn't hand back the
 * created row, so the copy only becomes visible once the list refetches.
 */
export function useDuplicateAssetMutation() {
  const invalidateAssets = useInvalidateAssets();
  const brandRecords = useAssetRegistryStore((state) => state.brandRecords);
  const typeRecords = useAssetRegistryStore((state) => state.typeRecords);
  return useMutation({
    mutationFn: (source: Asset) => {
      const { id: _id, ...draft } = source;
      void _id;
      const copy: AssetDraft = {
        ...draft,
        name: `${source.name} (copy)`,
        serialNo: "",
        // A fresh, unreconciled asset of its own — not the original's match.
        isReconciled: false,
        remainingAmount: assetValue(draft),
        possibleMatchCount: 0,
        // A copy is a second physical thing — it gets its own product record
        // rather than sharing the original's stock.
        inventoryProductId: null,
      };
      return createAssetApi(copy, { brands: brandRecords, types: typeRecords });
    },
    onSuccess: () => invalidateAssets(),
  });
}
