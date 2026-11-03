/**
 * The public booking page — sole-webapp's `pages/booking/[slug].js` and
 * `pages/booking/cancel.js`: which days a guest can pick, the guest's
 * details, the `join-booking` body (reschedule included), the host's theme,
 * and every public call — no session, encrypted writes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";

const clientMock = { apiGet: vi.fn(), apiPost: vi.fn() };
vi.mock("@/lib/api/client", () => clientMock);

const {
  addGuest,
  availabilitySummary,
  buildJoinPayload,
  canGoToNextMonth,
  canGoToPreviousMonth,
  cancelPublicBooking,
  durationLabel,
  fetchPublicBookingDetail,
  fetchPublicBookingLink,
  fetchPublicSlots,
  hostName,
  hostPicture,
  isBookableDay,
  isInPerson,
  joinBooking,
  meetingLabel,
  safeHex,
  shadeHex,
  slotWhen,
  validateGuestDetails,
} = await import("@/lib/public-booking");

type Link = Parameters<typeof hostName>[0];

const LINK: Link = {
  id: 16,
  slug: "test",
  title: "Discovery call",
  duration_min: 30,
  meeting_type: "online",
  location: null,
  meeting_platform: "google_meet",
  organizer_timezone: "Asia/Calcutta",
  theme_color: "#4f5de8",
  text_color: "#fff",
  profile_picture: "https://cdn/p.png",
  organizer: { name: "William" },
  availability: [1, 2, 3, 4, 5].map((day) => ({
    day_of_week: day,
    start_time: "09:00:00",
    end_time: "17:00:00",
  })),
};

const SLOT = {
  start_utc: "2026-10-20T03:30:00.000Z",
  end_utc: "2026-10-20T04:00:00.000Z",
  display: "09:00 AM",
};
const DETAILS = {
  name: " Jordan Reyes ",
  email: " jordan@reyes.co ",
  message: "",
  guests: [] as string[],
};

function decrypted(body: unknown) {
  return decryptPayload((body as { data: string }).data);
}

beforeEach(() => {
  vi.resetAllMocks();
});

/* ------------------------------------------------------------------ */

describe("which days a guest can pick", () => {
  // Saturday 17 October 2026.
  const today = new Date(2026, 9, 17, 15, 0);

  it("only the host's available weekdays", () => {
    expect(isBookableDay(new Date(2026, 9, 19), LINK.availability, today)).toBe(true); // Mon
    expect(isBookableDay(new Date(2026, 9, 18), LINK.availability, today)).toBe(false); // Sun
    expect(isBookableDay(new Date(2026, 9, 24), LINK.availability, today)).toBe(false); // Sat
  });

  it("never a past day, but today counts", () => {
    const friday = new Date(2026, 9, 16);
    expect(isBookableDay(friday, LINK.availability, today)).toBe(false);
    expect(isBookableDay(new Date(2026, 9, 17), [], today)).toBe(true);
  });

  it("up to two months ahead, no further", () => {
    expect(isBookableDay(new Date(2026, 11, 17), LINK.availability, today)).toBe(true); // Thu 17 Dec
    expect(isBookableDay(new Date(2026, 11, 18), LINK.availability, today)).toBe(false); // Fri 18 Dec
  });

  it("any weekday when the link lists no availability", () => {
    expect(isBookableDay(new Date(2026, 9, 18), [], today)).toBe(true);
    expect(isBookableDay(new Date(2026, 9, 18), undefined, today)).toBe(true);
  });

  it("can't page back before this month or past the window", () => {
    expect(canGoToPreviousMonth(new Date(2026, 9, 1), today)).toBe(false);
    expect(canGoToPreviousMonth(new Date(2026, 10, 1), today)).toBe(true);
    expect(canGoToNextMonth(new Date(2026, 10, 1), today)).toBe(true); // to December
    expect(canGoToNextMonth(new Date(2026, 11, 1), today)).toBe(false); // not to January
  });
});

describe("the guest's details", () => {
  it("needs a name and a valid email", () => {
    expect(validateGuestDetails({ ...DETAILS, name: " " })).toMatch(/name/);
    expect(validateGuestDetails({ ...DETAILS, email: "" })).toMatch(/email/);
    expect(validateGuestDetails({ ...DETAILS, email: "jordan@" })).toMatch(/valid email/);
    expect(validateGuestDetails(DETAILS)).toBeNull();
  });

  it("checks every extra guest", () => {
    expect(validateGuestDetails({ ...DETAILS, guests: ["ok@x.co", "nope"] })).toMatch(/nope/);
  });

  it("adds a guest once, tidied, and ignores blanks", () => {
    expect(addGuest([], "  PA@Reyes.co ")).toEqual(["pa@reyes.co"]);
    expect(addGuest(["pa@reyes.co"], "pa@reyes.co")).toEqual(["pa@reyes.co"]);
    expect(addGuest(["pa@reyes.co"], "   ")).toEqual(["pa@reyes.co"]);
  });
});

describe("join-booking's body", () => {
  it("is the old page's: link, slot, guest and timezone, trimmed", () => {
    expect(buildJoinPayload(LINK, SLOT, DETAILS, "Asia/Kolkata")).toEqual({
      booking_link_id: 16,
      start_utc: "2026-10-20T03:30:00.000Z",
      name: "Jordan Reyes",
      email: "jordan@reyes.co",
      timezone: "Asia/Kolkata",
    });
  });

  it("adds guests and notes only when there are some", () => {
    const payload = buildJoinPayload(
      LINK,
      SLOT,
      { ...DETAILS, guests: ["pa@reyes.co"], message: "  Bring plans " },
      "UTC",
    );
    expect(payload).toMatchObject({ guests: ["pa@reyes.co"], message: "Bring plans" });
  });

  it("carries reschedule_id when moving an existing booking", () => {
    expect(buildJoinPayload(LINK, SLOT, DETAILS, "UTC", "42")).toMatchObject({
      reschedule_id: "42",
    });
    expect(buildJoinPayload(LINK, SLOT, DETAILS, "UTC", null)).not.toHaveProperty("reschedule_id");
  });
});

describe("what the host panel shows", () => {
  it("the host, the meeting and the length", () => {
    expect(hostName(LINK)).toBe("William");
    expect(hostName({ ...LINK, organizer: null })).toBe("Your host");
    expect(hostPicture(LINK)).toBe("https://cdn/p.png");
    expect(
      hostPicture({ ...LINK, profile_picture: null, organizer: { profilePic: "u.png" } }),
    ).toBe("u.png");
    expect(durationLabel(LINK)).toBe("30 minutes");
    expect(meetingLabel(LINK)).toBe("Google Meet");
    expect(meetingLabel({ ...LINK, meeting_platform: "other" })).toBe("Video call");
  });

  it("an in-person meeting's address", () => {
    const inPerson = { ...LINK, meeting_type: "physical", location: "12 High St" };
    expect(isInPerson(inPerson)).toBe(true);
    expect(meetingLabel(inPerson)).toBe("12 High St");
    expect(meetingLabel({ ...inPerson, location: null })).toBe("In person");
  });

  it("the days and hours, in week order", () => {
    const summary = availabilitySummary({
      ...LINK,
      availability: [
        { day_of_week: 3, start_time: "13:00:00", end_time: "17:00:00" },
        { day_of_week: 1, start_time: "09:00:00", end_time: "12:00:00" },
      ],
    });
    expect(summary).toEqual(["Monday · 9:00 AM – 12:00 PM", "Wednesday · 1:00 PM – 5:00 PM"]);
  });

  it("the chosen slot in the guest's time", () => {
    const when = slotWhen({
      start_utc: new Date(2026, 9, 20, 9, 0).toISOString(),
      end_utc: new Date(2026, 9, 20, 9, 30).toISOString(),
      display: "",
    });
    expect(when).toEqual({ date: "Tuesday, October 20, 2026", time: "9:00 AM – 9:30 AM" });
  });
});

describe("the host's theme", () => {
  it("accepts a three- or six-digit hex, else the fallback", () => {
    expect(safeHex("#4f5de8", "#000000")).toBe("#4F5DE8");
    expect(safeHex("#fff", "#000000")).toBe("#FFFFFF");
    expect(safeHex("blue", "#000000")).toBe("#000000");
    expect(safeHex(null, "#4F5DE8")).toBe("#4F5DE8");
  });

  it("shades within 00–FF", () => {
    expect(shadeHex("#808080", 10)).toBe("#9A9A9A");
    expect(shadeHex("#FFFFFF", 50)).toBe("#FFFFFF");
    expect(shadeHex("#000000", -50)).toBe("#000000");
  });
});

/* ------------------------------------------------------------------ */

describe("public API", () => {
  it("loads the link without a session", async () => {
    clientMock.apiPost.mockResolvedValue({ success: true, data: LINK, status: 200 });
    const link = await fetchPublicBookingLink("my link");
    const [url, body, options] = clientMock.apiPost.mock.calls[0];
    expect(url).toBe(`${apiRoutes.scheduling.get}/my%20link`);
    expect(options).toEqual({ auth: "public" });
    expect(decrypted(body)).toEqual({
      timezone: expect.any(String),
      today_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(link.id).toBe(16);
  });

  it("says the link isn't there when the backend can't find it", async () => {
    clientMock.apiPost.mockResolvedValue({ success: false, status: 500 });
    await expect(fetchPublicBookingLink("gone")).rejects.toThrow(/doesn't exist/);
    clientMock.apiPost.mockResolvedValue({ success: true, data: {}, status: 200 });
    await expect(fetchPublicBookingLink("empty")).rejects.toThrow(/doesn't exist/);
  });

  it("asks for a day's slots in the guest's timezone", async () => {
    clientMock.apiGet.mockResolvedValue({
      success: true,
      data: { available: true, slots: [SLOT] },
      status: 200,
    });
    const slots = await fetchPublicSlots("test", new Date(2026, 9, 20), "Asia/Kolkata");
    expect(clientMock.apiGet).toHaveBeenCalledWith(`${apiRoutes.scheduling.getSlots}/test`, {
      auth: "public",
      params: { date: "2026-10-20", tz: "Asia/Kolkata" },
    });
    expect(slots).toEqual([SLOT]);
  });

  it("treats an unavailable day as no slots", async () => {
    clientMock.apiGet.mockResolvedValue({
      success: true,
      data: { available: false, slots: [] },
      status: 200,
    });
    expect(await fetchPublicSlots("test", new Date(2026, 9, 18), "UTC")).toEqual([]);
  });

  it("books the slot with an encrypted body and returns the generated Meet link", async () => {
    clientMock.apiPost.mockResolvedValue({
      success: true,
      message: "Booking confirmed!",
      data: { id: 77, meeting_link: "https://meet.google.com/abc-defg-hij" },
      status: 201,
    });
    const payload = buildJoinPayload(LINK, SLOT, DETAILS, "Asia/Kolkata", "42");
    const { booking, message } = await joinBooking(payload);
    const [url, body, options] = clientMock.apiPost.mock.calls[0];
    expect(url).toBe(apiRoutes.scheduling.joinSlot);
    expect(options).toEqual({ auth: "public" });
    expect(Object.keys(body)).toEqual(["data"]);
    expect(decrypted(body)).toEqual(payload);
    expect(booking.meeting_link).toBe("https://meet.google.com/abc-defg-hij");
    expect(message).toBe("Booking confirmed!");
  });

  it("surfaces a taken slot with the backend's message", async () => {
    clientMock.apiPost.mockResolvedValue({
      success: false,
      message: "This slot is no longer available",
      status: 409,
    });
    await expect(joinBooking(buildJoinPayload(LINK, SLOT, DETAILS, "UTC"))).rejects.toThrow(
      "This slot is no longer available",
    );
  });

  it("loads the booking being rescheduled or cancelled", async () => {
    clientMock.apiGet.mockResolvedValue({
      success: true,
      data: { id: 42, name: "Jordan" },
      status: 200,
    });
    expect((await fetchPublicBookingDetail("42")).name).toBe("Jordan");
    expect(clientMock.apiGet).toHaveBeenCalledWith(
      `${apiRoutes.scheduling.publicBookingDetails}/42`,
      { auth: "public" },
    );
    clientMock.apiGet.mockResolvedValue({
      success: false,
      message: "Booking not found",
      status: 404,
    });
    await expect(fetchPublicBookingDetail("9")).rejects.toThrow("Booking not found");
  });

  it("cancels with the guest's reason, encrypted, or none at all", async () => {
    clientMock.apiPost.mockResolvedValue({ success: true, status: 200 });
    await cancelPublicBooking("42", "  Something came up ");
    expect(clientMock.apiPost.mock.calls[0][0]).toBe(`${apiRoutes.scheduling.cancelBooking}/42`);
    expect(decrypted(clientMock.apiPost.mock.calls[0][1])).toEqual({ reason: "Something came up" });
    await cancelPublicBooking("42", "");
    expect(decrypted(clientMock.apiPost.mock.calls[1][1])).toEqual({});
  });

  it("surfaces a booking that's already cancelled", async () => {
    clientMock.apiPost.mockResolvedValue({
      success: false,
      message: "Booking not found or already cancelled",
      status: 404,
    });
    await expect(cancelPublicBooking("42", "")).rejects.toThrow(/already cancelled/);
  });
});
