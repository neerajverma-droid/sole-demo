"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchGeneralCatalogue } from "@/lib/general-catalogue";

/**
 * The General catalogue, cached the same way `useNdisQuery` caches its list —
 * it's server-resolved reference data (scoped to the active business's own
 * industry) that changes rarely, so every mount re-fetching it would be
 * waste. Safe to call from more than one component; React Query dedupes.
 */
export function useGeneralCatalogueQuery() {
  return useQuery({
    queryKey: ["general-catalogue"],
    queryFn: fetchGeneralCatalogue,
    staleTime: 5 * 60_000,
  });
}
