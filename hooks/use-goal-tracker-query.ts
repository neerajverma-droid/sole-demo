"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchRevenueGoalTarget, saveRevenueGoalTarget } from "@/lib/goal-tracker";
import { useDashboardStore } from "@/stores/dashboard";

/**
 * Loads the saved goal target and mirrors it into `useDashboardStore`, same
 * pattern as `useInvoicesQuery` mirroring into the invoice store. Leaves the
 * store's default target alone until the server actually answers with a
 * saved value — `null` (loaded, nothing saved yet) doesn't overwrite the
 * friendly starting suggestion, only a real number does.
 */
export function useRevenueGoalQuery() {
  const setGoalTarget = useDashboardStore((state) => state.setGoalTarget);

  const query = useQuery({
    queryKey: ["goal-tracker"],
    queryFn: fetchRevenueGoalTarget,
  });

  React.useEffect(() => {
    if (query.data != null) setGoalTarget(query.data);
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
