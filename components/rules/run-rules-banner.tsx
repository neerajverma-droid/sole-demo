"use client";

import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Shimmer } from "@/components/ui/shimmer";
import { useSyncRuleMutation } from "@/hooks/use-rules-query";
import { ALL_RULES_ID, type Rule } from "@/lib/rules";
import { useRulesStore } from "@/stores/rules";

/**
 * The dark "Run your rules" card. Add rule is the page's primary, so Start
 * sync here is the secondary — same height, no competing indigo fill.
 */
export function RunRulesBanner({
  rules,
  loading,
}: {
  rules: Rule[];
  /** The rules list hasn't loaded yet — `rules` is empty either way, so
   *  without this the button would just look permanently disabled. */
  loading: boolean;
}) {
  const syncingRuleId = useRulesStore((state) => state.syncingRuleId);
  const syncMutation = useSyncRuleMutation();

  const syncing = syncingRuleId !== null;
  const runningAll = syncingRuleId === ALL_RULES_ID;

  const runAll = () =>
    syncMutation.mutate({ ruleId: null, ruleName: "All rules" });

  if (loading) {
    return (
      <section
        className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-5"
        aria-hidden
      >
        <Shimmer className="size-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Shimmer className="h-4 w-32" />
          <Shimmer className="h-3.5 w-64 max-w-full" />
        </div>
        <Shimmer className="h-9 w-28 shrink-0 rounded-md" />
      </section>
    );
  }

  return (
    <section className="flex flex-wrap items-center gap-4 rounded-lg border border-hero-border bg-hero p-5 text-hero-foreground">
      <span
        className="grid size-10 shrink-0 place-items-center rounded-lg bg-hero-foreground/10 text-hero-foreground [&_svg]:size-5"
        aria-hidden
      >
        <RefreshCw />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-medium">Run your rules</p>
        <p className="text-sm text-hero-foreground/60">
          Match imported transactions against all active rules in one go.
        </p>
      </div>
      <Button
        variant="secondary"
        className="h-9 text-sm"
        onClick={runAll}
        disabled={syncing || rules.length === 0}
      >
        {runningAll ? (
          <>
            <Loader2 className="animate-spin" />
            Syncing
          </>
        ) : (
          <>
            <RefreshCw />
            Start sync
          </>
        )}
      </Button>
    </section>
  );
}
