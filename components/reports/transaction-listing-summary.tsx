"use client";

import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CircleCheck,
  ListOrdered,
  Plus,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/ui/count-up";
import { InfoTip } from "@/components/ui/info-tip";
import { STAT_TONES } from "@/components/ui/stat-cards";
import { HeroHairline } from "@/components/layout/page-header";
import {
  ReportDeltaLine,
  ReportStatCard,
} from "@/components/reports/report-stat-card";
import { reportMoney } from "@/lib/report-periods";
import {
  countDelta,
  moneyDelta,
  transactionCount,
  type TransactionListing,
} from "@/lib/transaction-listing";
import { cn } from "@/lib/utils";

/**
 * What the period contains, before the ledger itself.
 *
 * How many, how much each way, and how much of it is reconciled — the three
 * things you check before sending a listing to an accountant, because an
 * unreconciled row is the one they'll ask about.
 *
 * Same shape as the P&L's summary: a hero with the headline tally and three
 * supporting cards under it, all reading one report object.
 */
export function TransactionListingSummary({
  listing,
  empty = false,
}: {
  listing: TransactionListing;
  empty?: boolean;
}) {
  const { count, moneyIn, moneyOut, reconciled, unreconciled, gst } =
    listing.summary;
  const previous = listing.previousLabel;

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
              <ListOrdered />
            </span>
            <h2 className="flex items-center gap-1.5 text-sm text-muted-foreground">
              Transactions in this period
              <InfoTip text="Every transaction coded to a category between the two dates. Personal spending and transfers between your own accounts are left out." />
            </h2>
          </div>

          {empty ? (
            <>
              <p className="mt-4 text-2xl font-semibold leading-tight tracking-tight">
                No transactions in this period
              </p>
              <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
                Nothing has been coded between {listing.rangeLabel}. Widen the
                date range above, or record what you&apos;ve been paid and spent
                and it will appear here.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Button asChild>
                  <Link href="/transactions">
                    <Plus />
                    Go to Transactions
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-4 text-4xl font-semibold leading-none tracking-tight tabular">
                <CountUp value={count.amount} format={transactionCount} />
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <ReportDeltaLine delta={countDelta(count, previous)} />
                <span className="text-xs text-muted-foreground tabular">
                  {listing.rangeLabel} · {reportMoney(gst)} GST
                </span>
              </div>
            </>
          )}
        </div>
      </section>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ReportStatCard
          icon={ArrowDownLeft}
          tone="success"
          label="Money in"
          tip="Everything received in the period, GST included."
          value={moneyIn.amount}
          delta={moneyDelta(moneyIn, previous)}
          empty={empty}
        />
        <ReportStatCard
          icon={ArrowUpRight}
          label="Money out"
          tip="Everything paid out in the period, GST included."
          value={moneyOut.amount}
          // Money out takes the warm accent on the tile, as it does everywhere
          // else in the product. Never on the figure.
          tileTone="bg-warm text-warm-foreground"
          delta={moneyDelta(moneyOut, previous, "down-good")}
          empty={empty}
        />
        <ReportStatCard
          icon={CircleCheck}
          tone="success"
          label="Reconciled"
          tip="Matched against the bank feed. Anything still unreconciled is what your accountant will query first."
          value={reconciled}
          format={transactionCount}
          // No comparison: what matters is how much of *this* period is settled,
          // not whether last period happened to be tidier.
          breakdown={
            <ReconciledSplit
              reconciled={reconciled}
              unreconciled={unreconciled}
            />
          }
          empty={empty}
          emptyMeta="Nothing to reconcile yet"
        />
      </dl>
    </div>
  );
}

/**
 * Reconciled against not.
 *
 * Two chips rather than a ratio: "18 of 22" makes you do the subtraction, and
 * the number people act on is the one still outstanding. Green for settled and
 * amber for outstanding — amber rather than red because unreconciled is work
 * pending, not an error.
 *
 * The amber chip disappears at zero. "0 unreconciled" is a warning about nothing.
 */
function ReconciledSplit({
  reconciled,
  unreconciled,
}: {
  reconciled: number;
  unreconciled: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge
        variant="success"
        className="gap-1 rounded-full px-2 py-0 text-[11px] font-medium tabular"
      >
        <Check className="size-2.5" aria-hidden />
        {reconciled} reconciled
      </Badge>
      {unreconciled > 0 && (
        <Badge
          variant="warning"
          className="gap-1 rounded-full px-2 py-0 text-[11px] font-medium tabular"
        >
          <TriangleAlert className="size-2.5" aria-hidden />
          {unreconciled} unreconciled
        </Badge>
      )}
    </div>
  );
}
