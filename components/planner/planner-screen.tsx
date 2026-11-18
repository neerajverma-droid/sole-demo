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
  DeleteGoalDialog,
  DeletePlanDialog,
} from "@/components/planner/planner-dialogs";
import { PLANNER_ROOT } from "@/components/planner/planner-detail";
import {
  usePlannerPageState,
  usePlannerPaging,
} from "@/components/planner/planner-pagination";
import { PlannerBudgets } from "@/components/planner/planner-budgets";
import { PlannerTabHeader } from "@/components/planner/planner-bulk";
import { PlannerGoals } from "@/components/planner/planner-goals";
import {
  PlannerOverview,
} from "@/components/planner/planner-overview";
import { PlannerPlans } from "@/components/planner/planner-plans";
import {
  useCashWalletQuery,
  usePlannerBankAccountsQuery,
  usePlannerBudgetsPageQuery,
  usePlannerBudgetsQuery,
  usePlannerGoalsPageQuery,
  usePlannerGoalsQuery,
  usePlannerOverviewQuery,
  usePlannerPlansPageQuery,
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

  /*
   * What each table shows: one page of its list, asked of the server. The full
   * lists above stay — the Overview and the detail pages read the whole list —
   * but a table pages on its own, and only asks while its tab is open.
   */
  const goalsState = usePlannerPageState();
  const goalsPage = usePlannerGoalsPageQuery(
    goalsState.page,
    goalsState.pageSize,
    tab === "Goals",
  );
  const goalsPaging = usePlannerPaging(goalsState, goalsPage.data);

  const budgetsState = usePlannerPageState();
  const budgetsPage = usePlannerBudgetsPageQuery(
    budgetsState.page,
    budgetsState.pageSize,
    tab === "Budget",
  );
  const budgetsPaging = usePlannerPaging(budgetsState, budgetsPage.data);

  const plansState = usePlannerPageState();
  const plansPage = usePlannerPlansPageQuery(
    plansState.page,
    plansState.pageSize,
    tab === "Business planner",
  );
  const plansPaging = usePlannerPaging(plansState, plansPage.data);

  const goals = stored.goals;
  const budgets = stored.budgets;
  const plans = stored.plans;

  // `isFetching`, not `isLoading`: a list that's reloading after a goal, budget
  // or plan was saved has data, but it's the stale data — shimmering until the
  // fetch lands is what shows the new record arriving.
  const loadingGoals = goalsQuery.isFetching;
  const loadingBudgets = budgetsQuery.isFetching;
  const loadingPlans = plansQuery.isFetching;
  const loadingAny = loadingGoals || loadingBudgets || loadingPlans;

  // A failed fetch leaves its list empty too, but that's not "nothing yet" —
  // it keeps the tabs, where each section says what it has.
  const failedAny =
    goalsQuery.isError || budgetsQuery.isError || plansQuery.isError;

  // An untouched planner. The tabs and overview stay, as on Invoices; the
  // overview's goals card carries the first step in place of its list.
  const nothingYet =
    !loadingAny &&
    !failedAny &&
    goals.length === 0 &&
    budgets.length === 0 &&
    plans.length === 0;
  const showHint = !seen && !nothingYet && !loadingAny;

  /*
   * The tiles read the server's roll-up, which carries every figure they show
   * apart from cash on hand — so they wait for that, not for the goal, budget
   * and plan lists, which only matter here as a fallback. Without the roll-up
   * (it failed, or hasn't come back) the lists are what's left to count from.
   */
  const tilesLoading =
    overviewQuery.isLoading || (!overviewQuery.data && loadingAny);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Target}
        title="Business planner"
        description="Set savings goals, track category budgets, plan business expenses for ROI and payback, and spot funding gaps."
      />

      {/* The one-off explainer, after the first goal, budget or plan exists. */}
      {showHint && <PlannerHint onDismiss={() => setSeen(true)} />}

      {/* The tabs on the left; the three actions on the right, on the same line. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(next) => setTab(next as PlannerTab)}>
          <TabsList aria-label="Planner sections" data-usertour="planner-tabs">
            {PLANNER_TABS.map((option) => (
              <TabsTrigger key={option} value={option}>
                {option}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {/* One wrapper so the planner tours can highlight the three actions together. */}
        <div
          className="flex flex-wrap items-center gap-3"
          data-usertour="planner-actions"
        >
          {/* Ranked, not three equal buttons: a goal is where a new planner
              starts, so it's the only filled one. */}
          <Button asChild data-usertour="planner-create-goal">
            <Link href={`${PLANNER_ROOT}/goals/new`}>
              <Plus />
              Create goal
            </Link>
          </Button>
          <Button variant="outline" asChild data-usertour="planner-new-plan">
            <Link href={`${PLANNER_ROOT}/plans/new`}>New expense plan</Link>
          </Button>
          <Button variant="outline" asChild data-usertour="planner-wallet">
            <Link href={`${PLANNER_ROOT}/wallet`}>
              <Wallet />
              Cash wallet
            </Link>
          </Button>
        </div>
      </div>

      {tab === "Overview" && (
        <PlannerOverview
          goals={goals}
          plans={plans}
          wallet={wallet}
          today={today}
          banks={banksQuery.data ?? []}
          overview={overviewQuery.data ?? null}
          loading={tilesLoading}
          // The bank balances are part of cash on hand, so the available-cash
          // tile alone waits for them — reporting "$0 on hand" while that
          // request is out states a figure the screen doesn't have yet. The
          // other tiles don't read them, so they aren't held up behind the
          // slowest request on the page.
          loadingBanks={banksQuery.isLoading}
          banksFailed={banksQuery.isError}
          firstStep={nothingYet}
        />
      )}

      {/* The tab tours anchor on these wrappers, which render with or without
          records; `data-usertour-loading` holds a tour until the list is in. */}
      {tab === "Goals" && (
        <div className="space-y-4">
          <PlannerTabHeader
            description="Savings you're setting aside, tracked against a target and a date."
            action={
              goals.length > 0
                ? { label: "New Goal", href: `${PLANNER_ROOT}/goals/new` }
                : undefined
            }
          />
          <div
            data-usertour="planner-goals"
            data-usertour-loading={goalsPage.isFetching || undefined}
          >
            <PlannerGoals
              goals={goalsPage.data?.rows ?? []}
              today={today}
              loading={goalsPage.isFetching}
              paging={goalsPaging}
            />
          </div>
        </div>
      )}

      {tab === "Budget" && (
        <div className="space-y-4">
          <PlannerTabHeader
            description="Envelopes for recurring costs, tracked against your expenses."
            action={
              budgets.length > 0
                ? {
                    label: "New Budget",
                    href: `${PLANNER_ROOT}/budgets/new`,
                    usertour: "budget-new",
                  }
                : undefined
            }
          />
          <div
            data-usertour="planner-budgets"
            data-usertour-loading={budgetsPage.isFetching || undefined}
          >
            <PlannerBudgets
              budgets={budgetsPage.data?.rows ?? []}
              expenses={expenses}
              today={today}
              loading={budgetsPage.isFetching}
              paging={budgetsPaging}
            />
          </div>
        </div>
      )}

      {tab === "Business planner" && (
        <div className="space-y-4">
          <PlannerTabHeader
            description="Planned spending with the case for it — cost, actual activity, ROI and payback."
            action={
              plans.length > 0
                ? { label: "New Plan", href: `${PLANNER_ROOT}/plans/new` }
                : undefined
            }
          />
          <div
            data-usertour="planner-plans"
            data-usertour-loading={plansPage.isFetching || undefined}
          >
            <PlannerPlans
              plans={plansPage.data?.rows ?? []}
              loading={plansPage.isFetching}
              paging={plansPaging}
            />
          </div>
        </div>
      )}

      {/* Goals can be deleted from their row here, and from the detail page,
          which mounts its own copy — never both at once. */}
      <DeleteGoalDialog />
      {/* Budgets can be deleted from their row here, and from the detail
          page, which mounts its own copy — never both at once. */}
      <DeleteBudgetDialog />
      {/* Plans can be deleted from their row here, and from the detail
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
