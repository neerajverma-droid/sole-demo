import { describe, expect, it } from "vitest";

import {
  applyPreset,
  buildCreateLinkPayload,
  buildReschedulePayload,
  buildSettingsPayload,
  buildUpdateLinkPayload,
  defaultGoogleCalendarId,
  googleCalendars,
  isGoogleMeetLink,
  detectPreset,
  emptyLinkForm,
  formatDuration,
  invalidAvailabilityDays,
  linkFormFromDetail,
  monthCells,
  movedBooking,
  normalizeBookingEvents,
  normalizeSettings,
  normalizeTime,
  slugify,
  toggleAvailabilityDay,
  validateLinkStep,
  validateSettings,
  type BookingLinkForm,
  type RawBookingEvent,
} from "@/lib/booking-links";

function form(overrides: Partial<BookingLinkForm> = {}): BookingLinkForm {
  return {
    ...emptyLinkForm(null),
    title: "Discovery call",
    slug: "discovery-call",
    calendar_id: "7",
    timezone: "Australia/Sydney",
    ...overrides,
  };
}

function rawEvent(overrides: Partial<RawBookingEvent> = {}): RawBookingEvent {
  return {
    id: 1,
    booking_id: 11,
    title: "Discovery call: Jordan Reyes",
    startDate: "2026-10-20T00:00:00.000Z",
    endDate: "2026-10-20T00:30:00.000Z",
    status: "confirmed",
    attendees: [{ name: "Jordan Reyes", email: "jordan@reyes.co", is_primary: true }],
    ...overrides,
  };
}

describe("slugify", () => {
  it("lowercases, hyphenates and drops anything else", () => {
    expect(slugify("  30-min Strategy  Call! ")).toBe("30-min-strategy-call");
    expect(slugify("--Hello__World--")).toBe("helloworld");
  });
});

describe("formatDuration / normalizeTime", () => {
  it("labels known durations and falls back to minutes", () => {
    expect(formatDuration(60)).toBe("1 hour");
    expect(formatDuration(25)).toBe("25 minutes");
    expect(formatDuration(null)).toBe("30 minutes");
  });

  it("pads any time to HH:mm:ss", () => {
    expect(normalizeTime("9:00")).toBe("09:00:00");
    expect(normalizeTime("17:30:00")).toBe("17:30:00");
  });
});

describe("availability", () => {
  const office = [
    { day_of_week: 1, start_time: "09:00:00", end_time: "17:00:00" },
    { day_of_week: 3, start_time: "09:00:00", end_time: "17:00:00" },
  ];

  it("recognises a preset, or calls mixed hours custom", () => {
    expect(detectPreset(office)).toBe("office");
    expect(detectPreset([...office, { day_of_week: 5, start_time: "10:00", end_time: "12:00" }])).toBe("custom");
  });

  it("adds a day with the preset's hours, in day order, and removes it again", () => {
    const added = toggleAvailabilityDay(office, 2, "mornings");
    expect(added.map((slot) => slot.day_of_week)).toEqual([1, 2, 3]);
    expect(added[1]).toMatchObject({ start_time: "08:00:00", end_time: "12:00:00" });
    expect(toggleAvailabilityDay(added, 2, "mornings")).toEqual(office);
  });

  it("applies a preset to every day", () => {
    expect(applyPreset(office, "evenings").every((slot) => slot.start_time === "18:00:00")).toBe(true);
  });

  it("flags a day that ends before it starts", () => {
    expect(invalidAvailabilityDays([{ day_of_week: 4, start_time: "17:00", end_time: "09:00" }])).toEqual([4]);
    expect(
      invalidAvailabilityDays([{ day_of_week: 4, start_time: "22:00", end_time: "02:00", is_overnight: true }]),
    ).toEqual([]);
  });
});

describe("settings", () => {
  it("normalises the backend's settings with the old defaults", () => {
    const settings = normalizeSettings({
      timezone: "Australia/Sydney",
      default_duration_min: 45,
      default_buffer_after_minutes: 0,
      theme_color: "#112233",
      profile_picture: null,
      availableDays: [{ day_of_week: 2, start_time: "09:00:00", end_time: "17:00:00", id: 9 }],
    });
    expect(settings).toMatchObject({
      timezone: "Australia/Sydney",
      default_duration_min: 45,
      default_buffer_after_minutes: 0,
      theme_color: "#112233",
      text_color: "#FFFFFF",
      profile_picture: "",
    });
    expect(settings.availability).toEqual([{ day_of_week: 2, start_time: "09:00:00", end_time: "17:00:00" }]);
  });

  it("saves exactly the fields the settings endpoint reads", () => {
    const payload = buildSettingsPayload({
      ...normalizeSettings({ timezone: "UTC" }),
      availability: [{ day_of_week: 1, start_time: "9:00", end_time: "17:00" }],
    });
    expect(Object.keys(payload).sort()).toEqual(
      [
        "availability",
        "default_buffer_after_minutes",
        "default_duration_min",
        "profile_picture",
        "text_color",
        "theme_color",
        "timezone",
      ].sort(),
    );
    expect(payload.availability).toEqual([{ day_of_week: 1, start_time: "09:00:00", end_time: "17:00:00" }]);
  });

  it("refuses no days, and a theme colour the backend won't take", () => {
    const base = { ...normalizeSettings({}), availability: [] };
    expect(validateSettings(base)).toMatch(/at least one/);
    expect(
      validateSettings({
        ...base,
        availability: [{ day_of_week: 1, start_time: "09:00", end_time: "17:00" }],
        theme_color: "#fff",
      }),
    ).toMatch(/theme colour/);
  });
});

describe("link form", () => {
  it("needs a free slug before step one moves on", () => {
    expect(validateLinkStep(form({ title: "" }), 1)).toMatch(/title/);
    expect(validateLinkStep(form({ slug: "has space" }), 1)).toMatch(/letters, numbers/);
    expect(validateLinkStep(form(), 1, { checkSlug: true, slugAvailable: false })).toMatch(/available/);
    expect(validateLinkStep(form(), 1, { checkSlug: true, slugAvailable: true })).toBeNull();
  });

  it("asks for what each kind of meeting needs", () => {
    expect(validateLinkStep(form({ calendar_id: "" }), 2)).toMatch(/calendar is required/);
    expect(validateLinkStep(form({ meeting_platform: "other", meeting_url: "" }), 2)).toMatch(/meeting URL/);
    expect(
      validateLinkStep(form({ meeting_type: "in_person", meeting_platform: null, location: " " }), 2),
    ).toMatch(/location/);
  });

  it("creates with the slug, and updates by id without it", () => {
    const create = buildCreateLinkPayload(form({ meeting_url: "ignored" }));
    expect(create).toMatchObject({
      slug: "discovery-call",
      title: "Discovery call",
      meeting_type: "online",
      meeting_platform: "google_meet",
      meeting_url: "",
      location: null,
      calendar_id: 7,
    });
    const update = buildUpdateLinkPayload(5, form());
    expect(update.booking_link_id).toBe(5);
    expect("slug" in update).toBe(false);
  });

  it("sends an in-person link with its location and no platform", () => {
    const payload = buildCreateLinkPayload(
      form({ meeting_type: "in_person", meeting_platform: null, location: " 1 Main St " }),
    );
    expect(payload).toMatchObject({ meeting_type: "in_person", meeting_platform: null, location: "1 Main St" });
  });

  it("reads the edit endpoint back into the form", () => {
    const loaded = linkFormFromDetail(
      {
        slug: "intro",
        title: "Intro",
        duration_min: 45,
        buffer_after_minutes: 5,
        meeting_type: "in_person",
        meeting_platform: null,
        location: "Office",
        calendar_id: 3,
        availability: [{ day_of_week: 2, start_time: "09:00:00", end_time: "12:00:00", id: 1 }],
      },
      "UTC",
    );
    expect(loaded).toMatchObject({
      slug: "intro",
      meeting_type: "in_person",
      meeting_platform: null,
      calendar_id: "3",
      timezone: "UTC",
    });
    expect(loaded.availability).toEqual([{ day_of_week: 2, start_time: "09:00:00", end_time: "12:00:00" }]);
  });
});

describe("bookings", () => {
  it("pulls the guest and the link out of a calendar event", () => {
    const [booking] = normalizeBookingEvents([rawEvent()]);
    expect(booking).toMatchObject({
      key: "1",
      bookingId: "11",
      linkTitle: "Discovery call",
      guestName: "Jordan Reyes",
      guestEmail: "jordan@reyes.co",
      durationMin: 30,
    });
  });

  it("drops duplicates and cancelled events", () => {
    const rows = normalizeBookingEvents([
      rawEvent(),
      rawEvent({ id: 2 }),
      rawEvent({ id: 3, booking_id: 12, calendar_event_id: "g1", startDate: "2026-10-21T00:00:00.000Z" }),
      rawEvent({ id: 4, booking_id: 13, calendar_event_id: "g1", startDate: "2026-10-22T00:00:00.000Z" }),
      rawEvent({ id: 5, booking_id: 14, status: "cancelled", startDate: "2026-10-23T00:00:00.000Z" }),
    ]);
    expect(rows.map((row) => row.key)).toEqual(["1", "3"]);
  });

  it("keeps the time of day and the length when moved to another day", () => {
    const [booking] = normalizeBookingEvents([
      rawEvent({ startDate: new Date(2026, 9, 20, 9, 30).toISOString(), endDate: new Date(2026, 9, 20, 10, 15).toISOString() }),
    ]);
    const moved = movedBooking(booking, new Date(2026, 9, 22));
    expect(new Date(moved.start_date)).toEqual(new Date(2026, 9, 22, 9, 30));
    expect(new Date(moved.end_date)).toEqual(new Date(2026, 9, 22, 10, 15));
  });

  it("sends the guests back with a reschedule, since update-booking replaces them", () => {
    const payload = buildReschedulePayload(
      {
        id: 11,
        name: "Jordan",
        email: "jordan@reyes.co",
        notes: "Bring plans",
        start_date: "",
        end_date: "",
        guest_timezone: "Australia/Perth",
        attendees: ["pa@reyes.co"],
      },
      { start_utc: "2026-10-22T01:00:00.000Z", end_utc: "2026-10-22T01:30:00.000Z" },
    );
    expect(payload).toEqual({
      booking_id: 11,
      name: "Jordan",
      email: "jordan@reyes.co",
      guests: ["pa@reyes.co"],
      message: "Bring plans",
      start_date: "2026-10-22T01:00:00.000Z",
      end_date: "2026-10-22T01:30:00.000Z",
      guest_timezone: "Australia/Perth",
    });
  });
});

describe("monthCells", () => {
  it("covers the month in whole weeks from Sunday", () => {
    const cells = monthCells(new Date(2026, 9, 1));
    expect(cells[0].date.getDay()).toBe(0);
    expect(cells.length % 7).toBe(0);
    expect(cells.filter((cell) => cell.currentMonth)).toHaveLength(31);
  });
});

describe("Google Meet", () => {
  it("creates a Meet link with exactly the old drawer's fields", () => {
    // sole-webapp's CreateBookingDrawer posted its whole formData: Meet is
    // online + google_meet, no URL (the backend makes it), no location, and
    // the Google calendar the Meet event goes on.
    const payload = buildCreateLinkPayload(
      form({ meeting_type: "online", meeting_platform: "google_meet", calendar_id: "7" }),
    );
    expect(Object.keys(payload).sort()).toEqual(
      [
        "availability",
        "buffer_after_minutes",
        "calendar_id",
        "duration_min",
        "intro_text",
        "location",
        "meeting_platform",
        "meeting_type",
        "meeting_url",
        "slug",
        "timezone",
        "title",
      ].sort(),
    );
    expect(payload).toMatchObject({
      meeting_type: "online",
      meeting_platform: "google_meet",
      meeting_url: "",
      location: null,
      calendar_id: 7,
    });
  });

  it("only offers Google calendars, preferring the default", () => {
    const calendars = [
      { id: 1, provider: "outlook", is_default: true },
      { id: 2, provider: "google" },
      { id: 3, provider: "Google", is_default: true },
    ];
    expect(googleCalendars(calendars).map((c) => c.id)).toEqual([2, 3]);
    expect(defaultGoogleCalendarId(calendars)).toBe("3");
    expect(defaultGoogleCalendarId([{ id: 1, provider: "outlook" }])).toBe("");
  });

  it("recognises a Meet link", () => {
    expect(isGoogleMeetLink("https://meet.google.com/abc-defg-hij")).toBe(true);
    expect(isGoogleMeetLink("https://zoom.us/j/1")).toBe(false);
  });
});
