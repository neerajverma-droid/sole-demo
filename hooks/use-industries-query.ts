"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchIndustries } from "@/lib/industries";

/**
 * The industries list, cached for 5 minutes — matching sole-webapp's own
 * `industry.services.js` cache window, since the list changes rarely enough
 * that every business form re-fetching it on mount would just be waste.
 */
export function useIndustriesQuery() {
  return useQuery({
    queryKey: ["industries"],
    queryFn: fetchIndustries,
    staleTime: 5 * 60_000,
  });
}
