"use client";

import Link from "next/link";
import { useAtom } from "jotai";
import {
  ClipboardList,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyActions,
  EmptyCue,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { InfoTip } from "@/components/ui/info-tip";
import { MenuAction } from "@/components/ui/menu-action";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PLANNER_ROOT } from "@/components/planner/planner-detail";
import { deletePlanIdAtom } from "@/lib/atoms";
import { formatInvoiceDate, invoiceMoney } from "@/lib/invoices";
import {
  formatPayback,
  formatPercent,
  planActualTotal,
  planCommitted,
  planCost,
  planGap,
  planRoi,
  planStatus,
  planStatusVariant,
  type ExpensePlan,
} from "@/lib/planner";

const ROI_TIP =
  "The expected benefit net of the plan's cost, as a percentage of that cost, scaled from the plan's own window up to a year.";
const PAYBACK_TIP =
  "How long the expected benefit takes to cover the cost, at the monthly rate the plan's window implies.";
const ACTUAL_TIP =
  "What you've actually spent in this category since the plan's start date, from your expense ledger.";

/**
 * The Business planner tab: planned spending with the case for it — what it
 * costs, what's actually been spent, what it returns and when it pays back.
 */
export function PlannerPlans({
  plans,
  loading = false,
}: {
  plans: ExpensePlan[];
  /** While the list's fetch is still out — "no plans yet" would be a guess. */
  loading?: boolean;
}) {
  const [, setDeleteId] = useAtom(deletePlanIdAtom);

  if (loading && plans.length === 0) return <PlansSkeleton />;

  if (plans.length === 0) {
    return (
      <Empty>
        <EmptyMedia>
          <ClipboardList aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>No expense plans yet</EmptyTitle>
          <EmptyDescription>
            Plan a purchase to see what it costs, when it pays for itself, and
            how much of it you&apos;ve funded so far.
          </EmptyDescription>
        </div>
        <EmptyCue label="Start here" />
        <EmptyActions>
          <Button size="sm" asChild>
            <Link href={`${PLANNER_ROOT}/plans/new`}>New expense plan</Link>
          </Button>
        </EmptyActions>
      </Empty>
    );
  }

  return (
    <ul className="space-y-4">
      {plans.map((plan) => {
        const cost = planCost(plan);
        const committed = planCommitted(plan);
        const gap = planGap(plan);
        const actual = planActualTotal(plan);
        const status = planStatus(plan);
        const funded = cost > 0 ? Math.min(1, committed / cost) : 0;

        return (
          <li
            key={plan.id}
            className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
                  aria-hidden
                >
                  <ClipboardList className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{plan.name}</p>
                    <Badge variant={planStatusVariant(status)}>{status}</Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground tabular">
                    {plan.type} · {plan.fundingSource} ·{" "}
                    {formatInvoiceDate(plan.startDate)} –{" "}
                    {formatInvoiceDate(plan.endDate)}
                  </p>
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    aria-label={`Actions for ${plan.name}`}
                  >
                    <MoreHorizontal className="size-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <MenuAction
                    icon={<Pencil />}
                    label="Open"
                    href={`${PLANNER_ROOT}/plans/${plan.id}`}
                  />
                  <DropdownMenuSeparator />
                  <MenuAction
                    icon={<Trash2 />}
                    label="Delete"
                    onSelect={() => setDeleteId(plan.id)}
                    destructive
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <dl className="grid gap-3 rounded-lg border border-dashed border-border surface-subtle p-3 sm:grid-cols-3 lg:grid-cols-5">
              <Figure label="Planned budget" value={invoiceMoney(cost)} />
              <Figure
                label="Actual to date"
                value={invoiceMoney(actual)}
                tip={ACTUAL_TIP}
              />
              <Figure
                label="First-year ROI"
                value={formatPercent(planRoi(plan))}
                tip={ROI_TIP}
              />
              <Figure
                label="Payback"
                value={formatPayback(plan)}
                tip={PAYBACK_TIP}
              />
              <Figure
                label="Funding gap"
                value={gap > 0 ? invoiceMoney(gap) : "—"}
              />
            </dl>

            <div className="space-y-1.5">
              <Progress value={funded * 100} />
              <p className="text-xs text-muted-foreground tabular">
                {invoiceMoney(committed)} committed of {invoiceMoney(cost)}
                {gap > 0 && ` · ${invoiceMoney(gap)} still to find`}
              </p>
            </div>

            <p className="text-xs text-muted-foreground tabular">
              {plan.lines.length}{" "}
              {plan.lines.length === 1 ? "budget line" : "budget lines"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function Figure({
  label,
  value,
  tip,
}: {
  label: string;
  value: string;
  tip?: string;
}) {
  return (
    <div className="space-y-1">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {label}
        {tip && <InfoTip text={tip} />}
      </dt>
      <dd className="text-sm font-medium tabular">{value}</dd>
    </div>
  );
}

/** Stands in for the cards while the fetch is out, at the same height. */
function PlansSkeleton() {
  return (
    <ul className="space-y-4" aria-hidden>
      {[0, 1].map((row) => (
        <li
          key={row}
          className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Skeleton className="size-9 shrink-0 rounded-xl" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
            <Skeleton className="size-8 shrink-0 rounded-md" />
          </div>
          <div className="grid gap-3 rounded-lg border border-dashed border-border surface-subtle p-3 sm:grid-cols-3 lg:grid-cols-5">
            {[0, 1, 2, 3, 4].map((figure) => (
              <div key={figure} className="space-y-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </li>
      ))}
    </ul>
  );
}
