"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createClientRefundApi,
  deleteClientRefundApi,
  fetchClientRefunds,
  markClientRefundedApi,
  updateClientRefundApi,
  type RefundDraft,
  type RefundStatus,
} from "@/lib/refunds";
import { useRefundsStore } from "@/stores/refunds";
import { sessionUserId, useSessionStore } from "@/stores/session";

const CLIENT_REFUNDS_QUERY_KEY = ["client-refunds"];

export function useClientRefundsUserId() {
  return useSessionStore(
    (state) => sessionUserId(state.user) ?? undefined,
  );
}

/**
 * Loads the account's client refunds and credit notes and mirrors them into
 * the shared store. There's no pagination or period filter on this screen —
 * search, type and status are all filtered client-side — so this is a single
 * fetch of everything, refetched only when the signed-in user changes.
 */
export function useClientRefundsQuery() {
  const setRefunds = useRefundsStore((state) => state.setRefunds);
  const userId = useClientRefundsUserId();

  const query = useQuery({
    queryKey: [...CLIENT_REFUNDS_QUERY_KEY, userId],
    queryFn: () => fetchClientRefunds(userId as string | number),
    enabled: userId !== undefined,
  });

  React.useEffect(() => {
    if (query.data) setRefunds(query.data);
  }, [query.data, setRefunds]);

  return query;
}

/**
 * Every write below re-fetches the list on success rather than splicing the
 * server's response into the store directly — create and update both return
 * the bare database row, none of the enrichment (the linked invoice, the
 * client's name and bank info) that only the list endpoint computes.
 */
function useInvalidateClientRefunds() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: CLIENT_REFUNDS_QUERY_KEY });
}

export function useCreateClientRefundMutation() {
  const userId = useClientRefundsUserId();
  const invalidate = useInvalidateClientRefunds();

  return useMutation({
    mutationFn: (draft: RefundDraft) =>
      createClientRefundApi(draft, userId as string | number),
    onSuccess: invalidate,
  });
}

export function useUpdateClientRefundMutation() {
  const userId = useClientRefundsUserId();
  const invalidate = useInvalidateClientRefunds();

  return useMutation({
    mutationFn: ({
      id,
      draft,
      status,
    }: {
      id: string;
      draft: RefundDraft;
      status: RefundStatus;
    }) => updateClientRefundApi(id, draft, status, userId as string | number),
    onSuccess: invalidate,
  });
}

export function useMarkClientRefundedMutation() {
  const userId = useClientRefundsUserId();
  const invalidate = useInvalidateClientRefunds();

  return useMutation({
    mutationFn: (id: string) =>
      markClientRefundedApi(id, userId as string | number),
    onSuccess: invalidate,
  });
}

export function useDeleteClientRefundMutation() {
  const invalidate = useInvalidateClientRefunds();

  return useMutation({
    mutationFn: (id: string) => deleteClientRefundApi(id),
    onSuccess: invalidate,
  });
}
