"use client";

import * as React from "react";
import { format, isSameDay, isToday, parseISO, startOfDay } from "date-fns";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCalendar, useDropTarget } from "@/components/calendar/calendar-context";
import { EventBadge } from "@/components/calendar/event-chip";
import {
  MONTH_SLOTS,
  calculateMonthEventPositions,
  eventCoversDay,
  getCalendarCells,
  getMonthCellEvents,
  spanPosition,
  type CalendarEvent,
  type MonthCell,
} from "@/lib/calendar";
import { cn } from "@/lib/utils";

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function DayCell({
  cell,
  events,
  eventPositions,
}: {
  cell: MonthCell;
  events: CalendarEvent[];
  eventPositions: Record<string, number>;
}) {
  const { setSelectedDate, onAddTask } = useCalendar();
  const { day, currentMonth, date } = cell;
  const cellStart = startOfDay(date);
  const drop = useDropTarget({ date });
  const [moreOpen, setMoreOpen] = React.useState(false);

  const cellEvents = React.useMemo(
    () => getMonthCellEvents(date, events, eventPositions),
    [date, events, eventPositions],
  );

  const addTask = () => {
    setSelectedDate(date);
    onAddTask(date);
  };

  // A span hidden past the third slot only counts on the day it starts, so
  // "2 more" doesn't repeat on every day the same event covers.
  const hiddenCount = cellEvents.slice(MONTH_SLOTS).filter((event) => {
    const multiDay = !isSameDay(parseISO(event.startDate), parseISO(event.endDate));
    return !multiDay || isSameDay(startOfDay(parseISO(event.startDate)), cellStart);
  }).length;

  return (
    <div
      onDragOver={drop.onDragOver}
      onDragLeave={drop.onDragLeave}
      onDrop={drop.onDrop}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-month-event],[data-month-more],[data-month-action]")) return;
        addTask();
      }}
      className={cn(
        "group flex min-h-[112px] min-w-0 cursor-pointer flex-col border-l border-t border-border py-1.5 transition-colors [&:nth-child(7n+1)]:border-l-0",
        !currentMonth && "bg-muted/30",
        drop.isOver && "bg-primary/10",
      )}
    >
      <div className="flex items-center justify-between px-1.5">
        <span
          className={cn(
            "inline-grid h-6 min-w-6 place-items-center rounded-full px-1 text-[13px] font-medium",
            !currentMonth && "text-muted-foreground opacity-50",
            isToday(date) && "bg-primary text-primary-foreground opacity-100",
          )}
        >
          {day}
        </span>
        <button
          type="button"
          data-month-action
          aria-label={`Add task on ${format(date, "PPP")}`}
          onClick={addTask}
          className="grid size-6 place-items-center rounded-full text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <div className={cn("mt-1 flex flex-1 flex-col gap-1", !currentMonth && "opacity-60")}>
        {Array.from({ length: MONTH_SLOTS }, (_, slot) => {
          const event = cellEvents.find((candidate) => candidate.position === slot);
          const position = event ? spanPosition(event, cellStart) : "none";
          return (
            // A multi-day bar runs to the cell's edges so it joins the next
            // day's; a single-day chip keeps the cell's inset.
            <div
              key={event ? `${event.id}-${slot}` : `empty-${slot}`}
              className={cn("h-6", position === "none" ? "px-1.5" : "px-0")}
            >
              {event && eventCoversDay(event, cellStart) && (
                <EventBadge event={event} position={position} />
              )}
            </div>
          );
        })}
      </div>

      {hiddenCount > 0 && (
        <Popover open={moreOpen} onOpenChange={setMoreOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-month-more
              className="mx-1.5 self-start text-left text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              <span className="sm:hidden">+{hiddenCount}</span>
              <span className="hidden sm:inline">+{hiddenCount} more</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[260px] p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {format(date, "EEE")}
                </p>
                <p className="text-xl font-semibold">{format(date, "d")}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Close"
                onClick={() => setMoreOpen(false)}
              >
                <X />
              </Button>
            </div>
            <div className="flex max-h-60 flex-col gap-1.5 overflow-y-auto pr-1">
              {cellEvents.map((event, index) => (
                <EventBadge
                  key={`${event.id}-${index}`}
                  event={event}
                  disableDrag
                  className="h-8"
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

export function MonthView({
  singleDayEvents,
  multiDayEvents,
}: {
  singleDayEvents: CalendarEvent[];
  multiDayEvents: CalendarEvent[];
}) {
  const { selectedDate } = useCalendar();
  const allEvents = React.useMemo(
    () => [...multiDayEvents, ...singleDayEvents],
    [multiDayEvents, singleDayEvents],
  );
  const cells = React.useMemo(() => getCalendarCells(selectedDate), [selectedDate]);
  const eventPositions = React.useMemo(
    () => calculateMonthEventPositions(multiDayEvents, singleDayEvents, selectedDate),
    [multiDayEvents, singleDayEvents, selectedDate],
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="grid grid-cols-7">
        {WEEK_DAYS.map((day) => (
          <div key={day} className="p-2 text-left text-xs font-semibold text-muted-foreground">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell) => (
          <DayCell
            key={cell.date.toISOString()}
            cell={cell}
            events={allEvents}
            eventPositions={eventPositions}
          />
        ))}
      </div>
    </div>
  );
}
