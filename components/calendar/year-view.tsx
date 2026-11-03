"use client";

import * as React from "react";
import { addDays, format, isSameDay, isSameMonth, isToday, parseISO } from "date-fns";

import { useCalendar } from "@/components/calendar/calendar-context";
import type { CalendarEvent } from "@/lib/calendar";
import { cn } from "@/lib/utils";

const MAX_DOTS = 3;

/** An event's own colour where it brings one; the brand dot otherwise. */
function eventDotStyle(event: CalendarEvent): React.CSSProperties | undefined {
  const color = event.border_color || event.color;
  return color && color.toUpperCase() !== "#1D4ED8" ? { backgroundColor: color } : undefined;
}

function YearMonth({ month, events }: { month: Date; events: CalendarEvent[] }) {
  const { setSelectedDate, setView } = useCalendar();
  const gridStart = addDays(month, -month.getDay());
  const weeks = Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)),
  );

  const openDay = (date: Date) => {
    setSelectedDate(date);
    setView("day");
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => {
          setSelectedDate(new Date(month.getFullYear(), month.getMonth(), 1));
          setView("month");
        }}
        className="w-full border-b border-border bg-primary/[0.04] px-3 py-2.5 text-center text-sm font-semibold transition-colors hover:bg-accent"
      >
        {format(month, "MMMM")}
      </button>
      <div className="p-3">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                <th key={index} className="py-0.5 text-center text-[10px] font-normal text-muted-foreground">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week[0].toISOString()}>
                {week.map((date) => {
                  const outside = !isSameMonth(date, month);
                  if (outside) {
                    return (
                      <td key={date.toISOString()} className="p-px text-center">
                        <span className="inline-flex h-9 w-full min-w-7 justify-center pt-0.5 text-[11px] text-muted-foreground opacity-40">
                          <span className="grid size-5 place-items-center">{date.getDate()}</span>
                        </span>
                      </td>
                    );
                  }
                  const dayEvents = events.filter(
                    (event) =>
                      isSameDay(parseISO(event.startDate), date) ||
                      isSameDay(parseISO(event.endDate), date),
                  );
                  const today = isToday(date);
                  return (
                    <td key={date.toISOString()} className="p-px text-center">
                      <button
                        type="button"
                        onClick={() => openDay(date)}
                        aria-label={`${format(date, "PPP")}${dayEvents.length ? `, ${dayEvents.length} events` : ""}`}
                        className="inline-flex h-9 w-full min-w-7 flex-col items-center justify-start gap-0.5 rounded-md pt-0.5 transition-colors hover:bg-accent"
                      >
                        <span
                          className={cn(
                            "grid size-5 place-items-center rounded-full text-[11px]",
                            today && "bg-primary font-semibold text-primary-foreground",
                          )}
                        >
                          {date.getDate()}
                        </span>
                        {dayEvents.length > 0 && (
                          // Up to three dots, one per event; past that, the old
                          // calendar's one dot and "+N" for the rest.
                          <span className="flex h-2 items-center gap-px">
                            {(dayEvents.length <= MAX_DOTS ? dayEvents : dayEvents.slice(0, 1)).map(
                              (event) => (
                                <span
                                  key={event.id}
                                  className="size-1 shrink-0 rounded-full bg-primary"
                                  style={eventDotStyle(event)}
                                />
                              ),
                            )}
                            {dayEvents.length > MAX_DOTS && (
                              <span className="text-[9px] font-medium leading-none tabular-nums text-muted-foreground">
                                +{dayEvents.length - 1}
                              </span>
                            )}
                          </span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function YearView({ events }: { events: CalendarEvent[] }) {
  const { selectedDate } = useCalendar();
  const months = React.useMemo(
    () => Array.from({ length: 12 }, (_, i) => new Date(selectedDate.getFullYear(), i, 1)),
    [selectedDate],
  );

  // Year view marks the day an event starts, not every day it covers.
  const startDates = React.useMemo(
    () => events.map((event) => ({ ...event, endDate: event.startDate })),
    [events],
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {months.map((month) => (
        <YearMonth key={month.toISOString()} month={month} events={startDates} />
      ))}
    </div>
  );
}
