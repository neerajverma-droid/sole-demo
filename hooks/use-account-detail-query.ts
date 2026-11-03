"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchAccountDetail } from "@/lib/report-configs";

/** The drill-down behind one Chart of Accounts row. */
export function useAccountDetailQuery(subcategoryId: string | null) {
  return useQuery({
    queryKey: ["account-detail", subcategoryId],
    queryFn: () => fetchAccountDetail(subcategoryId!),
    enabled: Boolean(subcategoryId),
  });
}
