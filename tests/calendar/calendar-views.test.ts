/**
 * The four views — day, week, month and year — as sole-webapp's calendar
 * drew them: the range each one fetches and labels, how prev/next/today move
 * it, which events it shows, and how those events are laid out.
 *
 * Every date here is built in local time, as the calendar builds them.
 */
import { describe, expect, it, vi, afterEach } from "vitest";

import {
  calculateMonthEventPositions,
  eventCoversDay,
  eventsInView,
  getCalendarCells,
  getCalendarRange,
  getCurrentEvents,
  getEventsCount,
  getMaxOverlappingEvents,
  getMonthCellEvents,
  getPositionedEvents,
  getVisibleHours,
  HOUR_HEIGHT,
  navigateDate,
  normalizeEvent,
  rangeText,
  slotDateTime,
  spanPosition,
  splitByDuration,
  VISIBLE_HOURS,
  weekMultiDayRows,
  type CalendarEvent,
} from "@/lib/calendar";

afterEach(() => {
  vi.useRealTimers();
});

let nextId = 1;
/** An event from local-time pieces; `end` defaults to an hour after `start`. */
function ev(start: Date, end?: Date, extra: Record<string, unknown> = {}): CalendarEvent {
  const id = nextId++;
  return normalizeEvent(
    {
      id,
      task_id: id,
      task_name: `Event ${id}`,
      startDate: start.toISOString(),
      endDate: (end ?? new Date(start.getTime() + 3_600_000)).toISOString(),
      ...extra,
    },
    id,
    "Google Calendar",
  )!;
}

const at = (month: number, day: number, hour = 9, minute = 0) =>
  new Date(2026, month, day, hour, minute);

// Wednesday 14 October 2026.
const WED_OCT_14 = at(9, 14, 12);

/* ------------------------------------------------------------------ *
 * Shared header behaviour
 * ------------------------------------------------------------------ */

describe("range, label and navigation per view", () => {
  it("day: one day, labelled by date, moved a day at a time", () => {
    const { start_at, end_at } = getCalendarRange(WED_OCT_14, "day");
    expect(new Date(start_at)).toEqual(new Date(2026, 9, 14, 0, 0, 0, 0));
    expect(new Date(end_at)).toEqual(new Date(2026, 9, 14, 23, 59, 59, 999));
    expect(rangeText("day", WED_OCT_14)).toBe("Oct 14, 2026");
    expect(navigateDate(WED_OCT_14, "day", "next").getDate()).toBe(15);
    expect(navigateDate(WED_OCT_14, "day", "previous").getDate()).toBe(13);
  });

  it("week: Sunday to Saturday, moved a week at a time", () => {
    const { start_at, end_at } = getCalendarRange(WED_OCT_14, "week");
    expect(new Date(start_at)).toEqual(new Date(2026, 9, 11));
    expect(new Date(end_at)).toEqual(new Date(2026, 9, 17, 23, 59, 59, 999));
    expect(rangeText("week", WED_OCT_14)).toBe("Oct 11, 2026 - Oct 17, 2026");
    expect(navigateDate(WED_OCT_14, "week", "next").getDate()).toBe(21);
    expect(navigateDate(WED_OCT_14, "week", "previous").getDate()).toBe(7);
  });

  it("month: the whole month, moved a month at a time", () => {
    expect(rangeText("month", WED_OCT_14)).toBe("Oct 1, 2026 - Oct 31, 2026");
    expect(navigateDate(WED_OCT_14, "month", "next").getMonth()).toBe(10);
    expect(navigateDate(WED_OCT_14, "month", "previous").getMonth()).toBe(8);
    // Jan 31 → Feb clamps to the last day, not into March.
    expect(navigateDate(new Date(2026, 0, 31), "month", "next")).toEqual(new Date(2026, 1, 28));
  });

  it("year: the whole year, moved a year at a time", () => {
    const { start_at, end_at } = getCalendarRange(WED_OCT_14, "year");
    expect(new Date(start_at)).toEqual(new Date(2026, 0, 1));
    expect(new Date(end_at)).toEqual(new Date(2026, 11, 31, 23, 59, 59, 999));
    expect(rangeText("year", WED_OCT_14)).toBe("Jan 1, 2026 - Dec 31, 2026");
    expect(navigateDate(WED_OCT_14, "year", "next").getFullYear()).toBe(2027);
    expect(navigateDate(WED_OCT_14, "year", "previous").getFullYear()).toBe(2025);
  });

  it("counts the events in the view for the header pill", () => {
    const events = [ev(at(9, 14)), ev(at(9, 14, 15)), ev(at(9, 16)), ev(at(9, 30)), ev(at(2, 3))];
    expect(getEventsCount(events, WED_OCT_14, "day")).toBe(2);
    expect(getEventsCount(events, WED_OCT_14, "week")).toBe(3);
    expect(getEventsCount(events, WED_OCT_14, "month")).toBe(4);
    expect(getEventsCount(events, WED_OCT_14, "year")).toBe(5);
  });
});

describe("which events each view shows", () => {
  const before = ev(at(9, 10));
  const sameDay = ev(at(9, 14, 10));
  const laterThisWeek = ev(at(9, 17, 8));
  const nextWeek = ev(at(9, 20));
  const nextMonth = ev(at(10, 2));
  const nextYear = ev(new Date(2027, 0, 5, 9));
  // Starts in September, ends on the 14th: overlaps every view of the 14th.
  const spanning = ev(at(8, 28), at(9, 14, 11));
  const all = [before, sameDay, laterThisWeek, nextWeek, nextMonth, nextYear, spanning];

  const ids = (events: CalendarEvent[]) => events.map((event) => event.id).sort();

  it("day", () => {
    expect(ids(eventsInView(all, WED_OCT_14, "day"))).toEqual(ids([sameDay, spanning]));
  });

  it("week", () => {
    expect(ids(eventsInView(all, WED_OCT_14, "week"))).toEqual(
      ids([sameDay, laterThisWeek, spanning]),
    );
  });

  it("month", () => {
    expect(ids(eventsInView(all, WED_OCT_14, "month"))).toEqual(
      ids([before, sameDay, laterThisWeek, nextWeek, spanning]),
    );
  });

  it("year", () => {
    expect(ids(eventsInView(all, WED_OCT_14, "year"))).toEqual(
      ids([before, sameDay, laterThisWeek, nextWeek, nextMonth, spanning]),
    );
  });

  it("splits single-day from multi-day events", () => {
    const { singleDayEvents, multiDayEvents } = splitByDuration([sameDay, spanning]);
    expect(singleDayEvents).toEqual([sameDay]);
    expect(multiDayEvents).toEqual([spanning]);
  });
});

/* ------------------------------------------------------------------ *
 * Day and week: the time grid
 * ------------------------------------------------------------------ */

describe("day and week time grid", () => {
  it("shows the whole day, hour by hour", () => {
    const { hours, earliestEventHour, latestEventHour } = getVisibleHours(VISIBLE_HOURS, []);
    expect(hours).toHaveLength(24);
    expect([earliestEventHour, latestEventHour]).toEqual([0, 24]);
  });

  it("places a lone event by its start, capped in width", () => {
    const day = at(9, 14, 0);
    const event = ev(at(9, 14, 6));
    const [placed] = getPositionedEvents([event], day, { from: 0, to: 24 });
    expect(placed.style.top).toBe("25%");
    expect(placed.style.left).toBe("0%");
    expect(placed.style.width).toBe("min(100%, 360px)");
  });

  it("puts overlapping events side by side and reports how many columns", () => {
    const day = at(9, 14, 0);
    const a = ev(at(9, 14, 9), at(9, 14, 11));
    const b = ev(at(9, 14, 10), at(9, 14, 12));
    const c = ev(at(9, 14, 13));

    const placed = getPositionedEvents([a, b, c], day, { from: 0, to: 24 });
    const style = (event: CalendarEvent) => placed.find((p) => p.event.id === event.id)!.style;

    expect([style(a).width, style(a).left]).toEqual(["50%", "0%"]);
    expect([style(b).width, style(b).left]).toEqual(["50%", "50%"]);
    // c doesn't overlap either, so it gets the full width again.
    expect(style(c).width).toBe("min(100%, 360px)");
    expect(getMaxOverlappingEvents([a, b, c], day)).toBe(2);
  });

  it("gives a very short event enough height to see and still lays the next one beside it", () => {
    const day = at(9, 14, 0);
    const fiveMinutes = ev(at(9, 14, 9, 0), at(9, 14, 9, 5));
    const rightAfter = ev(at(9, 14, 9, 10), at(9, 14, 9, 40));
    // 28px of a 96px hour is ~17.5 minutes, so these display as overlapping.
    expect(HOUR_HEIGHT).toBe(96);
    expect(getMaxOverlappingEvents([fiveMinutes, rightAfter], day)).toBe(2);
  });

  it("turns a clicked quarter-hour slot into the new task's start", () => {
    expect(slotDateTime(at(9, 14, 0), 14, 45)).toEqual(at(9, 14, 14, 45));
  });

  it("lists what's happening now for the day view's side panel", () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(9, 14, 10, 30));
    const now = ev(at(9, 14, 10), at(9, 14, 11));
    const later = ev(at(9, 14, 15));
    expect(getCurrentEvents([now, later])).toEqual([now]);
  });
});

describe("week multi-day row", () => {
  it("lays spans into rows that don't collide, clipped to the week", () => {
    // Mon 12 → Wed 14, Tue 13 → Thu 15 (collides), Fri 16 → Sat 24 (clipped).
    const a = ev(at(9, 12), at(9, 14));
    const b = ev(at(9, 13), at(9, 15));
    const c = ev(at(9, 16), at(9, 24));

    const rows = weekMultiDayRows([a, b, c], WED_OCT_14);

    expect(rows).toHaveLength(2);
    const where = (event: CalendarEvent) => {
      const rowIndex = rows.findIndex((row) => row.some((item) => item.event.id === event.id));
      const item = rows[rowIndex].find((entry) => entry.event.id === event.id)!;
      return [rowIndex, item.startIndex, item.endIndex];
    };
    expect(where(a)).toEqual([0, 1, 3]);
    expect(where(b)).toEqual([1, 2, 4]);
    expect(where(c)).toEqual([0, 5, 6]);
  });

  it("leaves out spans outside the week", () => {
    expect(weekMultiDayRows([ev(at(9, 1), at(9, 3))], WED_OCT_14)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Month
 * ------------------------------------------------------------------ */

describe("month view", () => {
  it("fills whole weeks from the Sunday before the 1st", () => {
    const cells = getCalendarCells(WED_OCT_14);
    // October 2026 starts on a Thursday: 4 leading days, 31, then 0 trailing.
    expect(cells).toHaveLength(35);
    expect(cells[0]).toMatchObject({ day: 27, currentMonth: false });
    expect(cells[4]).toMatchObject({ day: 1, currentMonth: true });
    expect(cells.at(-1)).toMatchObject({ day: 31, currentMonth: true });
  });

  it("pads the last week into next month when needed", () => {
    const cells = getCalendarCells(new Date(2026, 8, 10)); // September 2026
    expect(cells.length % 7).toBe(0);
    expect(cells.at(-1)).toMatchObject({ currentMonth: false });
    expect(cells.at(-1)!.date.getMonth()).toBe(9);
  });

  it("gives each event a slot, longest spans first, up to three a day", () => {
    const span = ev(at(9, 5), at(9, 8));
    const singles = [ev(at(9, 6, 8)), ev(at(9, 6, 9)), ev(at(9, 6, 10))];

    const positions = calculateMonthEventPositions([span], singles, WED_OCT_14);

    expect(positions[span.id]).toBe(0);
    expect(singles.map((event) => positions[event.id])).toEqual([1, 2, undefined]);
  });

  it("lists a day's events with spans first, and marks the overflow", () => {
    const span = ev(at(9, 5), at(9, 8));
    const singles = [ev(at(9, 6, 8)), ev(at(9, 6, 9)), ev(at(9, 6, 10))];
    const positions = calculateMonthEventPositions([span], singles, WED_OCT_14);

    const cellEvents = getMonthCellEvents(at(9, 6, 0), [span, ...singles], positions);

    // The cell draws slot 0–2 by `position`, and "+N more" is whatever's left.
    // (Ordering follows the old helper, which ranks the unslotted -1 first.)
    expect(cellEvents).toHaveLength(4);
    expect(cellEvents.find((event) => event.position === 0)?.id).toBe(span.id);
    expect(cellEvents.filter((event) => event.position >= 0)).toHaveLength(3);
    expect(cellEvents.filter((event) => event.position === -1)).toHaveLength(1);
  });

  it("knows where a day sits in a span, for the bar's rounded ends", () => {
    const span = ev(at(9, 5), at(9, 8));
    expect(spanPosition(span, at(9, 5, 0))).toBe("first");
    expect(spanPosition(span, at(9, 6, 0))).toBe("middle");
    expect(spanPosition(span, at(9, 8, 0))).toBe("last");
    expect(spanPosition(ev(at(9, 6)), at(9, 6, 0))).toBe("none");
    expect(eventCoversDay(span, at(9, 9, 0))).toBe(false);
    expect(eventCoversDay(span, at(9, 7, 0))).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Year
 * ------------------------------------------------------------------ */

describe("year view", () => {
  it("covers all twelve months of the selected year", () => {
    const events = [ev(new Date(2026, 0, 1, 9)), ev(new Date(2026, 11, 31, 9)), ev(new Date(2025, 11, 31, 9))];
    const shown = eventsInView(events, WED_OCT_14, "year");
    expect(shown.map((event) => new Date(event.startDate).getFullYear())).toEqual([2026, 2026]);
  });

  it("counts every event in the year for the header pill", () => {
    const events = Array.from({ length: 12 }, (_, month) => ev(new Date(2026, month, 10, 9)));
    expect(getEventsCount(events, WED_OCT_14, "year")).toBe(12);
  });
});
