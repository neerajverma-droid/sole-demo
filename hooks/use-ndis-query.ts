"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchNdisSupportItems } from "@/lib/ndis-support-items";

/**
 * The NDIS support-item reference, cached the same way `useIndustriesQuery`
 * caches its list — it's published data that changes rarely, so every mount
 * of the Products screen or its filter dialog re-fetching it would be waste.
 * Safe to call from more than one component; React Query dedupes the request.
 *
 * `enabled` defaults to true so existing callers are unaffected; the Products
 * screen passes `false` for a business outside the NDIS industry, since the
 * NDIS tab is never shown to one and there's nothing to prefetch it for.
 */
export function useNdisQuery(enabled = true) {
  return useQuery({
    queryKey: ["ndis-support-items"],
    queryFn: fetchNdisSupportItems,
    staleTime: 5 * 60_000,
    enabled,
  });
}
