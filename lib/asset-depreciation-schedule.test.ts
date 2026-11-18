import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = { get: vi.fn() };

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// Imported after the mock so the module's `api` is the mocked one.
const {
  fetchAssetDepreciationSchedule,
  mapApiDepreciationSchedule,
  isCurrentPeriod,
  isFuturePeriod,
  scheduleTotals,
  groupByIncomeYear,
  depreciationScheduleCsv,
  depreciationScheduleFilename,
} = await import("@/lib/asset-depreciation-schedule");

/** Shaped like the controller's `data`: DECIMALs come back as strings. */
const apiRecord = {
  id: 7,
  asset_id: 42,
  depreciation_method: "straight_line",
  effective_life_years: "5.00",
  depreciation_rate: "20.0000",
  residual_value: "0.00",
  cost_limit: null,
  start_date: "2026-05-15",
  opening_value: "1200.00",
  accumulated_depreciation: "30.00",
  book_value: "1170.00",
  asset: { id: 42, name: "Laptop", price: "1320.00", sub_total: "1200.00" },
  // Deliberately out of order — Sequelize ignores the include's `order`.
  entries: [
    {
      period_start: "2026-07-01",
      period_end: "2026-07-31",
      depreciation_amount: "20.38",
      opening_book_value: "1167.94",
      closing_book_value: "1147.56",
      days_held: 31,
      is_posted: 0,
    },
    {
      period_start: "2026-05-15",
      period_end: "2026-05-31",
      depreciation_amount: "11.18",
      opening_book_value: "1200.00",
      closing_book_value: "1188.82",
      days_held: 17,
      is_posted: 1,
    },
    {
      period_start: "2026-06-01",
      period_end: "2026-06-30",
      depreciation_amount: "20.88",
      opening_book_value: "1188.82",
      closing_book_value: "1167.94",
      days_held: 30,
      is_posted: true,
    },
  ],
};

describe("mapApiDepreciationSchedule", () => {
  it("keeps the server's settings, money and entries, oldest entry first", () => {
    const schedule = mapApiDepreciationSchedule(apiRecord);
    expect(schedule).toMatchObject({
      id: "7",
      method: "Straight line",
      ratePercent: 20,
      effectiveLifeYears: 5,
      residualValue: 0,
      costLimit: null,
      startDate: "2026-05-15",
      openingValue: 1200,
      accumulatedDepreciation: 30,
      bookValue: 1170,
      assetName: "Laptop",
    });
    expect(schedule.entries.map((entry) => entry.periodStart)).toEqual([
      "2026-05-15",
      "2026-06-01",
      "2026-07-01",
    ]);
    expect(schedule.entries[0]).toEqual({
      periodStart: "2026-05-15",
      periodEnd: "2026-05-31",
      daysHeld: 17,
      depreciation: 11.18,
      openingBookValue: 1200,
      closingBookValue: 1188.82,
      isPosted: true,
    });
    expect(schedule.entries[2].isPosted).toBe(false);
  });

  it("treats a missing or zero rate / life as unset, and tolerates no entries", () => {
    const schedule = mapApiDepreciationSchedule({
      depreciation_method: "diminishing_value",
      depreciation_rate: "0.0000",
      effective_life_years: null,
      start_date: "2026-01-01T00:00:00.000Z",
      entries: null,
      asset: null,
    });
    expect(schedule.method).toBe("Diminishing value");
    expect(schedule.ratePercent).toBeNull();
    expect(schedule.effectiveLifeYears).toBeNull();
    expect(schedule.startDate).toBe("2026-01-01");
    expect(schedule.assetName).toBe("");
    expect(schedule.entries).toEqual([]);
  });
});

describe("fetchAssetDepreciationSchedule", () => {
  beforeEach(() => apiMock.get.mockReset());

  it("reads the asset's depreciation from the by-asset endpoint", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { success: true, data: apiRecord } });
    const schedule = await fetchAssetDepreciationSchedule("42");
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.asset.depreciation.byAsset + "42");
    expect(schedule?.entries).toHaveLength(3);
    expect(schedule?.bookValue).toBe(1170);
  });

  it("returns null on a 404 — no depreciation set up", async () => {
    apiMock.get.mockRejectedValueOnce({ response: { status: 404 } });
    await expect(fetchAssetDepreciationSchedule("42")).resolves.toBeNull();
  });

  it("rethrows any other failure", async () => {
    const failure = { response: { status: 500 } };
    apiMock.get.mockRejectedValueOnce(failure);
    await expect(fetchAssetDepreciationSchedule("42")).rejects.toBe(failure);
  });
});

describe("current / future periods", () => {
  const entry = { periodStart: "2026-06-01", periodEnd: "2026-06-30" };

  it("is current on either end of the period, inclusive", () => {
    expect(isCurrentPeriod(entry, "2026-06-01")).toBe(true);
    expect(isCurrentPeriod(entry, "2026-06-30")).toBe(true);
    expect(isCurrentPeriod(entry, "2026-07-01")).toBe(false);
    expect(isCurrentPeriod(entry, "2026-05-31")).toBe(false);
  });

  it("is future only once it hasn't started", () => {
    expect(isFuturePeriod(entry, "2026-05-31")).toBe(true);
    expect(isFuturePeriod(entry, "2026-06-01")).toBe(false);
  });
});

describe("scheduleTotals", () => {
  it("sums depreciation to the cent without float drift", () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      periodStart: `2026-0${index}-01`,
      periodEnd: `2026-0${index}-28`,
      daysHeld: 28,
      depreciation: 0.1,
      openingBookValue: 0,
      closingBookValue: 0,
      isPosted: false,
    }));
    expect(scheduleTotals(entries)).toEqual({ depreciation: 1, daysHeld: 280 });
  });
});

describe("groupByIncomeYear", () => {
  const { entries } = mapApiDepreciationSchedule(apiRecord);

  it("splits the months at 1 July, with a subtotal per income year", () => {
    const groups = groupByIncomeYear(entries);
    expect(groups.map((group) => group.label)).toEqual([
      "FY 2025/2026",
      "FY 2026/2027",
    ]);
    expect(groups[0]).toMatchObject({
      startYear: 2025,
      start: "2025-07-01",
      end: "2026-06-30",
      depreciation: 32.06,
      daysHeld: 47,
      openingBookValue: 1200,
      closingBookValue: 1167.94,
    });
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[1]).toMatchObject({
      startYear: 2026,
      depreciation: 20.38,
      openingBookValue: 1167.94,
      closingBookValue: 1147.56,
    });
  });

  it("follows another year start when given one (NZ, 1 April)", () => {
    const groups = groupByIncomeYear(entries, { month: 4, day: 1 });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      label: "FY 2026/2027",
      start: "2026-04-01",
      end: "2027-03-31",
    });
  });

  it("is empty for no entries", () => {
    expect(groupByIncomeYear([])).toEqual([]);
  });
});

describe("depreciationScheduleCsv", () => {
  it("uses sole-webapp's columns and 2dp money", () => {
    const { entries } = mapApiDepreciationSchedule(apiRecord);
    expect(depreciationScheduleCsv(entries).split("\n")).toEqual([
      "Period Start,Period End,Days Held,Depreciation Amount,Opening Book Value,Closing Book Value",
      "2026-05-15,2026-05-31,17,11.18,1200.00,1188.82",
      "2026-06-01,2026-06-30,30,20.88,1188.82,1167.94",
      "2026-07-01,2026-07-31,31,20.38,1167.94,1147.56",
    ]);
  });

  it("is just the header for no entries", () => {
    expect(depreciationScheduleCsv([])).toBe(
      "Period Start,Period End,Days Held,Depreciation Amount,Opening Book Value,Closing Book Value",
    );
  });
});

describe("depreciationScheduleFilename", () => {
  it("names the file after the asset, as sole-webapp did", () => {
    expect(depreciationScheduleFilename("Laptop", "42")).toBe(
      "depreciation_schedule_Laptop.csv",
    );
  });

  it("swaps out characters a filesystem won't take, and falls back to the id", () => {
    expect(depreciationScheduleFilename('Desk 1/2 "oak"', "42")).toBe(
      "depreciation_schedule_Desk 1_2 _oak_.csv",
    );
    expect(depreciationScheduleFilename("  ", "42")).toBe(
      "depreciation_schedule_42.csv",
    );
  });
});
