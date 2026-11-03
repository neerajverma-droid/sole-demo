"use client";

import * as React from "react";
import {
  addDays,
  differenceInDays,
  endOfDay,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCalendar } from "@/components/calendar/calendar-context";
import { EventBadge, EventSourceMark } from "@/components/calendar/event-chip";
import { TimeGrid, TIME_GRID_GUTTER } from "@/components/calendar/time-grid";
import {
  eventTitleText,
  getCurrentEvents,
  type CalendarEvent,
} from "@/lib/calendar";
import { cn } from "@/lib/utils";

/** Multi-day events that cover the selected day, longest first. */
function DayMultiDayRow({ multiDayEvents }: { multiDayEvents: CalendarEvent[] }) {
  const { selectedDate } = useCalendar();
  const dayStart = startOfDay(selectedDate);
  const dayEnd = endOfDay(selectedDate);

  const covering = multiDayEvents
    .filter((event) => {
      const start = parseISO(event.startDate);
      const end = parseISO(event.endDate);
      return start <= dayEnd && end >= dayStart;
    })
    .sort(
      (a, b) =>
        differenceInDays(parseISO(b.endDate), parseISO(b.startDate)) -
        differenceInDays(parseISO(a.endDate), parseISO(a.startDate)),
    );

  if (covering.length === 0) return null;

  return (
    <div className="flex border-b border-border">
      <div className="shrink-0" style={{ width: TIME_GRID_GUTTER }} />
      <div className="flex flex-1 flex-col gap-1 border-l border-border p-1">
        {covering.map((event) => {
          const start = startOfDay(parseISO(event.startDate));
          const total = differenceInDays(startOfDay(parseISO(event.endDate)), start) + 1;
          const current = differenceInDays(dayStart, start) + 1;
          return (
            <EventBadge key={event.id} event={event} prefix={`Day ${current} of ${total}`} />
          );
        })}
      </div>
    </div>
  );
}

/** The design's month picker beside the day, with a dot under days that have events. */
function MiniCalendar({ events }: { events: CalendarEvent[] }) {
  const { selectedDate, setSelectedDate } = useCalendar();
  const first = startOfMonth(selectedDate);
  const gridStart = addDays(first, -first.getDay());
  const weeks = Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)),
  );
  const hasEvents = (day: Date) =>
    events.some((event) => isSameDay(parseISO(event.startDate), day));

  const shiftMonth = (by: number) =>
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + by, 1));

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between px-1 pb-2">
        <Button variant="ghost" size="icon" className="size-7" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
          <ChevronLeft />
        </Button>
        <span className="text-sm font-medium">{format(selectedDate, "MMMM yyyy")}</span>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Next month" onClick={() => shiftMonth(1)}>
          <ChevronRight />
        </Button>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <th key={day} className="py-1 text-center text-xs font-normal text-muted-foreground">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0].toISOString()}>
              {week.map((day) => {
                const outside = !isSameMonth(day, selectedDate);
                const selected = isSameDay(day, selectedDate);
                return (
                  <td key={day.toISOString()} className="p-px text-center">
                    <button
                      type="button"
                      onClick={() => setSelectedDate(day)}
                      className={cn(
                        "h-8 w-8 rounded-md text-[13px] transition-colors hover:bg-accent",
                        outside && "text-muted-foreground opacity-50",
                        !selected && isToday(day) && "bg-accent",
                        selected && "bg-primary text-primary-foreground hover:bg-primary",
                      )}
                    >
                      {day.getDate()}
                      {hasEvents(day) && !outside && (
                        <span
                          className={cn(
                            "mx-auto mt-0.5 block size-1 rounded-full",
                            selected ? "bg-primary-foreground" : "bg-primary",
                          )}
                        />
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
  );
}

/** What's on now, or failing that what's next — the old day view's side panel. */
function DayAgenda({ dayEvents }: { dayEvents: CalendarEvent[] }) {
  const { users, onOpenEvent } = useCalendar();
  const currentEvents = getCurrentEvents(dayEvents);
  const now = new Date();
  const upcomingEvents = dayEvents
    .filter((event) => new Date(event.startDate) > now)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  const eventsToShow = currentEvents.length > 0 ? currentEvents : upcomingEvents;

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      {currentEvents.length > 0 ? (
        <div className="mb-3 flex items-center gap-2">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-success" />
          </span>
          <h3 className="text-sm font-semibold">Happening now</h3>
        </div>
      ) : upcomingEvents.length > 0 ? (
        <div className="mb-3 flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-primary" />
          <h3 className="text-sm font-semibold">Upcoming</h3>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 px-2 py-6 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <CalendarDays className="size-5" />
          </span>
          <div>
            <p className="font-semibold">Nothing coming up</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No events for the rest of this day. Click a time to add one.
            </p>
          </div>
        </div>
      )}

      {eventsToShow.length > 0 && (
        <ul className="flex max-h-[360px] flex-col gap-4 overflow-y-auto">
          {eventsToShow.map((event) => {
            const user = users.find((candidate) => candidate.id === event.user.id);
            return (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => onOpenEvent(event)}
                  className="w-full space-y-1 rounded-md text-left transition-colors hover:bg-accent/50"
                >
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <EventSourceMark event={event} />
                    <span className="line-clamp-2">{eventTitleText(event)}</span>
                  </p>
                  {user && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <User className="size-3.5" />
                      {user.name}
                    </p>
                  )}
                  <p className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                    <Clock className="size-3.5" />
                    {format(parseISO(event.startDate), "h:mm a")} –{" "}
                    {format(parseISO(event.endDate), "h:mm a")}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function DayView({
  singleDayEvents,
  multiDayEvents,
}: {
  singleDayEvents: CalendarEvent[];
  multiDayEvents: CalendarEvent[];
}) {
  const { selectedDate } = useCalendar();
  const dayEvents = singleDayEvents.filter((event) =>
    isSameDay(parseISO(event.startDate), selectedDate),
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-muted/40 px-4 py-2.5 text-center text-sm font-semibold">
          {format(selectedDate, "EEE d")}
        </div>
        <DayMultiDayRow multiDayEvents={multiDayEvents} />
        <TimeGrid days={[selectedDate]} singleDayEvents={singleDayEvents} />
      </div>
      <aside className="flex flex-col gap-6">
        <MiniCalendar events={[...singleDayEvents, ...multiDayEvents]} />
        <DayAgenda dayEvents={dayEvents} />
      </aside>
    </div>
  );
}
