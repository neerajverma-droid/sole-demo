"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchBalanceSheet, type FinancialYearOption } from "@/lib/balance-sheet";

/** The Balance Sheet as at a financial year's end. */
export function useBalanceSheetQuery(asAt: FinancialYearOption) {
  return useQuery({
    queryKey: ["balance-sheet", asAt.end],
    queryFn: () => fetchBalanceSheet(asAt),
  });
}
