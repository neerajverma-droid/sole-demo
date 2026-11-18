"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchResourceTree } from "@/lib/admin/resources";

export const ADMIN_RESOURCES_KEY = ["admin", "resources", "tree"] as const;

/** The whole folder tree, published and hidden, for the Resources manager. */
export function useAdminResourcesQuery() {
  return useQuery({
    queryKey: ADMIN_RESOURCES_KEY,
    queryFn: fetchResourceTree,
    staleTime: 30_000,
  });
}

/** Refetch the tree after a change; resolves once the fresh tree is in. */
export function useRefreshResources() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ADMIN_RESOURCES_KEY });
}
