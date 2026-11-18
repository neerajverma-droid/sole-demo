"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DeleteRuleDialog } from "@/components/rules/delete-rule-dialog";
import { RulesSummary } from "@/components/rules/rules-summary";
import { RulesTable } from "@/components/rules/rules-table";
import { RecentlyMatched } from "@/components/rules/recently-matched";
import { RunRulesBanner } from "@/components/rules/run-rules-banner";
import { SyncProgress } from "@/components/rules/sync-progress";
import { SyncResultDialog } from "@/components/rules/sync-result-dialog";
import { useRulesQuery, useRuleSyncStatsQuery } from "@/hooks/use-rules-query";
import { useRulesStore } from "@/stores/rules";

export function RulesScreen() {
  const rulesQuery = useRulesQuery();
  const rules = useRulesStore((state) => state.rules);
  const hasRules = rules.length > 0;

  // Fired alongside the rules fetch, not behind it — waiting for rules to
  // land first before even starting this one is what produced two separate,
  // back-to-back loading states instead of one.
  const statsQuery = useRuleSyncStatsQuery();
  const stats = statsQuery.data;

  return (
    <div className="space-y-[15px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1" data-usertour="rules-header">
          <h1 className="text-2xl font-semibold tracking-tight">
            Matching rules
          </h1>
          <p className="text-sm text-muted-foreground">
            Auto-categorise imported transactions with your own conditions.
          </p>
        </div>
        <Button asChild data-usertour="rules-add">
          <Link href="/transactions/rules/new">
            <Plus />
            Add rule
          </Link>
        </Button>
      </div>

      {/* The counts are always there, zeros included, so an account with no
          rules still reads like every other module: the figures, then the
          empty state below. The tours anchor on this wrapper and on the two
          below; `data-usertour-loading` holds them until the rules and the
          stats are both in. */}
      <div
        className="space-y-[15px]"
        data-usertour="rules-stats"
        data-usertour-loading={
          rulesQuery.isLoading || statsQuery.isLoading || undefined
        }
      >
        <RulesSummary stats={stats} loading={statsQuery.isLoading} />
        {/*
         * The rest is shown from the very first render, not just once the
         * rules list turns out non-empty — waiting for `hasRules` to become
         * true before even mounting it is what made the table's skeleton
         * resolve first and this one's appear a beat later, as two separate
         * loading states instead of one. Once rules have genuinely loaded and
         * there are none, it goes: there's nothing to sync or to have matched.
         */}
        {(rulesQuery.isLoading || hasRules) && (
          /* Between the counts and the button that changes them. */
          <SyncProgress stats={stats} loading={statsQuery.isLoading} />
        )}
      </div>

      {(rulesQuery.isLoading || hasRules) && (
        <>
          <div data-usertour="rules-run">
            <RunRulesBanner rules={rules} loading={rulesQuery.isLoading} />
          </div>
          {/* Between the banner that runs the rules and the rules themselves:
              what they caught is the evidence they're working. */}
          <div data-usertour="rules-recent">
            <RecentlyMatched
              matches={stats?.recentlyMatched ?? []}
              loading={statsQuery.isLoading}
            />
          </div>
        </>
      )}

      <RulesTable loading={rulesQuery.isLoading} />

      <DeleteRuleDialog />
      <SyncResultDialog />
    </div>
  );
}
