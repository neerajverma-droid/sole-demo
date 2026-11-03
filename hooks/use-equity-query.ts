"use client";

import * as React from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createEquityApi,
  deleteEquityApi,
  deleteEquityAttachmentApi,
  fetchEquityPage,
  undoEquityMatchApi,
  updateEquityApi,
  uploadEquityAttachmentApi,
  type Equity,
  type EquityDraft,
} from "@/lib/equity";
import { useEquityStore } from "@/stores/equity";

/**
 * Loads one page of the account's equity entries and mirrors it into the
 * shared store. `page`, `pageSize` and `search` are all the server
 * understands — changing any of them refetches. Mirrors
 * `use-liabilities-query.ts`.
 */
export function useEquityQuery(page: number, pageSize: number, search: string) {
  const setEquity = useEquityStore((state) => state.setEquity);

  const query = useQuery({
    queryKey: ["equity", page, pageSize, search],
    queryFn: () => fetchEquityPage(page, pageSize, search),
    /*
     * The previous page's rows stay on screen while the next one is in
     * flight, so a page, page-size or search change never empties the table
     * back to a first-load shimmer. `isPlaceholderData` is what tells the
     * table a fresh page is still coming.
     */
    placeholderData: keepPreviousData,
  });

  React.useEffect(() => {
    if (query.data) setEquity(query.data.equity);
  }, [query.data, setEquity]);

  return query;
}

/** Every mutation below refetches whichever page/search is on screen —
 *  a create, edit, delete or match change can shift which rows belong on
 *  the current page, not just their contents. */
function useInvalidateEquity() {
  const queryClient = useQueryClient();
  // The per-record detail (`["equity-detail", id]`) lives outside the list's
  // key — name it too, or the next open serves the pre-change copy.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["equity"] }),
      queryClient.invalidateQueries({ queryKey: ["equity-detail"] }),
    ]);
}

export function useCreateEquityMutation() {
  const invalidate = useInvalidateEquity();
  return useMutation({
    mutationFn: ({ draft, file }: { draft: EquityDraft; file: File | null }) =>
      createEquityApi(draft, file),
    onSuccess: invalidate,
  });
}

export function useUpdateEquityMutation() {
  const invalidate = useInvalidateEquity();
  return useMutation({
    mutationFn: ({
      id,
      draft,
      file,
    }: {
      id: string;
      draft: EquityDraft;
      file: File | null;
    }) => updateEquityApi(id, draft, file),
    onSuccess: invalidate,
  });
}

export function useDeleteEquityMutation() {
  const invalidate = useInvalidateEquity();
  return useMutation({
    mutationFn: (id: string) => deleteEquityApi(id),
    onSuccess: invalidate,
  });
}

export function useUndoEquityMatchMutation() {
  const invalidate = useInvalidateEquity();
  return useMutation({
    mutationFn: (equity: Equity) => undoEquityMatchApi(equity),
    onSuccess: invalidate,
  });
}

export function useUploadEquityAttachmentMutation() {
  const invalidate = useInvalidateEquity();
  return useMutation({
    mutationFn: ({ equityId, file }: { equityId: string; file: File }) =>
      uploadEquityAttachmentApi(equityId, file),
    onSuccess: invalidate,
  });
}

export function useDeleteEquityAttachmentMutation() {
  const invalidate = useInvalidateEquity();
  return useMutation({
    mutationFn: (documentId: string) => deleteEquityAttachmentApi(documentId),
    onSuccess: invalidate,
  });
}
