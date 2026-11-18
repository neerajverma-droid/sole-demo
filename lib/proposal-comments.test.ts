import { describe, expect, it } from "vitest";

import {
  STEP_OF_SECTION,
  SECTION_OF_TAB,
  locateQuote,
  mapThreads,
  openCount,
  placementOf,
  sortThreads,
  squash,
} from "@/lib/proposal-comments";

const apiThread = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  section: "SERVICES",
  quote: "Monthly bookkeeping",
  anchor: { prefix: "Services ", suffix: " $440" },
  resolved: false,
  resolved_by: null,
  created_at: "2026-11-14T10:00:00.000Z",
  comments: [
    { id: 7, author_type: "client", author_name: "Alex Taylor", body: "Too high", created_at: "2026-11-14T10:00:00.000Z" },
    { id: 8, author_type: "user", author_name: "Joshi Advisory", body: "Reduced", created_at: "2026-11-14T11:00:00.000Z" },
  ],
  ...overrides,
});

describe("mapThreads", () => {
  it("reads a thread and its replies", () => {
    expect(mapThreads([apiThread()])).toEqual([
      {
        id: "7",
        section: "SERVICES",
        quote: "Monthly bookkeeping",
        anchor: { prefix: "Services ", suffix: " $440" },
        resolved: false,
        resolvedBy: null,
        createdAt: "2026-11-14T10:00:00.000Z",
        comments: [
          { id: "7", authorType: "client", authorName: "Alex Taylor", body: "Too high", createdAt: "2026-11-14T10:00:00.000Z" },
          { id: "8", authorType: "user", authorName: "Joshi Advisory", body: "Reduced", createdAt: "2026-11-14T11:00:00.000Z" },
        ],
      },
    ]);
  });

  it("copes with a whole-page comment and odd values", () => {
    const [thread] = mapThreads([apiThread({ quote: null, anchor: null, section: "NOPE", resolved_by: "x", comments: undefined })]);
    expect(thread).toMatchObject({ quote: null, anchor: null, section: "COVER", resolvedBy: null, comments: [] });
    expect(mapThreads(null)).toEqual([]);
  });
});

describe("ordering and counts", () => {
  const threads = mapThreads([
    apiThread({ id: 1, resolved: true, created_at: "2026-11-14T08:00:00Z" }),
    apiThread({ id: 2, created_at: "2026-11-14T09:00:00Z" }),
    apiThread({ id: 3, section: "TERMS", created_at: "2026-11-14T07:00:00Z" }),
  ]);

  it("puts open threads first, oldest first", () => {
    expect(sortThreads(threads).map((thread) => thread.id)).toEqual(["3", "2", "1"]);
  });

  it("counts open threads, per page or in all", () => {
    expect(openCount(threads)).toBe(2);
    expect(openCount(threads, "SERVICES")).toBe(1);
    expect(openCount(threads, "PRICING")).toBe(0);
  });
});

describe("pages and steps", () => {
  it("maps each commentable page to its tab and its builder step", () => {
    expect(SECTION_OF_TAB.Pricing).toBe("PRICING");
    expect(SECTION_OF_TAB.Email).toBeUndefined();
    expect(STEP_OF_SECTION).toEqual({
      COVER: "General",
      INTRODUCTION: "Introduction",
      SERVICES: "Services",
      PRICING: "Payments",
      TERMS: "Terms & Sign",
      THANK_YOU: "Thank You",
    });
  });
});

describe("finding highlighted text again", () => {
  const page = squash("Services  Monthly bookkeeping  $440 per month. Annual returns   $900. Monthly bookkeeping again later.");

  it("stores the selected words and a little text either side", () => {
    const start = page.indexOf("Annual returns");
    const placement = placementOf(page, start, start + "Annual returns".length);
    expect(placement.quote).toBe("Annual returns");
    expect(placement.anchor.prefix.endsWith("per month. ")).toBe(true);
    expect(placement.anchor.suffix.startsWith(" $900")).toBe(true);
  });

  it("finds the quote, and picks the right one when it appears twice", () => {
    const second = page.lastIndexOf("Monthly bookkeeping");
    const { quote, anchor } = placementOf(page, second, second + "Monthly bookkeeping".length);
    expect(locateQuote(page, quote, anchor)).toEqual({ start: second, end: second + quote.length });
    const first = page.indexOf("Monthly bookkeeping");
    const firstPlacement = placementOf(page, first, first + "Monthly bookkeeping".length);
    expect(locateQuote(page, firstPlacement.quote, firstPlacement.anchor)?.start).toBe(first);
  });

  it("still finds it when the layout's spacing changed", () => {
    expect(locateQuote(squash("Annual\n   returns $900"), "Annual returns", null)).toEqual({ start: 0, end: 14 });
  });

  it("gives up when the words were edited away", () => {
    expect(locateQuote(page, "Quarterly bookkeeping", null)).toBeNull();
    expect(locateQuote(page, "  ", null)).toBeNull();
  });
});
