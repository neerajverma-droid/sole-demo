"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchSolePerks } from "@/lib/sole-perks";

/**
 * The deals rarely change and the request leaves this app entirely, so this
 * holds onto a stale list for a while rather than refetching on every visit.
 */
export function useSolePerksQuery() {
  return useQuery({
    queryKey: ["sole-perks"],
    queryFn: fetchSolePerks,
    staleTime: 1000 * 60 * 30,
  });
}
