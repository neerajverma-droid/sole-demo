"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createTenantApi,
  fetchTenantsPage,
  setTenantStatusApi,
  type CreateTenantInput,
  type TenantStatusFilter,
} from "@/lib/admin/tenants";

/** One page of tenants. Keeps the last page on screen while the next loads. */
export function useAdminTenantsQuery(params: {
  page: number;
  pageSize: number;
  search: string;
  status: TenantStatusFilter;
}) {
  return useQuery({
    queryKey: ["admin", "tenants", params],
    queryFn: () => fetchTenantsPage(params),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/**
 * The list and the dashboard both count tenants by status, so any write
 * invalidates both.
 */
function useInvalidateTenants() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "analytics"] }),
    ]);
}

export function useCreateTenantMutation() {
  const invalidate = useInvalidateTenants();
  return useMutation({
    mutationFn: (input: CreateTenantInput) => createTenantApi(input),
    onSuccess: invalidate,
  });
}

export function useSetTenantStatusMutation() {
  const invalidate = useInvalidateTenants();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "suspended" | "cancelled" }) =>
      setTenantStatusApi(id, status),
    onSuccess: invalidate,
  });
}
