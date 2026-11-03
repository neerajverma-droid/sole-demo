"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchAdminAnalytics } from "@/lib/admin/dashboard";

/** Platform totals for the admin dashboard; invalidated by tenant mutations. */
export function useAdminAnalyticsQuery() {
  return useQuery({
    queryKey: ["admin", "analytics"],
    queryFn: fetchAdminAnalytics,
    // Counts an admin is about to act on: a minute old is fresh enough, five
    // (the app default) is long enough to look wrong after a suspension.
    staleTime: 60_000,
  });
}
