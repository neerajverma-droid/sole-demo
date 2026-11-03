"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchTrialBalance, type FinancialYearOption } from "@/lib/trial-balance";

/** The Trial Balance as at a financial year's end. */
export function useTrialBalanceQuery(asAt: FinancialYearOption) {
  return useQuery({
    queryKey: ["trial-balance", asAt.end],
    queryFn: () => fetchTrialBalance(asAt),
  });
}
