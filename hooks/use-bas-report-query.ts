"use client";

import { useQuery, type QueryKey } from "@tanstack/react-query";

import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { fetchBasReport } from "@/lib/bas-report";
import {  type ReportPeriod, type ReportRange } from "@/lib/report-periods";
import { useCountryContext } from "@/hooks/use-country-context";

/**
 * The BAS report for a period and one page of its transactions. Keeps the
 * previous page on screen while the next loads, so paging the listing doesn't
 * blank the worksheet above it.
 *
 * Only within the same period, though. A new quarter or year is a different
 * report: holding the old one's figures up until the new ones land showed
 * last quarter's GST under this quarter's name, with no sign anything was
 * loading. Without a placeholder the query is loading, and the screen shows
 * its skeleton.
 */
export function useBasReportQuery(
  period: ReportPeriod,
  range: ReportRange | null,
  page: number,
  pageSize: number,
) {
  // The business's financial year, for the "financial year" periods.
  const fiscalYearStart = useFiscalYearStart();
  const queryKey = [
    "bas-report",
    period,
    range?.from,
    range?.to,
    page,
    pageSize,
    fiscalYearStart.month,
    fiscalYearStart.day,
  ] as const;
  return useQuery({
    queryKey,
    queryFn: () =>
      fetchBasReport(period, range, page, pageSize, fiscalYearStart),
    placeholderData: (previous, previousQuery) =>
      previousQuery && samePeriod(previousQuery.queryKey, queryKey)
        ? previous
        : undefined,
  });
}

/**
 * Whether two BAS query keys ask for the same period — same span and the same
 * financial year — and differ at most in page or page size.
 */
function samePeriod(previous: QueryKey, next: QueryKey): boolean {
  // Positions 4 and 5 are page and page size; every other part names the period.
  const periodParts = (key: QueryKey) => [...key.slice(0, 4), ...key.slice(6)];
  const a = periodParts(previous);
  const b = periodParts(next);
  return a.length === b.length && a.every((part, index) => part === b[index]);
}
