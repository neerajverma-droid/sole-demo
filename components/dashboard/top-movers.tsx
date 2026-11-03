"use client";

import Link from "next/link";
import { ChevronRight, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Shimmer } from "@/components/ui/shimmer";
import { RankedRow } from "@/components/dashboard/ranked-row";
import { money } from "@/lib/dashboard-data";
import type { TopMover } from "@/lib/dashboard";
import {
  useDashboardTopExpensesQuery,
  useDashboardTopIncomesQuery,
} from "@/hooks/use-dashboard-query";

export function TopIncomeCard() {
  const { data, isLoading } = useDashboardTopIncomesQuery();
  const rows = data ?? [];
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <TopMoversCard
      title="Top income"
      viewAllLabel="View all income"
      viewAllHref="/invoices"
      rows={rows}
      total={total}
      totalLabel="income"
      emptyCopy="No income recorded yet."
      emptyAction={{ label: "Create invoice", href: "/invoices/new" }}
      loading={isLoading}
    />
  );
}

export function TopExpensesCard() {
  const { data, isLoading } = useDashboardTopExpensesQuery();
  const rows = data ?? [];
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <TopMoversCard
      title="Top expenses"
      viewAllLabel="View all expenses"
      viewAllHref="/expenses"
      rows={rows}
      total={total}
      totalLabel="expenses"
      emptyCopy="No expenses recorded yet."
      emptyAction={{ label: "Add expense", href: "/expenses?new=1" }}
      loading={isLoading}
    />
  );
}

/**
 * Ranked rows, each with a bar showing its share of the category total —
 * a list you can read at a glance rather than a two-column table.
 */
function TopMoversCard({
  title,
  viewAllLabel,
  viewAllHref,
  rows,
  total,
  totalLabel,
  emptyCopy,
  emptyAction,
  loading,
}: {
  title: string;
  viewAllLabel: string;
  viewAllHref: string;
  rows: TopMover[];
  /** Category total, so bar length and quoted percentage agree. */
  total: number;
  totalLabel: string;
  emptyCopy: string;
  emptyAction: { label: string; href: string };
  loading?: boolean;
}) {
  const data = rows;
  // The leader carries the accent at full strength; the rest recede.
  const largest = Math.max(...data.map((row) => row.amount), 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href={viewAllHref}>
            {viewAllLabel}
            <ChevronRight className="size-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Shimmer className="h-9 w-full" />
            <Shimmer className="h-9 w-full" />
            <Shimmer className="h-9 w-full" />
          </div>
        ) : data.length === 0 ? (
          // Borderless: it already sits inside a card.
          <Empty className="border-0 bg-transparent px-0 py-6 shadow-none">
            <EmptyMedia>
              <Receipt aria-hidden />
            </EmptyMedia>
            <div className="space-y-1">
              <EmptyTitle>Nothing to rank yet</EmptyTitle>
              <EmptyDescription>{emptyCopy}</EmptyDescription>
            </div>
            <EmptyActions>
              <Button variant="outline" size="sm" asChild>
                <Link href={emptyAction.href}>{emptyAction.label}</Link>
              </Button>
            </EmptyActions>
          </Empty>
        ) : (
          <ul className="space-y-1">
            {data.map((row, index) => {
              const percent =
                total > 0 ? Math.round((row.amount / total) * 100) : 0;
              return (
                <li key={row.id ?? `${row.label}-${index}`}>
                  <RankedRow
                    label={row.label}
                    valueLabel={money(row.amount)}
                    percent={percent}
                    totalLabel={totalLabel}
                    leading={row.amount === largest}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
