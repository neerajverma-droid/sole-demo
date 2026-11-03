import { create } from "zustand";

import type { Rule } from "@/lib/rules";

export type LastSyncResult = { ruleName: string; matched: number };

/**
 * Matching rules, fetched from the real backend. `hydrated` follows the same
 * contract as the other real-API stores: false until the first fetch lands,
 * so a screen can tell "still loading" apart from "genuinely no rules".
 */
type RulesState = {
  rules: Rule[];
  hydrated: boolean;
  setRules: (rules: Rule[]) => void;
  /** The rule currently syncing, or `ALL_RULES_ID` for a run-everything sync. */
  syncingRuleId: string | null;
  setSyncingRuleId: (id: string | null) => void;
  /** Result of the last completed sync, for the success dialog. */
  lastSync: LastSyncResult | null;
  setLastSync: (result: LastSyncResult | null) => void;
};

export const useRulesStore = create<RulesState>()((set) => ({
  rules: [],
  hydrated: false,
  setRules: (rules) => set({ rules, hydrated: true }),

  syncingRuleId: null,
  setSyncingRuleId: (id) => set({ syncingRuleId: id }),

  lastSync: null,
  setLastSync: (result) => set({ lastSync: result }),
}));
