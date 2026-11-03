"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchContributionMatrix, type SuperMatrixPeriod } from "@/lib/super";

/** The KPI cards' own source — a separate call from the list, same as sole-webapp. */
export function useSuperMatrixQuery(type: SuperMatrixPeriod) {
  return useQuery({
    queryKey: ["super-contribution-matrix", type],
    queryFn: () => fetchContributionMatrix(type),
  });
}
