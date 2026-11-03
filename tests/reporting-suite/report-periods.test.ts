/**
 * `lib/report-periods.ts` — the period engine every report resolves its
 * span through. P&L's "previous period" call (see `lib/reports.test.ts`)
 * and every tabular report's `range` come from `periodShape` here, so a
 * quarter has to mean the same three months everywhere.
 */
import { describe, expect, it } from "vitest";
import { format } from "date-fns";

import {
  coverage,
  daysIn,
  financialYear,
  fyLabel,
  monthsIn,
  periodShape,
  quarterLabel,
  reportDelta,
  reportMoney,
  reportPercent,
  spanLabel,
} from "@/lib/report-periods";

const iso = (date: Date) => format(date, "yyyy-MM-dd");
const span = (shape: { from: Date; to: Date }) => [iso(shape.from), iso(shape.to)];

/** A Wednesday in the second BAS quarter of FY27. */
const TODAY = new Date(2026, 9, 8);

describe("financial years", () => {
  it("runs 1 July to 30 June, rolling over in July", () => {
    expect(span(financialYear(new Date(2026, 5, 30)))).toEqual(["2025-07-01", "2026-06-30"]);
    expect(span(financialYear(new Date(2026, 6, 1)))).toEqual(["2026-07-01", "2027-06-30"]);
  });

  it("labels a year by both halves", () => {
    expect(fyLabel(new Date(2026, 6, 1))).toBe("2026-27");
    expect(fyLabel(new Date(2000, 0, 1))).toBe("1999-00");
  });
});

describe("quarterLabel", () => {
  it("numbers quarters the BAS way — Q1 is July to September", () => {
    expect(quarterLabel(new Date(2026, 6, 1))).toBe("Q1 FY27");
    expect(quarterLabel(new Date(2026, 9, 1))).toBe("Q2 FY27");
    expect(quarterLabel(new Date(2027, 0, 1))).toBe("Q3 FY27");
    expect(quarterLabel(new Date(2027, 3, 1))).toBe("Q4 FY27");
  });
});

describe("periodShape", () => {
  it("resolves this month against last month", () => {
    const shape = periodShape("This month", null, TODAY);
    expect(span(shape.current)).toEqual(["2026-10-01", "2026-10-31"]);
    expect(span(shape.previous)).toEqual(["2026-09-01", "2026-09-30"]);
    expect(shape.scope).toBe("Oct 2026");
    expect(shape.previousLabel).toBe("last month");
  });

  it("resolves last month against the month before", () => {
    const shape = periodShape("Last month", null, TODAY);
    expect(span(shape.current)).toEqual(["2026-09-01", "2026-09-30"]);
    expect(span(shape.previous)).toEqual(["2026-08-01", "2026-08-31"]);
  });

  it("resolves quarters to whole calendar quarters, labelled as BAS quarters", () => {
    const thisQ = periodShape("This quarter", null, TODAY);
    expect(span(thisQ.current)).toEqual(["2026-10-01", "2026-12-31"]);
    expect(span(thisQ.previous)).toEqual(["2026-07-01", "2026-09-30"]);
    expect(thisQ.scope).toBe("Q2 FY27");
    expect(thisQ.previousScope).toBe("Q1 FY27");

    const lastQ = periodShape("Last quarter", null, TODAY);
    expect(span(lastQ.current)).toEqual(["2026-07-01", "2026-09-30"]);
    expect(span(lastQ.previous)).toEqual(["2026-04-01", "2026-06-30"]);
    expect(lastQ.scope).toBe("Q1 FY27");
    expect(lastQ.previousScope).toBe("Q4 FY26");
  });

  it("resolves financial years against the year before", () => {
    const thisFy = periodShape("This financial year", null, TODAY);
    expect(span(thisFy.current)).toEqual(["2026-07-01", "2027-06-30"]);
    expect(span(thisFy.previous)).toEqual(["2025-07-01", "2026-06-30"]);
    expect(thisFy.scope).toBe("2026-27");

    const lastFy = periodShape("Last financial year", null, TODAY);
    expect(span(lastFy.current)).toEqual(["2025-07-01", "2026-06-30"]);
    expect(span(lastFy.previous)).toEqual(["2024-07-01", "2025-06-30"]);
  });

  it("compares a custom range against the same number of days immediately before it", () => {
    const shape = periodShape("Custom range", { from: "2026-03-10", to: "2026-03-19" }, TODAY);
    expect(span(shape.current)).toEqual(["2026-03-10", "2026-03-19"]);
    expect(span(shape.previous)).toEqual(["2026-02-28", "2026-03-09"]);
    expect(daysIn(shape.previous)).toBe(daysIn(shape.current));
  });

  it("falls back to the last 30 days for a missing, invalid or backwards custom range", () => {
    for (const range of [
      null,
      { from: "garbage", to: "2026-03-19" },
      { from: "2026-03-19", to: "2026-03-10" },
    ]) {
      const shape = periodShape("Custom range", range, TODAY);
      expect(span(shape.current)).toEqual(["2026-09-09", "2026-10-08"]);
      expect(daysIn(shape.current)).toBe(30);
    }
  });
});

describe("monthsIn / daysIn / coverage", () => {
  const custom = { from: new Date(2026, 0, 16), to: new Date(2026, 2, 31) };

  it("lists every month a span touches and counts both ends", () => {
    expect(monthsIn(custom).map((m) => format(m, "yyyy-MM"))).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(daysIn({ from: new Date(2026, 0, 1), to: new Date(2026, 0, 1) })).toBe(1);
  });

  it("gives a mid-month start only part of that month, and whole months 1", () => {
    expect(coverage(new Date(2026, 0, 1), custom)).toBeCloseTo(16 / 31);
    expect(coverage(new Date(2026, 1, 1), custom)).toBe(1);
    expect(coverage(new Date(2026, 5, 1), custom)).toBe(0);
  });
});

describe("formatters", () => {
  it("puts the minus in front of the dollar, two decimals always", () => {
    expect(reportMoney(-1200)).toBe("-$1,200.00");
    expect(reportMoney(1234.5)).toBe("$1,234.50");
    expect(reportPercent(34.25)).toBe("34.3%");
  });

  it("labels a span with both ends", () => {
    expect(spanLabel({ from: new Date(2026, 6, 1), to: new Date(2027, 5, 30) })).toBe(
      "1 Jul 2026 – 30 Jun 2027",
    );
  });
});

describe("reportDelta", () => {
  it("colours by direction, not by sign — a rise in costs is unfavourable", () => {
    const income = reportDelta({ amount: 1500, previous: 1000 }, "last month");
    expect(income).toMatchObject({ amount: 500, up: true, flat: false, favourable: true });
    expect(income.label).toBe("+$500.00 vs last month");

    const costs = reportDelta({ amount: 1500, previous: 1000 }, "last month", "down-good");
    expect(costs.favourable).toBe(false);

    const fall = reportDelta({ amount: 800, previous: 1000 }, "last month", "down-good");
    expect(fall).toMatchObject({ up: false, favourable: true, label: "-$200.00 vs last month" });
  });

  it("treats sub-cent movement as no change", () => {
    const delta = reportDelta({ amount: 100.004, previous: 100 }, "last month");
    expect(delta.flat).toBe(true);
    expect(delta.label).toBe("No change vs last month");
  });

  it("accepts a formatter for a plain count", () => {
    expect(
      reportDelta({ amount: 7, previous: 4 }, "last quarter", "up-good", String).label,
    ).toBe("+3 vs last quarter");
  });
});

describe("the financial year is the business's country's", () => {
  const NZ = { month: 4, day: 1 };
  const ZA = { month: 3, day: 1 };
  const CALENDAR = { month: 1, day: 1 };
  const iso = (date: Date) => format(date, "yyyy-MM-dd");

  it("runs July to June in Australia, which is the default", () => {
    const fy = financialYear(new Date(2026, 7, 15));
    expect([iso(fy.from), iso(fy.to)]).toEqual(["2026-07-01", "2027-06-30"]);
    // August is in the year that started that July.
    expect(iso(financialYear(new Date(2026, 1, 15)).from)).toBe("2025-07-01");
  });

  it("runs April to March in New Zealand", () => {
    const fy = financialYear(new Date(2026, 7, 15), NZ);
    expect([iso(fy.from), iso(fy.to)]).toEqual(["2026-04-01", "2027-03-31"]);
    // A February date belongs to the year that started the previous April.
    expect(iso(financialYear(new Date(2027, 1, 15), NZ).from)).toBe("2026-04-01");
  });

  it("runs March to the end of February in South Africa, leap year included", () => {
    expect(iso(financialYear(new Date(2026, 5, 1), ZA).to)).toBe("2027-02-28");
    // 2028 is a leap year, so that year ends on the 29th — derived from the
    // day before the next year starts rather than a hardcoded 28.
    expect(iso(financialYear(new Date(2027, 5, 1), ZA).to)).toBe("2028-02-29");
  });

  it("is the calendar year when a country starts on 1 January", () => {
    const fy = financialYear(new Date(2026, 7, 15), CALENDAR);
    expect([iso(fy.from), iso(fy.to)]).toEqual(["2026-01-01", "2026-12-31"]);
  });

  it("falls back to Australia rather than computing nonsense from a bad value", () => {
    const bad = financialYear(new Date(2026, 7, 15), { month: 13, day: 99 });
    expect(iso(bad.from)).toBe("2026-07-01");
  });
});

describe("the financial year's name", () => {
  it("spans two years where the year does", () => {
    expect(fyLabel(new Date(2026, 7, 15))).toBe("2026-27");
    expect(fyLabel(new Date(2026, 7, 15), { month: 4, day: 1 })).toBe("2026-27");
  });

  it("is one year where the year is a calendar one", () => {
    // "2026-27" would be a lie about a year that ends in December.
    expect(fyLabel(new Date(2026, 7, 15), { month: 1, day: 1 })).toBe("2026");
  });
});

describe("quarter names follow the financial year", () => {
  it("counts from July in Australia", () => {
    expect(quarterLabel(new Date(2026, 6, 1))).toBe("Q1 FY27");
    expect(quarterLabel(new Date(2026, 9, 1))).toBe("Q2 FY27");
    expect(quarterLabel(new Date(2027, 3, 1))).toBe("Q4 FY27");
  });

  it("counts from April in New Zealand", () => {
    const NZ = { month: 4, day: 1 };
    expect(quarterLabel(new Date(2026, 3, 1), NZ)).toBe("Q1 FY27");
    expect(quarterLabel(new Date(2026, 6, 1), NZ)).toBe("Q2 FY27");
  });

  it("names the months in South Africa, whose year doesn't land on a quarter", () => {
    // A 1 March year start means March–May is not a calendar quarter, so a
    // quarter number would be one nobody files on.
    expect(quarterLabel(new Date(2026, 3, 1), { month: 3, day: 1 })).toBe("Apr–Jun 2026");
  });
});

describe("periodShape threads the country's year through", () => {
  const NZ = { month: 4, day: 1 };
  const AT = new Date(2026, 7, 15, 12);
  const iso = (date: Date) => format(date, "yyyy-MM-dd");

  it("resolves 'This financial year' to New Zealand's twelve months", () => {
    const shape = periodShape("This financial year", null, AT, NZ);
    expect([iso(shape.current.from), iso(shape.current.to)]).toEqual([
      "2026-04-01",
      "2027-03-31",
    ]);
    expect([iso(shape.previous.from), iso(shape.previous.to)]).toEqual([
      "2025-04-01",
      "2026-03-31",
    ]);
    expect(shape.scope).toBe("2026-27");
  });

  it("resolves 'Last financial year' to the one before it", () => {
    const shape = periodShape("Last financial year", null, AT, NZ);
    expect([iso(shape.current.from), iso(shape.current.to)]).toEqual([
      "2025-04-01",
      "2026-03-31",
    ]);
  });

  it("leaves a month alone — a month is a month in every country", () => {
    const au = periodShape("This month", null, AT);
    const nz = periodShape("This month", null, AT, NZ);
    expect(iso(nz.current.from)).toBe(iso(au.current.from));
    expect(iso(nz.current.to)).toBe(iso(au.current.to));
  });

  it("keeps Australia's answer when no country is passed", () => {
    const shape = periodShape("This financial year", null, AT);
    expect([iso(shape.current.from), iso(shape.current.to)]).toEqual([
      "2026-07-01",
      "2027-06-30",
    ]);
  });
});
