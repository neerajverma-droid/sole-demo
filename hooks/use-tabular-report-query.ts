"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { fetchTabularReport, type TabularReportConfig } from "@/lib/report-table";
import { type ReportPeriod, type ReportRange } from "@/lib/report-periods";
import { useCountryContext } from "@/hooks/use-country-context";

/**
 * One page of any tabular report. Keeps the previous page on screen while the
 * next loads, so paging or switching a filter doesn't blank the grid.
 */
export function useTabularReportQuery(
  config: TabularReportConfig,
  period: ReportPeriod,
  range: ReportRange | null,
  page: number,
  pageSize: number,
  extra: Record<string, string> = {},
) {
  // The business's financial year, for the "financial year" periods.
  const fiscalYearStart = useFiscalYearStart();
  return useQuery({
    queryKey: [
      "tabular-report",
      config.id,
      config.dated === false ? null : fiscalYearStart,
      // An undated report must not refetch when a period atom changes
      // underneath it — its rows don't depend on one.
      config.dated === false ? null : period,
      config.dated === false ? null : range?.from,
      config.dated === false ? null : range?.to,
      config.dated === false ? null : fiscalYearStart.month,
      config.dated === false ? null : fiscalYearStart.day,
      page,
      pageSize,
      extra,
    ],
    queryFn: () =>
      fetchTabularReport(config, period, range, page, pageSize, extra, fiscalYearStart),
    placeholderData: keepPreviousData,
  });
}
