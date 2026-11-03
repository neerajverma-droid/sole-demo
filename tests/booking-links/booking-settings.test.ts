/**
 * Booking settings and availability — sole-webapp's SettingDrawer and
 * AvailabilityCustomizer: what `/schedule/settings` is read into, what the
 * save sends back, the day pills, the time presets and the per-day rows.
 */
import { describe, expect, it } from "vitest";

import {
  CUSTOM_PRESET,
  TIME_PRESETS,
  applyPreset,
  buildSettingsPayload,
  defaultAvailability,
  detectPreset,
  invalidAvailabilityDays,
  isValidHexColor,
  normalizeSettings,
  normalizeTime,
  sortAvailability,
  timeLabel,
  timeOptions,
  toAvailability,
  toggleAvailabilityDay,
  validateSettings,
  type AvailabilitySlot,
  type BookingSettings,
} from "@/lib/booking-links";

function settings(overrides: Partial<BookingSettings> = {}): BookingSettings {
  return {
    ...normalizeSettings({ timezone: "Australia/Sydney" }),
    availability: defaultAvailability(),
    ...overrides,
  };
}

const slot = (day: number, start = "09:00:00", end = "17:00:00"): AvailabilitySlot => ({
  day_of_week: day,
  start_time: start,
  end_time: end,
});

/* ------------------------------------------------------------------ */

describe("reading /schedule/settings", () => {
  it("keeps what's saved", () => {
    expect(
      normalizeSettings({
        timezone: "Australia/Perth",
        default_duration_min: 60,
        default_buffer_after_minutes: 15,
        theme_color: "#112233",
        text_color: "#000000",
        profile_picture: "https://cdn/x.png",
        availableDays: [slot(2)],
      }),
    ).toEqual({
      timezone: "Australia/Perth",
      default_duration_min: 60,
      default_buffer_after_minutes: 15,
      theme_color: "#112233",
      text_color: "#000000",
      profile_picture: "https://cdn/x.png",
      availability: [slot(2)],
    });
  });

  it("fills the old drawer's defaults for a new account", () => {
    const fresh = normalizeSettings({});
    expect(fresh).toMatchObject({
      default_duration_min: 30,
      default_buffer_after_minutes: 10,
      theme_color: "#4F5DE8",
      text_color: "#FFFFFF",
      profile_picture: "",
      availability: [],
    });
    expect(fresh.timezone).toBeTruthy();
  });

  it("keeps a saved buffer of zero rather than defaulting it", () => {
    expect(normalizeSettings({ default_buffer_after_minutes: 0 }).default_buffer_after_minutes).toBe(0);
  });

  it("accepts the camelCase fields the backend sometimes sends", () => {
    expect(normalizeSettings({ themeColor: "#ABCDEF", profilePicture: "p.png" })).toMatchObject({
      theme_color: "#ABCDEF",
      profile_picture: "p.png",
    });
  });

  it("tidies the available days: drops bad rows, pads times, sorts by day", () => {
    expect(
      toAvailability([
        { day_of_week: 5, start_time: "9:00", end_time: "12:00", id: 3 },
        { day_of_week: "1", start_time: "13:00:00", end_time: "17:00:00" },
        { day_of_week: "x" },
        null,
      ]),
    ).toEqual([slot(1, "13:00:00", "17:00:00"), slot(5, "09:00:00", "12:00:00")]);
    expect(toAvailability(undefined)).toEqual([]);
  });
});

describe("saving /schedule/settings", () => {
  it("sends exactly the fields the endpoint reads", () => {
    expect(
      buildSettingsPayload(
        settings({
          theme_color: " #4F5DE8 ",
          text_color: "#FFFFFF",
          profile_picture: " https://cdn/x.png ",
          availability: [slot(3, "9:00", "17:00"), slot(1)],
        }),
      ),
    ).toEqual({
      timezone: "Australia/Sydney",
      default_duration_min: 30,
      default_buffer_after_minutes: 10,
      theme_color: "#4F5DE8",
      text_color: "#FFFFFF",
      profile_picture: "https://cdn/x.png",
      availability: [slot(1), slot(3)],
    });
  });

  it("strips row ids and flags the endpoint doesn't take", () => {
    const payload = buildSettingsPayload(
      settings({ availability: [{ ...slot(1), is_overnight: false, id: 9 } as AvailabilitySlot] }),
    );
    expect(payload.availability).toEqual([slot(1)]);
  });
});

describe("validating before save", () => {
  it("passes a complete set of settings", () => {
    expect(validateSettings(settings())).toBeNull();
  });

  it("needs at least one available day", () => {
    expect(validateSettings(settings({ availability: [] }))).toMatch(/at least one available day/);
  });

  it("needs each day to end after it starts", () => {
    expect(validateSettings(settings({ availability: [slot(1, "17:00", "17:00")] }))).toMatch(/end time/);
  });

  it("needs a six-digit theme colour — the backend's own rule", () => {
    expect(validateSettings(settings({ theme_color: "#fff" }))).toMatch(/theme colour/);
    expect(validateSettings(settings({ theme_color: "blue" }))).toMatch(/theme colour/);
  });

  it("checks the text colour only when there is one", () => {
    expect(validateSettings(settings({ text_color: "#12" }))).toMatch(/text colour/);
    expect(validateSettings(settings({ text_color: "" }))).toBeNull();
  });

  it("knows a valid hex colour", () => {
    expect(isValidHexColor("#4f5de8")).toBe(true);
    expect(isValidHexColor(" #4F5DE8 ")).toBe(true);
    expect(isValidHexColor("#4F5DE")).toBe(false);
    expect(isValidHexColor("4F5DE8")).toBe(false);
  });
});

describe("availability — day pills", () => {
  it("turns a day on with the chosen preset's hours, in day order", () => {
    const next = toggleAvailabilityDay([slot(1), slot(5)], 3, "afternoons");
    expect(next).toEqual([slot(1), slot(3, "13:00:00", "17:00:00"), slot(5)]);
  });

  it("turns a day on with the last row's hours when the hours are custom", () => {
    const next = toggleAvailabilityDay([slot(1, "07:30:00", "11:00:00")], 2, CUSTOM_PRESET);
    expect(next[1]).toEqual(slot(2, "07:30:00", "11:00:00"));
  });

  it("turns the first day on 9–5 when nothing is set and the hours are custom", () => {
    expect(toggleAvailabilityDay([], 0, CUSTOM_PRESET)).toEqual([slot(0)]);
  });

  it("turns a day off again", () => {
    expect(toggleAvailabilityDay([slot(1), slot(2)], 1, "office")).toEqual([slot(2)]);
  });
});

describe("availability — presets", () => {
  it.each(TIME_PRESETS.map((preset) => [preset.id, preset.start, preset.end]))(
    "%s sets every day to %s–%s and is recognised again",
    (id, start, end) => {
      const applied = applyPreset([slot(1), slot(4, "06:00", "07:00")], id);
      expect(applied.every((row) => row.start_time === start && row.end_time === end)).toBe(true);
      expect(detectPreset(applied)).toBe(id);
    },
  );

  it("leaves the rows alone for custom", () => {
    const rows = [slot(1, "07:00:00", "08:00:00")];
    expect(applyPreset(rows, CUSTOM_PRESET)).toBe(rows);
  });

  it("calls days with different hours custom", () => {
    expect(detectPreset([slot(1), slot(2, "10:00:00", "17:00:00")])).toBe(CUSTOM_PRESET);
  });

  it("calls a single non-preset window custom, and nothing at all office hours", () => {
    expect(detectPreset([slot(1, "07:00", "15:00")])).toBe(CUSTOM_PRESET);
    expect(detectPreset([])).toBe("office");
  });
});

describe("availability — the per-day rows", () => {
  it("flags only the days that end before (or as) they start", () => {
    expect(
      invalidAvailabilityDays([slot(1), slot(2, "12:00", "09:00"), slot(3, "10:00", "10:00")]),
    ).toEqual([2, 3]);
  });

  it("lets an overnight window through", () => {
    expect(invalidAvailabilityDays([{ ...slot(5, "22:00", "02:00"), is_overnight: true }])).toEqual([]);
  });

  it("sorts without changing the original", () => {
    const rows = [slot(4), slot(0)];
    expect(sortAvailability(rows).map((row) => row.day_of_week)).toEqual([0, 4]);
    expect(rows[0].day_of_week).toBe(4);
  });

  it("offers every half hour, and a saved off-grid time too", () => {
    const options = timeOptions();
    expect(options).toHaveLength(48);
    expect(options[0]).toBe("00:00:00");
    expect(options.at(-1)).toBe("23:30:00");
    const withSaved = timeOptions("09:15");
    expect(withSaved).toHaveLength(49);
    expect(withSaved).toContain("09:15:00");
    expect(withSaved.indexOf("09:15:00")).toBe(withSaved.indexOf("09:00:00") + 1);
  });

  it("labels times in 12-hour form", () => {
    expect(timeLabel("00:00:00")).toBe("12:00 AM");
    expect(timeLabel("09:30")).toBe("9:30 AM");
    expect(timeLabel("12:00:00")).toBe("12:00 PM");
    expect(timeLabel("17:45:00")).toBe("5:45 PM");
  });

  it("pads any time to HH:mm:ss", () => {
    expect(normalizeTime("9:5")).toBe("09:05:00");
    expect(normalizeTime("17:30")).toBe("17:30:00");
    expect(normalizeTime("")).toBe("00:00:00");
  });
});
