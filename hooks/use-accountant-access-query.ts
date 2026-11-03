"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  accountantAccessErrorMessage,
  addSupportAccess,
  deleteAccountantInvite,
  fetchAccountantAccess,
  sendAccountantInvite,
  updateAccountantInvite,
  type AccountantInvite,
  type AccountantInvitePayload,
} from "@/lib/accountant-access";

export const ACCOUNTANT_ACCESS_QUERY_KEY = ["accountant-access"] as const;

export function useAccountantAccessQuery() {
  return useQuery({
    queryKey: ACCOUNTANT_ACCESS_QUERY_KEY,
    queryFn: fetchAccountantAccess,
  });
}

/** Sets the invites list straight from a mutation's response, skipping a refetch. */
function useSetInvites() {
  const queryClient = useQueryClient();
  return (invites: AccountantInvite[]) => {
    queryClient.setQueryData(ACCOUNTANT_ACCESS_QUERY_KEY, (current: unknown) => {
      const previous = current as { invites: AccountantInvite[]; permissionModules: unknown } | undefined;
      return previous ? { ...previous, invites } : previous;
    });
  };
}

export function useSendAccountantInvite() {
  const setInvites = useSetInvites();
  return useMutation({
    mutationFn: (payload: AccountantInvitePayload) => sendAccountantInvite(payload),
    onSuccess: (invites) => {
      setInvites(invites);
      toast.success("Invitation sent");
    },
    onError: (error) => {
      toast.error(accountantAccessErrorMessage(error, "Couldn't send the invitation."));
    },
  });
}

export function useUpdateAccountantInvite() {
  const setInvites = useSetInvites();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: Omit<AccountantInvitePayload, "ccType">;
    }) => updateAccountantInvite(id, payload),
    onSuccess: (invites) => {
      setInvites(invites);
      toast.success("Changes saved");
    },
    onError: (error) => {
      toast.error(accountantAccessErrorMessage(error, "Couldn't save your changes."));
    },
  });
}

export function useDeleteAccountantInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteAccountantInvite(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ACCOUNTANT_ACCESS_QUERY_KEY });
      toast.success("Access removed");
    },
    onError: (error) => {
      toast.error(accountantAccessErrorMessage(error, "Couldn't remove that access."));
    },
  });
}

export function useAddSupportAccess() {
  const setInvites = useSetInvites();
  return useMutation({
    mutationFn: () => addSupportAccess(),
    onSuccess: (invites) => {
      setInvites(invites);
      toast.success("Sole Support can now access your account");
    },
    onError: (error) => {
      toast.error(accountantAccessErrorMessage(error, "Couldn't grant Sole Support access."));
    },
  });
}
