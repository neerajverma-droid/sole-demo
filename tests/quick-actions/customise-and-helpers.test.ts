/**
 * Quick Actions — Customise ("Show on home"), the shared formatters, and the
 * bookkeeping behind the rows' leave-and-arrive animation.
 */
import { describe, expect, it } from "vitest";

import { mergeRows, type ShownRow } from "@/lib/animated-rows";
import {
  DEFAULT_CARD_VISIBILITY,
  UNIBOX_CARD_OPTIONS,
  cardVisibilityKey,
  daysAgo,
  formatDuration,
  isReconciled,
  parseCardVisibility,
  shortDate,
  toNumber,
  toggleCardVisibility,
  truthy,
  visibleCardCount,
} from "@/lib/unibox";

/* ------------------------------------------------------------------ *
 * Customise
 * ------------------------------------------------------------------ */

describe("Customise — Show on home", () => {
  it("offers every card the old page did, in its order", () => {
    expect(UNIBOX_CARD_OPTIONS.map((option) => option.label)).toEqual([
      "Get paid",
      "Bank feed",
      "Expenses",
      "Your progress",
      "Time tracker",
      "Assets",
      "Projects",
      "Work coming up",
      "KM tracker",
      "Liabilities & equity",
    ]);
  });

  it("shows every card by default", () => {
    expect(Object.values(DEFAULT_CARD_VISIBILITY).every(Boolean)).toBe(true);
    expect(Object.keys(DEFAULT_CARD_VISIBILITY)).toHaveLength(UNIBOX_CARD_OPTIONS.length);
  });

  it("counts Liabilities & equity as two cards — eleven in all", () => {
    expect(visibleCardCount(DEFAULT_CARD_VISIBILITY)).toBe(11);
    expect(visibleCardCount({ ...DEFAULT_CARD_VISIBILITY, liabilities_equity: false })).toBe(9);
    expect(visibleCardCount({ ...DEFAULT_CARD_VISIBILITY, km_tracker: false })).toBe(10);
  });

  it("toggles a card off and back on", () => {
    const off = toggleCardVisibility(DEFAULT_CARD_VISIBILITY, "km_tracker");
    expect(off.km_tracker).toBe(false);
    expect(toggleCardVisibility(off, "km_tracker").km_tracker).toBe(true);
    // Nothing else moves.
    expect({ ...off, km_tracker: true }).toEqual(DEFAULT_CARD_VISIBILITY);
  });

  it("keys the saved preference by user and business, as the old page did", () => {
    expect(cardVisibilityKey("42", "7")).toBe("unibox-card-visibility:42:7");
    expect(cardVisibilityKey("42", null)).toBe("unibox-card-visibility:42:default");
  });

  it("reads a saved preference, filling in anything it doesn't mention", () => {
    const parsed = parseCardVisibility(JSON.stringify({ assets: false }));
    expect(parsed.assets).toBe(false);
    expect(parsed.get_paid).toBe(true);
  });

  it.each([null, "", "not json", "[1,2]", "null", "42"])("shows every card when the saved value is %j", (raw) => {
    expect(parseCardVisibility(raw)).toEqual(DEFAULT_CARD_VISIBILITY);
  });
});

/* ------------------------------------------------------------------ *
 * Shared formatters — uniboxData.js
 * ------------------------------------------------------------------ */

describe("formatters", () => {
  it("formatDuration reads minutes as min, hr or a decimal of hours", () => {
    expect(formatDuration(0)).toBe("0 min");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 hr");
    expect(formatDuration(120)).toBe("2 hr");
    expect(formatDuration(90)).toBe("1.5 hrs");
    expect(formatDuration(75)).toBe("1.3 hrs");
  });

  it("shortDate is day and short month, or the input when it can't be read", () => {
    expect(shortDate("2026-03-08T12:00:00")).toBe("8 Mar");
    expect(shortDate("garbage")).toBe("garbage");
    expect(shortDate(null)).toBe("");
  });

  it("daysAgo says Today, Yesterday or N days ago", () => {
    const at = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString();
    expect(daysAgo(at(0))).toBe("Today");
    expect(daysAgo(at(1))).toBe("Yesterday");
    expect(daysAgo(at(5))).toBe("5 days ago");
    expect(daysAgo(null)).toBe("");
    expect(daysAgo("garbage")).toBe("");
  });

  it("daysAgo never says a future date is ago", () => {
    expect(daysAgo(new Date(Date.now() + 3 * 86_400_000).toISOString())).toBe("Today");
  });

  it("truthy accepts the server's spellings of yes", () => {
    expect([true, 1, "1", "true", "TRUE"].map(truthy)).toEqual([true, true, true, true, true]);
    expect([false, 0, "0", "false", null, undefined, ""].map(truthy)).toEqual(
      Array(7).fill(false),
    );
  });

  it("isReconciled reads the same flags", () => {
    expect(isReconciled({ is_reconciled: 1 })).toBe(true);
    expect(isReconciled({ is_reconciled: "0" })).toBe(false);
    expect(isReconciled({})).toBe(false);
  });

  it("toNumber reads numbers and numeric strings, else zero", () => {
    expect(toNumber("12.5")).toBe(12.5);
    expect(toNumber(3)).toBe(3);
    expect(toNumber("abc")).toBe(0);
    expect(toNumber(undefined)).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * Rows leaving and arriving
 * ------------------------------------------------------------------ */

describe("mergeRows", () => {
  const idle = (...keys: string[]): ShownRow<string>[] =>
    keys.map((key) => ({ key, node: key, phase: "idle", settled: true }));
  const rows = (...keys: string[]) => keys.map((key) => ({ key, node: `${key}*` }));
  const shape = (shown: ShownRow<string>[]) => shown.map((row) => `${row.key}:${row.phase}`);

  it("leaves rows that stay exactly as they were, with their new content", () => {
    const next = mergeRows(idle("a", "b"), rows("a", "b"), false);
    expect(shape(next)).toEqual(["a:idle", "b:idle"]);
    expect(next[0]).toMatchObject({ node: "a*", settled: true });
  });

  it("marks a finished row to exit, where it was", () => {
    expect(shape(mergeRows(idle("a", "b", "c"), rows("a", "c"), false))).toEqual(["a:idle", "b:exit", "c:idle"]);
  });

  it("keeps the departing row's last content to draw while it goes", () => {
    const next = mergeRows(idle("a", "b"), rows("a"), false);
    expect(next.find((row) => row.key === "b")?.node).toBe("b");
  });

  it("brings the next one in, unsettled, as the old one leaves", () => {
    const next = mergeRows(idle("a", "b"), rows("a", "c"), false);
    expect(shape(next)).toEqual(["a:idle", "b:exit", "c:enter"]);
    expect(next.find((row) => row.key === "c")?.settled).toBe(false);
  });

  it("brings a row back in if it returns while still leaving", () => {
    const leaving: ShownRow<string>[] = [{ key: "a", node: "a", phase: "exit", settled: true }];
    expect(shape(mergeRows(leaving, rows("a"), false))).toEqual(["a:enter"]);
  });

  it("puts a departing last row at the end", () => {
    expect(shape(mergeRows(idle("a", "b"), rows("a"), false))).toEqual(["a:idle", "b:exit"]);
  });

  it("empties out fully, every row leaving", () => {
    expect(shape(mergeRows(idle("a", "b"), [], false))).toEqual(["a:exit", "b:exit"]);
  });

  it("with reduced motion, swaps at once — nothing enters or exits", () => {
    const next = mergeRows(idle("a", "b"), rows("a", "c"), true);
    expect(shape(next)).toEqual(["a:idle", "c:idle"]);
    expect(next.every((row) => row.settled)).toBe(true);
  });
});
