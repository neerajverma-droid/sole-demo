"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { fetchBasReport } from "@/lib/bas-report";
import {  type ReportPeriod, type ReportRange } from "@/lib/report-periods";
import { useCountryContext } from "@/hooks/use-country-context";

/**
 * The BAS report for a period and one page of its transactions. Keeps the
 * previous page on screen while the next loads, so paging the listing doesn't
 * blank the worksheet above it.
 */
export function useBasReportQuery(
  period: ReportPeriod,
  range: ReportRange | null,
  page: number,
  pageSize: number,
) {
  // The business's financial year, for the "financial year" periods.
  const fiscalYearStart = useFiscalYearStart();
  return useQuery({
    queryKey: [
      "bas-report",
      period,
      range?.from,
      range?.to,
      page,
      pageSize,
      fiscalYearStart.month,
      fiscalYearStart.day,
    ],
    queryFn: () =>
      fetchBasReport(period, range, page, pageSize, fiscalYearStart),
    placeholderData: keepPreviousData,
  });
}
