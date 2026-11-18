"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { ClipboardList, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyActions,
  EmptyCue,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { InfoTip } from "@/components/ui/info-tip";
import { RowIconAction } from "@/components/documents/row-actions";
import { FullTextTip, RowSubtext } from "@/components/planner/planner-cells";
import { Shimmer } from "@/components/ui/shimmer";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PlannerBulkDelete,
  usePlannerSelection,
} from "@/components/planner/planner-bulk";
import { PLANNER_ROOT } from "@/components/planner/planner-detail";
import {
  PlannerListPagination,
  skeletonRowCount,
  type PlannerPaging,
} from "@/components/planner/planner-pagination";
import { useBulkDeletePlansMutation } from "@/hooks/use-planner-query";
import { deletePlanIdAtom } from "@/lib/atoms";
import { formatInvoiceDate, invoiceMoney } from "@/lib/invoices";
import {
  formatPayback,
  formatPercent,
  planActualTotal,
  planCost,
  planGap,
  planRoi,
  planStatus,
  planStatusVariant,
  type ExpensePlan,
} from "@/lib/planner";
import { cn } from "@/lib/utils";

const ROI_TIP =
  "The expected revenue less the plan's cost, as a percentage of that cost. The cost is the planned amount, or what you've spent if that's more.";
const PAYBACK_TIP =
  "How long the expected revenue takes to cover the cost (planned, or spent if more), at the monthly rate the plan's dates imply.";
const ACTUAL_TIP =
  "What you've actually spent in this category since the plan's start date, from your expense ledger.";

/**
 * The Business planner tab: planned spending with the case for it — what it
 * costs, what's actually been spent, what it returns and when it pays back.
 */
export function PlannerPlans({
  plans,
  loading = false,
  paging,
}: {
  plans: ExpensePlan[];
  /** Present once a page has loaded; absent before, when there's nothing to page. */
  paging?: PlannerPaging;
  /** While the list's fetch is still out — "no plans yet" would be a guess. */
  loading?: boolean;
}) {
  const router = useRouter();
  const [, setDeleteId] = useAtom(deletePlanIdAtom);
  const selection = usePlannerSelection(plans.map((plan) => plan.id));
  const bulkDelete = useBulkDeletePlansMutation();

  // Whenever the list is loading, not only the first time — see PlannerGoals.
  if (loading) {
    const skeletonRows = skeletonRowCount(paging, 3);
    return (
      <div className="space-y-4">
        <TableFrame>
          <TableBody aria-hidden>
            {Array.from({ length: skeletonRows }, (_, row) => row).map((row) => (
              <TableRow key={row}>
                <TableCell>
                  <Shimmer className="size-4" />
                </TableCell>
                <TableCell>
                  <Shimmer className="h-4 w-44" />
                </TableCell>
                <TableCell>
                  <Shimmer className="mx-auto h-5 w-16 rounded-full" />
                </TableCell>
                {[0, 1, 2, 3, 4, 5].map((cell) => (
                  <TableCell key={cell}>
                    <Shimmer className="mx-auto h-4 w-16" />
                  </TableCell>
                ))}
                <TableCell>
                  <Shimmer className="ml-auto h-8 w-20" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableFrame>
        {paging && (
          <PlannerListPagination
            paging={paging}
            itemLabel="plan"
            navLabel="Plans pages"
            disabled
          />
        )}
      </div>
    );
  }

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
    <div className="space-y-4">
      <PlannerBulkDelete
        chosen={selection.chosen}
        noun="expense plan"
        plural="expense plans"
        consequence="Their budget lines are removed too, and the amounts committed to them return to your available cash."
        deleteIds={bulkDelete.mutateAsync}
        onDone={selection.clear}
        onClear={selection.clear}
      />
      <TableFrame selection={selection}>
        <TableBody>
          {plans.map((plan) => {
            const gap = planGap(plan);
            const status = planStatus(plan);
            const open = () => router.push(`${PLANNER_ROOT}/plans/${plan.id}`);

            return (
              <TableRow
                key={plan.id}
                className="cursor-pointer"
                data-state={selection.isChosen(plan.id) ? "selected" : undefined}
                onClick={open}
              >
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <Checkbox
                    checked={selection.isChosen(plan.id)}
                    onCheckedChange={() => selection.toggle(plan.id)}
                    aria-label={`Select ${plan.name}`}
                  />
                </TableCell>
                <TableCell className="max-w-[16rem]">
                  <FullTextTip text={plan.name}>
                    <Link
                      href={`${PLANNER_ROOT}/plans/${plan.id}`}
                      onClick={(event) => event.stopPropagation()}
                      className="block truncate font-medium outline-none hover:underline focus-visible:underline"
                    >
                      {plan.name}
                    </Link>
                  </FullTextTip>
                  <RowSubtext text={`${plan.type} · ${plan.fundingSource}`} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-center">
                  <Badge variant={planStatusVariant(status)}>{status}</Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-center tabular text-muted-foreground">
                  {formatInvoiceDate(plan.startDate)} –{" "}
                  {formatInvoiceDate(plan.endDate)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-center font-medium tabular">
                  {invoiceMoney(planCost(plan))}
                </TableCell>
                <TableCell className="whitespace-nowrap text-center tabular">
                  {invoiceMoney(planActualTotal(plan))}
                </TableCell>
                <TableCell className="whitespace-nowrap text-center tabular">
                  {formatPercent(planRoi(plan))}
                </TableCell>
                <TableCell className="whitespace-nowrap text-center tabular">
                  {formatPayback(plan)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-center tabular">
                  {gap > 0 ? invoiceMoney(gap) : "—"}
                </TableCell>
                <TableCell
                  className={HUG_COLUMN}
                  onClick={(event) => event.stopPropagation()}
                >
                  {/* Out of the menu and onto the row, as on the Invoices list. */}
                  <div className="flex items-center justify-end gap-1">
                    <RowIconAction
                      icon={<Pencil />}
                      label="Open plan"
                      href={`${PLANNER_ROOT}/plans/${plan.id}`}
                    />
                    <RowIconAction
                      icon={<Trash2 />}
                      label="Delete plan"
                      destructive
                      onClick={() => setDeleteId(plan.id)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </TableFrame>
      {paging && (
        <PlannerListPagination
          paging={paging}
          itemLabel="plan"
          navLabel="Plans pages"
          disabled={loading}
        />
      )}
    </div>
  );
}

function HeadWithTip({ label, tip }: { label: string; tip: string }) {
  return (
    <span className="inline-flex items-center justify-center gap-1.5">
      {label}
      <InfoTip text={tip} />
    </span>
  );
}

function TableFrame({
  children,
  selection,
}: {
  children: React.ReactNode;
  /** Absent while loading, when there's nothing to select yet. */
  selection?: { allChosen: boolean; toggleAll: () => void };
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[44px]">
              {selection && (
                <Checkbox
                  checked={selection.allChosen}
                  onCheckedChange={selection.toggleAll}
                  aria-label="Select all expense plans"
                />
              )}
            </TableHead>
            {/* As on the Invoices list: only the name column is left-aligned;
                every other column is centred, and the actions sit at the right edge. */}
            <TableHead className="w-[16rem]">Plan</TableHead>
            <TableHead className="whitespace-nowrap text-center">Status</TableHead>
            <TableHead className="whitespace-nowrap text-center">Dates</TableHead>
            <TableHead className="whitespace-nowrap text-center">Planned budget</TableHead>
            <TableHead className="whitespace-nowrap text-center">
              <HeadWithTip label="Actual to date" tip={ACTUAL_TIP} />
            </TableHead>
            <TableHead className="whitespace-nowrap text-center">
              <HeadWithTip label="ROI" tip={ROI_TIP} />
            </TableHead>
            <TableHead className="whitespace-nowrap text-center">
              <HeadWithTip label="Payback" tip={PAYBACK_TIP} />
            </TableHead>
            <TableHead className="whitespace-nowrap text-center">Funding gap</TableHead>
            <TableHead className={cn(HUG_COLUMN, "text-right")}>Actions</TableHead>
          </TableRow>
        </TableHeader>
        {children}
      </Table>
    </div>
  );
}
