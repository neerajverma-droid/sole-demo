/**
 * Calendar — the domain layer behind the Scheduling add-on's calendar.
 *
 * Ported from sole-webapp's `components/Calendar` (BigCalendar, helpers.js,
 * ClientContainer, AddTask). Behaviour is deliberately the same as there:
 * the same date ranges sent to `/calendar`, the same event normalisation,
 * the same overlap layout and month slotting, and the same task payload.
 * Only the presentation is new. If something here looks odd, check the old
 * file before "fixing" it — the backend was built against that behaviour.
 */
import {
  addDays,
  addHours,
  addMinutes,
  addMonths,
  addWeeks,
  addYears,
  differenceInDays,
  differenceInMinutes,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isSameDay,
  isSameMonth,
  isSameWeek,
  isSameYear,
  isToday,
  isTomorrow,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type CalendarView = "day" | "week" | "month" | "year";

export const CALENDAR_VIEWS: CalendarView[] = ["day", "week", "month", "year"];

export type CalendarUser = {
  id: string;
  name: string;
  picturePath: string | null;
};

type Named = { id?: string | number; name?: string; title?: string };

/**
 * A row as `/calendar` (and `/calendar/search`, `/calendar/:id`) returns it.
 * The API is loose — the same fact arrives under several names depending on
 * whether the row came from a Sole task or a synced Google event — so every
 * field is optional and the normaliser below picks whichever is present.
 */
export type RawCalendarEvent = {
  id?: string | number;
  _id?: string | number;
  task_id?: string | number | null;
  calendar_event_id?: string | number | null;
  event_id?: string | number | null;
  title?: string;
  name?: string;
  task_name?: string;
  task_details?: string;
  task_description?: string;
  description?: string;
  notes?: string;
  startDate?: string;
  endDate?: string;
  start_at?: string;
  end_at?: string;
  start_date?: string;
  end_date?: string;
  date?: string;
  due_date?: string;
  completed_at?: string | null;
  completedAt?: string | null;
  completed_date?: string | null;
  completedDate?: string | null;
  color?: string;
  border_color?: string;
  /** Present on events synced from a connected Google calendar. */
  email?: string;
  is_billable?: boolean | number;
  amount?: number | string | null;
  fixed_amount?: number | string | null;
  priority?: string | null;
  label?: string;
  stage?: (Named & { name?: string }) | string | number | null;
  stage_id?: string | number | null;
  stage_name?: string | null;
  status?: { name?: string } | string | null;
  status_name?: string | null;
  project?: (Named & { project_name?: string }) | string | null;
  project_id?: string | number | null;
  project_job_id?: string | number | null;
  job?: (Named & { job_name?: string }) | string | null;
  job_id?: string | number | null;
  client?: (Named & {
    client_id?: string | number;
    value?: string;
    email?: string;
    client_pic?: string | null;
    color?: string | null;
    currency?: string | null;
  }) | null;
  client_id?: string | number | null;
  client_name?: string;
  contact?: (Named & {
    full_name?: string;
    email?: string;
    profile_picture?: string | null;
  }) | null;
  contact_id?: string | number | null;
  contact_name?: string;
  calendar?: {
    email?: string;
    provider?: string;
    calendar_id?: string;
  } | null;
  documents?: unknown;
  attachments?: unknown;
  files?: unknown;
  task_documents?: unknown;
  taskDocuments?: unknown;
  recurrence?: unknown[] | null;
  parent_event_id?: string | number | null;
  is_recurring_parent?: boolean;
  is_occurrence?: boolean;
  user?: { id?: string | number; name?: string; picturePath?: string | null; avatar?: string };
  user_id?: string | number;
  created_by?: string | number;
  owner_id?: string | number;
  user_name?: string;
  owner_name?: string;
  assigned_to_name?: string;
  [key: string]: unknown;
};

/** A row after `normalizeEvent` — always has an id, both dates and a title. */
export type CalendarEvent = RawCalendarEvent & {
  id: string;
  task_id: string | number | null;
  startDate: string;
  endDate: string;
  title: string;
  displayTitle: string;
  color: string;
  border_color: string;
  description: string;
  user: CalendarUser;
  is_recurring_parent: boolean;
  is_occurrence: boolean;
};

/** A calendar connected through `/calendar/url`, as `/calendar/list` returns it. */
export type LinkedCalendar = {
  id: string | number;
  provider?: string;
  email?: string;
  calendar_id?: string;
  is_default?: boolean;
  color?: string;
  border_color?: string;
};

export type CalendarFilters = {
  calendar_ids: string[];
  billable: boolean;
};

export const EMPTY_FILTERS: CalendarFilters = { calendar_ids: [], billable: false };

/** A planner stage, from `/stage` — the task's Status. */
export type PlannerStage = { id: string | number; name: string; order?: number };

/** A row from `/contact/list` — the person a task is linked to. */
export type CalendarContact = {
  value: string;
  label: string;
  email: string;
  client_id: string | number | null;
  contact_id: string | number | null;
};

export type ClientProject = { id: string | number; project_name: string };
export type ProjectJob = { id: string | number; job_name: string };

/* ------------------------------------------------------------------ *
 * Ranges and navigation
 * ------------------------------------------------------------------ */

/** The window each view asks `/calendar` for. Weeks start on Sunday. */
export function getCalendarRange(date: Date, view: CalendarView) {
  switch (view) {
    case "day":
      return {
        start_at: startOfDay(date).toISOString(),
        end_at: endOfDay(date).toISOString(),
      };
    case "week":
      return {
        start_at: startOfWeek(date).toISOString(),
        end_at: endOfWeek(date).toISOString(),
      };
    case "year":
      return {
        start_at: startOfYear(date).toISOString(),
        end_at: endOfYear(date).toISOString(),
      };
    case "month":
    default:
      return {
        start_at: startOfMonth(date).toISOString(),
        end_at: endOfMonth(date).toISOString(),
      };
  }
}

export function rangeText(view: CalendarView, date: Date): string {
  const formatString = "MMM d, yyyy";
  let start: Date;
  let end: Date;
  switch (view) {
    case "year":
      start = startOfYear(date);
      end = endOfYear(date);
      break;
    case "month":
      start = startOfMonth(date);
      end = endOfMonth(date);
      break;
    case "week":
      start = startOfWeek(date);
      end = endOfWeek(date);
      break;
    case "day":
    default:
      return format(date, formatString);
  }
  return `${format(start, formatString)} - ${format(end, formatString)}`;
}

export function navigateDate(
  date: Date,
  view: CalendarView,
  direction: "previous" | "next",
): Date {
  const operations = {
    year: direction === "next" ? addYears : subYears,
    month: direction === "next" ? addMonths : subMonths,
    week: direction === "next" ? addWeeks : subWeeks,
    day: direction === "next" ? addDays : subDays,
  };
  return operations[view](date, 1);
}

export function getEventsCount(
  events: CalendarEvent[],
  date: Date,
  view: CalendarView,
): number {
  const compareFns = {
    year: isSameYear,
    day: isSameDay,
    week: isSameWeek,
    month: isSameMonth,
  };
  return events.filter((event) =>
    compareFns[view](new Date(event.startDate), date),
  ).length;
}

/** A task in a done/final stage can't be edited or deleted from the calendar. */
export function isFinalizedEvent(event: RawCalendarEvent | null | undefined): boolean {
  const stage =
    event?.stage_name ||
    (typeof event?.stage === "object" ? event?.stage?.name : undefined) ||
    (typeof event?.status === "object" ? event?.status?.name : undefined) ||
    event?.status_name ||
    "";
  const normalized = String(stage).trim().toLowerCase();
  return (
    normalized.includes("done") ||
    normalized.includes("final") ||
    normalized.includes("finalized")
  );
}

/* ------------------------------------------------------------------ *
 * Normalising API rows
 * ------------------------------------------------------------------ */

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const DEFAULT_CALENDAR_NAME = "My Work Calendar";

export function getProviderLabel(provider?: string): string {
  if (!provider) return "Calendar";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function getEventUser(event: RawCalendarEvent, fallbackName: string): CalendarUser {
  const userId =
    event?.user?.id ||
    event?.user_id ||
    event?.created_by ||
    event?.owner_id ||
    "calendar-user";

  const userName =
    event?.user?.name ||
    event?.user_name ||
    event?.owner_name ||
    event?.assigned_to_name ||
    fallbackName;

  return {
    id: String(userId),
    name: userName || fallbackName,
    picturePath: event?.user?.picturePath || event?.user?.avatar || null,
  };
}

/**
 * One API row as the calendar renders it, or null when it has no usable
 * start date. Recurring occurrences carry synthetic ids like "42_occ_0" and
 * keep them; everything else is keyed by its task id, falling back to the
 * row's own id. `task_id` is null on an occurrence so an edit never targets
 * the series by accident.
 */
export function normalizeEvent(
  event: RawCalendarEvent,
  index: number,
  fallbackUserName: string,
  { search = false }: { search?: boolean } = {},
): CalendarEvent | null {
  const startDate =
    toDate(event?.startDate) ||
    toDate(event?.start_at) ||
    toDate(event?.date) ||
    toDate(event?.due_date);

  if (!startDate) return null;

  const fallbackEnd = new Date(startDate);
  fallbackEnd.setHours(fallbackEnd.getHours() + 1);

  const endDate = toDate(event?.endDate) || toDate(event?.end_at) || fallbackEnd;

  const eventTitle =
    event?.title || event?.name || event?.task_name || "Untitled event";

  // Trust API-supplied flags first, compute locally as fallback.
  const isRecurringParent =
    event?.is_recurring_parent ??
    (Array.isArray(event?.recurrence) &&
      event.recurrence.length > 0 &&
      !event?.parent_event_id);
  const isOccurrence = event?.is_occurrence ?? Boolean(event?.parent_event_id);

  // Search results never carry occurrences' synthetic ids differently, so
  // the old search mapping skipped this branch — kept that way.
  const isVirtualOccurrence =
    !search && isOccurrence && String(event?.id || "").includes("_occ_");

  const resolvedId = isVirtualOccurrence
    ? String(event.id)
    : String(
        (event?.task_id !== null && event?.task_id !== undefined
          ? event.task_id
          : null) ||
          event?.id ||
          event?._id ||
          `calendar-${search ? "search-" : ""}event-${index}`,
      );

  return {
    ...event,
    id: resolvedId,
    task_id: isVirtualOccurrence
      ? null
      : event?.task_id !== undefined
        ? event.task_id
        : event?.id || null,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    title: eventTitle,
    displayTitle: eventTitle,
    color: event?.color ?? "#DBEAFE",
    border_color: event?.border_color ?? "#1D4ED8",
    description: event?.description || event?.notes || event?.task_name || "",
    user: getEventUser(event, fallbackUserName),
    is_recurring_parent: Boolean(isRecurringParent),
    is_occurrence: Boolean(isOccurrence),
  };
}

export function normalizeEvents(
  rows: RawCalendarEvent[],
  fallbackUserName: string,
): CalendarEvent[] {
  return (rows || [])
    .map((event, index) => normalizeEvent(event, index, fallbackUserName))
    .filter((event): event is CalendarEvent => event !== null);
}

/** Search results: normalised, in start order, capped at 100. */
export function normalizeSearchResults(
  rows: RawCalendarEvent[],
  fallbackUserName: string,
): CalendarEvent[] {
  return (rows || [])
    .map((event, index) =>
      normalizeEvent(event, index, fallbackUserName, { search: true }),
    )
    .filter((event): event is CalendarEvent => event !== null)
    .sort(
      (a, b) => parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime(),
    )
    .slice(0, 100);
}

/** The title without the "$ " prefix billable Google events arrive with. */
export function eventTitleText(event: CalendarEvent): string {
  const rawTitle = event.displayTitle || event.title || "";
  return event.is_billable ? rawTitle.replace(/^\$\s*/, "") : rawTitle;
}

export function isGoogleEvent(event: RawCalendarEvent): boolean {
  return Boolean(event?.email);
}

export function isRecurringEvent(event: CalendarEvent): boolean {
  return Boolean(event.is_recurring_parent || event.is_occurrence);
}

/**
 * The events a view shows — the ones overlapping its window. Matches
 * ClientContainer's own filter, which the API range alone didn't settle for
 * events optimistically added or moved since the last fetch.
 */
export function eventsInView(
  events: CalendarEvent[],
  selectedDate: Date,
  view: CalendarView,
): CalendarEvent[] {
  let windowStart: Date;
  let windowEnd: Date;

  if (view === "year") {
    windowStart = new Date(selectedDate.getFullYear(), 0, 1);
    windowEnd = new Date(selectedDate.getFullYear(), 11, 31, 23, 59, 59, 999);
  } else if (view === "month") {
    windowStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    windowEnd = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
  } else if (view === "week") {
    windowStart = new Date(selectedDate);
    windowStart.setDate(selectedDate.getDate() - selectedDate.getDay());
    windowStart.setHours(0, 0, 0, 0);
    windowEnd = new Date(windowStart);
    windowEnd.setDate(windowStart.getDate() + 6);
    windowEnd.setHours(23, 59, 59, 999);
  } else {
    windowStart = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      0,
      0,
      0,
    );
    windowEnd = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      23,
      59,
      59,
    );
  }

  return events.filter((event) => {
    const eventStart = parseISO(event.startDate);
    const eventEnd = parseISO(event.endDate);
    return eventStart <= windowEnd && eventEnd >= windowStart;
  });
}

export function splitByDuration(events: CalendarEvent[]) {
  const singleDayEvents: CalendarEvent[] = [];
  const multiDayEvents: CalendarEvent[] = [];
  events.forEach((event) => {
    if (isSameDay(parseISO(event.startDate), parseISO(event.endDate))) {
      singleDayEvents.push(event);
    } else {
      multiDayEvents.push(event);
    }
  });
  return { singleDayEvents, multiDayEvents };
}

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

export function groupSearchResults(results: CalendarEvent[]) {
  const groups = new Map<string, { date: Date; events: CalendarEvent[] }>();
  results.forEach((event) => {
    const date = parseISO(event.startDate);
    const key = date.toDateString();
    const group = groups.get(key);
    if (group) group.events.push(event);
    else groups.set(key, { date, events: [event] });
  });
  return Array.from(groups.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
}

export function formatSearchGroupHeading(date: Date): string {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEEE, d MMM yyyy");
}

export function formatSearchTimeLabel(event: CalendarEvent): string {
  try {
    const start = parseISO(event.startDate);
    const end = parseISO(event.endDate);
    const isAllDay =
      start.getHours() === 0 &&
      start.getMinutes() === 0 &&
      (end.getHours() === 23 || end.getHours() === 0) &&
      end.getMinutes() >= 59;
    if (isAllDay) return "All day";
    return format(start, "p");
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------ *
 * Day and week time grid
 * ------------------------------------------------------------------ */

export function getCurrentEvents(events: CalendarEvent[]): CalendarEvent[] {
  const now = new Date();
  return events.filter((event) =>
    isWithinInterval(now, {
      start: parseISO(event.startDate),
      end: parseISO(event.endDate),
    }),
  );
}

/** Pixel height of one hour row; the overlap maths below is tied to it. */
export const HOUR_HEIGHT = 96;
const MIN_EVENT_HEIGHT = 28;
const MIN_DISPLAY_EVENT_MINUTES = (MIN_EVENT_HEIGHT / HOUR_HEIGHT) * 60;
const SINGLE_EVENT_MAX_WIDTH = 360;

type DisplayItem = {
  event: CalendarEvent;
  displayInterval: { start: Date; end: Date };
};

function getDisplayInterval(event: CalendarEvent, day: Date) {
  const startDate = parseISO(event.startDate);
  const endDate = parseISO(event.endDate);
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);

  const clippedStart = startDate < dayStart ? dayStart : startDate;
  const minimumDisplayEnd = addMinutes(clippedStart, MIN_DISPLAY_EVENT_MINUTES);
  const clippedEnd = endDate > minimumDisplayEnd ? endDate : minimumDisplayEnd;

  return { start: clippedStart, end: clippedEnd };
}

function getTopOffsetPercent(
  date: Date,
  day: Date,
  visibleHoursRange?: { from: number; to: number },
) {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const startMinutes = differenceInMinutes(date, dayStart);

  if (visibleHoursRange) {
    const visibleStartMinutes = visibleHoursRange.from * 60;
    const visibleEndMinutes = visibleHoursRange.to * 60;
    const visibleRangeMinutes = visibleEndMinutes - visibleStartMinutes;
    return ((startMinutes - visibleStartMinutes) / visibleRangeMinutes) * 100;
  }

  return (startMinutes / 1440) * 100;
}

function getEventClusters(dayEvents: CalendarEvent[], day: Date) {
  const sortedEvents: DisplayItem[] = [...dayEvents]
    .map((event) => ({ event, displayInterval: getDisplayInterval(event, day) }))
    .sort((left, right) => {
      const startDifference =
        left.displayInterval.start.getTime() - right.displayInterval.start.getTime();
      if (startDifference !== 0) return startDifference;
      return left.displayInterval.end.getTime() - right.displayInterval.end.getTime();
    });

  const clusters: { items: DisplayItem[]; end: Date }[] = [];

  sortedEvents.forEach((item) => {
    const lastCluster = clusters[clusters.length - 1];
    if (!lastCluster || item.displayInterval.start.getTime() >= lastCluster.end.getTime()) {
      clusters.push({ items: [item], end: item.displayInterval.end });
      return;
    }
    lastCluster.items.push(item);
    if (item.displayInterval.end > lastCluster.end) {
      lastCluster.end = item.displayInterval.end;
    }
  });

  return clusters;
}

function getClusterLayout(cluster: { items: DisplayItem[] }) {
  const columns: Date[] = [];

  const laidOutItems = cluster.items.map((item) => {
    let columnIndex = columns.findIndex(
      (columnEnd) => item.displayInterval.start.getTime() >= columnEnd.getTime(),
    );
    if (columnIndex === -1) {
      columnIndex = columns.length;
      columns.push(item.displayInterval.end);
    } else {
      columns[columnIndex] = item.displayInterval.end;
    }
    return { ...item, columnIndex };
  });

  return { columnCount: Math.max(columns.length, 1), laidOutItems };
}

export function getMaxOverlappingEvents(dayEvents: CalendarEvent[], day: Date): number {
  return getEventClusters(dayEvents, day).reduce(
    (maxCount, cluster) => Math.max(maxCount, getClusterLayout(cluster).columnCount),
    1,
  );
}

/** Each event's absolute position in a day column, side by side when they overlap. */
export function getPositionedEvents(
  dayEvents: CalendarEvent[],
  day: Date,
  visibleHoursRange?: { from: number; to: number },
) {
  return getEventClusters(dayEvents, day).flatMap((cluster) => {
    const { columnCount, laidOutItems } = getClusterLayout(cluster);
    const columnWidth = 100 / columnCount;
    const eventWidth =
      columnCount === 1 ? `min(100%, ${SINGLE_EVENT_MAX_WIDTH}px)` : `${columnWidth}%`;

    return laidOutItems.map((item) => ({
      event: item.event,
      style: {
        top: `${getTopOffsetPercent(item.displayInterval.start, day, visibleHoursRange)}%`,
        width: eventWidth,
        left: `${item.columnIndex * columnWidth}%`,
        zIndex: item.columnIndex + 1,
      } as React.CSSProperties,
    }));
  });
}

/** The visible window is the full day (0–24), stretched for any event outside it. */
export const VISIBLE_HOURS = { from: 0, to: 24 };

export function getVisibleHours(
  visibleHours: { from: number; to: number },
  singleDayEvents: CalendarEvent[],
) {
  let earliestEventHour = visibleHours.from;
  let latestEventHour = visibleHours.to;
  singleDayEvents.forEach((event) => {
    const startHour = parseISO(event.startDate).getHours();
    const endTime = parseISO(event.endDate);
    const endHour = endTime.getHours() + (endTime.getMinutes() > 0 ? 1 : 0);
    if (startHour < earliestEventHour) earliestEventHour = startHour;
    if (endHour > latestEventHour) latestEventHour = endHour;
  });
  latestEventHour = Math.min(latestEventHour, 24);
  const hours = Array.from(
    { length: latestEventHour - earliestEventHour },
    (_, i) => i + earliestEventHour,
  );
  return { hours, earliestEventHour, latestEventHour };
}

/** The slots a time grid row is split into, for click-to-add and drop targets. */
export const QUARTER_MINUTES = [0, 15, 30, 45] as const;

export function slotDateTime(day: Date, hour: number, minute: number): Date {
  const next = new Date(day);
  next.setHours(hour, minute, 0, 0);
  return next;
}

/** Multi-day events laid out in rows across a week's seven columns. */
export function weekMultiDayRows(multiDayEvents: CalendarEvent[], selectedDate: Date) {
  const weekStart = startOfWeek(selectedDate);
  const weekEnd = endOfWeek(selectedDate);

  const processed = multiDayEvents
    .filter((event) => {
      const start = parseISO(event.startDate);
      const end = parseISO(event.endDate);
      return start <= weekEnd && end >= weekStart;
    })
    .map((event) => {
      const start = parseISO(event.startDate);
      const end = parseISO(event.endDate);
      const adjustedStart = start < weekStart ? weekStart : start;
      const adjustedEnd = end > weekEnd ? weekEnd : end;
      return {
        event,
        adjustedStart,
        startIndex: differenceInDays(startOfDay(adjustedStart), weekStart),
        endIndex: differenceInDays(startOfDay(adjustedEnd), weekStart),
      };
    })
    .sort((a, b) => {
      const startDiff = a.adjustedStart.getTime() - b.adjustedStart.getTime();
      if (startDiff !== 0) return startDiff;
      return b.endIndex - b.startIndex - (a.endIndex - a.startIndex);
    });

  const rows: (typeof processed)[] = [];
  processed.forEach((item) => {
    let rowIndex = rows.findIndex((row) =>
      row.every((e) => e.endIndex < item.startIndex || e.startIndex > item.endIndex),
    );
    if (rowIndex === -1) {
      rowIndex = rows.length;
      rows.push([]);
    }
    rows[rowIndex].push(item);
  });
  return rows;
}

/* ------------------------------------------------------------------ *
 * Month grid
 * ------------------------------------------------------------------ */

export type MonthCell = { day: number; currentMonth: boolean; date: Date };

/** Leading days of last month, this month, then trailing days to finish the row. */
export function getCalendarCells(selectedDate: Date): MonthCell[] {
  const currentYear = selectedDate.getFullYear();
  const currentMonth = selectedDate.getMonth();
  const getDaysInMonth = (year: number, month: number) =>
    new Date(year, month + 1, 0).getDate();
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInPrevMonth = getDaysInMonth(currentYear, currentMonth - 1);
  const totalDays = firstDayOfMonth + daysInMonth;

  const prevMonthCells = Array.from({ length: firstDayOfMonth }, (_, i) => ({
    day: daysInPrevMonth - firstDayOfMonth + i + 1,
    currentMonth: false,
    date: new Date(currentYear, currentMonth - 1, daysInPrevMonth - firstDayOfMonth + i + 1),
  }));
  const currentMonthCells = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    currentMonth: true,
    date: new Date(currentYear, currentMonth, i + 1),
  }));
  const nextMonthCells = Array.from({ length: (7 - (totalDays % 7)) % 7 }, (_, i) => ({
    day: i + 1,
    currentMonth: false,
    date: new Date(currentYear, currentMonth + 1, i + 1),
  }));
  return [...prevMonthCells, ...currentMonthCells, ...nextMonthCells];
}

export const MONTH_SLOTS = 3;

/**
 * Which of a day's three slots each event takes. Longest multi-day events
 * claim slots first so a span keeps one row across every day it covers.
 */
export function calculateMonthEventPositions(
  multiDayEvents: CalendarEvent[],
  singleDayEvents: CalendarEvent[],
  selectedDate: Date,
): Record<string, number> {
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);
  const eventPositions: Record<string, number> = {};
  const occupiedPositions: Record<string, boolean[]> = {};

  eachDayOfInterval({ start: monthStart, end: monthEnd }).forEach((day) => {
    occupiedPositions[day.toISOString()] = [false, false, false];
  });

  const sortedEvents = [
    ...[...multiDayEvents].sort((a, b) => {
      const aDuration = differenceInDays(parseISO(a.endDate), parseISO(a.startDate));
      const bDuration = differenceInDays(parseISO(b.endDate), parseISO(b.startDate));
      return (
        bDuration - aDuration ||
        parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime()
      );
    }),
    ...[...singleDayEvents].sort(
      (a, b) => parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime(),
    ),
  ];

  sortedEvents.forEach((event) => {
    const eventStart = parseISO(event.startDate);
    const eventEnd = parseISO(event.endDate);
    const clippedStart = eventStart < monthStart ? monthStart : eventStart;
    const clippedEnd = eventEnd > monthEnd ? monthEnd : eventEnd;
    if (clippedStart > clippedEnd) return;
    const eventDays = eachDayOfInterval({ start: clippedStart, end: clippedEnd });

    let position = -1;
    for (let i = 0; i < MONTH_SLOTS; i++) {
      if (
        eventDays.every((day) => {
          const dayPositions = occupiedPositions[startOfDay(day).toISOString()];
          return dayPositions && !dayPositions[i];
        })
      ) {
        position = i;
        break;
      }
    }

    if (position !== -1) {
      eventDays.forEach((day) => {
        occupiedPositions[startOfDay(day).toISOString()][position] = true;
      });
      eventPositions[event.id] = position;
    }
  });

  return eventPositions;
}

export type MonthCellEvent = CalendarEvent & { position: number; isMultiDay: boolean };

export function getMonthCellEvents(
  date: Date,
  events: CalendarEvent[],
  eventPositions: Record<string, number>,
): MonthCellEvent[] {
  return events
    .filter((event) => {
      const eventStart = parseISO(event.startDate);
      const eventEnd = parseISO(event.endDate);
      return (
        (date >= eventStart && date <= eventEnd) ||
        isSameDay(date, eventStart) ||
        isSameDay(date, eventEnd)
      );
    })
    .map((event) => ({
      ...event,
      position: eventPositions[event.id] ?? -1,
      isMultiDay: event.startDate !== event.endDate,
    }))
    .sort((a, b) => {
      if (a.isMultiDay && !b.isMultiDay) return -1;
      if (!a.isMultiDay && b.isMultiDay) return 1;
      return a.position - b.position;
    });
}

/** Where a day sits within an event that spans several. */
export type SpanPosition = "none" | "first" | "middle" | "last";

export function spanPosition(event: CalendarEvent, cellDate: Date): SpanPosition {
  const itemStart = startOfDay(parseISO(event.startDate));
  const itemEnd = startOfDay(parseISO(event.endDate));
  if (isSameDay(itemStart, itemEnd)) return "none";
  if (isSameDay(cellDate, itemStart)) return "first";
  if (isSameDay(cellDate, itemEnd)) return "last";
  return "middle";
}

export function eventCoversDay(event: CalendarEvent, cellDate: Date): boolean {
  const itemStart = startOfDay(parseISO(event.startDate));
  const itemEnd = endOfDay(parseISO(event.endDate));
  return cellDate >= itemStart && cellDate <= itemEnd;
}

/* ------------------------------------------------------------------ *
 * Moving an event (drag and drop)
 * ------------------------------------------------------------------ */

/** Same duration, new start — keeps the time of day when dropped on a day cell. */
export function movedEvent(
  event: CalendarEvent,
  target: { date: Date; hour?: number; minute?: number },
): CalendarEvent {
  const start = parseISO(event.startDate);
  const durationMs = parseISO(event.endDate).getTime() - start.getTime();
  const newStart = new Date(target.date);
  if (target.hour === undefined) {
    newStart.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds());
  } else {
    newStart.setHours(target.hour, target.minute ?? 0, 0, 0);
  }
  const newEnd = new Date(newStart.getTime() + durationMs);
  return { ...event, startDate: newStart.toISOString(), endDate: newEnd.toISOString() };
}

/**
 * The JSON body `PUT /calendar/:id` takes for a drag-and-drop move — exactly
 * use-update-event.js's payload, which is narrower than the form's.
 */
export function buildMovePayload(event: CalendarEvent) {
  const rawAmount = [event.amount, event.fixed_amount].find(
    (value) => value !== undefined && value !== null && value !== "",
  );
  const amount = rawAmount === undefined ? null : Number(rawAmount);
  return {
    task_name: event.task_name || event.title || "",
    task_details: event.task_details || event.description || "",
    label: event.label || "personal",
    start_date: event.startDate,
    end_date: event.endDate,
    project_id: event.project_id ? Number(event.project_id) : null,
    job_id: event.job_id ? Number(event.job_id) : null,
    is_billable: Boolean(event.is_billable),
    client_id: event.client_id ? Number(event.client_id) : null,
    contact_id: event.contact_id ? Number(event.contact_id) : null,
    /*
     * Only when the event has one. A move changes the time, not the billing,
     * and the backend checks the amount only when it's sent: an empty one on a
     * billable task — an hourly timer entry, say — is refused as "Amount is
     * required for billable tasks", where leaving it out keeps what's saved.
     */
    ...(amount !== null && !Number.isNaN(amount) ? { amount } : {}),
  };
}

/** The id an event is saved under — task id first, as use-update-event.js used. */
export function eventSaveId(event: CalendarEvent): string {
  return String(event.task_id || event.id);
}

/* ------------------------------------------------------------------ *
 * Event details
 * ------------------------------------------------------------------ */

/**
 * The id `GET /calendar/:id` expects. Views key events by task id, so the
 * calendar event's own id wins when it's present.
 */
export function detailIdFor(event: RawCalendarEvent): string | number | undefined {
  if (event?.calendar_event_id !== null && event?.calendar_event_id !== undefined) {
    return event.calendar_event_id;
  }
  if (event?.event_id !== null && event?.event_id !== undefined) return event.event_id;
  if (event?.id !== null && event?.id !== undefined) return event.id;
  return event?.task_id ?? undefined;
}

export type EventDocument = { documentId: string; name: string; url: string };

export function mapEventDocuments(documents: unknown): EventDocument[] {
  const docs: unknown[] = Array.isArray(documents)
    ? documents
    : Array.isArray((documents as { data?: unknown })?.data)
      ? ((documents as { data: unknown[] }).data)
      : [];

  return docs
    .filter(Boolean)
    .map((raw) => {
      const doc = raw as Record<string, unknown>;
      const url = (doc.file_url || doc.file_path || doc.url || "") as string;
      return {
        documentId: String(doc.document_id ?? doc.id ?? doc.documentId ?? ""),
        name: (doc.file_name || doc.name || "attachment") as string,
        url,
      };
    })
    .filter((doc) => doc.url);
}

export function eventDocumentsSource(event: RawCalendarEvent | null | undefined): unknown {
  return (
    event?.documents ||
    event?.attachments ||
    event?.files ||
    event?.task_documents ||
    event?.taskDocuments
  );
}

export function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(url);
}

/** A name for a linked record, which the API sends as an object or a bare string. */
export function linkedName(
  value: unknown,
  ...keys: string[]
): string | null {
  if (!value) return null;
  if (typeof value !== "object") return String(value);
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (record[key]) return String(record[key]);
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * The task form
 * ------------------------------------------------------------------ */

export type TaskLabel = "personal" | "business";
export type TaskPriority = "low" | "medium" | "high";
export type RecurrenceFreq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export const TASK_LABEL_OPTIONS: { value: TaskLabel; label: string; desc: string }[] = [
  {
    value: "personal",
    label: "Personal",
    desc: "Use this for a personal task that is not tied to business work.",
  },
  {
    value: "business",
    label: "Business",
    desc: "Use this for a business-related task linked to client or project work.",
  },
];

export const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export const FREQ_OPTIONS: { value: RecurrenceFreq; label: string; unit: string }[] = [
  { value: "DAILY", label: "Every day", unit: "day(s)" },
  { value: "WEEKLY", label: "Every week", unit: "week(s)" },
  { value: "MONTHLY", label: "Every month", unit: "month(s)" },
  { value: "YEARLY", label: "Every year", unit: "year(s)" },
];

export const WEEKDAYS = [
  { value: "MO", label: "Mon" },
  { value: "TU", label: "Tue" },
  { value: "WE", label: "Wed" },
  { value: "TH", label: "Thu" },
  { value: "FR", label: "Fri" },
  { value: "SA", label: "Sat" },
  { value: "SU", label: "Sun" },
] as const;

/** Recurring series can't run past 30 days from their start. */
export const RECURRENCE_MAX_DAYS = 30;

export type TaskFormValues = {
  task_id?: string | number | null;
  label: TaskLabel;
  task_name: string;
  stage_id: string;
  task_details: string;
  priority: string;
  start_time: string;
  end_time: string;
  completed_at: string;
  repeat: boolean;
  recurrence_freq: RecurrenceFreq;
  recurrence_interval: string;
  recurrence_byday: string[];
  recurrence_end_type: "count" | "until";
  recurrence_count: string;
  recurrence_until: string;
  client: CalendarContact | null;
  project_id: string;
  job_id: string;
  notes: string;
  is_billable: boolean;
  fixed_amount: string;
};

/** A date as `<input type="datetime-local">` holds it, in local time. */
export function toDateTimeLocalValue(value: unknown): string {
  if (!value) return "";
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return "";
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

function idString(value: unknown): string {
  return value === null || value === undefined || value === "" ? "" : String(value);
}

function taskLabelValue(value: unknown): TaskLabel {
  return value === "business" ? "business" : "personal";
}

function clientFromTask(task: RawCalendarEvent | null | undefined): CalendarContact | null {
  if (!task) return null;
  const contactId = task.contact_id || task.contact?.id || null;
  const clientId = task.client_id || task.client?.id || task.client?.client_id || null;
  if (!contactId && !clientId) return null;
  const name =
    task.contact_name ||
    task.contact?.name ||
    task.client_name ||
    task.client?.name ||
    "";
  return {
    value: String(contactId || clientId),
    label: name,
    email: task.contact?.email || task.client?.email || "",
    client_id: clientId,
    contact_id: contactId,
  };
}

export function getDefaultTaskValues({
  taskData,
  initialDateTime,
  initialStageId,
}: {
  taskData?: RawCalendarEvent | null;
  initialDateTime?: Date | null;
  /** The planner's "add a task to this column" — used when the task has no stage. */
  initialStageId?: string | null;
} = {}): TaskFormValues {
  const now = new Date();
  const startDate =
    initialDateTime ||
    taskData?.startDate ||
    taskData?.start_at ||
    taskData?.start_date ||
    now;
  const endDate =
    initialDateTime && !taskData?.endDate && !taskData?.end_at && !taskData?.end_date
      ? addHours(new Date(initialDateTime), 1)
      : taskData?.endDate ||
        taskData?.end_at ||
        taskData?.end_date ||
        addHours(new Date(startDate), 1);

  const completedAt =
    taskData?.completed_at ||
    taskData?.completedAt ||
    taskData?.completed_date ||
    taskData?.completedDate;

  const stage = taskData?.stage;
  const stageId =
    taskData?.stage_id ||
    (stage && typeof stage === "object" ? stage.id : stage) ||
    "";

  const amount =
    taskData?.amount !== undefined && taskData?.amount !== null
      ? taskData.amount
      : taskData?.fixed_amount;

  return {
    task_id:
      taskData?.task_id === null || taskData?.task_id !== undefined
        ? taskData?.task_id
        : taskData?.id || undefined,
    client: clientFromTask(taskData),
    task_name: taskData?.title || taskData?.task_name || "",
    task_details:
      taskData?.description || taskData?.task_description || taskData?.task_details || "",
    start_time: toDateTimeLocalValue(startDate),
    end_time: toDateTimeLocalValue(endDate),
    completed_at: completedAt ? toDateTimeLocalValue(completedAt) : "",
    project_id: idString(
      taskData?.project_id ||
        (typeof taskData?.project === "object" ? taskData?.project?.id : null),
    ),
    stage_id: idString(stageId) || idString(initialStageId),
    job_id: idString(
      taskData?.project_job_id ||
        taskData?.job_id ||
        (typeof taskData?.job === "object" ? taskData?.job?.id : null),
    ),
    label: taskLabelValue(taskData?.label),
    is_billable: Boolean(taskData?.is_billable),
    notes: taskData?.notes ?? "",
    fixed_amount: amount !== undefined && amount !== null ? String(amount) : "",
    priority: taskData?.priority || "medium",
    repeat: false,
    recurrence_freq: "WEEKLY",
    recurrence_interval: "1",
    recurrence_end_type: "count",
    recurrence_count: "4",
    recurrence_until: "",
    recurrence_byday: [],
  };
}

/** A series being edited — the form says edits touch the parent only. */
export function isRecurringParentTask(task: RawCalendarEvent | null | undefined): boolean {
  return (
    Array.isArray(task?.recurrence) &&
    (task?.recurrence?.length ?? 0) > 0 &&
    !task?.parent_event_id
  );
}

/** Field-level errors, in the same order and wording as ProjectCalendarTaskSchema. */
export function validateTask(
  values: TaskFormValues,
  { creating }: { creating: boolean },
): Partial<Record<keyof TaskFormValues, string>> {
  const errors: Partial<Record<keyof TaskFormValues, string>> = {};
  const valid = (value: string) => Boolean(value) && !Number.isNaN(new Date(value).getTime());

  const name = values.task_name;
  if (name.length < 2) errors.task_name = "Task name must be at least 2 characters.";
  else if (name.length > 40) errors.task_name = "Task name must be at most 40 characters.";

  if (!values.start_time) errors.start_time = "Start date & time is required.";
  else if (!valid(values.start_time)) errors.start_time = "Enter a valid start date & time.";

  if (!values.end_time) errors.end_time = "End date & time is required.";
  else if (!valid(values.end_time)) errors.end_time = "Enter a valid end date & time.";

  if (values.completed_at && !valid(values.completed_at)) {
    errors.completed_at = "Enter a valid completed date & time.";
  }

  if (values.task_id !== null && values.is_billable && !values.client) {
    errors.client = "Client is required";
  }

  if (values.project_id.trim() !== "" && values.job_id.trim() === "") {
    errors.job_id = "Job/Milestone is required when a project is selected.";
  }

  if (values.is_billable && values.fixed_amount.trim() === "") {
    errors.fixed_amount = "Amount is required for billable tasks.";
  }

  if (valid(values.start_time) && valid(values.end_time)) {
    if (new Date(values.start_time) >= new Date(values.end_time)) {
      errors.start_time ??= "Start date & time must be earlier than end date & time.";
      errors.end_time ??= "End date & time must be later than start date & time.";
    }
  }

  if (valid(values.start_time) && valid(values.completed_at)) {
    if (new Date(values.completed_at) < new Date(values.start_time)) {
      errors.completed_at ??=
        "Completed date & time cannot be earlier than start date & time.";
    }
  }

  if (creating && values.repeat && values.recurrence_end_type === "until") {
    if (!values.recurrence_until) {
      errors.recurrence_until = "Please select an end date for the recurring event";
    } else {
      const maxDate = values.start_time ? new Date(values.start_time) : new Date();
      maxDate.setDate(maxDate.getDate() + RECURRENCE_MAX_DAYS);
      if (new Date(values.recurrence_until) > maxDate) {
        errors.recurrence_until =
          "Recurring events cannot exceed 30 days from the start date";
      }
    }
  }

  return errors;
}

/**
 * The task as the API takes it, before it's flattened into FormData. Keys and
 * coercions match AddTask.js exactly — recurrence only on create, only when on.
 */
export function buildTaskPayload(values: TaskFormValues, { creating }: { creating: boolean }) {
  const client = values.client;
  return {
    task_name: values.task_name,
    task_details: values.task_details || "",
    label: values.label || "personal",
    start_date: values.start_time ? new Date(values.start_time).toISOString() : null,
    end_date: values.end_time ? new Date(values.end_time).toISOString() : null,
    completed_at: values.completed_at ? new Date(values.completed_at).toISOString() : null,
    project_id: values.project_id ? Number(values.project_id) : null,
    job_id: values.job_id ? Number(values.job_id) : null,
    stage_id: values.stage_id ? Number(values.stage_id) : null,
    is_billable: Boolean(values.is_billable),
    notes: values.notes || "",
    client_id: client?.client_id ? Number(client.client_id) : null,
    contact_id: client?.contact_id ? Number(client.contact_id) : null,
    amount: values.fixed_amount && values.fixed_amount !== "" ? Number(values.fixed_amount) : null,
    priority: values.priority || "medium",
    ...(creating && values.repeat
      ? {
          recurrence: {
            freq: values.recurrence_freq || "WEEKLY",
            interval:
              Number(values.recurrence_interval) > 1
                ? Number(values.recurrence_interval)
                : undefined,
            ...(values.recurrence_freq === "WEEKLY" && values.recurrence_byday.length > 0
              ? { byday: values.recurrence_byday }
              : {}),
            ...(values.recurrence_end_type === "count"
              ? { count: Number(values.recurrence_count) }
              : { until: values.recurrence_until }),
          },
        }
      : {}),
  };
}

export type TaskPayload = ReturnType<typeof buildTaskPayload>;

/**
 * The fields the task request carries, before encryption: the payload with
 * empty values dropped, exactly the set AddTask.js put in its FormData (so an
 * edit never starts sending `completed_at: null` and clearing something it
 * used to leave alone). Recurrence stays an object — it's JSON inside the
 * encrypted body now, and the backend reads either form.
 */
export function taskRequestFields(payload: TaskPayload): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined || value === "") continue;
    fields[key] = value;
  }
  return fields;
}

/** A saved task, shaped for the calendar until the refetch replaces it. */
export function normalizeSavedTask(
  task: RawCalendarEvent,
  fallback: TaskPayload,
  fallbackUser: CalendarUser,
): CalendarEvent {
  const startAt = task?.start_at || task?.start_date || task?.startDate || fallback.start_date || "";
  const endAt = task?.end_at || task?.end_date || task?.endDate || fallback.end_date || startAt;
  const title = task?.title || task?.task_name || fallback.task_name || "Untitled event";

  return {
    ...task,
    id: String(
      (task?.task_id !== null && task?.task_id !== undefined ? task.task_id : null) ||
        task?.id ||
        Date.now(),
    ),
    task_id: task?.task_id !== undefined ? (task.task_id ?? null) : task?.id || null,
    title,
    displayTitle: title,
    description:
      task?.description || task?.task_description || task?.task_details || fallback.task_details || "",
    task_name: task?.task_name || fallback.task_name || "",
    task_details: task?.task_description || task?.task_details || fallback.task_details || "",
    start_at: startAt,
    end_at: endAt,
    completed_at: task?.completed_at || fallback.completed_at || null,
    startDate: new Date(startAt).toISOString(),
    endDate: new Date(endAt).toISOString(),
    user: (task?.user as CalendarUser) || fallbackUser,
    color: task?.color || "#DBEAFE",
    border_color: task?.border_color || "#1D4ED8",
    project_id: task?.project_id ?? fallback.project_id ?? null,
    stage_id: task?.stage_id ?? fallback.stage_id ?? null,
    job_id: task?.job_id ?? fallback.job_id ?? null,
    label: taskLabelValue(task?.label ?? fallback.label),
    is_billable: Boolean(task?.is_billable ?? fallback.is_billable ?? false),
    amount: task?.amount ?? fallback.amount ?? null,
    notes: task?.notes ?? fallback.notes ?? "",
    priority: task?.priority ?? fallback.priority ?? null,
    client_id: task?.client_id ?? fallback.client_id ?? null,
    contact_id: task?.contact_id ?? fallback.contact_id ?? null,
    is_recurring_parent: false,
    is_occurrence: false,
  };
}

/* ------------------------------------------------------------------ *
 * Google Calendar connection
 * ------------------------------------------------------------------ */

/** The connected calendar's display name — the default one, else the first. */
export function connectedCalendarName(calendars: LinkedCalendar[]): string {
  const defaultCalendar = calendars.find((calendar) => calendar?.is_default) || calendars[0];
  return defaultCalendar
    ? `${getProviderLabel(defaultCalendar.provider)} Calendar`
    : DEFAULT_CALENDAR_NAME;
}
