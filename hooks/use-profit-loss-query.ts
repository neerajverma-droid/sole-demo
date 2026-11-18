"use client";

import { useQuery } from "@tanstack/react-query";

import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import {
  fetchPlFinancialYears,
  fetchPlReport,
  type PlPeriod,
  type PlRange,
} from "@/lib/reports";

import { useCountryContext } from "@/hooks/use-country-context";

/**
 * The Profit & Loss report for a period — refetches when the period, range or
 * GST toggle changes, or the business's financial year does.
 */
export function usePlReportQuery(
  period: PlPeriod,
  range: PlRange | null,
  gstInclusive: boolean,
) {
  const fiscalYearStart = useFiscalYearStart();
  return useQuery({
    queryKey: [
      "profit-loss-report",
      period,
      range?.from,
      range?.to,
      fiscalYearStart.month,
      fiscalYearStart.day,
      gstInclusive,
    ],
    queryFn: () => fetchPlReport(period, range, fiscalYearStart, gstInclusive),
  });
}

/** The business's financial years, for the "pick an older year" control. */
export function usePlFinancialYearsQuery() {
  return useQuery({
    queryKey: ["profit-loss-financial-years"],
    queryFn: fetchPlFinancialYears,
    // A business's financial years are only ever appended to, never edited —
    // worth caching past the default 5 minutes so switching reports and back
    // doesn't re-fetch a list that hasn't changed.
    staleTime: 10 * 60 * 1000,
  });
}
