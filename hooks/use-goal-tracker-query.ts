"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchRevenueGoalTarget, saveRevenueGoalTarget } from "@/lib/goal-tracker";
import { useIsDashboardDemo } from "@/hooks/use-dashboard-demo";
import { useDashboardStore } from "@/stores/dashboard";

/**
 * Loads the saved goal target and mirrors it into `useDashboardStore`, same
 * pattern as `useInvoicesQuery` mirroring into the invoice store. Leaves the
 * store alone until the server answers. `null` (loaded, nothing saved yet)
 * clears the target to 0 ("no goal set") rather than showing a made-up figure.
 */
export function useRevenueGoalQuery() {
  const setGoalTarget = useDashboardStore((state) => state.setGoalTarget);
  // The sample shows its own goal (`useDashboardGoalTarget`); the real one
  // is fetched once the sample has ended.
  const demo = useIsDashboardDemo();

  const query = useQuery({
    queryKey: ["goal-tracker"],
    queryFn: fetchRevenueGoalTarget,
    enabled: !demo,
  });

  React.useEffect(() => {
    // `undefined` = still loading; `null` = loaded, no goal saved for this
    // account. The server is the source of truth, so a persisted figure from
    // a previous session/account must not survive a "nothing saved" answer.
    if (query.data !== undefined) setGoalTarget(query.data ?? 0);
  }, [query.data, setGoalTarget]);

  return query;
}

export function useSaveRevenueGoalMutation() {
  const queryClient = useQueryClient();
  const setGoalTarget = useDashboardStore((state) => state.setGoalTarget);

  return useMutation({
    mutationFn: saveRevenueGoalTarget,
    onSuccess: (_result, incomeGoal) => {
      setGoalTarget(incomeGoal);
      queryClient.invalidateQueries({ queryKey: ["goal-tracker"] });
    },
  });
}
