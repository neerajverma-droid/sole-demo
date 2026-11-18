"use client";

import Link from "next/link";
import { CalendarCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Shimmer } from "@/components/ui/shimmer";
import { BillStatusBadge, ExpectedBadge, RepeatBadge, SupplierMark } from "@/components/bills/bill-status";
import { useUpcomingBillsQuery } from "@/hooks/use-bills-query";
import { daysBetween, groupUpcoming, occurrenceLabel, upcomingDueDate, type UpcomingItem } from "@/lib/bills";
import { formatInvoiceDate, invoiceMoney } from "@/lib/invoices";
import { cn } from "@/lib/utils";

/** How far ahead expected repeat bills are shown. */
export const UPCOMING_DAYS = 60;

/**
 * Everything still owed, soonest first, in the hero's buckets — overdue, the
 * next 7 days, within 30, later, and no due date — with each bucket's total.
 * Repeat bills not made yet sit in with the real ones, marked "Expected", and
 * open their schedule rather than a bill.
 */
export function BillsUpcoming({ today, onManageRepeat }: { today: string; onManageRepeat: (scheduleId: string) => void }) {
  const query = useUpcomingBillsQuery(UPCOMING_DAYS);

  if (query.isLoading) {
    return (
      <div className="space-y-4" aria-hidden>
        {Array.from({ length: 2 }).map((_, group) => (
          <div key={group} className="overflow-hidden rounded-lg border border-border bg-card">
            <Shimmer className="h-9 w-full rounded-none" />
            {Array.from({ length: 3 }).map((__, row) => (
              <div key={row} className="flex items-center gap-3 border-t border-border p-3">
                <Shimmer className="size-9 rounded-lg" />
                <Shimmer className="h-4 w-40" />
                <Shimmer className="ml-auto h-4 w-20" />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="font-medium">Couldn&apos;t load upcoming bills</p>
        <p className="mt-1 text-sm text-muted-foreground">{query.error?.message}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const groups = groupUpcoming(query.data?.bills ?? [], query.data?.expected ?? [], today);

  if (groups.length === 0) {
    return (
      <Empty>
        <EmptyMedia>
          <CalendarCheck aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>Nothing owed</EmptyTitle>
          <EmptyDescription>Every bill is paid, and no repeat bills are due in the next {UPCOMING_DAYS} days.</EmptyDescription>
        </div>
      </Empty>
    );
  }

  return (
    <div className="space-y-4" data-usertour="bill-upcoming">
      {groups.map((group) => (
        <section key={group.id} className="overflow-hidden rounded-lg border border-border bg-card shadow-sm" aria-label={group.title}>
          <header
            className={cn(
              "flex items-center justify-between gap-3 border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide",
              group.id === "overdue" ? "bg-destructive/[0.06] text-destructive" : "bg-muted/60 text-muted-foreground",
            )}
          >
            <span>
              {group.title} · {group.items.length}
            </span>
            <span className="tabular">{invoiceMoney(group.total)}</span>
          </header>
          <ul className="divide-y divide-border">
            {group.items.map((item) => (
              <UpcomingRow
                key={item.kind === "bill" ? `bill-${item.bill.id}` : `expected-${item.expected.key}`}
                item={item}
                today={today}
                onManageRepeat={onManageRepeat}
              />
            ))}
          </ul>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">
        Expected bills are repeat bills that will be made on their date. Totals count what&apos;s still owed on part-paid bills.
      </p>
    </div>
  );
}

function UpcomingRow({
  item,
  today,
  onManageRepeat,
}: {
  item: UpcomingItem;
  today: string;
  onManageRepeat: (scheduleId: string) => void;
}) {
  const due = upcomingDueDate(item);

  if (item.kind === "expected") {
    const expected = item.expected;
    return (
      <li>
        <button
          type="button"
          onClick={() => onManageRepeat(expected.scheduleId)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
          aria-label={`Expected bill from ${expected.supplierName || "supplier"} — manage repeat`}
        >
          <SupplierMark name={expected.supplierName} muted />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-muted-foreground">{expected.supplierName || "No supplier"}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <ExpectedBadge position={occurrenceLabel(expected.occurrenceNo, expected.totalCount)} />
              {expected.category && <span className="truncate text-xs text-muted-foreground">{expected.category}</span>}
            </span>
          </span>
          <DueCell amount={expected.total} due={due} today={today} muted />
        </button>
      </li>
    );
  }

  const bill = item.bill;
  return (
    <li>
      <Link
        href={`/expenses/bills/${bill.id}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
      >
        <SupplierMark name={bill.supplierName} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium">{bill.supplierName || "No supplier yet"}</span>
            {bill.schedule && <RepeatBadge schedule={bill.schedule} occurrenceNo={bill.occurrenceNo} />}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <BillStatusBadge bill={bill} className="px-1.5 py-0 text-[10px]" />
            {bill.category && <span className="truncate text-xs text-muted-foreground">{bill.category}</span>}
          </span>
        </span>
        <DueCell amount={bill.amountDue} due={due} today={today} partOf={bill.paymentStatus === "part_paid" ? bill.total : undefined} />
      </Link>
    </li>
  );
}

function DueCell({
  amount,
  due,
  today,
  muted,
  partOf,
}: {
  amount: number;
  due: string;
  today: string;
  muted?: boolean;
  /** The full total, when `amount` is only what's left of it. */
  partOf?: number;
}) {
  return (
    <span className="shrink-0 text-right">
      <span className={cn("block font-semibold tabular", muted && "text-muted-foreground")}>{invoiceMoney(amount)}</span>
      {partOf !== undefined && <span className="block text-[11px] text-muted-foreground">of {invoiceMoney(partOf)}</span>}
      {due ? (
        // Coloured like the list's Due column: red once overdue, amber within a week.
        <span
          className={cn(
            "block text-[11px] tabular",
            due < today ? "font-medium text-destructive" : daysBetween(today, due) <= 7 ? "font-medium text-warning" : "text-muted-foreground",
          )}
        >
          Due {formatInvoiceDate(due)}
        </span>
      ) : (
        <span className="block text-[11px] text-muted-foreground">No due date</span>
      )}
    </span>
  );
}
