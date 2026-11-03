"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiErrorMessage } from "@/lib/api-error";
import {
  fetchSpmKeys,
  generateSpmKey,
  revokeSpmConnection,
  revokeSpmKey,
} from "@/lib/spm-connect";

export const SPM_KEYS_QUERY_KEY = ["spm-keys"] as const;

export function useSpmKeysQuery() {
  return useQuery({
    queryKey: SPM_KEYS_QUERY_KEY,
    queryFn: fetchSpmKeys,
  });
}

export function useGenerateSpmKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: generateSpmKey,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SPM_KEYS_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Couldn't generate a key."));
    },
  });
}

export function useRevokeSpmKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => revokeSpmKey(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SPM_KEYS_QUERY_KEY });
      toast.success("Key revoked");
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Couldn't revoke that key."));
    },
  });
}

export function useRevokeSpmConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => revokeSpmConnection(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SPM_KEYS_QUERY_KEY });
      toast.success("Connection disconnected");
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Couldn't disconnect that connection."));
    },
  });
}
