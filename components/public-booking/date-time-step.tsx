"use client";

import * as React from "react";
import { format, isSameDay, isToday, parseISO } from "date-fns";
import { CalendarSearch, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemedButton, type HostTheme } from "@/components/public-booking/booking-shell";
import { monthCells } from "@/lib/booking-links";
import {
  canGoToNextMonth,
  canGoToPreviousMonth,
  isBookableDay,
  type PublicBookingLink,
  type PublicSlot,
} from "@/lib/public-booking";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function MonthCalendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  availability,
  theme,
}: {
  month: Date;
  onMonthChange: (month: Date) => void;
  selected: Date | null;
  onSelect: (day: Date) => void;
  availability: PublicBookingLink["availability"];
  theme: HostTheme;
}) {
  const cells = React.useMemo(() => monthCells(month), [month]);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">{format(month, "MMMM yyyy")}</p>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Previous month"
            disabled={!canGoToPreviousMonth(month)}
            onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Next month"
            disabled={!canGoToNextMonth(month)}
            onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((day) => (
          <span key={day} className="pb-1 text-[11px] font-medium uppercase text-muted-foreground">
            {day}
          </span>
        ))}
        {cells.map(({ date, currentMonth }) => {
          if (!currentMonth) return <span key={date.toISOString()} aria-hidden />;
          const bookable = isBookableDay(date, availability);
          const chosen = selected !== null && isSameDay(date, selected);
          return (
            <button
              key={date.toISOString()}
              type="button"
              disabled={!bookable}
              aria-pressed={chosen}
              aria-label={format(date, "EEEE, MMMM d")}
              onClick={() => onSelect(date)}
              className={cn(
                "relative mx-auto grid aspect-square w-full max-w-10 place-items-center rounded-full text-sm tabular-nums transition-colors",
                bookable
                  ? "font-semibold hover:opacity-80"
                  : "cursor-not-allowed text-muted-foreground/50",
              )}
              style={
                chosen
                  ? { backgroundColor: theme.color, color: theme.text }
                  : bookable
                    ? { backgroundColor: `${theme.color}14`, color: theme.color }
                    : undefined
              }
            >
              {date.getDate()}
              {isToday(date) && !chosen && (
                <span
                  className="absolute bottom-1 size-1 rounded-full"
                  style={{ backgroundColor: bookable ? theme.color : "currentColor" }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SlotList({
  day,
  slots,
  loading,
  error,
  selected,
  onSelect,
  onContinue,
  theme,
}: {
  day: Date | null;
  slots: PublicSlot[];
  loading: boolean;
  error: string | null;
  selected: PublicSlot | null;
  onSelect: (slot: PublicSlot) => void;
  onContinue: () => void;
  theme: HostTheme;
}) {
  if (!day) {
    return (
      <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        <CalendarSearch className="size-5" />
        Pick a day to see the open times.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      <p className="mb-3 text-sm font-semibold">{format(day, "EEEE, MMMM d")}</p>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : slots.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          No open times on this day — try another date.
        </p>
      ) : (
        <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto pr-1">
          {slots.map((slot) => {
            const chosen = selected?.start_utc === slot.start_utc;
            const label = format(parseISO(slot.start_utc), "h:mm a");
            return chosen ? (
              <div key={slot.start_utc} className="grid grid-cols-2 gap-2">
                <span className="grid h-10 place-items-center rounded-md bg-muted text-sm font-semibold tabular-nums">
                  {label}
                </span>
                <ThemedButton theme={theme} className="h-10" onClick={onContinue}>
                  Next
                </ThemedButton>
              </div>
            ) : (
              <button
                key={slot.start_utc}
                type="button"
                onClick={() => onSelect(slot)}
                className="h-10 rounded-md border text-sm font-semibold tabular-nums transition-colors hover:bg-accent/60"
                style={{ borderColor: `${theme.color}55`, color: theme.color }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Step one: a day on the left, its open times on the right, then Next. */
export function DateTimeStep(props: {
  link: PublicBookingLink;
  theme: HostTheme;
  month: Date;
  onMonthChange: (month: Date) => void;
  day: Date | null;
  onDayChange: (day: Date) => void;
  slots: PublicSlot[];
  slotsLoading: boolean;
  slotsError: string | null;
  slot: PublicSlot | null;
  onSlotChange: (slot: PublicSlot) => void;
  onContinue: () => void;
  rescheduling: boolean;
}) {
  return (
    <div>
      {props.rescheduling && (
        <p
          className="mb-4 inline-flex rounded-full px-3 py-1 text-xs font-medium"
          style={{ backgroundColor: `${props.theme.color}14`, color: props.theme.color }}
        >
          Rescheduling your existing booking
        </p>
      )}
      <h2 className="text-lg font-semibold">Select a date &amp; time</h2>
      <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,1fr)_200px]">
        <MonthCalendar
          month={props.month}
          onMonthChange={props.onMonthChange}
          selected={props.day}
          onSelect={props.onDayChange}
          availability={props.link.availability}
          theme={props.theme}
        />
        <SlotList
          day={props.day}
          slots={props.slots}
          loading={props.slotsLoading}
          error={props.slotsError}
          selected={props.slot}
          onSelect={props.onSlotChange}
          onContinue={props.onContinue}
          theme={props.theme}
        />
      </div>
    </div>
  );
}
