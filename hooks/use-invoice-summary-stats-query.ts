"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchInvoiceSummaryStats } from "@/lib/invoices";

/**
 * The invoice summary card's figures, added up by the server. Keyed under
 * `["invoices"]` so every save, payment or delete that already invalidates (or
 * resets) the invoice list refreshes the card with it.
 */
export function useInvoiceSummaryStatsQuery() {
  return useQuery({
    queryKey: ["invoices", "summary-stats"],
    queryFn: fetchInvoiceSummaryStats,
  });
}
