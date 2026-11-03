"use client";

import { useQuery } from "@tanstack/react-query";

import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { fetchTransactionListing } from "@/lib/transaction-listing";
import {  type ReportPeriod, type ReportRange } from "@/lib/report-periods";
import { useCountryContext } from "@/hooks/use-country-context";

/**
 * The Transaction Listing for a period — refetches when the period or range
 * changes, or the business's financial year does.
 */
export function useTransactionListingQuery(
  period: ReportPeriod,
  range: ReportRange | null,
) {
  const fiscalYearStart = useFiscalYearStart();
  return useQuery({
    queryKey: [
      "transaction-listing-report",
      period,
      range?.from,
      range?.to,
      fiscalYearStart.month,
      fiscalYearStart.day,
    ],
    queryFn: () => fetchTransactionListing(period, range, fiscalYearStart),
  });
}
