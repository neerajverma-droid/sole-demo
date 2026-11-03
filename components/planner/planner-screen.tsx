"use client";

import * as React from "react";
import Link from "next/link";
import { useAtom } from "jotai";
import { Info, Plus, Target, Wallet, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DeleteBudgetDialog,
  DeletePlanDialog,
} from "@/components/planner/planner-dialogs";
import { PLANNER_ROOT } from "@/components/planner/planner-detail";
import { PlannerBudgets } from "@/components/planner/planner-budgets";
import { PlannerGoals } from "@/components/planner/planner-goals";
import {
  PlannerFirstStep,
  PlannerOverview,
} from "@/components/planner/planner-overview";
import { PlannerPlans } from "@/components/planner/planner-plans";
import {
  useCashWalletQuery,
  usePlannerBankAccountsQuery,
  usePlannerBudgetsQuery,
  usePlannerGoalsQuery,
  usePlannerOverviewQuery,
  usePlannerPlansQuery,
} from "@/hooks/use-planner-query";
import { plannerHintSeenAtom, plannerTabAtom } from "@/lib/atoms";
import { toIsoDate } from "@/lib/invoices";
import { PLANNER_TABS, type PlannerTab } from "@/lib/planner";
import { useExpensesStore } from "@/stores/expenses";
import { usePlannerStore, useWalletBalance } from "@/stores/planner";

export function PlannerScreen() {
  // Every tab's data is loaded here rather than per tab: the Overview totals
  // goals and plans together, so switching tabs must not be what decides
  // whether those figures are complete.
  const goalsQuery = usePlannerGoalsQuery();
  const budgetsQuery = usePlannerBudgetsQuery();
  const plansQuery = usePlannerPlansQuery();
  // The wallet is part of available cash, which the Overview reports.
  useCashWalletQuery();

  // The Overview's own figures: the server's roll-up across the whole business,
  // and the bank balances that make up cash on hand. Both are additive — the
  // tab renders from the lists above until they land.
  const overviewQuery = usePlannerOverviewQuery();
  const banksQuery = usePlannerBankAccountsQuery();

  const stored = usePlannerStore((state) => state);
  const wallet = useWalletBalance();
  const expenses = useExpensesStore((state) => state.expenses);

  const [tab, setTab] = useAtom(plannerTabAtom);

  /**
   * The explainer is shown once, from the moment the first goal, budget or plan
   * exists, and dismissing it stores that for good.
   *
   * Derived from the records rather than fired by a create callback: all four
   * records are now created on their own routed pages, so there's no creation
   * event this screen is present for. Keying off "something exists and you
   * haven't dismissed this" also means goals and plans finally raise it, which
   * the callback only ever did for budgets.
   */
  const [seen, setSeen] = useAtom(plannerHintSeenAtom);

  const today = toIsoDate(new Date());

  const goals = stored.goals;
  const budgets = stored.budgets;
  const plans = stored.plans;

  const loadingGoals = goalsQuery.isLoading;
  const loadingBudgets = budgetsQuery.isLoading;
  const loadingPlans = plansQuery.isLoading;
  const loadingAny = loadingGoals || loadingBudgets || loadingPlans;

  // A failed fetch leaves its list empty too, but that's not "nothing yet" —
  // it keeps the tabs, where each section says what it has.
  const failedAny =
    goalsQuery.isError || budgetsQuery.isError || plansQuery.isError;

  // An untouched planner: the header and the first step, nothing else — no
  // tabs over sections that would each say "nothing here" in turn.
  const nothingYet =
    !loadingAny &&
    !failedAny &&
    goals.length === 0 &&
    budgets.length === 0 &&
    plans.length === 0;
  const showHint = !seen && !nothingYet && !loadingAny;

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={Target}
        title="Business planner"
        description="Set savings goals, track category budgets, plan business expenses for ROI and payback, and spot funding gaps."
      >
        {/* Ranked, not three equal buttons: a goal is where a new planner
            starts, so it's the only filled one. */}
        <Button asChild data-usertour="planner-create-goal">
          <Link href={`${PLANNER_ROOT}/goals/new`}>
            <Plus />
            Create goal
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`${PLANNER_ROOT}/plans/new`}>New expense plan</Link>
        </Button>
        <Button variant="outline" asChild data-usertour="planner-wallet">
          <Link href={`${PLANNER_ROOT}/wallet`}>
            <Wallet />
            Cash wallet
          </Link>
        </Button>
      </PageHeader>

      {/* The one-off explainer, after the first goal, budget or plan exists. */}
      {showHint && <PlannerHint onDismiss={() => setSeen(true)} />}

      {nothingYet ? (
        <PlannerFirstStep />
      ) : (
        <>
          <Tabs value={tab} onValueChange={(next) => setTab(next as PlannerTab)}>
            <TabsList aria-label="Planner sections" data-usertour="planner-tabs">
              {PLANNER_TABS.map((option) => (
                <TabsTrigger key={option} value={option}>
                  {option}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {tab === "Overview" && (
            <PlannerOverview
              goals={goals}
              plans={plans}
              wallet={wallet}
              today={today}
              banks={banksQuery.data ?? []}
              overview={overviewQuery.data ?? null}
              // The bank balances are part of cash on hand, so the tiles wait for
              // them too — reporting "$0 on hand" while that request is still out
              // states a figure the screen doesn't have yet.
              loading={
                loadingAny || overviewQuery.isLoading || banksQuery.isLoading
              }
            />
          )}

          {tab === "Goals" && (
            <PlannerGoals goals={goals} today={today} loading={loadingGoals} />
          )}

          {tab === "Budget" && (
            <div className="space-y-4">
              {/* The header's actions aren't repeated here; this row is the tab's
                  own New Budget, which the header doesn't carry. */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Envelopes for recurring costs, tracked against your expenses.
                </p>
                {budgets.length > 0 && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`${PLANNER_ROOT}/budgets/new`}>
                      <Plus />
                      New Budget
                    </Link>
                  </Button>
                )}
              </div>
              <PlannerBudgets
                budgets={budgets}
                expenses={expenses}
                today={today}
                loading={loadingBudgets}
              />
            </div>
          )}

          {tab === "Business planner" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Planned spending with the case for it — cost, actual activity, ROI
                and payback.
              </p>
              <PlannerPlans plans={plans} loading={loadingPlans} />
            </div>
          )}
        </>
      )}

      {/* Budgets can be deleted from their card menu here, and from the detail
          page, which mounts its own copy — never both at once. */}
      <DeleteBudgetDialog />
      {/* Plans can be deleted from their row menu here, and from the detail
          page, which mounts its own copy — never both at once. */}
      <DeletePlanDialog />
    </div>
  );
}

/**
 * What happens next, said once. Allocating is the part people misread — it looks
 * like moving money — so this is the one thing worth interrupting for, and only
 * the first time.
 */
function PlannerHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/[0.04] px-4 py-3">
      <span
        className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
        aria-hidden
      >
        <Info className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium">What happens next</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Allocating cash to a goal earmarks it: your estimated available cash
          drops so you can&apos;t plan the same dollar twice, but no accounting
          transaction is posted and nothing moves between accounts.
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <X className="size-4 text-muted-foreground" />
      </Button>
    </div>
  );
}
