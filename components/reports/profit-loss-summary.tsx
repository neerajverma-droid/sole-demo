"use client";

import Link from "next/link";
import { useSetAtom } from "jotai";
import {
  Landmark,
  Plus,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/ui/count-up";
import {
  ReportDeltaLine,
  ReportStatCard,
} from "@/components/reports/report-stat-card";
import { InfoTip } from "@/components/ui/info-tip";
import { STAT_TONES } from "@/components/ui/stat-cards";
import { HeroHairline } from "@/components/layout/page-header";
import { connectBankIntroOpenAtom } from "@/lib/atoms";
import { plDelta, reportMoney, type PlReport } from "@/lib/reports";
import { cn } from "@/lib/utils";

/**
 * The answer, before the working.
 *
 * Net profit gets the hero and the largest figure on the page, because it's the
 * one number the report exists to produce — everything in the table below is how
 * it was arrived at. The three cards under it are the figures you check next: what
 * came in, what went out, and what was left before overheads.
 *
 * Every card carries the same period-over-period line, so the question "up or
 * down?" has the same answer in the same place four times over.
 *
 * `empty` is a first-run account: the hero says so and offers the two things
 * that end it, and the cards hold their places at zero. The tiles stay rather
 * than collapsing to nothing, because the shape of the answer is part of the
 * explanation — you can see what will be here.
 */
export function ProfitLossSummary({
  report,
  empty = false,
}: {
  report: PlReport;
  empty?: boolean;
}) {
  const { netProfit, income, expenses, grossProfit } = report.headline;
  const previous = report.previousLabel;
  const loss = !empty && netProfit.amount < 0;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <HeroHairline />
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5",
                STAT_TONES.primary,
              )}
              aria-hidden
            >
              <Wallet />
            </span>
            <h2 className="flex items-center gap-1.5 text-sm text-muted-foreground">
              {loss ? "Net loss" : "Net profit"}
              <InfoTip text="What's left after every cost — cost of sales, overheads, depreciation and finance costs. The bottom line of the report below." />
            </h2>
          </div>

          {empty ? (
            <>
              {/*
                A sentence where the figure goes, at a size that reads as a
                headline rather than as a caption apologising for missing data.
              */}
              <p className="mt-4 text-2xl font-semibold leading-tight tracking-tight">
                No profit or loss recorded yet
              </p>
              <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
                As soon as income and expenses are coded, this becomes your net
                profit for {report.rangeLabel} — and the breakdown below fills
                in with the accounts behind it.
              </p>
              <FirstRunActions />
            </>
          ) : (
            <>
              {/* Larger than any other figure on the page, and the only one at
                  this size — a hero that shares its scale with the cards
                  beneath it isn't a hero. */}
              <p className="mt-4 text-4xl font-semibold leading-none tracking-tight tabular">
                <CountUp value={netProfit.amount} format={reportMoney} />
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <ReportDeltaLine delta={plDelta(netProfit, previous)} />
                <span className="text-xs text-muted-foreground tabular">
                  {report.rangeLabel}
                </span>
              </div>
            </>
          )}
        </div>
      </section>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ReportStatCard
          icon={TrendingUp}
          tone="success"
          label="Total income"
          tip="Everything invoiced and received in the period, before any costs."
          value={income.amount}
          delta={plDelta(income, previous)}
          empty={empty}
        />
        <ReportStatCard
          icon={TrendingDown}
          label="Total expenses"
          tip="Cost of sales, overheads, depreciation and finance costs added together."
          value={expenses.amount}
          // Money out takes the warm accent on the tile, as it does everywhere
          // else in the product. Never on the figure.
          tileTone="bg-warm text-warm-foreground"
          delta={plDelta(expenses, previous, "down-good")}
          empty={empty}
        />
        <ReportStatCard
          icon={Scale}
          label="Gross profit"
          tip="Income minus cost of sales — what the work itself earned, before overheads."
          value={grossProfit.amount}
          delta={plDelta(grossProfit, previous)}
          empty={empty}
        />
      </dl>
    </div>
  );
}

/**
 * The two things that end an empty P&L.
 *
 * Coding a transaction is the direct route and takes the primary; the bank feed
 * is the one that keeps doing it, which is why it's offered beside rather than
 * buried. It opens the consent explainer rather than the provider flow — the
 * platform rule is that every "add bank account" goes through that first, and
 * the explainer is mounted globally by the top bar, so it's reachable from here.
 */
function FirstRunActions() {
  const openConnectBank = useSetAtom(connectBankIntroOpenAtom);

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <Button asChild>
        <Link href="/transactions/new">
          <Plus />
          Add transactions
        </Link>
      </Button>
      <Button variant="outline" onClick={() => openConnectBank(true)}>
        <Landmark />
        Connect a bank feed
      </Button>
    </div>
  );
}
