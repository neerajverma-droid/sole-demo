"use client";

import { useQuery } from "@tanstack/react-query";

import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { fetchPlReport, type PlPeriod, type PlRange } from "@/lib/reports";

import { useCountryContext } from "@/hooks/use-country-context";

/**
 * The Profit & Loss report for a period — refetches when the period or range
 * changes, or the business's financial year does.
 */
export function usePlReportQuery(period: PlPeriod, range: PlRange | null) {
  const fiscalYearStart = useFiscalYearStart();
  return useQuery({
    queryKey: [
      "profit-loss-report",
      period,
      range?.from,
      range?.to,
      fiscalYearStart.month,
      fiscalYearStart.day,
    ],
    queryFn: () => fetchPlReport(period, range, fiscalYearStart),
  });
}
