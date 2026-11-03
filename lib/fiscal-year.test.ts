import { describe, expect, it } from "vitest";

import {
  AU_FISCAL_YEAR_START,
  fiscalQuarterOf,
  fiscalYearLabel,
  fiscalYearOf,
  fiscalYearOfIso,
  fiscalYearRange,
  fiscalYearSpan,
  recentFiscalYears,
} from "@/lib/fiscal-year";
import { currentFinancialYear } from "@/lib/invoices";
import { fyLabel, quarterLabel } from "@/lib/report-periods";
import { recentFinancialYears } from "@/lib/asset-depreciation-report";
import {
  financialYearChoices,
  financialYearRange,
} from "@/lib/bank-transactions";
import { presetRange } from "@/lib/transaction-filters";
import { financialYearOf } from "@/lib/transactions";

const NZ = { month: 4, day: 1 };

describe("fiscalYearOf — Australia (the default)", () => {
  it("1 July starts the year, 30 June ends the last", () => {
    expect(fiscalYearOf(new Date(2026, 6, 1))).toBe(2026);
    expect(fiscalYearOf(new Date(2026, 5, 30))).toBe(2025);
    expect(fiscalYearOf(new Date(2027, 2, 15))).toBe(2026);
    expect(fiscalYearOf(new Date(2026, 6, 1), AU_FISCAL_YEAR_START)).toBe(2026);
  });

  it("reads an ISO date the same way, without parsing it", () => {
    expect(fiscalYearOfIso("2026-07-01")).toBe(2026);
    expect(fiscalYearOfIso("2026-06-30")).toBe(2025);
  });
});

describe("fiscalYearOf — New Zealand (1 April)", () => {
  it("15 Mar 2027 is in the year that started 1 Apr 2026", () => {
    expect(fiscalYearOf(new Date(2027, 2, 15), NZ)).toBe(2026);
    expect(fiscalYearOfIso("2027-03-15", NZ)).toBe(2026);
  });

  it("1 Apr 2027 starts the next one", () => {
    expect(fiscalYearOf(new Date(2027, 3, 1), NZ)).toBe(2027);
    expect(fiscalYearOfIso("2027-04-01", NZ)).toBe(2027);
    expect(fiscalYearOf(new Date(2027, 2, 31), NZ)).toBe(2026);
  });

  it("honours a start day other than the 1st", () => {
    const start = { month: 3, day: 15 };
    expect(fiscalYearOf(new Date(2027, 2, 14), start)).toBe(2026);
    expect(fiscalYearOf(new Date(2027, 2, 15), start)).toBe(2027);
  });
});

describe("fiscalYearRange / fiscalYearSpan", () => {
  it("AU: 1 July to 30 June", () => {
    expect(fiscalYearRange(2026)).toEqual({
      start: "2026-07-01",
      end: "2027-06-30",
    });
    expect(fiscalYearSpan(2026)).toEqual({
      from: new Date(2026, 6, 1),
      to: new Date(2027, 5, 30),
    });
  });

  it("NZ: 1 April to 31 March", () => {
    expect(fiscalYearRange(2026, NZ)).toEqual({
      start: "2026-04-01",
      end: "2027-03-31",
    });
  });

  it("a 1 March year ends on the last day of February, leap years included", () => {
    expect(fiscalYearRange(2027, { month: 3, day: 1 }).end).toBe("2028-02-29");
    expect(fiscalYearRange(2026, { month: 3, day: 1 }).end).toBe("2027-02-28");
  });
});

describe("recentFiscalYears", () => {
  it("newest first, by start year", () => {
    expect(recentFiscalYears(3, new Date(2026, 9, 22))).toEqual([
      2026, 2025, 2024,
    ]);
    expect(recentFiscalYears(3, new Date(2027, 2, 15), NZ)).toEqual([
      2026, 2025, 2024,
    ]);
    expect(recentFiscalYears(2, new Date(2027, 3, 1), NZ)).toEqual([
      2027, 2026,
    ]);
  });
});

describe("fiscalQuarterOf", () => {
  it("AU: Q1 is July–September", () => {
    expect(fiscalQuarterOf(new Date(2026, 6, 1))).toBe(1);
    expect(fiscalQuarterOf(new Date(2026, 9, 1))).toBe(2);
    expect(fiscalQuarterOf(new Date(2027, 0, 1))).toBe(3);
    expect(fiscalQuarterOf(new Date(2027, 3, 1))).toBe(4);
  });

  it("NZ: Q1 is April–June", () => {
    expect(fiscalQuarterOf(new Date(2026, 3, 1), NZ)).toBe(1);
    expect(fiscalQuarterOf(new Date(2026, 6, 1), NZ)).toBe(2);
    expect(fiscalQuarterOf(new Date(2027, 2, 31), NZ)).toBe(4);
  });
});

describe("fiscalYearLabel", () => {
  it("keeps the three shapes the app already uses", () => {
    expect(fiscalYearLabel(2026, "short")).toBe("FY 26/27");
    expect(fiscalYearLabel(2026, "span")).toBe("2026-27");
    expect(fiscalYearLabel(1999, "span")).toBe("1999-00");
    expect(fiscalYearLabel(2026, "long")).toBe("FY 2026/2027");
  });
});

/*
 * The helpers built on it: unchanged for Australia by default, and on the
 * April year when passed New Zealand's start.
 */
describe("the financial-year helpers, AU by default and NZ when asked", () => {
  it("currentFinancialYear", () => {
    expect(currentFinancialYear(new Date(2026, 9, 22))).toEqual({
      startIso: "2026-07-01",
      endIso: "2027-06-30",
      label: "Financial year 2026",
    });
    expect(currentFinancialYear(new Date(2027, 2, 15), NZ)).toEqual({
      startIso: "2026-04-01",
      endIso: "2027-03-31",
      label: "Financial year 2026",
    });
    expect(currentFinancialYear(new Date(2027, 3, 1), NZ).startIso).toBe(
      "2027-04-01",
    );
  });

  it("report-periods fyLabel / quarterLabel", () => {
    expect(fyLabel(new Date(2027, 2, 15))).toBe("2026-27");
    expect(fyLabel(new Date(2027, 3, 1))).toBe("2026-27");
    expect(fyLabel(new Date(2027, 3, 1), NZ)).toBe("2027-28");
    expect(quarterLabel(new Date(2026, 6, 1))).toBe("Q1 FY27");
    expect(quarterLabel(new Date(2026, 3, 1), NZ)).toBe("Q1 FY27");
    expect(quarterLabel(new Date(2027, 0, 1), NZ)).toBe("Q4 FY27");
  });

  it("recentFinancialYears (balance sheet, trial balance, depreciation)", () => {
    expect(recentFinancialYears("2026-10-22")[0]).toEqual({
      start: "2026-07-01",
      end: "2027-06-30",
      label: "FY 2026/2027",
    });
    expect(recentFinancialYears("2027-03-15", NZ)[0]).toEqual({
      start: "2026-04-01",
      end: "2027-03-31",
      label: "FY 2026/2027",
    });
  });

  it("the Transactions list's year labels and ranges", () => {
    expect(financialYearChoices(new Date(2026, 4, 1))[0]).toBe("FY 25/26");
    expect(financialYearChoices(new Date(2026, 4, 1), NZ)[0]).toBe("FY 26/27");
    expect(financialYearRange("FY 25/26")).toEqual({
      start: "2025-07-01",
      end: "2026-06-30",
    });
    expect(financialYearRange("FY 25/26", NZ)).toEqual({
      start: "2025-04-01",
      end: "2026-03-31",
    });
    expect(financialYearOf("2026-05-01")).toBe(2026);
    expect(financialYearOf("2026-05-01", NZ)).toBe(2027);
  });

  it("the Filters popover's previous financial year", () => {
    expect(presetRange("prev_fy", new Date(2026, 4, 1))).toEqual({
      from: "2024-07-01",
      to: "2025-06-30",
    });
    expect(presetRange("prev_fy", new Date(2026, 4, 1), NZ)).toEqual({
      from: "2025-04-01",
      to: "2026-03-31",
    });
  });
});
