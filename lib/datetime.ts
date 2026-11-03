/**
 * Event timestamps from the API, shown in the business's own timezone.
 *
 * The one rule for history/activity times across quotes and invoices:
 *
 *  - The database stores instants in UTC, and the API returns them as ISO-8601
 *    with a zone designator (`2026-10-07T00:12:00.000Z`) — an exact moment, not
 *    a wall-clock reading in whatever zone the server happens to run in.
 *  - The frontend converts exactly once, here, into the active business's IANA
 *    timezone (`Australia/Sydney`, from its country), falling back to the
 *    browser's zone when the business has none recorded.
 *  - Date-only values (`YYYY-MM-DD` — a payment date, a due date) are calendar
 *    days, not instants. They are never shifted and never given a time.
 *
 * Older API builds sent a naive `YYYY-MM-DD HH:mm:ss` in the server's local
 * time. That carries no zone, so it can't be converted correctly; it is read
 * as browser-local wall time, exactly as before, until those builds are gone.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar date with no time — never converted between zones. */
export function isDateOnlyValue(value: string | null | undefined): boolean {
  return !!value && DATE_ONLY.test(value.trim());
}

/** The exact moment an API timestamp names, or null for a blank, date-only or unreadable value. */
export function parseApiInstant(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || DATE_ONLY.test(trimmed)) return null;
  const parsed = new Date(
    trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T"),
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: string;
  minute: string;
  dayPeriod: string;
};

function formatterFor(timeZone: string | undefined): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  try {
    return new Intl.DateTimeFormat("en-AU", { ...options, timeZone });
  } catch {
    // An unrecognised zone name — show browser time rather than nothing.
    return new Intl.DateTimeFormat("en-AU", options);
  }
}

function zonedParts(date: Date, timeZone: string | undefined): ZonedParts {
  const parts: Record<string, string> = {};
  for (const part of formatterFor(timeZone || undefined).formatToParts(date)) {
    parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: parts.hour ?? "",
    minute: parts.minute ?? "",
    dayPeriod: (parts.dayPeriod ?? "").toLowerCase(),
  };
}

function dayLabel(year: number, month: number, day: number, shortYear: boolean): string {
  const yearText = shortYear ? String(year).slice(-2) : String(year);
  return `${String(day).padStart(2, "0")} ${MONTHS[month - 1]} ${yearText}`;
}

export type EventDateTimeStyle =
  /** `07 Oct 2026 · 9:12 am` — the quote timeline's format. */
  | "dot"
  /** `07 Oct 26, 9:12 am` — the invoice timeline's format. */
  | "compact";

/**
 * An API timestamp as a date and time in `timeZone` (the business's zone).
 * A date-only value comes back as just the date; a blank or unreadable one
 * as `fallback`.
 */
export function formatEventDateTime(
  value: string | null | undefined,
  {
    timeZone,
    style = "dot",
    fallback = "—",
  }: { timeZone?: string; style?: EventDateTimeStyle; fallback?: string } = {},
): string {
  const shortYear = style === "compact";

  if (isDateOnlyValue(value)) {
    const [year, month, day] = (value as string).trim().split("-").map(Number);
    return dayLabel(year, month, day, shortYear);
  }

  const instant = parseApiInstant(value);
  if (!instant) return fallback;

  const parts = zonedParts(instant, timeZone);
  const date = dayLabel(parts.year, parts.month, parts.day, shortYear);
  const time = `${parts.hour}:${parts.minute} ${parts.dayPeriod}`.trim();
  return style === "compact" ? `${date}, ${time}` : `${date} · ${time}`;
}
