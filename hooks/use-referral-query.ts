"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchReferralInvites, sendReferralInvite } from "@/lib/referral";

/** Every invite this account has sent, newest first — the server's own order. */
export function useReferralInvitesQuery() {
  return useQuery({
    queryKey: ["referral", "invites"],
    queryFn: fetchReferralInvites,
  });
}

/** Sending one invite. Refetches the list on success, so the new row appears. */
export function useSendReferralInviteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sendReferralInvite,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["referral", "invites"] }),
  });
}
