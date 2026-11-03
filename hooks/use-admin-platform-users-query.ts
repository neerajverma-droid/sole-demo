"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteUserApi,
  fetchPlatformUsersPage,
  impersonateUserApi,
  type UsersFilters,
} from "@/lib/admin/users";

export function usePlatformUsersQuery(params: { page: number; pageSize: number; filters: UsersFilters }) {
  return useQuery({
    queryKey: ["admin", "users", params],
    queryFn: () => fetchPlatformUsersPage(params),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/** Refetches the list, and the dashboard's user total, once the delete lands. */
export function useDeleteUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, confirmEmail, reason }: { userId: string; confirmEmail: string; reason: string }) =>
      deleteUserApi(userId, confirmEmail, reason),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "analytics"] }),
      ]),
  });
}

export function useImpersonateMutation() {
  return useMutation({
    mutationFn: ({ tenantId, userId }: { tenantId: string; userId: string }) =>
      impersonateUserApi(tenantId, userId),
  });
}
