"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  Target,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { InfoTip } from "@/components/ui/info-tip";
import { Progress } from "@/components/ui/progress";
import {
  ProportionBar,
  segmentHighlight,
  type ProportionSegment,
} from "@/components/dashboard/proportion-bar";
import { WARM_TILE } from "@/components/layout/page-header";
import { PLANNER_ROOT } from "@/components/planner/planner-detail";
import {
  StatCards,
  type StatCard,
} from "@/components/ui/stat-cards";
import { invoiceMoney } from "@/lib/invoices";
import {
  availableCash,
  cashAccounts,
  cashOnHand,
  forecastAnnualReturn,
  formatGoalDate,
  goalAllocated,
  goalIsMeasurable,
  goalProgress,
  goalStatus,
  goalStatusCounts,
  goalStatusVariant,
  goalTarget,
  isOverAllocated,
  planCommitted,
  planCost,
  planStatusCounts,
  requiredWeekly,
  signedMoney,
  totalCommitted,
  totalFundingGap,
  totalGoalAllocations,
  type BankAccountBalance,
  type ExpensePlan,
  type Goal,
} from "@/lib/planner";
import type { PlannerOverviewData } from "@/lib/planner-api";
import { cn } from "@/lib/utils";

/** The tooltips for figures nobody can be expected to infer. */
const TIPS = {
  available:
    "Cash across your bank accounts and cash wallet, less what you've earmarked for goals and committed to expense plans.",
  gaps: "The shortfall between what your expense plans will cost and the cash you've committed to them.",
  forecast:
    "The projected net benefit over 12 months from your active expense plans, after their costs.",
  weekly:
    "What's left to reach the target, divided by the weeks until the target date.",
};

export function PlannerOverview({
  goals,
  plans,
  wallet,
  today,
  banks = [],
  overview = null,
  loading = false,
}: {
  goals: Goal[];
  plans: ExpensePlan[];
  wallet: number;
  /** ISO `YYYY-MM-DD`, passed in so every card dates from the same moment. */
  today: string;
  /** The connected bank accounts, whose balances count towards cash on hand. */
  banks?: BankAccountBalance[];
  /**
   * The portfolio roll-up from `/planner-overview`. Every figure it carries is
   * preferred over the local one: the server totals the whole business, while
   * the lists here are only what this screen happens to have loaded. Null until
   * it arrives, and the local calculation answers in the meantime.
   */
  overview?: PlannerOverviewData | null;
  /**
   * While the planner's fetches are still out. The tiles show their own
   * placeholder, and the lines that read something into a zero — "No goals
   * yet", "Every plan is fully funded" — are held back until the figures are
   * real, since a count of nothing loaded is not a count of nothing.
   */
  loading?: boolean;
}) {
  // The wallet balance the overview reports is the same one the store holds;
  // preferring it keeps this card agreeing with the server even if the wallet
  // query hasn't come back yet.
  const walletBalance = overview?.cashWalletBalance ?? wallet;

  const allocations = overview?.goals.totalAllocated ?? totalGoalAllocations(goals);
  const committed = overview?.plans.committedToPlans ?? totalCommitted(plans);
  const onHand = cashOnHand(walletBalance, banks);

  // Floored, as availableCash does: earmarking past what you hold is a warning
  // to show rather than a negative balance to report.
  const available = overview
    ? Math.max(0, onHand - allocations - committed)
    : availableCash(wallet, goals, plans, banks);

  const gaps = overview?.plans.totalFundingGaps ?? totalFundingGap(plans);
  const forecast =
    overview?.plans.forecastAnnualReturn ?? forecastAnnualReturn(plans);

  const localGoalCounts = goalStatusCounts(goals, today);
  const localPlanCounts = planStatusCounts(plans);

  const goalCounts = overview
    ? {
        onTrack: overview.goals.onTrack,
        behind: overview.goals.behind,
        complete: overview.goals.complete,
        draft: 0,
      }
    : localGoalCounts;

  const planCounts = overview
    ? {
        onTrack: overview.plans.onTrack,
        // The API has no "review" state; it splits plans into on track and
        // funding gap only, so the middle count is genuinely zero rather than
        // unknown — which is exactly what the reference frontend renders.
        review: 0,
        fundingGap: overview.plans.withGap,
      }
    : localPlanCounts;

  const goalTotal = overview?.goals.total ?? goals.length;
  const planTotal = overview?.plans.total ?? plans.length;

  const stats: StatCard[] = [
    {
      key: "available",
      label: "Estimated available cash",
      tip: TIPS.available,
      value: invoiceMoney(available),
      // Names what's actually counted, so the figure and the label can't
      // disagree the way "bank balance" did while the wallet held the money.
      meta: `${invoiceMoney(onHand)} on hand across ${cashAccounts(walletBalance, banks).length} accounts`,
      icon: Wallet,
    },
    {
      key: "plans",
      label: "Expense plans",
      value: String(planTotal),
      breakdown:
        planTotal > 0
          ? [
              { label: `${planCounts.onTrack} on track`, tone: "success" },
              { label: `${planCounts.review} review`, tone: "warning" },
              {
                label: `${planCounts.fundingGap} funding gap`,
                tone: "danger",
              },
            ]
          : undefined,
      meta: !loading && planTotal === 0 ? "Nothing planned yet" : undefined,
      icon: ClipboardList,
    },
    {
      key: "goals",
      label: "Active goals",
      value: String(goalTotal),
      breakdown:
        goalTotal > 0
          ? [
              { label: `${goalCounts.onTrack} on track`, tone: "success" },
              { label: `${goalCounts.behind} behind`, tone: "warning" },
              { label: `${goalCounts.complete} complete`, tone: "success" },
            ]
          : undefined,
      meta: !loading && goalTotal === 0 ? "No goals yet" : undefined,
      icon: Target,
    },
    {
      key: "gaps",
      label: "Funding gaps",
      tip: TIPS.gaps,
      value: invoiceMoney(gaps),
      meta:
        gaps > 0
          ? `across ${planCounts.fundingGap} ${planCounts.fundingGap === 1 ? "plan" : "plans"}`
          : loading
            ? undefined
            : "Every plan is fully funded",
      icon: TriangleAlert,
      // Money you're short of takes the warm accent, on the tile only.
      tileTone: WARM_TILE,
    },
    {
      key: "forecast",
      label: "Forecast annual return",
      tip: TIPS.forecast,
      value: signedMoney(forecast),
      meta:
        forecast >= 0
          ? "net of plan costs, next 12 months"
          : "costs outweigh the first year's benefit",
      icon: TrendingUp,
    },
  ];

  return (
    <div className="space-y-6">
      <StatCards stats={stats} loading={loading} />

      <div className="grid gap-4 lg:grid-cols-2">
        <CashPositionCard
          wallet={walletBalance}
          banks={banks}
          available={available}
          allocations={allocations}
          committed={committed}
          overAllocated={
            overview
              ? allocations + committed > onHand
              : isOverAllocated(wallet, goals, plans, banks)
          }
        />
        <PlanFundingCard plans={plans} committed={committed} gaps={gaps} />
      </div>

      <GoalsProgressCard goals={goals} today={today} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Cash position
 * ------------------------------------------------------------------ */

function CashPositionCard({
  wallet,
  banks,
  available,
  allocations,
  committed,
  overAllocated,
}: {
  wallet: number;
  banks: BankAccountBalance[];
  available: number;
  allocations: number;
  committed: number;
  overAllocated: boolean;
}) {
  const [hovered, setHovered] = React.useState<string | null>(null);
  const accounts = cashAccounts(wallet, banks);
  const onHand = cashOnHand(wallet, banks);

  const lines = [
    {
      key: "available",
      label: "Available",
      value: available,
      fill: "bg-chart-in",
    },
    {
      key: "goals",
      label: "Goal allocations",
      value: allocations,
      fill: "bg-chart-in-soft",
    },
    {
      key: "plans",
      label: "Committed to expense plans",
      value: committed,
      fill: "bg-chart-out",
    },
  ];

  const total = lines.reduce((sum, line) => sum + line.value, 0);
  const segments: ProportionSegment[] = lines.map((line) => ({
    key: line.key,
    label: line.label,
    percent: total > 0 ? Math.round((line.value / total) * 100) : 0,
    valueLabel: invoiceMoney(line.value),
    className: line.fill,
  }));

  return (
    <Card className="flex h-full flex-col" data-usertour="planner-cash-position">
      <CardHeader className="flex-row items-baseline justify-between space-y-0 pb-4">
        <CardTitle className="text-base">Cash position</CardTitle>
        <span className="text-xs text-muted-foreground tabular">
          {invoiceMoney(onHand)} on hand
        </span>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        <ProportionBar
          label="Available cash, goal allocations and plan commitments"
          segments={segments}
          hovered={hovered}
          onHoverChange={setHovered}
          empty={total <= 0}
        />

        <dl className="space-y-0.5">
          {lines.map((line) => (
            <div
              key={line.key}
              tabIndex={0}
              onMouseEnter={() => setHovered(line.key)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(line.key)}
              onBlur={() => setHovered(null)}
              className={cn(
                "flex cursor-default items-center justify-between gap-4 rounded-md px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                segmentHighlight(hovered, line.key),
              )}
            >
              <dt className="flex min-w-0 items-center gap-2.5 text-sm text-muted-foreground">
                <span
                  className={cn("size-2 shrink-0 rounded-sm", line.fill)}
                  aria-hidden
                />
                <span className="truncate">{line.label}</span>
              </dt>
              <dd className="shrink-0 text-sm font-medium tabular">
                {invoiceMoney(line.value)}
              </dd>
            </div>
          ))}
        </dl>

        {/* Earmarking more than you hold is worth saying out loud rather than
            quietly flooring the available figure at zero. */}
        {overAllocated && (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
            Your goal allocations and plan commitments add up to more than the
            cash you hold.
          </p>
        )}

        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Accounts
          </p>
          <dl className="space-y-0.5">
            {accounts.map((account, index) => (
              <div
                // Two accounts at the same bank share a name, so the position
                // is what keeps the keys distinct.
                key={`${account.name}-${index}`}
                className="flex items-center justify-between gap-4 py-1"
              >
                <dt className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="truncate">{account.name}</span>
                  {account.detail && (
                    <span className="shrink-0 text-xs text-muted-foreground tabular">
                      {account.detail}
                    </span>
                  )}
                  {account.kind === "wallet" && (
                    <Badge variant="secondary">Cash</Badge>
                  )}
                </dt>
                <dd className="shrink-0 text-sm tabular text-muted-foreground">
                  {invoiceMoney(account.balance)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Expense plan funding
 * ------------------------------------------------------------------ */

function PlanFundingCard({
  plans,
  committed,
  gaps,
}: {
  plans: ExpensePlan[];
  committed: number;
  gaps: number;
}) {
  const [hovered, setHovered] = React.useState<string | null>(null);
  const total = committed + gaps;

  const lines = [
    {
      key: "committed",
      label: "Committed cash",
      value: committed,
      fill: "bg-chart-in",
    },
    { key: "gap", label: "Funding gap", value: gaps, fill: "bg-chart-out" },
  ];

  const segments: ProportionSegment[] = lines.map((line) => ({
    key: line.key,
    label: line.label,
    percent: total > 0 ? Math.round((line.value / total) * 100) : 0,
    valueLabel: invoiceMoney(line.value),
    className: line.fill,
  }));

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-baseline justify-between space-y-0 pb-4">
        <CardTitle className="text-base">Expense plan funding</CardTitle>
        <span className="text-xs text-muted-foreground tabular">
          {invoiceMoney(total)} forecast
        </span>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        <ProportionBar
          label="Committed cash against the funding gap"
          segments={segments}
          hovered={hovered}
          onHoverChange={setHovered}
          empty={total <= 0}
        />

        <dl className="space-y-0.5">
          {lines.map((line) => (
            <div
              key={line.key}
              tabIndex={0}
              onMouseEnter={() => setHovered(line.key)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(line.key)}
              onBlur={() => setHovered(null)}
              className={cn(
                "flex cursor-default items-center justify-between gap-4 rounded-md px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                segmentHighlight(hovered, line.key),
              )}
            >
              <dt className="flex min-w-0 items-center gap-2.5 text-sm text-muted-foreground">
                <span
                  className={cn("size-2 shrink-0 rounded-sm", line.fill)}
                  aria-hidden
                />
                <span className="truncate">{line.label}</span>
              </dt>
              <dd className="shrink-0 text-sm font-medium tabular">
                {invoiceMoney(line.value)}
              </dd>
            </div>
          ))}
        </dl>

        <div className="space-y-2 border-t border-border pt-3">
          {plans.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              No expense plans yet — nothing to fund.
            </p>
          ) : (
            plans.map((plan) => (
              <div key={plan.id} className="flex items-center justify-between gap-4">
                <p className="min-w-0 truncate text-sm">{plan.name}</p>
                <p className="shrink-0 text-xs text-muted-foreground tabular">
                  {invoiceMoney(planCommitted(plan))} of{" "}
                  {invoiceMoney(planCost(plan))}
                </p>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Goals progress
 * ------------------------------------------------------------------ */

function GoalsProgressCard({
  goals,
  today,
}: {
  goals: Goal[];
  today: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        {/* The weekly explanation lives here rather than on each row: it's the
            same sentence every time, and it keeps the clickable rows free of
            anything else that takes focus or a click. */}
        <CardTitle className="flex items-center gap-2 text-base">
          Goals progress
          <InfoTip text={TIPS.weekly} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {goals.length === 0 ? (
          // The shared Empty, with its own frame dropped — it's already inside
          // a card, and the Dashboard's in-card empties read the same way.
          <Empty className="border-0 bg-transparent px-0 py-6 shadow-none">
            <EmptyMedia>
              <Target aria-hidden />
            </EmptyMedia>
            <div className="space-y-1">
              <EmptyTitle>No goals yet</EmptyTitle>
              <EmptyDescription>
                Set a savings goal and your allocations against target will show
                here.
              </EmptyDescription>
            </div>
            <EmptyActions>
              <Button size="sm" asChild>
                <Link href={`${PLANNER_ROOT}/goals/new`}>Create goal</Link>
              </Button>
            </EmptyActions>
          </Empty>
        ) : (
          goals.map((goal) => {
            const status = goalStatus(goal, today);
            const weekly = requiredWeekly(goal, today);
            const allocated = goalAllocated(goal);
            const target = goalTarget(goal);

            return (
              // A link, now that a goal has its own page — which is also the
              // simplest answer to the nested-interactive problem this row had.
              <Link
                key={goal.id}
                href={`${PLANNER_ROOT}/goals/${goal.id}`}
                className="block w-full space-y-2 rounded-lg border border-border p-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-medium">{goal.name}</p>
                    {/* No badge at all until the goal has a target and a date —
                        an unfinished goal isn't behind. */}
                    {status && (
                      <Badge variant={goalStatusVariant(status)}>{status}</Badge>
                    )}
                  </div>
                  <p className="shrink-0 text-sm tabular">
                    {invoiceMoney(allocated)}
                    <span className="text-muted-foreground">
                      {" "}
                      of {target > 0 ? invoiceMoney(target) : "—"}
                    </span>
                  </p>
                </div>

                <Progress value={goalProgress(goal) * 100} />

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="tabular">
                    {formatGoalDate(goal.targetDate)}
                  </span>
                  {goalIsMeasurable(goal) && weekly !== null && weekly > 0 && (
                    <span className="tabular">
                      {invoiceMoney(weekly)}/wk to stay on track
                    </span>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

/**
 * An untouched planner's one empty view, standing in for the tabs until the
 * first goal, budget or plan exists — the shared Empty, so it reads like every
 * other module's "nothing yet". A goal is where a new planner starts, so that's
 * the one action it carries.
 */
export function PlannerFirstStep() {
  return (
    <Empty>
      <EmptyMedia>
        <Target aria-hidden />
      </EmptyMedia>
      <div className="space-y-1">
        <EmptyTitle>Start with a savings goal</EmptyTitle>
        <EmptyDescription>
          A buffer or a BAS set-aside gives the rest of the planner something to
          work from.
        </EmptyDescription>
      </div>
      <EmptyActions>
        <Button size="sm" asChild>
          <Link href={`${PLANNER_ROOT}/goals/new`}>
            Create goal
            <ArrowRight />
          </Link>
        </Button>
      </EmptyActions>
    </Empty>
  );
}
