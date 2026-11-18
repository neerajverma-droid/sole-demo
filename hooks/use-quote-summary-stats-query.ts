"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchQuoteSummaryStats } from "@/lib/quotes";

/**
 * The quote summary card's figures, added up by the server. Keyed under
 * `["quotes"]` so every save, response or delete that already invalidates (or
 * resets) the quote list refreshes the card with it.
 */
export function useQuoteSummaryStatsQuery() {
  return useQuery({
    queryKey: ["quotes", "summary-stats"],
    queryFn: fetchQuoteSummaryStats,
  });
}
