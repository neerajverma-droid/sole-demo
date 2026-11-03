/**
 * Booking links' API surface, request by request, against sole-webapp's own
 * `components/Scheduling` calls — the same endpoints, params and fields, now
 * inside the encrypted `{ data }` envelope the booking controller decrypts
 * with `handlePayload`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";
import { emptyLinkForm, normalizeSettings } from "@/lib/booking-links";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const {
  fetchBookingLinks,
  fetchBookingLinkForm,
  checkSlugAvailability,
  createBookingLink,
  updateBookingLink,
  deleteBookingLink,
  fetchBookingSettings,
  saveBookingSettings,
  uploadBookingProfilePicture,
  fetchTimezones,
  fetchMonthBookings,
  fetchBookingDetail,
  fetchAvailableSlots,
  rescheduleBooking,
  moveBooking,
  cancelBooking,
} = await import("@/lib/booking-links-api");

beforeEach(() => {
  vi.resetAllMocks();
});

function decryptedFields(body: unknown): Record<string, unknown> {
  const data = body instanceof FormData ? body.get("data") : (body as { data?: unknown })?.data;
  if (typeof data !== "string") throw new Error("Body was not a {data} envelope");
  return decryptPayload(data);
}

const FORM = {
  ...emptyLinkForm(null),
  title: "Discovery call",
  slug: "discovery-call",
  calendar_id: "7",
  timezone: "Australia/Sydney",
};

describe("links", () => {
  it("pages through the booking list ten at a time", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { records: [{ id: 1 }], total: 11, hasMore: true } },
    });
    const page = await fetchBookingLinks(2);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.scheduling.list, { params: { page: 2, limit: 10 } });
    expect(page).toEqual({ records: [{ id: 1 }], total: 11, page: 2, hasMore: true });
  });

  it("checks a slug by its URL", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { available: true } } });
    const result = await checkSlugAvailability("my call");
    expect(apiMock.post.mock.calls[0][0]).toBe(`${apiRoutes.scheduling.checkSlug}my%20call`);
    expect(result.available).toBe(true);
  });

  it("creates a link with an encrypted body", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await createBookingLink(FORM);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.scheduling.create);
    expect(decryptedFields(body)).toMatchObject({
      slug: "discovery-call",
      title: "Discovery call",
      meeting_type: "online",
      meeting_platform: "google_meet",
      calendar_id: 7,
    });
  });

  it("updates a link by id, encrypted, and surfaces a refusal", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });
    await updateBookingLink(5, FORM);
    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(apiRoutes.scheduling.update);
    expect(decryptedFields(body)).toMatchObject({ booking_link_id: 5, title: "Discovery call" });

    apiMock.put.mockResolvedValue({ data: { success: false, message: "Nope" } });
    await expect(updateBookingLink(5, FORM)).rejects.toThrow("Nope");
  });

  it("deletes a link by id", async () => {
    apiMock.delete.mockResolvedValue({ status: 200, data: { success: true } });
    await deleteBookingLink(9);
    expect(apiMock.delete).toHaveBeenCalledWith(`${apiRoutes.scheduling.delete}/9`);
  });
});

describe("settings", () => {
  it("reads the settings and their available days", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          timezone: "UTC",
          availableDays: [{ day_of_week: 1, start_time: "09:00:00", end_time: "17:00:00" }],
        },
      },
    });
    const settings = await fetchBookingSettings();
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.scheduling.getSetting);
    expect(settings.availability).toHaveLength(1);
  });

  it("saves the settings encrypted", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await saveBookingSettings({
      ...normalizeSettings({ timezone: "UTC" }),
      availability: [{ day_of_week: 1, start_time: "09:00", end_time: "17:00" }],
    });
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.scheduling.setSetting);
    expect(decryptedFields(body)).toMatchObject({ timezone: "UTC", theme_color: "#4F5DE8" });
  });

  it("uploads the picture raw as profile_pic, beside the encrypted envelope", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { profile_picture: "https://x/p.png" } } });
    const file = new File(["x"], "me.png", { type: "image/png" });
    const url = await uploadBookingProfilePicture(file);
    const body = apiMock.post.mock.calls[0][1] as FormData;
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.scheduling.uploadProfilePicture);
    expect(body.get("profile_pic")).toBeInstanceOf(File);
    expect(decryptedFields(body)).toEqual({});
    expect(url).toBe("https://x/p.png");
  });
});

describe("bookings", () => {
  it("asks for the whole visible month grid", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });
    await fetchMonthBookings(new Date(2026, 9, 15));
    const [url, config] = apiMock.get.mock.calls[0];
    expect(url).toBe(apiRoutes.scheduling.calendarEvents);
    // October 2026 starts on a Thursday — the grid opens on Sunday 27 Sept.
    expect(new Date(config.params.start_date)).toEqual(new Date(2026, 8, 27));
    expect(new Date(config.params.end_date).getDate()).toBe(31);
  });

  it("asks for a link's open slots on a day", async () => {
    apiMock.get.mockResolvedValue({ data: { data: { slots: [{ start_utc: "a", end_utc: "b", display: "" }] } } });
    const slots = await fetchAvailableSlots("intro", "2026-10-22", "Australia/Sydney");
    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.scheduling.getSlots}/intro`, {
      params: { date: "2026-10-22", tz: "Australia/Sydney" },
    });
    expect(slots).toHaveLength(1);
  });

  it("reschedules, moves and cancels with encrypted bodies", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await rescheduleBooking(
      { id: 11, name: "J", email: "j@x.co", notes: "", start_date: "", end_date: "", guest_timezone: "UTC", attendees: [] },
      { start_utc: "2026-10-22T01:00:00.000Z", end_utc: "2026-10-22T01:30:00.000Z" },
    );
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.scheduling.updateBooking);
    expect(decryptedFields(apiMock.post.mock.calls[0][1])).toMatchObject({ booking_id: 11, guests: [] });

    await moveBooking(11, { start_date: "s", end_date: "e" });
    expect(apiMock.post.mock.calls[1][0]).toBe(apiRoutes.scheduling.rescheduleDragDrop);
    expect(decryptedFields(apiMock.post.mock.calls[1][1])).toEqual({ booking_id: 11, start_date: "s", end_date: "e" });

    await cancelBooking(11, "  ");
    expect(apiMock.post.mock.calls[2][0]).toBe(`${apiRoutes.scheduling.cancelBooking}/11`);
    expect(decryptedFields(apiMock.post.mock.calls[2][1])).toEqual({ reason: "Cancelled by host" });
  });
});

/* ------------------------------------------------------------------ *
 * Edges and failures
 * ------------------------------------------------------------------ */

describe("links — edges", () => {
  it("treats an empty or odd list response as no links", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    expect(await fetchBookingLinks(1)).toEqual({ records: [], total: 0, page: 1, hasMore: false });
  });

  it("loads a link to edit, falling back to the settings timezone", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { slug: "intro", title: "Intro", duration_min: 30, meeting_type: "online", meeting_platform: "google_meet", calendar_id: 7, availability: [] },
      },
    });
    const form = await fetchBookingLinkForm(5, "Australia/Perth");
    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.scheduling.detailBooking}/5`);
    expect(form).toMatchObject({ slug: "intro", calendar_id: "7", timezone: "Australia/Perth" });
  });

  it("fails loudly when the link to edit can't be loaded", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "Booking link not found" } });
    await expect(fetchBookingLinkForm(5, "UTC")).rejects.toThrow("Booking link not found");
  });

  it("reports a taken slug with the backend's message, or a plain one", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { available: false, message: "Already in use" } } });
    expect(await checkSlugAvailability("intro")).toEqual({ available: false, message: "Already in use" });
    apiMock.post.mockResolvedValue({ data: { success: true, data: { available: false } } });
    expect((await checkSlugAvailability("intro")).message).toMatch(/taken/);
  });

  it("passes the abort signal so a stale check can be cancelled", async () => {
    apiMock.post.mockResolvedValue({ data: { data: { available: true } } });
    const controller = new AbortController();
    await checkSlugAvailability("intro", controller.signal);
    expect(apiMock.post.mock.calls[0][2]).toEqual({ signal: controller.signal });
  });

  it("surfaces a refused create with the backend's message", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Slug already exists" } });
    await expect(createBookingLink(FORM)).rejects.toThrow("Slug already exists");
  });

  it("surfaces a refused delete", async () => {
    apiMock.delete.mockResolvedValue({ status: 404, data: { success: false, message: "Not found" } });
    await expect(deleteBookingLink(9)).rejects.toThrow("Not found");
  });
});

describe("settings — edges", () => {
  it("reads settings sent without the data envelope", async () => {
    apiMock.get.mockResolvedValue({ data: { timezone: "Australia/Perth", default_duration_min: 45 } });
    const settings = await fetchBookingSettings();
    expect(settings).toMatchObject({ timezone: "Australia/Perth", default_duration_min: 45 });
  });

  it("surfaces a refused save", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Invalid timezone provided" } });
    await expect(
      saveBookingSettings({ ...normalizeSettings({ timezone: "Nope/Nope" }), availability: [] }),
    ).rejects.toThrow("Invalid timezone provided");
  });

  it("refuses an upload that comes back without a picture", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    await expect(uploadBookingProfilePicture(new File(["x"], "a.png", { type: "image/png" }))).rejects.toThrow();
  });

  it("lists the timezones, or none", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [{ value: "UTC", label: "UTC" }] } });
    expect(await fetchTimezones()).toEqual([{ value: "UTC", label: "UTC" }]);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.scheduling.timeZoneList);
    apiMock.get.mockResolvedValue({ data: { success: true, data: null } });
    expect(await fetchTimezones()).toEqual([]);
  });
});

describe("bookings — edges", () => {
  it("loads a booking's details for a reschedule", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { id: 11, booking_link: { slug: "intro" } } } });
    const detail = await fetchBookingDetail(11);
    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.scheduling.getBookingDetails}/11`);
    expect(detail.booking_link?.slug).toBe("intro");
  });

  it("fails when the booking is gone", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "Booking not found" } });
    await expect(fetchBookingDetail(11)).rejects.toThrow("Booking not found");
  });

  it("treats a missing slots list as no open times, and escapes the slug", async () => {
    apiMock.get.mockResolvedValue({ data: { data: { available: false } } });
    expect(await fetchAvailableSlots("a b", "2026-10-22", "UTC")).toEqual([]);
    expect(apiMock.get.mock.calls[0][0]).toBe(`${apiRoutes.scheduling.getSlots}/a%20b`);
  });

  it("treats a month with no events as empty", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: null } });
    expect(await fetchMonthBookings(new Date(2026, 9, 1))).toEqual([]);
  });

  it("accepts the old `status: true` success flag", async () => {
    apiMock.post.mockResolvedValue({ data: { status: true } });
    await expect(moveBooking(11, { start_date: "s", end_date: "e" })).resolves.toBeUndefined();
  });

  it("surfaces a refused reschedule, move and cancel", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "This time slot is already booked or blocked." } });
    const detail = { id: 11, name: "J", email: "j@x.co", notes: "", start_date: "", end_date: "", guest_timezone: "UTC", attendees: [] };
    await expect(
      rescheduleBooking(detail, { start_utc: "2026-10-22T01:00:00.000Z", end_utc: "2026-10-22T01:30:00.000Z" }),
    ).rejects.toThrow(/already booked/);
    await expect(moveBooking(11, { start_date: "s", end_date: "e" })).rejects.toThrow(/already booked/);
    await expect(cancelBooking(11, "")).rejects.toThrow(/already booked/);
  });

  it("sends the host's own cancellation reason, trimmed", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await cancelBooking(11, "  Clash with another job  ");
    expect(decryptedFields(apiMock.post.mock.calls[0][1])).toEqual({ reason: "Clash with another job" });
  });
});

describe("every write is encrypted", () => {
  it("never sends a booking field in the clear", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    apiMock.put.mockResolvedValue({ data: { success: true } });
    await createBookingLink(FORM);
    await updateBookingLink(5, FORM);
    await saveBookingSettings({ ...normalizeSettings({ timezone: "UTC" }), availability: [] });
    await moveBooking(11, { start_date: "s", end_date: "e" });
    await cancelBooking(11, "x");
    const bodies = [...apiMock.post.mock.calls, ...apiMock.put.mock.calls].map((call) => call[1]);
    for (const body of bodies) {
      expect(Object.keys(body as object)).toEqual(["data"]);
      expect(JSON.stringify(body)).not.toMatch(/discovery-call|booking_id|timezone|reason/);
    }
  });
});
