"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createAdminUserApi,
  fetchAdminUsersPage,
  grantFeaturesApi,
  revokeAllAccessApi,
  revokeFeaturesApi,
  type AdminUsersPage,
  type CreateAdminInput,
} from "@/lib/admin/admin-users";

const ADMIN_USERS_KEY = ["admin", "admin-users"] as const;

export function useAdminUsersQuery(params: { page: number; pageSize: number; search: string }) {
  return useQuery({
    queryKey: [...ADMIN_USERS_KEY, params],
    queryFn: () => fetchAdminUsersPage(params),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useCreateAdminUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAdminInput) => createAdminUserApi(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY }),
  });
}

/**
 * Grant or revoke sections for one admin.
 *
 * Written into every cached page on success rather than refetched: the row
 * being edited is open, and a refetch would re-sort or re-page the list under
 * the checkbox that was just clicked. Nothing is written before the server
 * agrees, so a failed toggle never shows as done.
 */
export function useSetFeaturesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, keys, grant }: { userId: string; keys: string[]; grant: boolean }) =>
      grant ? grantFeaturesApi(userId, keys) : revokeFeaturesApi(userId, keys),
    onSuccess: (_, { userId, keys, grant }) => {
      queryClient.setQueriesData<AdminUsersPage>({ queryKey: ADMIN_USERS_KEY }, (page) =>
        page
          ? {
              ...page,
              admins: page.admins.map((admin) =>
                admin.id !== userId
                  ? admin
                  : {
                      ...admin,
                      features: grant
                        ? [...new Set([...admin.features, ...keys])]
                        : admin.features.filter((key) => !keys.includes(key)),
                    },
              ),
            }
          : page,
      );
    },
  });
}

export function useRevokeAllAccessMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => revokeAllAccessApi(userId),
    onSuccess: (_, userId) => {
      queryClient.setQueriesData<AdminUsersPage>({ queryKey: ADMIN_USERS_KEY }, (page) =>
        page
          ? {
              ...page,
              admins: page.admins.map((admin) =>
                admin.id === userId ? { ...admin, features: [] } : admin,
              ),
            }
          : page,
      );
    },
  });
}
