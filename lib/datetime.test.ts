import { describe, expect, it } from "vitest";

import {
  formatEventDateTime,
  isDateOnlyValue,
  parseApiInstant,
} from "@/lib/datetime";
import { formatQuoteEventTime } from "@/lib/quotes";
import { formatTimelineDateTime } from "@/lib/invoice-history";

describe("parseApiInstant", () => {
  it("reads an ISO instant exactly, whatever zone it is written in", () => {
    expect(parseApiInstant("2026-10-07T00:12:00.000Z")?.toISOString()).toBe(
      "2026-10-07T00:12:00.000Z",
    );
    expect(parseApiInstant("2026-10-07T05:42:00+05:30")?.toISOString()).toBe(
      "2026-10-07T00:12:00.000Z",
    );
  });

  it("treats a date-only value as a calendar day, not an instant", () => {
    expect(isDateOnlyValue("2026-10-07")).toBe(true);
    expect(parseApiInstant("2026-10-07")).toBeNull();
  });

  it("returns null for blanks and garbage rather than an Invalid Date", () => {
    expect(parseApiInstant("")).toBeNull();
    expect(parseApiInstant(null)).toBeNull();
    expect(parseApiInstant("not a date")).toBeNull();
  });
});

describe("formatEventDateTime", () => {
  // 11:00 am in Sydney (AEDT, UTC+11) is 00:00 UTC and 5:30 am in India.
  const sydneyEleven = "2026-10-07T00:00:00.000Z";

  it("shows the business's local time, not the server's or the browser's", () => {
    expect(
      formatEventDateTime(sydneyEleven, { timeZone: "Australia/Sydney" }),
    ).toBe("07 Oct 2026 · 11:00 am");
    expect(
      formatEventDateTime(sydneyEleven, { timeZone: "Asia/Kolkata" }),
    ).toBe("07 Oct 2026 · 5:30 am");
  });

  it("rolls the calendar day over with the zone", () => {
    expect(
      formatEventDateTime("2026-10-06T14:30:00.000Z", {
        timeZone: "Australia/Perth",
      }),
    ).toBe("06 Oct 2026 · 10:30 pm");
    expect(
      formatEventDateTime("2026-10-06T14:30:00.000Z", {
        timeZone: "Australia/Sydney",
      }),
    ).toBe("07 Oct 2026 · 1:30 am");
  });

  it("prints a date-only value as just its date, unshifted", () => {
    expect(
      formatEventDateTime("2026-10-07", { timeZone: "Pacific/Honolulu" }),
    ).toBe("07 Oct 2026");
  });

  it("falls back to the browser zone for an unknown zone name", () => {
    expect(
      formatEventDateTime(sydneyEleven, { timeZone: "Not/AZone" }),
    ).toMatch(/^\d{2} Oct 2026 · \d{1,2}:\d{2} (am|pm)$/);
  });

  it("supports the invoice timeline's compact style", () => {
    expect(
      formatEventDateTime(sydneyEleven, {
        timeZone: "Australia/Sydney",
        style: "compact",
      }),
    ).toBe("07 Oct 26, 11:00 am");
  });
});

describe("history formatters", () => {
  it("never renders 'undefined' or 'Select date' for the API's real shapes", () => {
    for (const value of [
      "2026-10-07T00:12:00.000Z",
      // The naive server-local shape older API builds sent.
      "2026-10-07 09:12:00",
      "2026-10-07",
    ]) {
      const quote = formatQuoteEventTime(value, "Australia/Sydney");
      const invoice = formatTimelineDateTime(value, "Australia/Sydney");
      for (const text of [quote, invoice]) {
        expect(text).not.toMatch(/undefined|NaN|Select date|Invalid/);
      }
    }
  });

  it("formats a quote event in the business zone", () => {
    expect(
      formatQuoteEventTime("2026-10-07T00:12:00.000Z", "Australia/Sydney"),
    ).toBe("07 Oct 2026 · 11:12 am");
  });
});
