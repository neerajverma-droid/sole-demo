"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchDepreciationReport } from "@/lib/asset-depreciation-report";

/** The depreciation summary for one financial year — refetches when the FY changes. */
export function useDepreciationReportQuery(fyStart: string, fyEnd: string) {
  return useQuery({
    queryKey: ["asset-depreciation-report", fyStart, fyEnd],
    queryFn: () => fetchDepreciationReport(fyStart, fyEnd),
  });
}
