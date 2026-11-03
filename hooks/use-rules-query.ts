"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  ALL_RULES_ID,
  createRuleApi,
  deleteRuleApi,
  fetchRuleSyncStats,
  fetchRules,
  syncRuleApi,
  updateRuleApi,
  type Rule,
  type RuleDraft,
} from "@/lib/rules";
import { useRulesStore } from "@/stores/rules";

/** Loads every matching rule and mirrors it into the shared store. */
export function useRulesQuery() {
  const setRules = useRulesStore((state) => state.setRules);

  const query = useQuery({ queryKey: ["rules"], queryFn: fetchRules });

  React.useEffect(() => {
    if (query.data) setRules(query.data);
  }, [query.data, setRules]);

  return query;
}

/**
 * Polled every 5s while the page is open, same as sole-webapp's own page —
 * not gated on the rules list, so it fetches in parallel with it rather than
 * waiting behind it. Whether the result is worth *showing* is a screen
 * decision (there's nothing to sync-match without a rule), not a fetch one.
 */
export function useRuleSyncStatsQuery() {
  return useQuery({
    queryKey: ["rule-sync-stats"],
    queryFn: fetchRuleSyncStats,
    refetchInterval: 5000,
  });
}

function useReplaceRules() {
  const setRules = useRulesStore((state) => state.setRules);
  const queryClient = useQueryClient();
  return (rules: Rule[]) => {
    setRules(rules);
    queryClient.setQueryData(["rules"], rules);
  };
}

export function useCreateRuleMutation() {
  const replaceRules = useReplaceRules();
  return useMutation({
    mutationFn: (draft: RuleDraft) => createRuleApi(draft),
    onSuccess: replaceRules,
  });
}

export function useUpdateRuleMutation() {
  const replaceRules = useReplaceRules();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: RuleDraft }) =>
      updateRuleApi(id, draft),
    onSuccess: replaceRules,
  });
}

export function useDeleteRuleMutation() {
  const replaceRules = useReplaceRules();
  return useMutation({
    mutationFn: (id: string) => deleteRuleApi(id),
    onSuccess: replaceRules,
  });
}

/** `ruleId: null` runs every rule in one pass — the banner's "Start sync". */
export function useSyncRuleMutation() {
  const setSyncingRuleId = useRulesStore((state) => state.setSyncingRuleId);
  const setLastSync = useRulesStore((state) => state.setLastSync);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ruleId,
    }: {
      ruleId: string | null;
      ruleName: string;
    }) => syncRuleApi(ruleId),
    onMutate: ({ ruleId }) => {
      setSyncingRuleId(ruleId ?? ALL_RULES_ID);
    },
    onSuccess: (result, { ruleName }) => {
      setLastSync({ ruleName, matched: result.matched });
      queryClient.invalidateQueries({ queryKey: ["rule-sync-stats"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to sync rule.");
    },
    onSettled: () => {
      setSyncingRuleId(null);
    },
  });
}
