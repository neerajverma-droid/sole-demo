"use client";

import * as React from "react";
import { format, isSameDay, isToday, parseISO } from "date-fns";

import { useCalendar } from "@/components/calendar/calendar-context";
import { EventBlock } from "@/components/calendar/event-chip";
import {
  HOUR_HEIGHT,
  QUARTER_MINUTES,
  VISIBLE_HOURS,
  getMaxOverlappingEvents,
  getPositionedEvents,
  getVisibleHours,
  slotDateTime,
  type CalendarEvent,
} from "@/lib/calendar";
import { cn } from "@/lib/utils";

/** Width of the hour labels down the left. */
const GUTTER = 64;
/** A day column with overlaps never squeezes an event narrower than this. */
const MIN_EVENT_COLUMN_WIDTH = 180;

function hourLabel(hour: number) {
  return format(new Date().setHours(hour, 0, 0, 0), "hh a");
}

/** A quarter of an hour: click to add a task starting there. */
function QuarterSlot({ day, hour, minute }: { day: Date; hour: number; minute: number }) {
  const { onAddTask } = useCalendar();
  return (
    <div
      onClick={() => onAddTask(slotDateTime(day, hour, minute))}
      aria-hidden
      className="absolute inset-x-0 cursor-pointer transition-colors hover:bg-accent/60"
      style={{ top: (minute / 60) * HOUR_HEIGHT, height: HOUR_HEIGHT / 4 }}
    />
  );
}

function DayColumn({
  day,
  hours,
  events,
  range,
  compact,
}: {
  day: Date;
  hours: number[];
  events: CalendarEvent[];
  range: { from: number; to: number };
  compact: boolean;
}) {
  const positioned = getPositionedEvents(events, day, range);
  const { dragging, onMoveEvent } = useCalendar();
  const [overQuarter, setOverQuarter] = React.useState<number | null>(null);

  /**
   * The whole column is the drop target, the slot read off the pointer's
   * height. Drops then land wherever they're let go — over another event, or
   * over the dragged one's own block — not only on an empty quarter.
   */
  const quarterAt = (e: React.DragEvent<HTMLDivElement>) => {
    const offset = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const last = hours.length * 4 - 1;
    return Math.min(last, Math.max(0, Math.floor(offset / (HOUR_HEIGHT / 4))));
  };

  return (
    <div
      className="relative"
      onDragOver={(e) => {
        if (!dragging.current) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const quarter = quarterAt(e);
        if (quarter !== overQuarter) setOverQuarter(quarter);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverQuarter(null);
      }}
      onDrop={(e) => {
        const event = dragging.current;
        if (!event) return;
        e.preventDefault();
        const quarter = quarterAt(e);
        setOverQuarter(null);
        dragging.current = null;
        onMoveEvent(event, {
          date: day,
          hour: hours[0] + Math.floor(quarter / 4),
          minute: (quarter % 4) * 15,
        });
      }}
    >
      {overQuarter !== null && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-0 bg-primary/10"
          style={{ top: overQuarter * (HOUR_HEIGHT / 4), height: HOUR_HEIGHT / 4 }}
        />
      )}
      {hours.map((hour, index) => (
        <div key={hour} className="relative" style={{ height: HOUR_HEIGHT }}>
          {index !== 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border" />
          )}
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dotted border-border/60" />
          {QUARTER_MINUTES.map((minute) => (
            <QuarterSlot key={minute} day={day} hour={hour} minute={minute} />
          ))}
        </div>
      ))}
      {positioned.map(({ event, style }) => (
        <div key={event.id} className="absolute p-0.5" style={style}>
          <EventBlock event={event} compactWeek={compact} />
        </div>
      ))}
    </div>
  );
}

/** The red-line-equivalent: where now is, in brand indigo, refreshed every minute. */
function NowLine({ from, to }: { from: number; to: number }) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (now.getHours() < from || now.getHours() >= to) return null;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const top = ((minutes - from * 60) / ((to - from) * 60)) * 100;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-30 flex items-center"
      style={{ top: `${top}%` }}
    >
      <span
        className="shrink-0 -translate-y-px bg-card pr-2 text-right text-[11px] font-medium tabular-nums text-primary"
        style={{ width: GUTTER }}
      >
        {format(now, "h:mm a")}
      </span>
      <span className="size-2 shrink-0 -translate-x-1 rounded-full bg-primary" />
      <span className="h-px flex-1 bg-primary" />
    </div>
  );
}

/**
 * The scrolling hour grid shared by the day and week views. Columns are the
 * days given; `showNow` only draws the now line when one of them is today.
 */
export function TimeGrid({
  days,
  singleDayEvents,
  className,
}: {
  days: Date[];
  singleDayEvents: CalendarEvent[];
  className?: string;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { hours, earliestEventHour, latestEventHour } = getVisibleHours(
    VISIBLE_HOURS,
    singleDayEvents,
  );
  const range = { from: earliestEventHour, to: latestEventHour };
  const isWeek = days.length > 1;
  const showsToday = days.some((day) => isToday(day));

  const eventsByDay = days.map((day) =>
    singleDayEvents.filter(
      (event) =>
        isSameDay(parseISO(event.startDate), day) ||
        (isWeek && isSameDay(parseISO(event.endDate), day)),
    ),
  );

  // A single day with overlapping events scrolls sideways rather than
  // squeezing them; a week keeps its seven equal columns.
  const minGridWidth = isWeek
    ? undefined
    : getMaxOverlappingEvents(eventsByDay[0] ?? [], days[0]) * MIN_EVENT_COLUMN_WIDTH;

  const dayKey = days.map((day) => day.toDateString()).join("|");
  React.useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport || !showsToday) return;
    const now = new Date();
    const minutesFromStart = (now.getHours() - earliestEventHour) * 60 + now.getMinutes();
    const topOffset = Math.max(0, (minutesFromStart / 60) * HOUR_HEIGHT);
    viewport.scrollTo({ top: Math.max(0, topOffset - viewport.clientHeight / 2), behavior: "smooth" });
  }, [dayKey, earliestEventHour, showsToday]);

  return (
    <div ref={scrollRef} className={cn("relative max-h-[620px] overflow-y-auto", className)}>
      <div className="relative flex">
        <div className="sticky left-0 z-20 shrink-0 bg-card" style={{ width: GUTTER }}>
          {hours.map((hour, index) => (
            <div key={hour} className="relative" style={{ height: HOUR_HEIGHT }}>
              {index !== 0 && (
                <span className="absolute -top-2 right-3 text-xs tabular-nums text-muted-foreground">
                  {hourLabel(hour)}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto border-l border-border">
          <div
            className={cn("relative min-w-full", isWeek && "grid grid-cols-7 divide-x divide-border")}
            style={minGridWidth ? { minWidth: minGridWidth } : undefined}
          >
            {days.map((day, index) => (
              <DayColumn
                key={day.toISOString()}
                day={day}
                hours={hours}
                events={eventsByDay[index]}
                range={range}
                compact={isWeek}
              />
            ))}
          </div>
        </div>

        {showsToday && <NowLine from={earliestEventHour} to={latestEventHour} />}
      </div>
    </div>
  );
}

export { GUTTER as TIME_GRID_GUTTER };
