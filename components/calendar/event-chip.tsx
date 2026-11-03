"use client";

import * as React from "react";
import { differenceInMinutes, format, parseISO } from "date-fns";
import { BadgeDollarSign, RefreshCw } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCalendar, useDraggableEvent } from "@/components/calendar/calendar-context";
import {
  HOUR_HEIGHT,
  eventTitleText,
  isGoogleEvent,
  isRecurringEvent,
  type CalendarEvent,
  type SpanPosition,
} from "@/lib/calendar";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Source marks
 * ------------------------------------------------------------------ */

export function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={cn("size-4", className)}>
      <path
        fill="#fbc02d"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917"
      />
      <path
        fill="#e53935"
        d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691"
      />
      <path
        fill="#4caf50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44"
      />
      <path
        fill="#1565c0"
        d="M43.611 20.083 43.595 20 42 20H24v8h11.303a11.95 11.95 0 0 1-4.084 5.569l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917"
      />
    </svg>
  );
}

export function SoleMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a 16px inline mark
    <img
      src="/sole-logo.svg"
      alt=""
      aria-hidden="true"
      className={cn("size-4 shrink-0 object-contain", className)}
    />
  );
}

/** Google for a synced event, Sole for one that only lives here. */
export function EventSourceMark({ event, className }: { event: CalendarEvent; className?: string }) {
  return isGoogleEvent(event) ? (
    <GoogleMark className={cn("shrink-0", className)} />
  ) : (
    <SoleMark className={className} />
  );
}

/** The billable and recurring marks that sit before a title. */
function EventFlags({ event, size = "size-3.5" }: { event: CalendarEvent; size?: string }) {
  return (
    <>
      {event.is_billable ? (
        <span className="shrink-0" title="Billable">
          <BadgeDollarSign className={size} aria-hidden="true" />
          <span className="sr-only">Billable</span>
        </span>
      ) : null}
      {isRecurringEvent(event) ? (
        <span
          className="shrink-0"
          title={event.is_recurring_parent ? "Recurring series" : "Occurrence"}
        >
          <RefreshCw className="size-3" aria-hidden="true" />
          <span className="sr-only">Recurring</span>
        </span>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Tone
 * ------------------------------------------------------------------ */

/** The colour normalizeEvent falls back to when a row brings none of its own. */
const DEFAULT_ACCENT = "#1D4ED8";

/**
 * Events that bring their own colour (a synced Google calendar, a stage
 * colour) keep it as the accent; the rest take the brand tint the design
 * uses. Text stays on the theme's foreground either way, so a dark navy
 * accent never ends up as text on a dark card.
 */
export function eventTone(event: CalendarEvent): {
  className: string;
  style: React.CSSProperties;
} {
  const accent = event.border_color;
  if (!accent || accent.toUpperCase() === DEFAULT_ACCENT) {
    return {
      className: "border-primary bg-primary/10 text-primary hover:bg-primary/15",
      style: {},
    };
  }
  return {
    className: "text-foreground hover:brightness-95 dark:hover:brightness-110",
    style: {
      borderColor: accent,
      backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`,
    },
  };
}

function TitleTooltip({ title, children }: { title: string; children: React.ReactElement }) {
  if (!title) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}

function activateOnKey(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    e.currentTarget.click();
  }
}

/* ------------------------------------------------------------------ *
 * Time-grid block (day and week views)
 * ------------------------------------------------------------------ */

export function EventBlock({ event, compactWeek = false }: { event: CalendarEvent; compactWeek?: boolean }) {
  const { onOpenEvent } = useCalendar();
  const drag = useDraggableEvent(event);
  const start = parseISO(event.startDate);
  const end = parseISO(event.endDate);
  const durationInMinutes = differenceInMinutes(end, start);
  const heightInPixels = Math.max((durationInMinutes / 60) * HOUR_HEIGHT - 8, 28);
  const isCompact = durationInMinutes < 25;
  const title = eventTitleText(event);
  const tone = eventTone(event);

  return (
    <TitleTooltip title={title}>
      <div
        role="button"
        tabIndex={0}
        draggable={drag.draggable}
        onDragStart={drag.onDragStart}
        onDragEnd={drag.onDragEnd}
        onClick={(e) => {
          e.stopPropagation();
          onOpenEvent(event);
        }}
        onKeyDown={activateOnKey}
        className={cn(
          "flex cursor-pointer select-none flex-col gap-0.5 overflow-hidden rounded-md border-l-2 px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          isCompact && "justify-center py-0.5",
          tone.className,
          drag.isDragging && "opacity-40",
        )}
        style={{ height: `${heightInPixels}px`, ...tone.style }}
      >
        <div className="flex items-center gap-1.5 overflow-hidden">
          <EventSourceMark event={event} className={compactWeek ? "size-3.5" : undefined} />
          <EventFlags event={event} />
          <p className={cn("truncate font-medium", compactWeek ? "text-xs" : "text-sm")}>{title}</p>
        </div>
        {!isCompact && (
          <p className="truncate tabular-nums opacity-80">
            {format(start, "h:mm a")} – {format(end, "h:mm a")}
          </p>
        )}
      </div>
    </TitleTooltip>
  );
}

/* ------------------------------------------------------------------ *
 * Month chip (month view, "more" popover, multi-day rows)
 * ------------------------------------------------------------------ */

/**
 * The old calendar's month bar: a 1px outline in the event's colour, open on
 * the sides where the span carries on into the next day, so a multi-day event
 * reads as one bar across the week rather than separate tinted strips.
 */
const SPAN_BORDERS: Record<SpanPosition, React.CSSProperties> = {
  none: { borderWidth: 1 },
  first: { borderTopWidth: 1, borderBottomWidth: 1, borderLeftWidth: 1, borderRightWidth: 0 },
  middle: { borderTopWidth: 1, borderBottomWidth: 1, borderLeftWidth: 0, borderRightWidth: 0 },
  last: { borderTopWidth: 1, borderBottomWidth: 1, borderLeftWidth: 0, borderRightWidth: 1 },
};

export function EventBadge({
  event,
  position = "none",
  disableDrag = false,
  prefix,
  className,
}: {
  event: CalendarEvent;
  position?: SpanPosition;
  disableDrag?: boolean;
  /** "Day 2 of 3" on a multi-day event shown inside a single day. */
  prefix?: string;
  className?: string;
}) {
  const { onOpenEvent } = useCalendar();
  const drag = useDraggableEvent(event, disableDrag);
  const title = eventTitleText(event);
  const tone = eventTone(event);
  const showText = position === "first" || position === "none";

  return (
    <TitleTooltip title={title}>
      <div
        role="button"
        tabIndex={0}
        data-month-event
        draggable={drag.draggable}
        onDragStart={drag.onDragStart}
        onDragEnd={drag.onDragEnd}
        onClick={(e) => {
          e.stopPropagation();
          onOpenEvent(event);
        }}
        onKeyDown={activateOnKey}
        className={cn(
          "flex h-6 w-full cursor-pointer select-none items-center justify-between gap-1.5 truncate whitespace-nowrap px-1.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          position === "none" && "rounded",
          position === "first" && "-mr-px w-[calc(100%+1px)] rounded-l",
          position === "middle" && "-mx-px w-[calc(100%+2px)] rounded-none",
          position === "last" && "-ml-px w-[calc(100%+1px)] rounded-r",
          tone.className,
          drag.isDragging && "opacity-40",
          className,
        )}
        style={{ ...tone.style, borderStyle: "solid", ...SPAN_BORDERS[position] }}
      >
        {showText ? (
          <>
            <span className="flex min-w-0 items-center gap-1 font-medium">
              <EventSourceMark event={event} className="size-3.5" />
              {prefix ? <span className="shrink-0">{prefix} •</span> : null}
              <EventFlags event={event} size="size-3" />
              <span className="truncate">{title}</span>
            </span>
            <span className="shrink-0 tabular-nums opacity-80">
              {format(parseISO(event.startDate), "h:mm a")}
            </span>
          </>
        ) : (
          <span className="sr-only">{title}</span>
        )}
      </div>
    </TitleTooltip>
  );
}
