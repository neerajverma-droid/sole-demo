"use client";

import * as React from "react";
import {
  addMonths,
  format,
  isToday,
  parseISO,
  startOfDay,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CalendarSkeleton } from "@/components/calendar/calendar-skeleton";
import {
  bookingStatus,
  bookingsOnDay,
  monthCells,
  type BookingEvent,
} from "@/lib/booking-links";
import { cn } from "@/lib/utils";

const WEEK_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const VISIBLE_PER_DAY = 3;
const DRAG_TYPE = "application/x-sole-booking";

/** The design's date pill, month title and booking count, with month arrows. */
export function BookingMonthHeader({
  month,
  onMonthChange,
  count,
}: {
  month: Date;
  onMonthChange: (month: Date) => void;
  count: number | null;
}) {
  const today = new Date();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => onMonthChange(today)}
        aria-label="Go to this month"
        className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-card text-center shadow-sm transition-colors hover:bg-accent"
      >
        <span className="-mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
          {format(today, "MMM")}
        </span>
        <span className="text-lg font-semibold leading-none">
          {today.getDate()}
        </span>
      </button>
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="text-lg font-semibold">{format(month, "MMMM yyyy")}</h2>
        {count === null ? (
          <Skeleton className="h-5 w-20" />
        ) : (
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium tabular-nums text-primary">
            {count} {count === 1 ? "booking" : "bookings"}
          </span>
        )}
      </div>
      <div className="ml-auto flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Previous month"
          onClick={() => onMonthChange(subMonths(month, 1))}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Next month"
          onClick={() => onMonthChange(addMonths(month, 1))}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

function BookingChip({
  booking,
  onOpen,
  draggable,
  className,
}: {
  booking: BookingEvent;
  onOpen: (booking: BookingEvent) => void;
  draggable: boolean;
  className?: string;
}) {
  const past = bookingStatus(booking) === "past";
  const start = parseISO(booking.start);
  const end = booking.end ? parseISO(booking.end) : null;
  // The calendar's own tooltip, not the browser's slow `title` hint.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-booking-chip
          draggable={draggable}
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, booking.key);
            e.dataTransfer.effectAllowed = "move";
          }}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(booking);
          }}
          className={cn(
            "flex h-6 w-full min-w-0 items-center gap-1.5 rounded-md border px-1.5 text-left text-[11px] font-medium transition-colors",
            booking.pending
              ? "border-warning/30 bg-warning/10 text-warning hover:bg-warning/15"
              : "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15",
            past && "opacity-60",
            draggable && "cursor-grab active:cursor-grabbing",
            className,
          )}
        >
          <span className="hidden shrink-0 tabular-nums sm:inline">
            {format(parseISO(booking.start), "h:mma").toLowerCase()}
          </span>
          <span className="truncate">{booking.guestName}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 space-y-0.5">
        <p className="font-semibold">
          {booking.title || booking.linkTitle || "Booking"}
        </p>
        <p className="tabular-nums opacity-90">
          {format(start, "EEE d MMM, h:mm a")}
          {end && !Number.isNaN(end.getTime())
            ? ` – ${format(end, "h:mm a")}`
            : ""}
        </p>
        {booking.guestName && (
          <p className="opacity-90">
            {booking.guestName}
            {booking.guestEmail ? ` · ${booking.guestEmail}` : ""}
          </p>
        )}
        {booking.pending && <p className="font-medium">Pending</p>}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The bookings calendar — one month, bookings only. Its own grid rather than
 * the Calendar screen's: nothing here is a task, a day click doesn't add
 * anything, and a booking dragged to another day keeps its time.
 */
export function BookingCalendar({
  month,
  bookings,
  loading,
  onOpen,
  onMove,
}: {
  month: Date;
  bookings: BookingEvent[];
  loading: boolean;
  onOpen: (booking: BookingEvent) => void;
  onMove: (booking: BookingEvent, day: Date) => void;
}) {
  const cells = React.useMemo(() => monthCells(month), [month]);
  const today = startOfDay(new Date());
  const [overDay, setOverDay] = React.useState<string | null>(null);
  const [moreDay, setMoreDay] = React.useState<string | null>(null);

  const canDrag = (booking: BookingEvent) =>
    Boolean(booking.bookingId) && bookingStatus(booking) === "upcoming";

  // The Calendar screen's own month skeleton, so both calendars load alike.
  if (loading) return <CalendarSkeleton view="month" />;

  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      data-usertour="scheduling-booking-calendar"
    >
      <div className="grid grid-cols-7 border-b border-border">
        {WEEK_DAY_LABELS.map((day) => (
          <div
            key={day}
            className="p-2 text-left text-xs font-semibold text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map(({ date, currentMonth }) => {
          const key = date.toISOString();
          const dayBookings = bookingsOnDay(bookings, date);
          const hidden = dayBookings.length - VISIBLE_PER_DAY;
          const droppable = date >= today;
          return (
            <div
              key={key}
              onDragOver={(e) => {
                if (!droppable || !e.dataTransfer.types.includes(DRAG_TYPE))
                  return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overDay !== key) setOverDay(key);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                  setOverDay(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOverDay(null);
                const dragged = bookings.find(
                  (item) => item.key === e.dataTransfer.getData(DRAG_TYPE),
                );
                if (dragged && droppable) onMove(dragged, date);
              }}
              className={cn(
                "flex min-h-[104px] min-w-0 flex-col gap-1 overflow-hidden border-l border-t border-border p-1.5 [&:nth-child(-n+7)]:border-t-0 [&:nth-child(7n+1)]:border-l-0",
                !currentMonth && "bg-muted/30",
                overDay === key && "bg-primary/10",
              )}
            >
              <span
                className={cn(
                  "inline-grid h-6 min-w-6 place-items-center self-start rounded-full px-1 text-[13px] font-medium",
                  !currentMonth && "text-muted-foreground opacity-50",
                  isToday(date) &&
                    "bg-primary text-primary-foreground opacity-100",
                )}
              >
                {date.getDate()}
              </span>

              <div
                className={cn(
                  "flex min-w-0 flex-col gap-1",
                  !currentMonth && "opacity-60",
                )}
              >
                {dayBookings.slice(0, VISIBLE_PER_DAY).map((booking) => (
                  <BookingChip
                    key={booking.key}
                    booking={booking}
                    onOpen={onOpen}
                    draggable={canDrag(booking)}
                  />
                ))}
                {hidden > 0 && (
                  <Popover
                    open={moreDay === key}
                    onOpenChange={(open) => setMoreDay(open ? key : null)}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="self-start px-0.5 text-left text-[11px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        +{hidden} more
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[260px] p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {format(date, "EEE")}
                      </p>
                      <p className="mb-2 text-xl font-semibold">
                        {format(date, "d")}
                      </p>
                      <div className="flex max-h-60 flex-col gap-1.5 overflow-y-auto pr-1">
                        {dayBookings.map((booking) => (
                          <BookingChip
                            key={booking.key}
                            booking={booking}
                            draggable={false}
                            className="h-8"
                            onOpen={(item) => {
                              setMoreDay(null);
                              onOpen(item);
                            }}
                          />
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
