"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  PAYROLL_REPORT_EXPORT_LIMIT,
  buildPayrollReport,
  fetchPayrollReport,
  type BuiltPayrollReport,
  type PayrollReportId,
  type PayrollReportParams,
  type PayrollReportResponse,
} from "@/lib/payroll-reports";

/**
 * One page of a payroll report — `GET /reports/{id}` — already built into the
 * sections the screen draws. The raw response is what's cached; the build
 * happens in `select`.
 */
export function usePayrollReportQuery(
  id: PayrollReportId,
  params: PayrollReportParams,
) {
  return useQuery<PayrollReportResponse, Error, BuiltPayrollReport>({
    queryKey: ["payroll", "reports", id, params],
    queryFn: () => fetchPayrollReport(id, params),
    select: (response) => buildPayrollReport(id, response),
    // The previous page stays up while the next loads — but only within the
    // same report. Another report's response run through this one's builder
    // would draw the wrong table for a moment.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === id ? previous : undefined,
  });
}

/**
 * The whole year of a report, for Export CSV.
 *
 * sole-webapp exported whichever page was on screen, so a twelve-page report
 * downloaded as its first ten rows. This asks for every row in one page
 * instead, through the same cache, so exporting twice doesn't fetch twice.
 */
export function useFetchPayrollReportForExport() {
  const queryClient = useQueryClient();

  return async (id: PayrollReportId, year: string): Promise<BuiltPayrollReport> => {
    const params: PayrollReportParams = {
      year,
      page: 1,
      limit: PAYROLL_REPORT_EXPORT_LIMIT,
    };
    const response = await queryClient.fetchQuery<PayrollReportResponse>({
      queryKey: ["payroll", "reports", id, params],
      queryFn: () => fetchPayrollReport(id, params),
      staleTime: 60_000,
    });
    return buildPayrollReport(id, response);
  };
}
