/**
 * The public booking page — what a guest sees at `/booking/:slug`.
 *
 * Ported from sole-webapp's `pages/booking/[slug].js` and
 * `pages/booking/cancel.js`: the same endpoints, the same fields, the same
 * rules (book from today up to two months out, on the host's available days,
 * in the guest's own timezone). Every call is public — no session, only the
 * API key — and the writes go encrypted, as the booking controller decrypts
 * them with `handlePayload`.
 */
import { addMonths, format, parseISO, startOfDay } from "date-fns";

import apiRoutes from "@/config/api-routes";
import { apiGet, apiPost } from "@/lib/api/client";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { formatDuration, timeLabel, WEEK_DAYS } from "@/lib/booking-links";

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

/** `POST /schedule/appointment/:slug` — the link as a guest sees it. */
export type PublicBookingLink = {
  id: number | string;
  slug: string;
  title: string;
  duration_min?: number | null;
  meeting_type?: string | null;
  location?: string | null;
  meeting_platform?: string | null;
  organizer_timezone?: string | null;
  theme_color?: string | null;
  text_color?: string | null;
  profile_picture?: string | null;
  organizer?: { name?: string | null; profilePic?: string | null } | null;
  availability?: { day_of_week: number; start_time: string; end_time: string }[];
};

/** One open time from `/schedule/public/available-slots/:slug`. */
export type PublicSlot = { start_utc: string; end_utc: string; display: string };

/** `/schedule/public/booking/details/:id` — the booking being rescheduled or cancelled. */
export type PublicBookingDetail = {
  id: number | string;
  name?: string | null;
  email?: string | null;
  message?: string | null;
  guests?: string[] | null;
};

export type GuestDetails = {
  name: string;
  email: string;
  message: string;
  guests: string[];
};

/** What `join-booking` hands back once the slot is taken. */
export type ConfirmedBooking = {
  id: number | string;
  meeting_link: string | null;
  status?: string;
};

/* ------------------------------------------------------------------ *
 * Rules
 * ------------------------------------------------------------------ */

/** Guests can book up to two months ahead, as before. */
export const BOOKING_WINDOW_MONTHS = 2;

export const DEFAULT_THEME = "#4F5DE8";
export const DEFAULT_TEXT = "#FFFFFF";

export function guestTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** `YYYY-MM-DD` in the guest's own calendar. */
export function localDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function lastBookableDay(today: Date = new Date()): Date {
  return startOfDay(addMonths(today, BOOKING_WINDOW_MONTHS));
}

/**
 * Whether a day can be picked: not in the past, not past the booking window,
 * and on one of the host's available weekdays (any day when the link lists
 * none, as the old page allowed).
 */
export function isBookableDay(
  day: Date,
  availability: PublicBookingLink["availability"],
  today: Date = new Date(),
): boolean {
  const start = startOfDay(day);
  if (start < startOfDay(today)) return false;
  if (start > lastBookableDay(today)) return false;
  const days = availability ?? [];
  if (days.length === 0) return true;
  return days.some((slot) => slot.day_of_week === start.getDay());
}

/** Whether the month after `month` still has a bookable day in it. */
export function canGoToNextMonth(month: Date, today: Date = new Date()): boolean {
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  return next <= lastBookableDay(today);
}

export function canGoToPreviousMonth(month: Date, today: Date = new Date()): boolean {
  return (
    month.getFullYear() > today.getFullYear() ||
    (month.getFullYear() === today.getFullYear() && month.getMonth() > today.getMonth())
  );
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** The first problem with the guest's details, or null. */
export function validateGuestDetails(details: GuestDetails): string | null {
  if (!details.name.trim()) return "Please enter your name.";
  if (!details.email.trim()) return "Please enter your email.";
  if (!isValidEmail(details.email)) return "Please enter a valid email address.";
  const bad = details.guests.find((guest) => !isValidEmail(guest));
  if (bad) return `${bad} isn't a valid guest email.`;
  return null;
}

/** Adds a guest email once, trimmed and lowercased; ignores blanks and repeats. */
export function addGuest(guests: string[], value: string): string[] {
  const email = value.trim().toLowerCase();
  if (!email || guests.includes(email)) return guests;
  return [...guests, email];
}

/* ------------------------------------------------------------------ *
 * Display
 * ------------------------------------------------------------------ */

export function hostName(link: PublicBookingLink): string {
  return link.organizer?.name?.trim() || "Your host";
}

export function hostPicture(link: PublicBookingLink): string | null {
  return link.profile_picture || link.organizer?.profilePic || null;
}

export function isInPerson(link: PublicBookingLink): boolean {
  return link.meeting_type === "physical" || link.meeting_type === "in_person";
}

/** "Google Meet", "Video call" or the in-person address. */
export function meetingLabel(link: PublicBookingLink): string {
  if (isInPerson(link)) return link.location || "In person";
  if (link.meeting_platform === "google_meet") return "Google Meet";
  return "Video call";
}

export function durationLabel(link: PublicBookingLink): string {
  return formatDuration(link.duration_min || 30);
}

/** "Mon – Fri, 9:00 AM – 5:00 PM" style summary of when the host takes bookings. */
export function availabilitySummary(link: PublicBookingLink): string[] {
  const rows = [...(link.availability ?? [])].sort((a, b) => a.day_of_week - b.day_of_week);
  return rows.map(
    (row) =>
      `${WEEK_DAYS[row.day_of_week]?.name ?? ""} · ${timeLabel(row.start_time)} – ${timeLabel(row.end_time)}`,
  );
}

/** A safe six-digit hex for the host's colour, or the fallback. */
export function safeHex(value: string | null | undefined, fallback: string): string {
  const color = (value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    return `#${color
      .slice(1)
      .split("")
      .map((c) => c + c)
      .join("")}`.toUpperCase();
  }
  return fallback;
}

/** Lightens (positive) or darkens (negative) a hex by a percentage. */
export function shadeHex(hex: string, percent: number): string {
  const full = safeHex(hex, DEFAULT_THEME).slice(1);
  const amount = Math.round(2.55 * percent);
  const channel = (i: number) =>
    Math.min(255, Math.max(0, parseInt(full.slice(i, i + 2), 16) + amount))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(2)}${channel(4)}`.toUpperCase();
}

/** The host panel's gradient — the old page's, from the host's own colour. */
export function themeGradient(hex: string): string {
  return `linear-gradient(160deg, ${shadeHex(hex, 10)} 0%, ${shadeHex(hex, -12)} 100%)`;
}

/** "Tuesday, October 20" and "9:30 AM – 10:00 AM" for the chosen slot. */
export function slotWhen(slot: PublicSlot): { date: string; time: string } {
  const start = parseISO(slot.start_utc);
  const end = parseISO(slot.end_utc);
  return {
    date: format(start, "EEEE, MMMM d, yyyy"),
    time: `${format(start, "h:mm a")} – ${format(end, "h:mm a")}`,
  };
}

/* ------------------------------------------------------------------ *
 * Payloads
 * ------------------------------------------------------------------ */

/** `join-booking`'s body — the old page's, with `reschedule_id` when moving one. */
export function buildJoinPayload(
  link: PublicBookingLink,
  slot: PublicSlot,
  details: GuestDetails,
  timezone: string,
  rescheduleId?: string | null,
) {
  return {
    booking_link_id: link.id,
    start_utc: slot.start_utc,
    name: details.name.trim(),
    email: details.email.trim(),
    timezone,
    ...(details.guests.length ? { guests: details.guests } : {}),
    ...(details.message.trim() ? { message: details.message.trim() } : {}),
    ...(rescheduleId ? { reschedule_id: rescheduleId } : {}),
  };
}

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

export async function fetchPublicBookingLink(slug: string): Promise<PublicBookingLink> {
  const result = await apiPost<PublicBookingLink>(
    `${apiRoutes.scheduling.get}/${encodeURIComponent(slug)}`,
    buildEncryptedRequestBody({ timezone: guestTimezone(), today_date: localDateKey(new Date()) }),
    { auth: "public" },
  );
  if (!result.success || !result.data?.id) {
    throw new Error("This booking link doesn't exist or is no longer available.");
  }
  return result.data;
}

export async function fetchPublicSlots(
  slug: string,
  date: Date,
  timezone: string,
): Promise<PublicSlot[]> {
  const result = await apiGet<{ available?: boolean; slots?: PublicSlot[] }>(
    `${apiRoutes.scheduling.getSlots}/${encodeURIComponent(slug)}`,
    { auth: "public", params: { date: localDateKey(date), tz: timezone } },
  );
  if (!result.success) throw new Error(result.message || "Couldn't load the open times.");
  return result.data?.available && Array.isArray(result.data.slots) ? result.data.slots : [];
}

export async function fetchPublicBookingDetail(id: string): Promise<PublicBookingDetail> {
  const result = await apiGet<PublicBookingDetail>(
    `${apiRoutes.scheduling.publicBookingDetails}/${encodeURIComponent(id)}`,
    { auth: "public" },
  );
  if (!result.success || !result.data) {
    throw new Error(result.message || "This booking couldn't be found.");
  }
  return result.data;
}

export async function joinBooking(
  payload: ReturnType<typeof buildJoinPayload>,
): Promise<{ booking: ConfirmedBooking; message: string }> {
  const result = await apiPost<ConfirmedBooking>(
    apiRoutes.scheduling.joinSlot,
    buildEncryptedRequestBody(payload),
    { auth: "public" },
  );
  if (!result.success || !result.data) {
    throw new Error(result.message || "We couldn't book that time. Please try another.");
  }
  return { booking: result.data, message: result.message || "Booking confirmed!" };
}

export async function cancelPublicBooking(id: string, reason: string): Promise<void> {
  const result = await apiPost(
    `${apiRoutes.scheduling.cancelBooking}/${encodeURIComponent(id)}`,
    buildEncryptedRequestBody(reason.trim() ? { reason: reason.trim() } : {}),
    { auth: "public" },
  );
  if (!result.success) {
    throw new Error(result.message || "We couldn't cancel this booking.");
  }
}
