/**
 * Creating and editing a booking link — sole-webapp's CreateBookingDrawer,
 * end to end from the wizard's form to the fields `/schedule/create-complete`
 * and `/schedule/update` receive: defaults, each step's rules, where the
 * meeting happens (Google Meet's calendar included) and the edit round trip.
 */
import { describe, expect, it } from "vitest";

import {
  applyMeetingWhere,
  buildCreateLinkPayload,
  buildUpdateLinkPayload,
  emptyLinkForm,
  isValidSlug,
  linkFormFromDetail,
  meetingWhere,
  normalizeSettings,
  slugify,
  validateLinkForm,
  validateLinkStep,
  type BookingLinkForm,
} from "@/lib/booking-links";

const GOOGLE_DEFAULT = { id: 7, provider: "google", email: "me@x.co", is_default: true };
const GOOGLE_OTHER = { id: 8, provider: "google", email: "work@x.co" };
const OUTLOOK = { id: 9, provider: "outlook", email: "me@outlook.com", is_default: true };

/** A form that passes every step, as a user would fill it in. */
function filled(overrides: Partial<BookingLinkForm> = {}): BookingLinkForm {
  return {
    ...emptyLinkForm(null),
    title: "Discovery call",
    slug: "discovery-call",
    calendar_id: "7",
    timezone: "Australia/Sydney",
    ...overrides,
  };
}

const AVAILABLE = { checkSlug: true, slugAvailable: true };

/* ------------------------------------------------------------------ */

describe("create — defaults", () => {
  it("starts on Google Meet, 30 minutes, a 10 minute buffer and weekdays 9–5 with no settings", () => {
    const form = emptyLinkForm(null);
    expect(form).toMatchObject({
      slug: "",
      title: "",
      duration_min: 30,
      buffer_after_minutes: 10,
      meeting_type: "online",
      meeting_platform: "google_meet",
      meeting_url: "",
      location: "",
      calendar_id: "",
      intro_text: "",
    });
    expect(form.availability.map((slot) => slot.day_of_week)).toEqual([1, 2, 3, 4, 5]);
    expect(form.availability.every((slot) => slot.start_time === "09:00:00" && slot.end_time === "17:00:00")).toBe(
      true,
    );
  });

  it("uses the saved booking settings when there are some ('Use default settings')", () => {
    const settings = normalizeSettings({
      timezone: "Australia/Perth",
      default_duration_min: 60,
      default_buffer_after_minutes: 0,
      availableDays: [{ day_of_week: 6, start_time: "10:00:00", end_time: "14:00:00" }],
    });
    const form = emptyLinkForm(settings);
    expect(form).toMatchObject({ duration_min: 60, buffer_after_minutes: 0, timezone: "Australia/Perth" });
    expect(form.availability).toEqual([{ day_of_week: 6, start_time: "10:00:00", end_time: "14:00:00" }]);
  });

  it("falls back to weekdays when the settings have no days saved", () => {
    const form = emptyLinkForm(normalizeSettings({ timezone: "UTC" }));
    expect(form.availability).toHaveLength(5);
  });
});

describe("create — the booking link (slug)", () => {
  it("suggests a slug from the title", () => {
    expect(slugify("30-min Strategy Call")).toBe("30-min-strategy-call");
    expect(slugify("  Café & Chat!! ")).toBe("caf-chat");
    expect(slugify("a   b---c")).toBe("a-b-c");
    expect(slugify("")).toBe("");
  });

  it("only allows letters, numbers and hyphens", () => {
    expect(isValidSlug("discovery-call-2")).toBe(true);
    expect(isValidSlug("Discovery")).toBe(true);
    expect(isValidSlug("has space")).toBe(false);
    expect(isValidSlug("under_score")).toBe(false);
    expect(isValidSlug("")).toBe(false);
  });
});

describe("create — step 1, booking info", () => {
  it.each([
    ["no title", { title: "  " }, /booking title/],
    ["no slug", { slug: "" }, /booking link/],
    ["a bad slug", { slug: "bad slug" }, /letters, numbers and hyphens/],
    ["no duration", { duration_min: 0 }, /greater than 0/],
  ])("stops on %s", (_, overrides, message) => {
    expect(validateLinkStep(filled(overrides), 1, AVAILABLE)).toMatch(message);
  });

  it("won't move on until the slug is confirmed free", () => {
    expect(validateLinkStep(filled(), 1, { checkSlug: true, slugAvailable: false })).toMatch(
      /available booking link/,
    );
    expect(validateLinkStep(filled(), 1, AVAILABLE)).toBeNull();
  });
});

describe("create — step 2, where it happens", () => {
  it("Google Meet needs a calendar to make the Meet link on", () => {
    expect(validateLinkStep(filled({ calendar_id: "" }), 2)).toMatch(/calendar is required/);
    expect(validateLinkStep(filled(), 2)).toBeNull();
  });

  it("in person needs a location", () => {
    const form = applyMeetingWhere(filled(), "in_person", [GOOGLE_DEFAULT]);
    expect(validateLinkStep(form, 2)).toMatch(/location/);
    expect(validateLinkStep({ ...form, location: "1 Main St" }, 2)).toBeNull();
  });

  it("an existing video-link meeting needs its URL", () => {
    const form = applyMeetingWhere(filled(), "video_link", [GOOGLE_DEFAULT]);
    expect(validateLinkStep(form, 2)).toMatch(/meeting URL/);
    expect(validateLinkStep({ ...form, meeting_url: "https://zoom.us/j/1" }, 2)).toBeNull();
  });
});

describe("create — step 3, availability", () => {
  it("needs at least one day", () => {
    expect(validateLinkStep(filled({ availability: [] }), 3)).toMatch(/at least one/);
  });

  it("refuses a day that ends before it starts", () => {
    const availability = [{ day_of_week: 1, start_time: "17:00:00", end_time: "09:00:00" }];
    expect(validateLinkStep(filled({ availability }), 3)).toMatch(/end time/);
  });
});

describe("create — the whole form on submit", () => {
  it("sends you back to the first step with a problem", () => {
    expect(validateLinkForm(filled({ calendar_id: "" }), AVAILABLE)).toEqual({
      step: 2,
      message: expect.stringMatching(/calendar/),
    });
    expect(validateLinkForm(filled({ title: "", availability: [] }), AVAILABLE)?.step).toBe(1);
    expect(validateLinkForm(filled(), AVAILABLE)).toBeNull();
  });
});

describe("where the meeting happens", () => {
  it("reads the choice off the form", () => {
    expect(meetingWhere(filled())).toBe("google_meet");
    expect(meetingWhere(filled({ meeting_platform: "other" }))).toBe("video_link");
    expect(meetingWhere(filled({ meeting_type: "in_person", meeting_platform: null }))).toBe("in_person");
  });

  it("Google Meet picks the default Google calendar, never another provider", () => {
    const form = applyMeetingWhere(
      filled({ meeting_type: "in_person", meeting_platform: null, calendar_id: "9" }),
      "google_meet",
      [OUTLOOK, GOOGLE_OTHER, GOOGLE_DEFAULT],
    );
    expect(form).toMatchObject({ meeting_type: "online", meeting_platform: "google_meet", calendar_id: "7" });
  });

  it("Google Meet keeps a Google calendar you already picked", () => {
    const form = applyMeetingWhere(filled({ calendar_id: "8" }), "google_meet", [GOOGLE_DEFAULT, GOOGLE_OTHER]);
    expect(form.calendar_id).toBe("8");
  });

  it("Google Meet with no Google calendar connected leaves it empty, so step 2 stops", () => {
    const form = applyMeetingWhere(filled({ calendar_id: "9" }), "google_meet", [OUTLOOK]);
    expect(form.calendar_id).toBe("");
    expect(validateLinkStep(form, 2)).toMatch(/calendar is required/);
  });

  it("in person clears the platform and keeps the calendar as it was", () => {
    const form = applyMeetingWhere(filled({ calendar_id: "9" }), "in_person", [GOOGLE_DEFAULT, OUTLOOK]);
    expect(form).toMatchObject({ meeting_type: "in_person", meeting_platform: null, calendar_id: "9" });
  });
});

describe("create — payload (the old drawer's fields)", () => {
  it("a Google Meet link: online, google_meet, no URL — the backend generates the Meet link", () => {
    expect(buildCreateLinkPayload(filled({ intro_text: "Bring your plans" }))).toEqual({
      slug: "discovery-call",
      title: "Discovery call",
      duration_min: 30,
      buffer_after_minutes: 10,
      meeting_type: "online",
      meeting_platform: "google_meet",
      meeting_url: "",
      location: null,
      calendar_id: 7,
      intro_text: "Bring your plans",
      timezone: "Australia/Sydney",
      availability: [1, 2, 3, 4, 5].map((day) => ({
        day_of_week: day,
        start_time: "09:00:00",
        end_time: "17:00:00",
      })),
    });
  });

  it("drops a leftover URL and location that don't apply to Meet", () => {
    const payload = buildCreateLinkPayload(filled({ meeting_url: "https://x", location: "Office" }));
    expect(payload.meeting_url).toBe("");
    expect(payload.location).toBeNull();
  });

  it("an in-person link: no platform, the trimmed location", () => {
    const payload = buildCreateLinkPayload(
      applyMeetingWhere(filled({ location: "  12 High St  " }), "in_person", []),
    );
    expect(payload).toMatchObject({ meeting_type: "in_person", meeting_platform: null, meeting_url: "", location: "12 High St" });
  });

  it("a video-link meeting: its trimmed URL", () => {
    const payload = buildCreateLinkPayload(
      applyMeetingWhere(filled({ meeting_url: " https://zoom.us/j/1 " }), "video_link", []),
    );
    expect(payload).toMatchObject({ meeting_type: "online", meeting_platform: "other", meeting_url: "https://zoom.us/j/1" });
  });

  it("trims the title and slug, sorts the days and pads their times", () => {
    const payload = buildCreateLinkPayload(
      filled({
        title: "  Intro  ",
        slug: " intro ",
        availability: [
          { day_of_week: 4, start_time: "9:30", end_time: "12:00" },
          { day_of_week: 2, start_time: "13:00", end_time: "17:00" },
        ],
      }),
    );
    expect(payload.title).toBe("Intro");
    expect(payload.slug).toBe("intro");
    expect(payload.availability).toEqual([
      { day_of_week: 2, start_time: "13:00:00", end_time: "17:00:00" },
      { day_of_week: 4, start_time: "09:30:00", end_time: "12:00:00" },
    ]);
  });

  it("keeps an overnight window marked as one", () => {
    const payload = buildCreateLinkPayload(
      filled({ availability: [{ day_of_week: 5, start_time: "22:00", end_time: "02:00", is_overnight: true }] }),
    );
    expect(payload.availability).toEqual([
      { day_of_week: 5, start_time: "22:00:00", end_time: "02:00:00", is_overnight: true },
    ]);
  });
});

describe("edit", () => {
  const detail = {
    id: 5,
    slug: "intro",
    title: "Intro",
    duration_min: 45,
    buffer_after_minutes: 15,
    meeting_type: "online",
    meeting_platform: "google_meet",
    meeting_url: "",
    location: null,
    calendar_id: 7,
    intro_text: "Hi",
    timezone: "Australia/Sydney",
    availability: [
      { id: 1, day_of_week: 3, start_time: "09:00:00", end_time: "17:00:00", is_overnight: false },
      { id: 2, day_of_week: 1, start_time: "09:00:00", end_time: "17:00:00", is_overnight: false },
    ],
  };

  it("loads /schedule/edit into the form", () => {
    expect(linkFormFromDetail(detail, "UTC")).toEqual({
      slug: "intro",
      title: "Intro",
      duration_min: 45,
      buffer_after_minutes: 15,
      meeting_type: "online",
      meeting_platform: "google_meet",
      meeting_url: "",
      location: "",
      calendar_id: "7",
      intro_text: "Hi",
      timezone: "Australia/Sydney",
      availability: [
        { day_of_week: 1, start_time: "09:00:00", end_time: "17:00:00" },
        { day_of_week: 3, start_time: "09:00:00", end_time: "17:00:00" },
      ],
    });
  });

  it("reads an in-person link without a platform, and a missing timezone from settings", () => {
    const form = linkFormFromDetail(
      { ...detail, meeting_type: "in_person", meeting_platform: null, location: "Office", timezone: null },
      "Australia/Perth",
    );
    expect(form).toMatchObject({ meeting_type: "in_person", meeting_platform: null, location: "Office", timezone: "Australia/Perth" });
  });

  it("doesn't check the slug — it can't change", () => {
    const form = linkFormFromDetail(detail, "UTC");
    expect(validateLinkForm(form, { checkSlug: false })).toBeNull();
  });

  it("updates by booking_link_id and never sends the slug", () => {
    const payload = buildUpdateLinkPayload(5, { ...linkFormFromDetail(detail, "UTC"), title: "Intro call" });
    expect(payload.booking_link_id).toBe(5);
    expect(payload.title).toBe("Intro call");
    expect(payload).not.toHaveProperty("slug");
  });

  it("round-trips unchanged: what's loaded is what's saved", () => {
    const payload = buildUpdateLinkPayload(5, linkFormFromDetail(detail, "UTC"));
    expect(payload).toMatchObject({
      duration_min: 45,
      buffer_after_minutes: 15,
      meeting_platform: "google_meet",
      calendar_id: 7,
      intro_text: "Hi",
    });
  });
});
