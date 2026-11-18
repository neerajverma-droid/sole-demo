"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminAddons } from "@/lib/admin/addon-content";

export const ADMIN_ADDON_CONTENT_KEY = ["admin", "addon-content"] as const;

/** Every add-on with its marketplace content, for the Add-ons editor. */
export function useAdminAddonContentQuery() {
  return useQuery({
    queryKey: ADMIN_ADDON_CONTENT_KEY,
    queryFn: fetchAdminAddons,
    staleTime: 30_000,
  });
}

/**
 * Refetch after a save — the editor's list and, so this tab's marketplace
 * shows the new copy without a reload, the plans catalogue it reads.
 */
export function useRefreshAdminAddonContent() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ADMIN_ADDON_CONTENT_KEY }),
      queryClient.invalidateQueries({ queryKey: ["subscription", "catalogue"] }),
    ]);
}
