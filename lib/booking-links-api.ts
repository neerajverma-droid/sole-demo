/**
 * Booking links — API layer.
 *
 * Every request is sole-webapp's own, read from `components/Scheduling`
 * (index, CreateBookingDrawer, SettingDrawer, EditAppointmentDrawer,
 * SchedulingCalendarView, BookingLinksList): same endpoints, same params,
 * same fields.
 *
 * Every body is encrypted the way the calendar's are —
 * `buildEncryptedRequestBody`: the fields as one AES `data` string, a file
 * raw alongside it. The booking controller decrypts with `handlePayload`,
 * which still accepts the old app's plain bodies.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import {
  buildCreateLinkPayload,
  buildReschedulePayload,
  buildSettingsPayload,
  buildUpdateLinkPayload,
  linkFormFromDetail,
  monthRange,
  normalizeSettings,
  type AvailableSlot,
  type BookingDetail,
  type BookingLinkForm,
  type BookingLinkPage,
  type BookingSettings,
  type RawBookingEvent,
  type TimezoneOption,
} from "@/lib/booking-links";

type ApiEnvelope<T> = { success?: boolean; status?: boolean; message?: string; data?: T };

function ensureSuccess<T>(body: ApiEnvelope<T> | undefined, fallback: string): ApiEnvelope<T> {
  if (!body?.success && !body?.status) {
    throw new Error(body?.message || fallback);
  }
  return body;
}

/* ------------------------------------------------------------------ *
 * Links
 * ------------------------------------------------------------------ */

export const LINKS_PAGE_SIZE = 10;

export async function fetchBookingLinks(page: number): Promise<BookingLinkPage> {
  const res = await api.get<
    ApiEnvelope<{ records?: BookingLinkPage["records"]; total?: number; hasMore?: boolean }>
  >(apiRoutes.scheduling.list, { params: { page, limit: LINKS_PAGE_SIZE } });
  const data = res.data?.data;
  return {
    records: Array.isArray(data?.records) ? data.records : [],
    total: Number(data?.total ?? 0),
    page,
    hasMore: Boolean(data?.hasMore),
  };
}

export async function fetchBookingLinkForm(
  id: string | number,
  fallbackTimezone: string,
): Promise<BookingLinkForm> {
  const res = await api.get<ApiEnvelope<Record<string, unknown>>>(
    `${apiRoutes.scheduling.detailBooking}/${id}`,
  );
  const body = ensureSuccess(res.data, "Failed to load booking details");
  if (!body.data) throw new Error("Failed to load booking details");
  return linkFormFromDetail(body.data, fallbackTimezone);
}

/** `{ available, message }` — the old drawer checked on blur; this checks as you type. */
export async function checkSlugAvailability(
  slug: string,
  signal?: AbortSignal,
): Promise<{ available: boolean; message: string }> {
  const res = await api.post<ApiEnvelope<{ available?: boolean; message?: string }>>(
    apiRoutes.scheduling.checkSlug + encodeURIComponent(slug),
    undefined,
    { signal },
  );
  const available = res.data?.data?.available === true;
  return {
    available,
    message:
      res.data?.data?.message ||
      (available ? "This booking link is available" : "This booking link is taken"),
  };
}

export async function createBookingLink(form: BookingLinkForm): Promise<void> {
  const res = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.scheduling.create,
    buildEncryptedRequestBody(buildCreateLinkPayload(form)),
  );
  ensureSuccess(res.data, "Failed to save booking link");
}

export async function updateBookingLink(id: string | number, form: BookingLinkForm): Promise<void> {
  const res = await api.put<ApiEnvelope<unknown>>(
    apiRoutes.scheduling.update,
    buildEncryptedRequestBody(buildUpdateLinkPayload(id, form)),
  );
  ensureSuccess(res.data, "Failed to save booking link");
}

export async function deleteBookingLink(id: string | number): Promise<void> {
  const res = await api.delete<ApiEnvelope<unknown>>(`${apiRoutes.scheduling.delete}/${id}`);
  if (!(res.data?.success || res.status === 200 || res.status === 204)) {
    throw new Error(res.data?.message || "Failed to remove booking link");
  }
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

export async function fetchBookingSettings(): Promise<BookingSettings> {
  const res = await api.get<ApiEnvelope<Record<string, unknown>>>(apiRoutes.scheduling.getSetting);
  return normalizeSettings(res.data?.data || (res.data as Record<string, unknown>) || {});
}

export async function saveBookingSettings(settings: BookingSettings): Promise<void> {
  const res = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.scheduling.setSetting,
    buildEncryptedRequestBody(buildSettingsPayload(settings)),
  );
  ensureSuccess(res.data, "Failed to save settings");
}

/** Returns the stored picture's URL. */
export async function uploadBookingProfilePicture(file: File): Promise<string> {
  const res = await api.post<
    ApiEnvelope<{ profile_picture?: string; profilePicture?: string; profile_pic?: string }>
  >(apiRoutes.scheduling.uploadProfilePicture, buildEncryptedRequestBody({}, { profile_pic: file }));
  const data = res.data?.data;
  const url = data?.profile_picture || data?.profilePicture || data?.profile_pic || "";
  if (!url) throw new Error(res.data?.message || "Upload succeeded but no image was returned");
  return url;
}

export async function fetchTimezones(): Promise<TimezoneOption[]> {
  const res = await api.get<ApiEnvelope<TimezoneOption[]>>(apiRoutes.scheduling.timeZoneList);
  return Array.isArray(res.data?.data) ? res.data.data : [];
}

/* ------------------------------------------------------------------ *
 * Bookings
 * ------------------------------------------------------------------ */

async function fetchBookingEventsBetween(range: {
  start_date: string;
  end_date: string;
}): Promise<RawBookingEvent[]> {
  const res = await api.get<ApiEnvelope<RawBookingEvent[]>>(apiRoutes.scheduling.calendarEvents, {
    params: range,
  });
  return Array.isArray(res.data?.data) ? res.data.data : [];
}

export function fetchMonthBookings(month: Date): Promise<RawBookingEvent[]> {
  return fetchBookingEventsBetween(monthRange(month));
}

export async function fetchBookingDetail(bookingId: string | number): Promise<BookingDetail> {
  const res = await api.get<ApiEnvelope<BookingDetail>>(
    `${apiRoutes.scheduling.getBookingDetails}/${bookingId}`,
  );
  const body = ensureSuccess(res.data, "Failed to load booking details");
  if (!body.data) throw new Error("Failed to load booking details");
  return body.data;
}

/** The slots open on a day for the booking's own link — what a reschedule may pick. */
export async function fetchAvailableSlots(
  slug: string,
  date: string,
  timezone: string,
): Promise<AvailableSlot[]> {
  const res = await api.get<ApiEnvelope<{ slots?: AvailableSlot[] }>>(
    `${apiRoutes.scheduling.getSlots}/${encodeURIComponent(slug)}`,
    { params: { date, tz: timezone } },
  );
  const slots = res.data?.data?.slots;
  return Array.isArray(slots) ? slots : [];
}

export async function rescheduleBooking(
  detail: BookingDetail,
  slot: { start_utc: string; end_utc: string },
): Promise<void> {
  const res = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.scheduling.updateBooking,
    buildEncryptedRequestBody(buildReschedulePayload(detail, slot)),
  );
  ensureSuccess(res.data, "Failed to reschedule booking");
}

/** A booking dragged to another day on the calendar. */
export async function moveBooking(
  bookingId: string | number,
  range: { start_date: string; end_date: string },
): Promise<void> {
  const res = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.scheduling.rescheduleDragDrop,
    buildEncryptedRequestBody({ booking_id: bookingId, ...range }),
  );
  ensureSuccess(res.data, "Failed to reschedule booking");
}

export async function cancelBooking(bookingId: string | number, reason: string): Promise<void> {
  const res = await api.post<ApiEnvelope<unknown>>(
    `${apiRoutes.scheduling.cancelBooking}/${bookingId}`,
    buildEncryptedRequestBody({ reason: reason.trim() || "Cancelled by host" }),
  );
  ensureSuccess(res.data, "Failed to cancel booking");
}
