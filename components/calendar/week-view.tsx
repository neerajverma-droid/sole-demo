"use client";

import { addDays, format, isToday, startOfWeek } from "date-fns";

import { useCalendar } from "@/components/calendar/calendar-context";
import { EventBadge } from "@/components/calendar/event-chip";
import { TimeGrid, TIME_GRID_GUTTER } from "@/components/calendar/time-grid";
import { weekMultiDayRows, type CalendarEvent, type SpanPosition } from "@/lib/calendar";
import { cn } from "@/lib/utils";

/** Events spanning several days, as bars across the top of the week. */
function WeekMultiDayRow({
  weekDays,
  multiDayEvents,
}: {
  weekDays: Date[];
  multiDayEvents: CalendarEvent[];
}) {
  const { selectedDate } = useCalendar();
  const rows = weekMultiDayRows(multiDayEvents, selectedDate);
  if (rows.length === 0) return null;

  return (
    <div className="flex border-b border-border">
      <div className="shrink-0" style={{ width: TIME_GRID_GUTTER }} />
      <div className="grid flex-1 grid-cols-7 divide-x divide-border border-l border-border">
        {weekDays.map((day, dayIndex) => (
          <div key={day.toISOString()} className="flex flex-col gap-1 py-1">
            {rows.map((row, rowIndex) => {
              const item = row.find((e) => e.startIndex <= dayIndex && e.endIndex >= dayIndex);
              if (!item) return <div key={rowIndex} className="h-6" />;
              let position: SpanPosition = "middle";
              if (dayIndex === item.startIndex && dayIndex === item.endIndex) position = "none";
              else if (dayIndex === item.startIndex) position = "first";
              else if (dayIndex === item.endIndex) position = "last";
              return (
                <EventBadge
                  key={`${item.event.id}-${dayIndex}`}
                  event={item.event}
                  position={position}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WeekView({
  singleDayEvents,
  multiDayEvents,
}: {
  singleDayEvents: CalendarEvent[];
  multiDayEvents: CalendarEvent[];
}) {
  const { selectedDate } = useCalendar();
  const weekStart = startOfWeek(selectedDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-col items-center justify-center gap-1 px-4 py-10 text-center text-sm text-muted-foreground sm:hidden">
        <p>Weekly view is not available on smaller devices.</p>
        <p>Please switch to daily or monthly view.</p>
      </div>

      <div className="hidden sm:block">
        <div className="flex border-b border-border bg-muted/40">
          <div className="shrink-0" style={{ width: TIME_GRID_GUTTER }} />
          <div className="grid flex-1 grid-cols-7 border-l border-border">
            {weekDays.map((day) => (
              <div
                key={day.toISOString()}
                className={cn(
                  "border-l border-border px-1 py-2 text-center text-xs font-semibold first:border-l-0",
                  isToday(day) && "text-primary",
                )}
              >
                {format(day, "EEE")}{" "}
                <span
                  className={cn(
                    "text-[11px] font-medium",
                    isToday(day) ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>
            ))}
          </div>
        </div>
        <WeekMultiDayRow weekDays={weekDays} multiDayEvents={multiDayEvents} />
        <TimeGrid days={weekDays} singleDayEvents={singleDayEvents} />
      </div>
    </div>
  );
}
