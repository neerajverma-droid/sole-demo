/**
 * The bookings calendar — sole-webapp's SchedulingCalendarView,
 * scheduling-helpers and EditAppointmentDrawer: turning
 * `/schedule/calendar-events` into bookings, the month grid and its range,
 * drag-to-another-day, the details shown, and what a reschedule sends.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bookingStatus,
  bookingUrl,
  bookingUrlPrefix,
  bookingWhen,
  bookingsInMonth,
  bookingsOnDay,
  buildReschedulePayload,
  formatDuration,
  initials,
  isGoogleMeetLink,
  monthCells,
  monthRange,
  movedBooking,
  normalizeBookingEvents,
  type RawBookingEvent,
} from "@/lib/booking-links";

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m, d, h, min).toISOString();

function raw(overrides: Partial<RawBookingEvent> = {}): RawBookingEvent {
  return {
    id: 101,
    booking_id: 11,
    title: "Discovery call: Jordan Reyes",
    startDate: at(2026, 9, 20, 9, 30),
    endDate: at(2026, 9, 20, 10, 0),
    description: "Bring the plans",
    location: null,
    meeting_link: "https://meet.google.com/abc-defg-hij",
    status: "confirmed",
    attendees: [{ name: "Jordan Reyes", email: "jordan@reyes.co", is_primary: true }],
    time_zone: "Australia/Sydney",
    source: "booking",
    calendar_event_id: "g-1",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

/* ------------------------------------------------------------------ */

describe("events from /schedule/calendar-events", () => {
  it("becomes one booking with the guest, the link and the length", () => {
    const [booking] = normalizeBookingEvents([raw()]);
    expect(booking).toMatchObject({
      key: "101",
      bookingId: "11",
      title: "Discovery call: Jordan Reyes",
      linkTitle: "Discovery call",
      guestName: "Jordan Reyes",
      guestEmail: "jordan@reyes.co",
      durationMin: 30,
      meetingLink: "https://meet.google.com/abc-defg-hij",
      description: "Bring the plans",
      timeZone: "Australia/Sydney",
      pending: false,
    });
  });

  it("takes the guest from the title when there are no attendees", () => {
    const [booking] = normalizeBookingEvents([raw({ attendees: [] })]);
    expect(booking.guestName).toBe("Jordan Reyes");
    expect(booking.guestEmail).toBe("");
  });

  it("uses the primary attendee over the first", () => {
    const [booking] = normalizeBookingEvents([
      raw({
        attendees: [
          { email: "pa@reyes.co", is_primary: false },
          { name: "Jordan", email: "jordan@reyes.co", is_primary: true },
        ],
      }),
    ]);
    expect(booking.guestName).toBe("Jordan");
  });

  it("keeps a title with no guest as the link name", () => {
    const [booking] = normalizeBookingEvents([raw({ title: "Strategy call", attendees: [] })]);
    expect(booking.linkTitle).toBe("Strategy call");
    expect(booking.guestName).toBe("Guest");
  });

  it("marks a booking with no booking_id so it can't be moved or cancelled", () => {
    const [booking] = normalizeBookingEvents([raw({ booking_id: null })]);
    expect(booking.bookingId).toBeNull();
  });

  it("flags a pending booking", () => {
    expect(normalizeBookingEvents([raw({ status: "pending" })])[0].pending).toBe(true);
  });

  it("dedupes as the old helpers did — by booking, Google event, then title and start", () => {
    const rows = normalizeBookingEvents([
      raw({ id: 1, booking_id: 1, calendar_event_id: "g-a", startDate: at(2026, 9, 20, 9) }),
      raw({ id: 2, booking_id: 1, calendar_event_id: "g-b", startDate: at(2026, 9, 21, 9) }),
      raw({ id: 3, booking_id: 3, calendar_event_id: "g-a", startDate: at(2026, 9, 22, 9) }),
      raw({ id: 4, booking_id: 4, calendar_event_id: null, startDate: at(2026, 9, 20, 9) }),
      raw({ id: 5, booking_id: 5, calendar_event_id: null, startDate: at(2026, 9, 23, 9) }),
    ]);
    expect(rows.map((row) => row.key)).toEqual(["1", "5"]);
  });

  it("drops cancelled events and rows without a usable start", () => {
    const rows = normalizeBookingEvents([
      raw({ id: 1, status: "cancelled" }),
      raw({ id: 2, booking_id: 2, startDate: "not a date" }),
      raw({ id: 3, booking_id: 3, calendar_event_id: "g-3" }),
    ]);
    expect(rows.map((row) => row.key)).toEqual(["3"]);
  });

  it("sorts by start time and copes with nothing at all", () => {
    const rows = normalizeBookingEvents([
      raw({ id: 2, booking_id: 2, calendar_event_id: "b", startDate: at(2026, 9, 22, 9), endDate: at(2026, 9, 22, 10) }),
      raw({ id: 1, booking_id: 1, calendar_event_id: "a", startDate: at(2026, 9, 21, 9), endDate: at(2026, 9, 21, 10) }),
    ]);
    expect(rows.map((row) => row.key)).toEqual(["1", "2"]);
    expect(normalizeBookingEvents(undefined)).toEqual([]);
  });

  it("treats a missing end as a zero-length booking", () => {
    const [booking] = normalizeBookingEvents([raw({ endDate: "" })]);
    expect(booking.durationMin).toBe(0);
  });
});

describe("upcoming or past", () => {
  const [booking] = normalizeBookingEvents([raw()]);
  it("is upcoming until it starts, past after", () => {
    expect(bookingStatus(booking, new Date(2026, 9, 20, 9, 29))).toBe("upcoming");
    expect(bookingStatus(booking, new Date(2026, 9, 20, 9, 30))).toBe("upcoming");
    expect(bookingStatus(booking, new Date(2026, 9, 20, 9, 31))).toBe("past");
  });
});

describe("month grid", () => {
  it.each([
    ["October 2026 (starts Thursday)", new Date(2026, 9, 15), 35, 31],
    ["February 2026 (starts Sunday, four rows)", new Date(2026, 1, 10), 28, 28],
    ["August 2026 (six rows)", new Date(2026, 7, 1), 42, 31],
  ])("%s covers whole weeks from Sunday", (_, month, cellCount, inMonth) => {
    const cells = monthCells(month);
    expect(cells).toHaveLength(cellCount);
    expect(cells[0].date.getDay()).toBe(0);
    expect(cells.at(-1)!.date.getDay()).toBe(6);
    expect(cells.filter((cell) => cell.currentMonth)).toHaveLength(inMonth);
  });

  it("asks for exactly the visible grid, start of the first day to the end of the last", () => {
    const { start_date, end_date } = monthRange(new Date(2026, 9, 15));
    expect(new Date(start_date)).toEqual(new Date(2026, 8, 27, 0, 0, 0, 0));
    expect(new Date(end_date)).toEqual(new Date(2026, 9, 31, 23, 59, 59, 999));
  });

  it("puts each booking on its own day", () => {
    const rows = normalizeBookingEvents([
      raw({ id: 1, booking_id: 1, calendar_event_id: "a", startDate: at(2026, 9, 20, 9), endDate: at(2026, 9, 20, 10) }),
      raw({ id: 2, booking_id: 2, calendar_event_id: "b", startDate: at(2026, 9, 20, 14), endDate: at(2026, 9, 20, 15) }),
      raw({ id: 3, booking_id: 3, calendar_event_id: "c", startDate: at(2026, 9, 21, 9), endDate: at(2026, 9, 21, 10) }),
    ]);
    expect(bookingsOnDay(rows, new Date(2026, 9, 20)).map((row) => row.key)).toEqual(["1", "2"]);
    expect(bookingsOnDay(rows, new Date(2026, 9, 22))).toEqual([]);
  });

  it("counts only the month's own bookings in the header, not the padding days", () => {
    const rows = normalizeBookingEvents([
      raw({ id: 1, booking_id: 1, calendar_event_id: "a", startDate: at(2026, 8, 28, 9), endDate: at(2026, 8, 28, 10) }),
      raw({ id: 2, booking_id: 2, calendar_event_id: "b", startDate: at(2026, 9, 1, 0), endDate: at(2026, 9, 1, 1) }),
      raw({ id: 3, booking_id: 3, calendar_event_id: "c", startDate: at(2026, 9, 31, 23, 30), endDate: at(2026, 9, 31, 23, 59) }),
    ]);
    expect(bookingsInMonth(rows, new Date(2026, 9, 10)).map((row) => row.key)).toEqual(["2", "3"]);
  });
});

describe("drag to another day", () => {
  it("keeps the time of day and the length", () => {
    const [booking] = normalizeBookingEvents([raw({ startDate: at(2026, 9, 20, 9, 30), endDate: at(2026, 9, 20, 10, 15) })]);
    const moved = movedBooking(booking, new Date(2026, 9, 23, 18, 0));
    expect(moved).toEqual({ start_date: at(2026, 9, 23, 9, 30), end_date: at(2026, 9, 23, 10, 15) });
  });

  it("dropping on the same day changes nothing", () => {
    const [booking] = normalizeBookingEvents([raw()]);
    expect(movedBooking(booking, new Date(2026, 9, 20)).start_date).toBe(booking.start);
  });
});

describe("details", () => {
  const [booking] = normalizeBookingEvents([raw()]);

  it("says when, in the list's and the dialog's forms", () => {
    expect(bookingWhen(booking)).toEqual({
      day: "Tue, Oct 20",
      time: "9:30 AM · 30 minutes",
      long: "Tuesday, Oct 20 · 9:30 AM – 10:00 AM",
    });
  });

  it("recognises a generated Google Meet link", () => {
    expect(isGoogleMeetLink(booking.meetingLink)).toBe(true);
    expect(isGoogleMeetLink("https://zoom.us/j/1")).toBe(false);
    expect(isGoogleMeetLink(null)).toBe(false);
  });

  it("labels durations as the old list did", () => {
    expect(formatDuration(15)).toBe("15 minutes");
    expect(formatDuration(60)).toBe("1 hour");
    expect(formatDuration(90)).toBe("1.5 hours");
    expect(formatDuration(180)).toBe("3 hours");
    expect(formatDuration(25)).toBe("25 minutes");
    expect(formatDuration(0)).toBe("30 minutes");
  });

  it("makes initials for the guest's avatar", () => {
    expect(initials("Jordan Reyes")).toBe("JR");
    expect(initials("harper")).toBe("H");
    expect(initials("  ")).toBe("?");
  });
});

describe("reschedule (update-booking)", () => {
  const detail = {
    id: 11,
    name: "Jordan Reyes",
    email: "jordan@reyes.co",
    notes: "Bring the plans",
    start_date: at(2026, 9, 20, 9, 30),
    end_date: at(2026, 9, 20, 10, 0),
    guest_timezone: "Australia/Sydney",
    attendees: ["pa@reyes.co", "ops@reyes.co"],
    booking_link: { id: 5, slug: "discovery-call", title: "Discovery call", duration: 30 },
  };

  it("sends the picked slot with the guest, everyone else and the notes unchanged", () => {
    expect(
      buildReschedulePayload(detail, { start_utc: "2026-10-22T01:00:00.000Z", end_utc: "2026-10-22T01:30:00.000Z" }),
    ).toEqual({
      booking_id: 11,
      name: "Jordan Reyes",
      email: "jordan@reyes.co",
      guests: ["pa@reyes.co", "ops@reyes.co"],
      message: "Bring the plans",
      start_date: "2026-10-22T01:00:00.000Z",
      end_date: "2026-10-22T01:30:00.000Z",
      guest_timezone: "Australia/Sydney",
    });
  });

  it("defaults missing guests, notes and timezone rather than sending undefined", () => {
    const payload = buildReschedulePayload(
      { ...detail, attendees: undefined as unknown as string[], notes: "", guest_timezone: "" },
      { start_utc: "2026-10-22T01:00:00Z", end_utc: "2026-10-22T01:30:00Z" },
    );
    expect(payload).toMatchObject({ guests: [], message: "", guest_timezone: "UTC" });
  });
});

describe("the public booking page link", () => {
  it("points at the web app that serves /booking/:slug", () => {
    vi.stubEnv("NEXT_PUBLIC_REDIRECT_URL", "https://webapp.getsole.ai/");
    expect(bookingUrl("discovery-call")).toBe("https://webapp.getsole.ai/booking/discovery-call");
    expect(bookingUrlPrefix()).toBe("webapp.getsole.ai/booking/");
  });
});
