/**
 * Booking links — types and pure helpers.
 *
 * The shapes are sole-webapp's own (`components/Scheduling`): the
 * `/schedule/*` endpoints, the same fields, the same defaults. The booking
 * calendar here is its own thing — month only, bookings only — and doesn't
 * share the `/calendar` module's events or task form.
 */
import {
  addDays,
  differenceInMinutes,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

/** A row of `/schedule/booking-list`. `meeting_type` arrives as a label. */
export type BookingLinkRow = {
  id: number | string;
  slug: string;
  title: string;
  duration_min?: number | null;
  meeting_type?: string | null;
  scheduled_days?: string[];
  is_active?: boolean;
  booked_count?: number;
};

export type BookingLinkPage = {
  records: BookingLinkRow[];
  total: number;
  page: number;
  hasMore: boolean;
};

/** One day's window, in the organiser's own timezone. `HH:mm:ss`. */
export type AvailabilitySlot = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_overnight?: boolean;
};

export type MeetingType = "online" | "in_person";
export type MeetingPlatform = "google_meet" | "other";

/** What the create / edit wizard edits — `/schedule/edit/:id`'s shape. */
export type BookingLinkForm = {
  slug: string;
  title: string;
  duration_min: number;
  buffer_after_minutes: number;
  meeting_type: MeetingType;
  meeting_platform: MeetingPlatform | null;
  meeting_url: string;
  location: string;
  calendar_id: string;
  intro_text: string;
  timezone: string;
  availability: AvailabilitySlot[];
};

export type BookingSettings = {
  default_duration_min: number;
  default_buffer_after_minutes: number;
  timezone: string;
  theme_color: string;
  text_color: string;
  profile_picture: string;
  availability: AvailabilitySlot[];
};

export type TimezoneOption = { value: string; label: string };

export type BookingAttendee = {
  name?: string | null;
  email?: string | null;
  is_primary?: boolean;
};

/** A row of `/schedule/calendar-events` — one booking on the calendar. */
export type RawBookingEvent = {
  id: number | string;
  booking_id?: number | string | null;
  title?: string | null;
  startDate: string;
  endDate: string;
  description?: string | null;
  location?: string | null;
  meeting_link?: string | null;
  status?: string | null;
  attendees?: BookingAttendee[] | null;
  time_zone?: string | null;
  source?: string | null;
  calendar_event_id?: string | null;
};

export type BookingEvent = {
  /** The calendar event's id — the key on the grid. */
  key: string;
  /** The booking's own id — what update, reschedule and cancel act on. */
  bookingId: string | null;
  title: string;
  linkTitle: string;
  guestName: string;
  guestEmail: string;
  start: string;
  end: string;
  durationMin: number;
  meetingLink: string;
  location: string;
  description: string;
  timeZone: string;
  pending: boolean;
  raw: RawBookingEvent;
};

/** `/schedule/booking-details/:id` — what the reschedule has to send back. */
export type BookingDetail = {
  id: number | string;
  name: string;
  email: string;
  notes: string;
  start_date: string;
  end_date: string;
  guest_timezone: string;
  attendees: string[];
  booking_link?: { id?: number | string; slug?: string; title?: string; duration?: number };
};

export type AvailableSlot = { start_utc: string; end_utc: string; display: string };

export type BookingStatus = "upcoming" | "past";

/* ------------------------------------------------------------------ *
 * Options
 * ------------------------------------------------------------------ */

export const DURATION_OPTIONS: { value: number; label: string }[] = [
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 45, label: "45 minutes" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
];

export const PRESET_BUFFERS = [5, 10, 15, 30];

export const SETTINGS_BUFFER_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "No buffer" },
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
];

export const WEEK_DAYS = [
  { id: 0, short: "Su", name: "Sunday" },
  { id: 1, short: "Mo", name: "Monday" },
  { id: 2, short: "Tu", name: "Tuesday" },
  { id: 3, short: "We", name: "Wednesday" },
  { id: 4, short: "Th", name: "Thursday" },
  { id: 5, short: "Fr", name: "Friday" },
  { id: 6, short: "Sa", name: "Saturday" },
] as const;

/** The old customiser's presets; "custom" is whatever the rows say. */
export const TIME_PRESETS = [
  { id: "office", label: "9:00 AM – 5:00 PM (office hours)", start: "09:00:00", end: "17:00:00" },
  { id: "mornings", label: "8:00 AM – 12:00 PM (mornings)", start: "08:00:00", end: "12:00:00" },
  { id: "afternoons", label: "1:00 PM – 5:00 PM (afternoons)", start: "13:00:00", end: "17:00:00" },
  { id: "evenings", label: "6:00 PM – 10:00 PM (evenings)", start: "18:00:00", end: "22:00:00" },
] as const;

export const CUSTOM_PRESET = "custom";

export const DEFAULT_THEME_COLOR = "#4F5DE8";
export const DEFAULT_TEXT_COLOR = "#FFFFFF";

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return "30 minutes";
  const option = DURATION_OPTIONS.find((item) => item.value === minutes);
  if (option) return option.label;
  if (minutes % 60 === 0) return `${minutes / 60} hours`;
  return `${minutes} minutes`;
}

/** `HH:mm[:ss]` → `9:00 AM`. */
export function timeLabel(value: string): string {
  const [h = "0", m = "00"] = value.split(":");
  const hour = Number(h);
  const suffix = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${m.padStart(2, "0")} ${suffix}`;
}

/** Every half hour of the day, `HH:mm:ss` — the availability time pickers. */
export function timeOptions(include?: string): string[] {
  const out: string[] = [];
  for (let h = 0; h < 24; h += 1) {
    for (const m of [0, 30]) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
    }
  }
  const normalized = include ? normalizeTime(include) : "";
  if (normalized && !out.includes(normalized)) {
    out.push(normalized);
    out.sort();
  }
  return out;
}

/** `9:00` / `09:00` / `09:00:00` → `09:00:00`. */
export function normalizeTime(value: string): string {
  const [h = "0", m = "0", s = "0"] = String(value || "").split(":");
  return [h, m, s].map((part) => String(Number(part) || 0).padStart(2, "0")).join(":");
}

/** Lowercase letters, numbers and single hyphens — what a slug may be. */
export function slugify(value: string): string {
  return (value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function isValidSlug(value: string): boolean {
  return /^[a-zA-Z0-9-]+$/.test(value);
}

/** The backend only takes a six-digit hex for the theme colour. */
export function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test((value || "").trim());
}

/**
 * Where public booking pages live: this app's own `/booking/:slug`, so a
 * copied link opens on the domain the host is using. The configured URL is
 * the fallback where there's no browser (tests, the server).
 */
export function bookingBaseUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return (process.env.NEXT_PUBLIC_REDIRECT_URL || "").trim().replace(/\/+$/, "");
}

export function bookingUrl(slug: string): string {
  return `${bookingBaseUrl()}/booking/${slug}`;
}

/** The URL prefix shown in front of the slug field, without the protocol. */
export function bookingUrlPrefix(): string {
  return `${bookingBaseUrl().replace(/^https?:\/\//, "")}/booking/`;
}

export function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

/* ------------------------------------------------------------------ *
 * Google Meet
 * ------------------------------------------------------------------ */

type CalendarLike = { id: string | number; provider?: string; is_default?: boolean };

/**
 * The calendars a Google Meet link can use. The backend generates the Meet
 * link itself when a guest books — it creates the event on the host's Google
 * calendar with conference data — so a Meet link only stores which Google
 * calendar, and refuses any other provider.
 */
export function googleCalendars<T extends CalendarLike>(calendars: T[]): T[] {
  return calendars.filter((calendar) => (calendar.provider || "").toLowerCase() === "google");
}

/** The default Google calendar, else the first one; "" when none is connected. */
export function defaultGoogleCalendarId(calendars: CalendarLike[]): string {
  const google = googleCalendars(calendars);
  const preferred = google.find((calendar) => calendar.is_default) || google[0];
  return preferred ? String(preferred.id) : "";
}

export function isGoogleMeetLink(url: string | null | undefined): boolean {
  return /^https?:\/\/meet\.google\.com\//i.test(url || "");
}

/* ------------------------------------------------------------------ *
 * Availability
 * ------------------------------------------------------------------ */

export function defaultAvailability(): AvailabilitySlot[] {
  return [1, 2, 3, 4, 5].map((day) => ({
    day_of_week: day,
    start_time: "09:00:00",
    end_time: "17:00:00",
  }));
}

export function sortAvailability(slots: AvailabilitySlot[]): AvailabilitySlot[] {
  return [...slots].sort((a, b) => a.day_of_week - b.day_of_week);
}

/** Which preset every row matches, or custom when they differ. */
export function detectPreset(slots: AvailabilitySlot[]): string {
  if (slots.length === 0) return TIME_PRESETS[0].id;
  const first = slots[0];
  const uniform = slots.every(
    (slot) =>
      normalizeTime(slot.start_time) === normalizeTime(first.start_time) &&
      normalizeTime(slot.end_time) === normalizeTime(first.end_time),
  );
  if (!uniform) return CUSTOM_PRESET;
  const preset = TIME_PRESETS.find(
    (item) =>
      item.start === normalizeTime(first.start_time) && item.end === normalizeTime(first.end_time),
  );
  return preset?.id ?? CUSTOM_PRESET;
}

/** Turns a day on (with the preset's hours, or the last row's) or off. */
export function toggleAvailabilityDay(
  slots: AvailabilitySlot[],
  day: number,
  presetId: string,
): AvailabilitySlot[] {
  if (slots.some((slot) => slot.day_of_week === day)) {
    return slots.filter((slot) => slot.day_of_week !== day);
  }
  const preset = TIME_PRESETS.find((item) => item.id === presetId);
  const template = slots[slots.length - 1];
  const start = preset?.start ?? normalizeTime(template?.start_time || "09:00");
  const end = preset?.end ?? normalizeTime(template?.end_time || "17:00");
  return sortAvailability([...slots, { day_of_week: day, start_time: start, end_time: end }]);
}

export function applyPreset(slots: AvailabilitySlot[], presetId: string): AvailabilitySlot[] {
  const preset = TIME_PRESETS.find((item) => item.id === presetId);
  if (!preset) return slots;
  return slots.map((slot) => ({ ...slot, start_time: preset.start, end_time: preset.end }));
}

/** A day whose window ends before (or when) it starts, other than overnight. */
export function invalidAvailabilityDays(slots: AvailabilitySlot[]): number[] {
  return slots
    .filter(
      (slot) =>
        !slot.is_overnight && normalizeTime(slot.end_time) <= normalizeTime(slot.start_time),
    )
    .map((slot) => slot.day_of_week);
}

/** Settings' `availableDays` rows, trimmed to the fields a save sends back. */
export function toAvailability(rows: unknown): AvailabilitySlot[] {
  if (!Array.isArray(rows)) return [];
  return sortAvailability(
    rows
      .filter((row) => row && Number.isFinite(Number(row.day_of_week)))
      .map((row) => ({
        day_of_week: Number(row.day_of_week),
        start_time: normalizeTime(row.start_time || "09:00"),
        end_time: normalizeTime(row.end_time || "17:00"),
        ...(row.is_overnight ? { is_overnight: true } : {}),
      })),
  );
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** `/schedule/settings` as the old app normalised it, with its defaults. */
export function normalizeSettings(payload: Record<string, unknown> | null | undefined): BookingSettings {
  const p = payload || {};
  const str = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    default_duration_min: Number(p.default_duration_min ?? 30) || 30,
    default_buffer_after_minutes: Number(p.default_buffer_after_minutes ?? 10),
    timezone: str(p.timezone) || browserTimezone(),
    theme_color: str(p.theme_color) || str(p.themeColor) || DEFAULT_THEME_COLOR,
    text_color: str(p.text_color) || DEFAULT_TEXT_COLOR,
    profile_picture: str(p.profile_picture) || str(p.profilePicture) || "",
    availability: toAvailability(p.availableDays ?? p.availability),
  };
}

/** The body `/schedule/settings` saves. */
export function buildSettingsPayload(settings: BookingSettings) {
  return {
    timezone: settings.timezone,
    default_duration_min: settings.default_duration_min,
    default_buffer_after_minutes: settings.default_buffer_after_minutes,
    availability: sortAvailability(settings.availability).map(({ day_of_week, start_time, end_time }) => ({
      day_of_week,
      start_time: normalizeTime(start_time),
      end_time: normalizeTime(end_time),
    })),
    theme_color: settings.theme_color.trim(),
    text_color: settings.text_color.trim(),
    profile_picture: settings.profile_picture.trim(),
  };
}

export function validateSettings(settings: BookingSettings): string | null {
  if (!settings.availability.length) return "Please select at least one available day.";
  if (invalidAvailabilityDays(settings.availability).length) {
    return "Each day's end time needs to be after its start time.";
  }
  if (!isValidHexColor(settings.theme_color)) {
    return "Please enter a valid theme colour (e.g. #4F5DE8).";
  }
  if (settings.text_color && !isValidHexColor(settings.text_color)) {
    return "Please enter a valid text colour (e.g. #FFFFFF).";
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * The link form
 * ------------------------------------------------------------------ */

export function emptyLinkForm(settings?: BookingSettings | null): BookingLinkForm {
  return {
    slug: "",
    title: "",
    duration_min: settings?.default_duration_min || 30,
    buffer_after_minutes: settings?.default_buffer_after_minutes ?? 10,
    meeting_type: "online",
    meeting_platform: "google_meet",
    meeting_url: "",
    location: "",
    calendar_id: "",
    intro_text: "",
    timezone: settings?.timezone || browserTimezone(),
    availability: settings?.availability.length ? settings.availability : defaultAvailability(),
  };
}

/** `/schedule/edit/:id` into the form. */
export function linkFormFromDetail(detail: Record<string, unknown>, fallbackTimezone: string): BookingLinkForm {
  const meetingType: MeetingType = detail.meeting_type === "in_person" ? "in_person" : "online";
  const platform: MeetingPlatform | null =
    meetingType === "online" ? (detail.meeting_platform === "other" ? "other" : "google_meet") : null;
  return {
    slug: String(detail.slug ?? ""),
    title: String(detail.title ?? ""),
    duration_min: Number(detail.duration_min) || 30,
    buffer_after_minutes: Number(detail.buffer_after_minutes ?? 0),
    meeting_type: meetingType,
    meeting_platform: platform,
    meeting_url: String(detail.meeting_url ?? ""),
    location: String(detail.location ?? ""),
    calendar_id: detail.calendar_id ? String(detail.calendar_id) : "",
    intro_text: String(detail.intro_text ?? ""),
    timezone: String(detail.timezone || fallbackTimezone),
    availability: toAvailability(detail.availability),
  };
}

/** The wizard's "Where does it happen?" choice, read off the form. */
export type MeetingWhere = "google_meet" | "video_link" | "in_person";

export function meetingWhere(form: BookingLinkForm): MeetingWhere {
  if (form.meeting_type === "in_person") return "in_person";
  return form.meeting_platform === "other" ? "video_link" : "google_meet";
}

/**
 * Switches where a meeting happens. Choosing Google Meet also moves the
 * calendar onto a Google one — the backend makes the Meet link there — unless
 * a Google calendar is already picked.
 */
export function applyMeetingWhere(
  form: BookingLinkForm,
  where: MeetingWhere,
  calendars: CalendarLike[],
): BookingLinkForm {
  const meeting_type: MeetingType = where === "in_person" ? "in_person" : "online";
  const meeting_platform: MeetingPlatform | null =
    where === "in_person" ? null : where === "video_link" ? "other" : "google_meet";
  const keepsCalendar =
    where !== "google_meet" ||
    googleCalendars(calendars).some((calendar) => String(calendar.id) === form.calendar_id);
  const calendar_id = keepsCalendar ? form.calendar_id : defaultGoogleCalendarId(calendars);
  return { ...form, meeting_type, meeting_platform, calendar_id };
}

export type LinkStep = 1 | 2 | 3;

/** The first problem with a step, in the old drawer's words. */
export function validateLinkStep(
  form: BookingLinkForm,
  step: LinkStep,
  options: { checkSlug?: boolean; slugAvailable?: boolean } = {},
): string | null {
  if (step === 1) {
    if (!form.title.trim()) return "Please enter a booking title.";
    if (!form.slug.trim()) return "Please enter a booking link.";
    if (!isValidSlug(form.slug.trim())) return "Use only letters, numbers and hyphens in the link.";
    if (options.checkSlug && !options.slugAvailable) return "Please use an available booking link.";
    if (!form.duration_min) return "Duration must be greater than 0 minutes.";
  }
  if (step === 2) {
    if (form.meeting_type === "online" && form.meeting_platform === "other" && !form.meeting_url.trim()) {
      return "Please enter a meeting URL.";
    }
    if (form.meeting_type === "in_person" && !form.location.trim()) {
      return "Please enter a location for in-person meetings.";
    }
    if (form.meeting_type === "online" && form.meeting_platform === "google_meet" && !form.calendar_id) {
      return "A calendar is required to generate Google Meet links.";
    }
  }
  if (step === 3) {
    if (!form.availability.length) return "Please select at least one available day.";
    if (invalidAvailabilityDays(form.availability).length) {
      return "Each day's end time needs to be after its start time.";
    }
  }
  return null;
}

export function validateLinkForm(
  form: BookingLinkForm,
  options: { checkSlug?: boolean; slugAvailable?: boolean } = {},
): { step: LinkStep; message: string } | null {
  for (const step of [1, 2, 3] as const) {
    const message = validateLinkStep(form, step, options);
    if (message) return { step, message };
  }
  return null;
}

function linkFields(form: BookingLinkForm) {
  const online = form.meeting_type === "online";
  return {
    title: form.title.trim(),
    duration_min: form.duration_min,
    buffer_after_minutes: form.buffer_after_minutes,
    meeting_type: form.meeting_type,
    meeting_platform: online ? form.meeting_platform || "google_meet" : null,
    meeting_url: online && form.meeting_platform === "other" ? form.meeting_url.trim() : "",
    location: form.meeting_type === "in_person" ? form.location.trim() || null : null,
    calendar_id: form.calendar_id ? Number(form.calendar_id) || form.calendar_id : "",
    intro_text: form.intro_text,
    timezone: form.timezone,
    availability: sortAvailability(form.availability).map((slot) => ({
      day_of_week: slot.day_of_week,
      start_time: normalizeTime(slot.start_time),
      end_time: normalizeTime(slot.end_time),
      ...(slot.is_overnight ? { is_overnight: true } : {}),
    })),
  };
}

/** `/schedule/create-complete`. */
export function buildCreateLinkPayload(form: BookingLinkForm) {
  return { slug: form.slug.trim(), ...linkFields(form) };
}

/** `/schedule/update` — the slug can't change once a link exists. */
export function buildUpdateLinkPayload(id: string | number, form: BookingLinkForm) {
  return { booking_link_id: id, ...linkFields(form) };
}

/* ------------------------------------------------------------------ *
 * Bookings
 * ------------------------------------------------------------------ */

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = parseISO(value);
  return isValid(date) ? date : null;
}

/**
 * Calendar events into bookings: one per booking (the old screen's
 * dedupe — by booking, by Google event, by title and start), with the guest
 * and the link pulled out of the attendees and the `Link: Guest` title.
 */
export function normalizeBookingEvents(rows: RawBookingEvent[] | null | undefined): BookingEvent[] {
  const seenIds = new Set<string>();
  const seenGoogle = new Set<string>();
  const seenComposite = new Set<string>();
  const out: BookingEvent[] = [];

  for (const row of rows || []) {
    const start = parseDate(row.startDate);
    const end = parseDate(row.endDate) ?? start;
    if (!start || !end) continue;
    if (row.status === "cancelled") continue;

    const id = String(row.booking_id ?? row.id ?? "");
    const composite = `${row.title ?? ""}-${row.startDate}`;
    if (id && seenIds.has(id)) continue;
    if (row.calendar_event_id && seenGoogle.has(row.calendar_event_id)) continue;
    if (seenComposite.has(composite)) continue;
    if (id) seenIds.add(id);
    if (row.calendar_event_id) seenGoogle.add(row.calendar_event_id);
    seenComposite.add(composite);

    const attendees = Array.isArray(row.attendees) ? row.attendees : [];
    const guest = attendees.find((attendee) => attendee?.is_primary) || attendees[0] || {};
    const title = (row.title || "Booking").trim();
    const separator = title.lastIndexOf(": ");
    const linkTitle = separator > 0 ? title.slice(0, separator) : title;
    const titleGuest = separator > 0 ? title.slice(separator + 2) : "";

    out.push({
      key: String(row.id),
      bookingId: row.booking_id != null && row.booking_id !== "" ? String(row.booking_id) : null,
      title,
      linkTitle,
      guestName: guest.name || titleGuest || guest.email || "Guest",
      guestEmail: guest.email || "",
      start: start.toISOString(),
      end: end.toISOString(),
      durationMin: Math.max(differenceInMinutes(end, start), 0),
      meetingLink: row.meeting_link || "",
      location: row.location || "",
      description: row.description || "",
      timeZone: row.time_zone || "",
      pending: row.status === "pending",
      raw: row,
    });
  }

  return out.sort((a, b) => a.start.localeCompare(b.start));
}

export function bookingStatus(event: BookingEvent, now: Date = new Date()): BookingStatus {
  return parseISO(event.start).getTime() >= now.getTime() ? "upcoming" : "past";
}

export function bookingsOnDay(events: BookingEvent[], day: Date): BookingEvent[] {
  return events.filter((event) => isSameDay(parseISO(event.start), day));
}

export function bookingsInMonth(events: BookingEvent[], month: Date): BookingEvent[] {
  const from = startOfMonth(month).getTime();
  const to = endOfMonth(month).getTime();
  return events.filter((event) => {
    const time = parseISO(event.start).getTime();
    return time >= from && time <= to;
  });
}

/** `Mon, Oct 12 · 9:30 AM` style pieces. */
export function bookingWhen(event: BookingEvent): { day: string; time: string; long: string } {
  const start = parseISO(event.start);
  const end = parseISO(event.end);
  return {
    day: format(start, "EEE, MMM d"),
    time: `${format(start, "h:mm a")} · ${formatDuration(event.durationMin)}`,
    long: `${format(start, "EEEE, MMM d")} · ${format(start, "h:mm a")} – ${format(end, "h:mm a")}`,
  };
}

/* ------------------------------------------------------------------ *
 * The month grid
 * ------------------------------------------------------------------ */

export type MonthCell = { date: Date; currentMonth: boolean };

/** Whole weeks, Sunday first, covering the month. */
export function monthCells(month: Date): MonthCell[] {
  const first = startOfWeek(startOfMonth(month));
  const last = endOfWeek(endOfMonth(month));
  const cells: MonthCell[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) {
    cells.push({ date: day, currentMonth: day.getMonth() === month.getMonth() });
  }
  return cells;
}

/** The calendar's request: the visible grid, padded to whole weeks. */
export function monthRange(month: Date): { start_date: string; end_date: string } {
  const start = startOfDay(startOfWeek(startOfMonth(month)));
  const end = endOfWeek(endOfMonth(month));
  end.setHours(23, 59, 59, 999);
  return { start_date: start.toISOString(), end_date: end.toISOString() };
}

/** A booking dropped on another day keeps its time of day and length. */
export function movedBooking(event: BookingEvent, day: Date): { start_date: string; end_date: string } {
  const start = parseISO(event.start);
  const end = parseISO(event.end);
  const moved = new Date(day);
  moved.setHours(start.getHours(), start.getMinutes(), 0, 0);
  const movedEnd = new Date(moved.getTime() + (end.getTime() - start.getTime()));
  return { start_date: moved.toISOString(), end_date: movedEnd.toISOString() };
}

/**
 * `/schedule/update-booking` replaces the attendees outright, so a
 * reschedule sends the guest and everyone else back with the new time.
 */
export function buildReschedulePayload(detail: BookingDetail, slot: { start_utc: string; end_utc: string }) {
  return {
    booking_id: detail.id,
    name: detail.name,
    email: detail.email,
    guests: detail.attendees || [],
    message: detail.notes || "",
    start_date: new Date(slot.start_utc).toISOString(),
    end_date: new Date(slot.end_utc).toISOString(),
    guest_timezone: detail.guest_timezone || "UTC",
  };
}
