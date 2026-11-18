"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BillStatusBadge, ExpectedBadge, SupplierMark } from "@/components/bills/bill-status";
import { useBillCalendarQuery } from "@/hooks/use-bills-query";
import { addDays, billBadge, occurrenceLabel, type Bill, type BillExpected } from "@/lib/bills";
import { invoiceMoney } from "@/lib/invoices";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type DayEntry = { kind: "bill"; bill: Bill } | { kind: "expected"; expected: BillExpected };

/** The day a bill sits on: its due date, or its bill date when it has none. */
const entryDate = (entry: DayEntry) =>
  entry.kind === "bill" ? entry.bill.dueDate || entry.bill.billDate : entry.expected.dueDate || entry.expected.billDate;

function monthBounds(month: string) {
  const [year, monthNo] = month.split("-").map(Number);
  const first = `${month}-01`;
  const last = new Date(Date.UTC(year, monthNo, 0)).toISOString().slice(0, 10);
  return { first, last };
}

function shiftMonth(month: string, by: number) {
  const [year, monthNo] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNo - 1 + by, 1));
  return date.toISOString().slice(0, 7);
}

function monthTitle(month: string) {
  const [year, monthNo] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNo - 1, 1)).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
}

function dayTitle(iso: string) {
  const [year, monthNo, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, monthNo - 1, day)).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/**
 * A month of bills by the day they fall due — paid ones too, so the month
 * reads complete — with repeat bills still to be made shown as expected.
 * Picking a day lists what's on it below the grid.
 */
export function BillsCalendar({ today, onManageRepeat }: { today: string; onManageRepeat: (scheduleId: string) => void }) {
  const [month, setMonthState] = React.useState(today.slice(0, 7));
  const [selectedDay, setSelectedDay] = React.useState<string | null>(today);
  // A new month starts with no day picked — the old pick belongs to the month left behind.
  const setMonth = (next: string) => {
    setMonthState(next);
    setSelectedDay(null);
  };
  const { first, last } = monthBounds(month);
  const query = useBillCalendarQuery(first, last);

  const byDay = React.useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    const entries: DayEntry[] = [
      ...(query.data?.bills ?? []).map((bill) => ({ kind: "bill" as const, bill })),
      ...(query.data?.expected ?? []).map((expected) => ({ kind: "expected" as const, expected })),
    ];
    for (const entry of entries) {
      const day = entryDate(entry);
      if (!day) continue;
      map.set(day, [...(map.get(day) ?? []), entry]);
    }
    return map;
  }, [query.data]);

  // Monday-first grid: pad back to the Monday on or before the 1st, forward to the Sunday on or after the last.
  const [year, monthNo] = month.split("-").map(Number);
  const firstWeekday = (new Date(Date.UTC(year, monthNo - 1, 1)).getUTCDay() + 6) % 7;
  const start = addDays(first, -firstWeekday);
  const lastWeekday = (new Date(Date.UTC(year, monthNo - 1, Number(last.slice(8)))).getUTCDay() + 6) % 7;
  const end = addDays(last, 6 - lastWeekday);
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);

  const selectedEntries = selectedDay ? byDay.get(selectedDay) ?? [] : [];

  return (
    <div className="space-y-4" data-usertour="bill-calendar">
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
            <ChevronLeft />
          </Button>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{monthTitle(month)}</h2>
            {query.isFetching && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Loading" />}
            {month !== today.slice(0, 7) && (
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => {
                  setMonth(today.slice(0, 7));
                  setSelectedDay(today);
                }}
              >
                Today
              </Button>
            )}
          </div>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
            <ChevronRight />
          </Button>
        </div>

        {query.isError ? (
          <div className="p-8 text-center">
            <p className="font-medium">Couldn&apos;t load this month</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <div role="grid" aria-label={`Bills in ${monthTitle(month)}`}>
            <div role="row" className="grid grid-cols-7 border-b border-border text-center text-[11px] font-medium text-muted-foreground">
              {WEEKDAYS.map((weekday) => (
                <div key={weekday} role="columnheader" className="py-1.5">
                  {weekday}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const entries = byDay.get(day) ?? [];
                const inMonth = day.slice(0, 7) === month;
                const overdue = entries.some((entry) => entry.kind === "bill" && entry.bill.isOverdue);
                const total = entries.reduce(
                  (sum, entry) => sum + (entry.kind === "bill" ? entry.bill.total : entry.expected.total),
                  0,
                );
                return (
                  <button
                    key={day}
                    type="button"
                    role="gridcell"
                    aria-selected={selectedDay === day}
                    aria-label={`${dayTitle(day)}${entries.length ? `, ${entries.length} ${entries.length === 1 ? "bill" : "bills"}, ${invoiceMoney(total)}` : ""}`}
                    onClick={() => setSelectedDay(day)}
                    className={cn(
                      "flex min-h-16 flex-col items-stretch gap-1 border-b border-r border-border p-1.5 text-left transition-colors hover:bg-muted/40 [&:nth-child(7n)]:border-r-0 focus-visible:bg-muted/40 focus-visible:outline-none sm:min-h-24",
                      !inMonth && "bg-muted/20 text-muted-foreground/60",
                      selectedDay === day && "bg-primary/[0.06] ring-1 ring-inset ring-primary/40",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-6 place-items-center rounded-full text-xs tabular",
                        day === today && "bg-primary font-semibold text-primary-foreground",
                      )}
                    >
                      {Number(day.slice(8))}
                    </span>
                    {entries.length > 0 && (
                      <>
                        {/* Phones get a dot and a total; wider screens name the bills. */}
                        <span className="flex items-center gap-1 sm:hidden">
                          <span className={cn("size-1.5 rounded-full", overdue ? "bg-destructive" : "bg-primary")} aria-hidden />
                          <span className="text-[10px] tabular">{entries.length}</span>
                        </span>
                        <span className="hidden space-y-0.5 sm:block">
                          {entries.slice(0, 2).map((entry) => (
                            <DayChip key={entry.kind === "bill" ? entry.bill.id : entry.expected.key} entry={entry} />
                          ))}
                          {entries.length > 2 && <span className="block text-[10px] text-muted-foreground">+{entries.length - 2} more</span>}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {selectedDay && (
        <section className="rounded-lg border border-border bg-card shadow-sm" aria-label={`Bills on ${dayTitle(selectedDay)}`}>
          <header className="border-b border-border px-4 py-2 text-sm font-semibold">{dayTitle(selectedDay)}</header>
          {selectedEntries.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No bills due on this day.</p>
          ) : (
            <ul className="divide-y divide-border">
              {selectedEntries.map((entry) =>
                entry.kind === "bill" ? (
                  <li key={entry.bill.id}>
                    <Link href={`/expenses/bills/${entry.bill.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                      <SupplierMark name={entry.bill.supplierName} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{entry.bill.supplierName || "No supplier yet"}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[entry.bill.billNo, entry.bill.category].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-semibold tabular">{invoiceMoney(entry.bill.total)}</span>
                        <BillStatusBadge bill={entry.bill} className="mt-0.5 px-1.5 py-0 text-[10px]" />
                      </span>
                    </Link>
                  </li>
                ) : (
                  <li key={entry.expected.key}>
                    <button
                      type="button"
                      onClick={() => onManageRepeat(entry.expected.scheduleId)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                    >
                      <SupplierMark name={entry.expected.supplierName} muted />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-muted-foreground">{entry.expected.supplierName || "No supplier"}</span>
                        <ExpectedBadge position={occurrenceLabel(entry.expected.occurrenceNo, entry.expected.totalCount)} />
                      </span>
                      <span className="shrink-0 font-semibold tabular text-muted-foreground">{invoiceMoney(entry.expected.total)}</span>
                    </button>
                  </li>
                ),
              )}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function DayChip({ entry }: { entry: DayEntry }) {
  if (entry.kind === "expected") {
    return (
      <span className="block truncate rounded border border-dashed border-border px-1 text-[10px] leading-4 text-muted-foreground">
        {entry.expected.supplierName || "Expected"} {invoiceMoney(entry.expected.total)}
      </span>
    );
  }
  const variant = billBadge(entry.bill).variant;
  return (
    <span
      className={cn(
        "block truncate rounded px-1 text-[10px] leading-4",
        variant === "success" && "bg-success/10 text-success",
        variant === "danger" && "bg-destructive/10 text-destructive",
        variant === "warning" && "bg-warning/10 text-warning",
        (variant === "secondary" || variant === "outline") && "bg-secondary text-secondary-foreground",
      )}
    >
      {entry.bill.supplierName || "Bill"} {invoiceMoney(entry.bill.total)}
    </span>
  );
}
