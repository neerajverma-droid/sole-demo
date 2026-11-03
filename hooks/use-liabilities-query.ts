"use client";

import * as React from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createLiabilityApi,
  deleteLiabilityApi,
  deleteLiabilityAttachmentApi,
  fetchLiabilitiesPage,
  undoLiabilityMatchApi,
  updateLiabilityApi,
  uploadLiabilityAttachmentApi,
  type Liability,
  type LiabilityDraft,
} from "@/lib/liabilities";
import { useLiabilitiesStore } from "@/stores/liabilities";

/**
 * Loads one page of the account's liabilities and mirrors it into the
 * shared store. `page`, `pageSize` and `search` are all the server
 * understands — changing any of them refetches. Mirrors
 * `use-super-contributions-query.ts`.
 */
export function useLiabilitiesQuery(
  page: number,
  pageSize: number,
  search: string,
) {
  const setLiabilities = useLiabilitiesStore((state) => state.setLiabilities);

  const query = useQuery({
    queryKey: ["liabilities", page, pageSize, search],
    queryFn: () => fetchLiabilitiesPage(page, pageSize, search),
    /*
     * The previous page's rows stay on screen while the next one is in
     * flight, so a page, page-size or search change never empties the table
     * back to a first-load shimmer. `isPlaceholderData` is what tells the
     * table a fresh page is still coming.
     */
    placeholderData: keepPreviousData,
  });

  React.useEffect(() => {
    if (query.data) setLiabilities(query.data.liabilities);
  }, [query.data, setLiabilities]);

  return query;
}

/** Every mutation below refetches whichever page/search is on screen —
 *  a create, edit, delete, match or attachment change can shift which rows
 *  belong on the current page, not just their contents. */
function useInvalidateLiabilities() {
  const queryClient = useQueryClient();
  /*
   * The per-record detail (`["liability-detail", id]` — documents, the edit
   * form's seed, the View dialog) lives outside the list's key, so it has to
   * be named too, or the next open serves the pre-change copy until a hard
   * refresh.
   */
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["liabilities"] }),
      queryClient.invalidateQueries({ queryKey: ["liability-detail"] }),
    ]);
}

export function useCreateLiabilityMutation() {
  const invalidate = useInvalidateLiabilities();
  return useMutation({
    mutationFn: ({ draft, file }: { draft: LiabilityDraft; file: File | null }) =>
      createLiabilityApi(draft, file),
    onSuccess: invalidate,
  });
}

export function useUpdateLiabilityMutation() {
  const invalidate = useInvalidateLiabilities();
  return useMutation({
    mutationFn: ({
      id,
      draft,
      file,
    }: {
      id: string;
      draft: LiabilityDraft;
      file: File | null;
    }) => updateLiabilityApi(id, draft, file),
    onSuccess: invalidate,
  });
}

export function useDeleteLiabilityMutation() {
  const invalidate = useInvalidateLiabilities();
  return useMutation({
    mutationFn: (id: string) => deleteLiabilityApi(id),
    onSuccess: invalidate,
  });
}

export function useUndoLiabilityMatchMutation() {
  const invalidate = useInvalidateLiabilities();
  return useMutation({
    mutationFn: (liability: Liability) => undoLiabilityMatchApi(liability),
    onSuccess: invalidate,
  });
}

export function useUploadLiabilityAttachmentMutation() {
  const invalidate = useInvalidateLiabilities();
  return useMutation({
    mutationFn: ({ liabilityId, file }: { liabilityId: string; file: File }) =>
      uploadLiabilityAttachmentApi(liabilityId, file),
    onSuccess: invalidate,
  });
}

export function useDeleteLiabilityAttachmentMutation() {
  const invalidate = useInvalidateLiabilities();
  return useMutation({
    mutationFn: (documentId: string) => deleteLiabilityAttachmentApi(documentId),
    onSuccess: invalidate,
  });
}
