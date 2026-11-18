"use client";

import { CalendarClock, CalendarRange, CircleAlert, CircleCheck } from "lucide-react";

import { HeroHairline } from "@/components/layout/page-header";
import { Shimmer } from "@/components/ui/shimmer";
import { Stat } from "@/components/expenses/expenses-summary";
import type { BillDueBucket, BillSummary } from "@/lib/bills";

const EMPTY_BUCKET: BillDueBucket = { amount: 0, count: 0, expectedCount: 0 };

/** "3 bills · 1 expected", or the empty wording for a bucket with nothing in it. */
function bucketMeta(bucket: BillDueBucket, empty: string): string {
  if (bucket.count === 0 && bucket.expectedCount === 0) return empty;
  const parts: string[] = [];
  if (bucket.count > 0) parts.push(`${bucket.count} ${bucket.count === 1 ? "bill" : "bills"}`);
  if (bucket.expectedCount > 0) parts.push(`${bucket.expectedCount} expected`);
  return parts.join(" · ");
}

// The shared tile's comparison line, used here as a plain caption.
const caption = (label: string) => ({ percent: null, up: false, label });

/**
 * The Bills page's hero: what's been paid this month, then what's coming from
 * today — due in the next 7 and 30 days (counting repeat bills not made yet) —
 * and last, what's already overdue.
 */
export function BillsSummary({ summary, loading }: { summary?: BillSummary; loading: boolean }) {
  if (loading) {
    return (
      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm" aria-hidden>
        <HeroHairline />
        <dl className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="min-w-0 space-y-3 p-5">
              <div className="flex items-center gap-2.5">
                <Shimmer className="size-10 shrink-0 rounded-xl" />
                <Shimmer className="h-4 w-28" />
              </div>
              <Shimmer className="h-7 w-24" />
              <Shimmer className="h-3 w-32" />
            </div>
          ))}
        </dl>
      </section>
    );
  }

  const paid = summary?.paidThisMonth ?? { amount: 0, count: 0 };
  const due7 = summary?.due7 ?? EMPTY_BUCKET;
  const due30 = summary?.due30 ?? EMPTY_BUCKET;
  const overdue = summary?.overdue ?? EMPTY_BUCKET;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <HeroHairline />
      <dl className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        <Stat
          icon={<CircleCheck aria-hidden />}
          label="Paid this month"
          tone="success"
          tip="Bill payments matched to your bank this month, by the date the money left. Part payments count what was paid."
          value={paid.amount}
          change={caption(paid.count > 0 ? `${paid.count} ${paid.count === 1 ? "bill" : "bills"}` : "Nothing paid yet this month")}
        />
        <Stat
          icon={<CalendarClock aria-hidden />}
          label="Due in 7 days"
          tone="warning"
          tip="Bills due from today to a week out, including repeat bills that haven't been made yet."
          value={due7.amount}
          change={caption(bucketMeta(due7, "Nothing due this week"))}
        />
        <Stat
          icon={<CalendarRange aria-hidden />}
          label="Due in 30 days"
          tip="Everything due from today to 30 days out, this week included, with expected repeat bills."
          value={due30.amount}
          change={caption(bucketMeta(due30, "Nothing due this month"))}
        />
        <Stat
          icon={<CircleAlert aria-hidden />}
          label="Overdue"
          tone="danger"
          tip="Bills still owed past their due date, saved or converted. Part-paid bills count what's left."
          value={overdue.amount}
          change={caption(bucketMeta(overdue, "Nothing overdue"))}
        />
      </dl>
    </section>
  );
}
