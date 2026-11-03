"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  deleteProposalApi,
  fetchProposalDetail,
  fetchProposalsPage,
  markProposalPaidApi,
  sendProposalApi,
  type ProposalStatus,
} from "@/lib/proposals";

/**
 * One page of the account's proposals. `page`, `pageSize`, `search` and
 * `status` are all the server understands — changing any of them refetches.
 */
export function useProposalsQuery(
  page: number,
  pageSize: number,
  search: string,
  status: ProposalStatus | "all",
) {
  return useQuery({
    queryKey: ["proposals", page, pageSize, search, status],
    queryFn: () => fetchProposalsPage(page, pageSize, search, status),
    placeholderData: keepPreviousData,
  });
}

export function useProposalDetailQuery(id: string | null) {
  return useQuery({
    queryKey: ["proposal-detail", id],
    queryFn: () => fetchProposalDetail(id as string),
    enabled: id !== null,
  });
}

/** The list and every cached detail — either can be stale after a write. */
export function useInvalidateProposals() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["proposals"] }),
      queryClient.invalidateQueries({ queryKey: ["proposal-detail"] }),
    ]);
}

export function useDeleteProposalMutation() {
  const invalidate = useInvalidateProposals();
  return useMutation({
    mutationFn: (id: string) => deleteProposalApi(id),
    onSuccess: invalidate,
  });
}

export function useMarkProposalPaidMutation() {
  const invalidate = useInvalidateProposals();
  return useMutation({
    mutationFn: ({ id, paid }: { id: string; paid: boolean }) =>
      markProposalPaidApi(id, paid),
    onSuccess: invalidate,
  });
}

export function useSendProposalMutation() {
  const invalidate = useInvalidateProposals();
  return useMutation({
    mutationFn: (id: string) => sendProposalApi(id),
    onSuccess: invalidate,
  });
}
