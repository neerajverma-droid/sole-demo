import { describe, expect, it } from "vitest";

import {
  anchorOf,
  cashFlowSeries,
  compareSuffix,
  comparisonRange,
  defaultCustomRange,
  indexOfKey,
  monthsIn,
  percentChange,
  periodRange,
  rangeLabel,
  totalsFor,
} from "@/lib/cash-flow";
import type { CashFlowMonth } from "@/lib/dashboard";

const LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * `count` consecutive months ending at `endYear`-`endMonth` (1-based), oldest
 * first — the same shape `fetchDashboardCashFlow` returns. Money in is
 * 100 × position + 100, money out is 50 × position + 50, so every month's
 * figures are distinct and sums are easy to check by hand.
 */
function months(count: number, endYear: number, endMonth: number): CashFlowMonth[] {
  const out: CashFlowMonth[] = [];
  for (let i = 0; i < count; i += 1) {
    const offset = count - 1 - i;
    const date = new Date(endYear, endMonth - 1 - offset, 1);
    const year = date.getFullYear();
    const monthIndex = date.getMonth();
    out.push({
      key: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
      month: LABELS[monthIndex],
      year,
      moneyIn: 100 * (i + 1),
      moneyOut: 50 * (i + 1),
    });
  }
  return out;
}

// 24 months, Nov 2024 – Oct 2026 — the real fetch window as of Oct 2026.
const FULL = months(24, 2026, 10);

describe("anchorOf / indexOfKey", () => {
  it("anchors on the newest (last) month", () => {
    expect(anchorOf(FULL)).toBe(23);
    expect(FULL[anchorOf(FULL)].key).toBe("2026-10");
  });

  it("finds a month by key, -1 when absent", () => {
    expect(indexOfKey(FULL, "2025-11")).toBe(12);
    expect(indexOfKey(FULL, "2019-01")).toBe(-1);
  });
});

describe("periodRange", () => {
  it("This month is just the anchor", () => {
    expect(periodRange(FULL, "This month")).toEqual({ start: 23, end: 23 });
  });

  it("This quarter runs from the start of the anchor's calendar quarter", () => {
    // Oct is the first month of Q4 → only Oct itself.
    expect(periodRange(FULL, "This quarter")).toEqual({ start: 23, end: 23 });
    // Ending in Aug → Jul, Aug.
    const toAug = months(24, 2026, 8);
    expect(monthsIn(toAug, periodRange(toAug, "This quarter")).map((m) => m.key)).toEqual([
      "2026-07",
      "2026-08",
    ]);
    // Ending in Dec → Oct, Nov, Dec.
    const toDec = months(24, 2026, 12);
    expect(periodRange(toDec, "This quarter")).toEqual({ start: 21, end: 23 });
  });

  it("Last 6 months is the six ending at the anchor, clamped to the data", () => {
    expect(periodRange(FULL, "Last 6 months")).toEqual({ start: 18, end: 23 });
    expect(periodRange(months(4, 2026, 10), "Last 6 months")).toEqual({ start: 0, end: 3 });
  });

  it("This year runs from January of the anchor year, clamped to the data", () => {
    expect(monthsIn(FULL, periodRange(FULL, "This year"))[0].key).toBe("2026-01");
    expect(periodRange(FULL, "This year")).toEqual({ start: 14, end: 23 });
    expect(periodRange(months(3, 2026, 10), "This year")).toEqual({ start: 0, end: 2 });
  });

  it("Custom resolves both keys to indices, normalising a back-to-front pick", () => {
    expect(periodRange(FULL, "Custom", { fromKey: "2025-03", toKey: "2025-06" })).toEqual({
      start: 4,
      end: 7,
    });
    expect(periodRange(FULL, "Custom", { fromKey: "2025-06", toKey: "2025-03" })).toEqual({
      start: 4,
      end: 7,
    });
  });

  it("Custom with no range picked uses the default last three months", () => {
    expect(periodRange(FULL, "Custom")).toEqual({ start: 21, end: 23 });
  });

  it("Custom with a key outside the data falls back to the last three months", () => {
    expect(periodRange(FULL, "Custom", { fromKey: "2010-01", toKey: "2026-10" })).toEqual({
      start: 21,
      end: 23,
    });
  });

  it("is {0,0} for an empty month list rather than throwing", () => {
    for (const period of ["This month", "This quarter", "Last 6 months", "This year", "Custom"] as const) {
      expect(periodRange([], period)).toEqual({ start: 0, end: 0 });
    }
  });
});

describe("defaultCustomRange", () => {
  it("opens on the last three months", () => {
    expect(defaultCustomRange(FULL)).toEqual({ fromKey: "2026-08", toKey: "2026-10" });
  });

  it("clamps to the first month when there are fewer than three", () => {
    const two = months(2, 2026, 10);
    expect(defaultCustomRange(two)).toEqual({ fromKey: "2026-09", toKey: "2026-10" });
  });

  it("is blank keys for no data", () => {
    expect(defaultCustomRange([])).toEqual({ fromKey: "", toKey: "" });
  });
});

describe("comparisonRange", () => {
  it("Previous period shifts back by the period's own length", () => {
    expect(comparisonRange({ start: 18, end: 23 }, "Previous period")).toEqual({ start: 12, end: 17 });
    expect(comparisonRange({ start: 23, end: 23 }, "Previous period")).toEqual({ start: 22, end: 22 });
  });

  it("Same period last year shifts back exactly 12 months regardless of length", () => {
    expect(comparisonRange({ start: 21, end: 23 }, "Same period last year")).toEqual({ start: 9, end: 11 });
  });

  it("is null when the data doesn't reach back far enough, rather than a truncated window", () => {
    expect(comparisonRange({ start: 3, end: 8 }, "Previous period")).toBeNull();
    expect(comparisonRange({ start: 11, end: 11 }, "Same period last year")).toBeNull();
  });

  it("allows a comparison starting exactly at index 0", () => {
    expect(comparisonRange({ start: 12, end: 23 }, "Same period last year")).toEqual({ start: 0, end: 11 });
  });

  it("over the 24-month fetch window, every preset has a full year-on-year comparison", () => {
    for (const period of ["This month", "This quarter", "Last 6 months", "This year"] as const) {
      expect(comparisonRange(periodRange(FULL, period), "Same period last year")).not.toBeNull();
      expect(comparisonRange(periodRange(FULL, period), "Previous period")).not.toBeNull();
    }
  });
});

describe("totalsFor", () => {
  it("sums money in/out over the inclusive range and nets them", () => {
    // Positions 22..24 → in 2200+2300+2400, out 1100+1150+1200.
    expect(totalsFor(FULL, { start: 21, end: 23 })).toEqual({
      moneyIn: 6900,
      moneyOut: 3450,
      net: 3450,
    });
  });

  it("can go negative", () => {
    const loss: CashFlowMonth[] = [{ key: "2026-01", month: "Jan", year: 2026, moneyIn: 100, moneyOut: 400 }];
    expect(totalsFor(loss, { start: 0, end: 0 })).toEqual({ moneyIn: 100, moneyOut: 400, net: -300 });
  });
});

describe("percentChange", () => {
  it("is the signed change relative to the baseline's magnitude", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    // Negative baseline: improving from -200 to -100 is +50%, not -50%.
    expect(percentChange(-100, -200)).toBe(50);
  });

  it("is null against a zero baseline", () => {
    expect(percentChange(500, 0)).toBeNull();
  });
});

describe("cashFlowSeries", () => {
  it("zips the two periods by position, labelling the axis with the current months", () => {
    const series = cashFlowSeries(FULL, { start: 22, end: 23 }, { start: 10, end: 11 });
    expect(series).toEqual([
      {
        label: "Sep",
        currentLabel: "Sep 2026",
        moneyIn: 2300,
        moneyOut: 1150,
        compareLabel: "Sep 2025",
        compareIn: 1100,
        compareOut: 550,
      },
      {
        label: "Oct",
        currentLabel: "Oct 2026",
        moneyIn: 2400,
        moneyOut: 1200,
        compareLabel: "Oct 2025",
        compareIn: 1200,
        compareOut: 600,
      },
    ]);
  });

  it("nulls the comparison fields when there's no comparison", () => {
    const [point] = cashFlowSeries(FULL, { start: 23, end: 23 }, null);
    expect(point).toMatchObject({ compareLabel: null, compareIn: null, compareOut: null });
  });

  it("nulls only the trailing points when the comparison is shorter", () => {
    const series = cashFlowSeries(FULL, { start: 21, end: 23 }, { start: 0, end: 0 });
    expect(series.map((p) => p.compareIn)).toEqual([100, null, null]);
  });

  it("adds a two-digit year to axis labels only past 12 months", () => {
    expect(cashFlowSeries(FULL, { start: 12, end: 23 }, null)[0].label).toBe("Nov");
    const long = cashFlowSeries(FULL, { start: 0, end: 23 }, null);
    expect(long[0].label).toBe("Nov 24");
    expect(long[23].label).toBe("Oct 26");
  });
});

describe("rangeLabel", () => {
  it("names a single month with its year", () => {
    expect(rangeLabel(FULL, { start: 23, end: 23 })).toBe("Oct 2026");
  });

  it("puts the year once for a run inside one year", () => {
    expect(rangeLabel(FULL, { start: 16, end: 23 })).toBe("Mar – Oct 2026");
  });

  it("names both years when the run crosses one", () => {
    expect(rangeLabel(FULL, { start: 0, end: 23 })).toBe("Nov 2024 – Oct 2026");
  });

  it("is a dash for no months", () => {
    expect(rangeLabel([], { start: 0, end: 0 })).toBe("—");
  });
});

describe("compareSuffix", () => {
  it("reads each mode's phrase", () => {
    expect(compareSuffix("Previous period")).toBe("vs previous period");
    expect(compareSuffix("Same period last year")).toBe("vs last year");
  });
});
