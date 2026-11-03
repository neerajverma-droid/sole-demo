/**
 * The register's pure arithmetic and validation — everything in
 * `lib/assets.ts` that `lib/assets.test.ts` (API wiring) doesn't reach:
 * depreciation preview/schedule, GST, owing/paid, stats, the rest of
 * `filterAssets`, and the wizard's issues/step mapping.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/axiosInstance", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const {
  assetValue,
  assetOwing,
  isPaid,
  assetExGstValue,
  depreciationPreview,
  depreciationSchedule,
  gstBreakdown,
  assetStats,
  filterAssets,
  assetIssues,
  firstIncompleteStep,
  isDisposed,
  normaliseRegistry,
  registryMatch,
  emptyAssetDraft,
  EMPTY_DEPRECIATION,
} = await import("@/lib/assets");

type Asset = import("@/lib/assets").Asset;
type AssetDepreciation = import("@/lib/assets").AssetDepreciation;

function asset(overrides: Partial<Asset> = {}): Asset {
  return { ...emptyAssetDraft("2026-01-01"), id: "1", ...overrides };
}

function dep(overrides: Partial<AssetDepreciation> = {}): AssetDepreciation {
  return { ...EMPTY_DEPRECIATION, enabled: true, ...overrides };
}

describe("assetValue / assetOwing / isPaid", () => {
  it("reads a comma-grouped price and falls back to 0 for rubbish", () => {
    expect(assetValue({ costPrice: "1,234.50" })).toBe(1234.5);
    expect(assetValue({ costPrice: "abc" })).toBe(0);
  });

  it("floors owing at zero, so a negative typed figure can't owe a negative amount", () => {
    expect(assetOwing({ owing: "-50" })).toBe(0);
    expect(assetOwing({ owing: "2,000" })).toBe(2000);
    expect(assetOwing({ owing: "" })).toBe(0);
  });

  it("treats an empty or zero owing as paid", () => {
    expect(isPaid({ owing: "" })).toBe(true);
    expect(isPaid({ owing: "0" })).toBe(true);
    expect(isPaid({ owing: "10" })).toBe(false);
  });
});

describe("GST", () => {
  it("divides GST back out of an inclusive price, by eleven", () => {
    expect(assetExGstValue({ costPrice: "1100", gst: true })).toBeCloseTo(1000);
    expect(assetExGstValue({ costPrice: "1100", gst: false })).toBe(1100);
  });

  it("splits a typed price into subtotal, GST and total", () => {
    const inclusive = gstBreakdown("1,100", true);
    expect(inclusive.total).toBe(1100);
    expect(inclusive.gst).toBeCloseTo(100);
    expect(inclusive.subTotal).toBeCloseTo(1000);
    expect(gstBreakdown("1100", false)).toEqual({ subTotal: 1100, gst: 0, total: 1100 });
  });
});

describe("depreciationPreview", () => {
  it("takes GST out before applying the cost limit", () => {
    // 11,000 inc GST → 10,000 ex GST → capped at 8,000.
    const preview = depreciationPreview(
      { costPrice: "11000", gst: true },
      dep({ method: "Straight line", effectiveLife: "4", costLimit: "8000" }),
    );
    expect(preview.exGst).toBe(true);
    expect(preview.depreciableCost).toBeCloseTo(8000);
    expect(preview.openingBookValue).toBeCloseTo(8000);
    expect(preview.annualDepreciation).toBeCloseTo(2000);
  });

  it("caps with a min — a limit above the price changes nothing", () => {
    const preview = depreciationPreview(
      { costPrice: "5000", gst: false },
      dep({ method: "Straight line", effectiveLife: "5", costLimit: "99999" }),
    );
    expect(preview.depreciableCost).toBe(5000);
  });

  it("writes the whole base off in year one for full depreciation", () => {
    const preview = depreciationPreview(
      { costPrice: "3000", gst: false },
      dep({ method: "Full depreciation on purchase" }),
    );
    expect(preview.rate).toBe(1);
    expect(preview.annualDepreciation).toBe(3000);
  });

  it("reports no rate, not a guessed one, without an effective life", () => {
    for (const method of ["Straight line", "Diminishing value"] as const) {
      const preview = depreciationPreview(
        { costPrice: "3000", gst: false },
        dep({ method, effectiveLife: "" }),
      );
      expect(preview.rate).toBeNull();
      expect(preview.annualDepreciation).toBe(0);
    }
  });

  it("subtracts residual from the straight-line base", () => {
    const preview = depreciationPreview(
      { costPrice: "10000", gst: false },
      dep({ method: "Straight line", effectiveLife: "4", residualValue: "2000" }),
    );
    expect(preview.rate).toBe(0.25);
    expect(preview.annualDepreciation).toBe(2000);
  });

  it("uses 200% of the straight-line rate for diminishing value, and ignores residual", () => {
    const preview = depreciationPreview(
      { costPrice: "10000", gst: false },
      dep({ method: "Diminishing value", effectiveLife: "5", residualValue: "2000" }),
    );
    expect(preview.rate).toBeCloseTo(0.4);
    expect(preview.annualDepreciation).toBeCloseTo(4000);
  });

  it("lets a typed override rate replace the diminishing-value rate", () => {
    const preview = depreciationPreview(
      { costPrice: "10000", gst: false },
      dep({ method: "Diminishing value", effectiveLife: "5", overrideRate: "25" }),
    );
    expect(preview.rate).toBe(0.25);
    expect(preview.annualDepreciation).toBe(2500);
  });
});

describe("depreciationSchedule", () => {
  it("agrees with the preview it's built on", () => {
    const values = dep({ method: "Straight line", effectiveLife: "4", costLimit: "8000" });
    const schedule = depreciationSchedule({ costPrice: "11000", gst: true }, values);
    expect(schedule.preview).toEqual(
      depreciationPreview({ costPrice: "11000", gst: true }, values),
    );
    expect(schedule.depreciableCost).toBeCloseTo(8000);
  });

  it("runs straight line for the effective life, ending at the residual", () => {
    const schedule = depreciationSchedule(
      { costPrice: "10000", gst: false },
      dep({ method: "Straight line", effectiveLife: "4", residualValue: "2000" }),
    );
    expect(schedule.years).toHaveLength(4);
    expect(schedule.years.map((y) => y.depreciation)).toEqual([2000, 2000, 2000, 2000]);
    expect(schedule.years.at(-1)?.closingValue).toBe(2000);
  });

  it("never takes a diminishing-value asset below its residual", () => {
    const schedule = depreciationSchedule(
      { costPrice: "10000", gst: false },
      dep({ method: "Diminishing value", effectiveLife: "5", residualValue: "3000" }),
    );
    // 10000 → 6000 (−4000) → 3600 (−2400) → 3000 (clamped to −600), then nothing left.
    expect(schedule.years.map((y) => y.depreciation)).toEqual([4000, 2400, 600]);
    for (const year of schedule.years) {
      expect(year.closingValue).toBeGreaterThanOrEqual(3000);
    }
  });

  it("is one year for full depreciation", () => {
    const schedule = depreciationSchedule(
      { costPrice: "3000", gst: false },
      dep({ method: "Full depreciation on purchase", residualValue: "500" }),
    );
    expect(schedule.years).toEqual([
      { year: 1, openingValue: 3000, depreciation: 2500, closingValue: 500 },
    ]);
  });

  it("caps a mistyped effective life at 40 years rather than running away", () => {
    const schedule = depreciationSchedule(
      { costPrice: "100000", gst: false },
      dep({ method: "Straight line", effectiveLife: "1000" }),
    );
    expect(schedule.years).toHaveLength(40);
  });

  it("clamps a residual above cost into the cost — an empty schedule, never a negative one", () => {
    const schedule = depreciationSchedule(
      { costPrice: "1000", gst: false },
      dep({ method: "Straight line", effectiveLife: "4", residualValue: "5000" }),
    );
    expect(schedule.residual).toBe(1000);
    expect(schedule.years).toEqual([]);
    expect(schedule.currentBookValue).toBe(1000);
  });

  it("counts only whole years elapsed, not an anniversary that hasn't come round", () => {
    const values = dep({
      method: "Straight line",
      effectiveLife: "4",
      startDate: "2024-07-01",
    });
    const before = depreciationSchedule({ costPrice: "4000", gst: false }, values, "2026-06-30");
    expect(before.elapsedYears).toBe(1);
    expect(before.accumulated).toBe(1000);
    expect(before.currentBookValue).toBe(3000);

    const on = depreciationSchedule({ costPrice: "4000", gst: false }, values, "2026-07-01");
    expect(on.elapsedYears).toBe(2);
    expect(on.accumulated).toBe(2000);
  });

  it("caps elapsed years at the schedule's length, and book value at the residual", () => {
    const schedule = depreciationSchedule(
      { costPrice: "4000", gst: false },
      dep({
        method: "Straight line",
        effectiveLife: "2",
        residualValue: "1000",
        startDate: "2010-01-01",
      }),
      "2026-01-01",
    );
    expect(schedule.elapsedYears).toBe(2);
    expect(schedule.accumulated).toBe(3000);
    expect(schedule.currentBookValue).toBe(1000);
  });

  it("reports nothing elapsed with no start date or no today", () => {
    const values = dep({ method: "Straight line", effectiveLife: "4" });
    expect(depreciationSchedule({ costPrice: "4000", gst: false }, values, "2026-01-01").elapsedYears).toBe(0);
    expect(
      depreciationSchedule(
        { costPrice: "4000", gst: false },
        { ...values, startDate: "2020-01-01" },
      ).elapsedYears,
    ).toBe(0);
  });
});

describe("assetStats", () => {
  it("totals value and owing, and counts depreciating/paid/owing assets", () => {
    const stats = assetStats([
      asset({ costPrice: "1000", owing: "" }),
      asset({ costPrice: "2,000", owing: "500", depreciation: dep() }),
    ]);
    expect(stats).toEqual({
      totalValue: 3000,
      paidValue: 2500,
      owingValue: 500,
      depreciatingCount: 1,
      paidCount: 1,
      owingCount: 1,
    });
  });
});

describe("filterAssets — query, filters and sorts", () => {
  const laptop = asset({
    id: "a",
    name: "Laptop",
    supplierName: "Harvey Norman",
    category: "Technology",
    costPrice: "2000",
    purchaseDate: "2026-03-01",
    brand: "Dell",
    serialNo: "SN-XYZ",
  });
  const van = asset({
    id: "b",
    name: "Van",
    supplierName: "Northside Motors",
    category: "Vehicle",
    costPrice: "38000",
    owing: "10000",
    purchaseDate: "2025-01-15",
    depreciation: dep(),
  });
  const saw = asset({
    id: "c",
    name: "Mitre saw",
    supplierName: "Total Tools",
    category: "Tools",
    costPrice: "900",
    purchaseDate: "2026-05-20",
  });
  const all = [laptop, van, saw];
  const ids = (list: Asset[]) => list.map((a) => a.id);

  it("matches free text on name, supplier and category — not brand or serial", () => {
    const run = (query: string) => ids(filterAssets(all, { query, filter: "All", sort: "Name A–Z" }));
    expect(run("laptop")).toEqual(["a"]);
    expect(run("  northside ")).toEqual(["b"]);
    expect(run("tools")).toEqual(["c"]);
    expect(run("dell")).toEqual([]);
    expect(run("sn-xyz")).toEqual([]);
  });

  it("filters Paid / Owing on owing, and Depreciating on the enabled flag", () => {
    const run = (filter: "Paid" | "Owing" | "Depreciating") =>
      ids(filterAssets(all, { query: "", filter, sort: "Name A–Z" }));
    expect(run("Paid")).toEqual(["a", "c"]);
    expect(run("Owing")).toEqual(["b"]);
    expect(run("Depreciating")).toEqual(["b"]);
  });

  it("sorts by every option, newest first by default", () => {
    const run = (sort: Parameters<typeof filterAssets>[1]["sort"]) =>
      ids(filterAssets(all, { query: "", filter: "All", sort }));
    expect(run("Newest first")).toEqual(["c", "a", "b"]);
    expect(run("Oldest first")).toEqual(["b", "a", "c"]);
    expect(run("Highest value")).toEqual(["b", "a", "c"]);
    expect(run("Lowest value")).toEqual(["c", "a", "b"]);
    expect(run("Name A–Z")).toEqual(["a", "c", "b"]);
  });

  it("never reorders the caller's array", () => {
    const input = [...all];
    filterAssets(input, { query: "", filter: "All", sort: "Name A–Z" });
    expect(ids(input)).toEqual(["a", "b", "c"]);
  });
});

describe("assetIssues / firstIncompleteStep", () => {
  function completeDraft() {
    return {
      ...emptyAssetDraft("2026-01-01"),
      name: "Laptop",
      category: "Technology" as const,
      supplierName: "Harvey Norman",
      costPrice: "2000",
      brand: "Dell",
      assetType: "New",
    };
  }

  it("has no issues for a complete draft, and no incomplete step", () => {
    const issues = assetIssues(completeDraft());
    expect(issues).toEqual([]);
    expect(firstIncompleteStep(issues)).toBeNull();
  });

  it("requires a unit type only for the Inventory category", () => {
    expect(assetIssues(completeDraft()).map((i) => i.key)).not.toContain("unitType");
    const inventory = { ...completeDraft(), category: "Inventory" as const };
    expect(assetIssues(inventory).map((i) => i.key)).toContain("unitType");
    expect(assetIssues({ ...inventory, unitType: "Items" })).toEqual([]);
  });

  it("validates effective life only when depreciation is enabled", () => {
    expect(assetIssues({ ...completeDraft(), depreciation: { ...EMPTY_DEPRECIATION } })).toEqual([]);

    expect(assetIssues({ ...completeDraft(), depreciation: dep() })).toEqual([
      { key: "effectiveLife", message: "Enter an effective life." },
    ]);
    expect(
      assetIssues({ ...completeDraft(), depreciation: dep({ effectiveLife: "0" }) }),
    ).toEqual([{ key: "effectiveLife", message: "Years must be a number." }]);
  });

  it("rejects a missing, zero or malformed price", () => {
    const keyOf = (costPrice: string) =>
      assetIssues({ ...completeDraft(), costPrice }).filter((i) => i.key === "costPrice");
    expect(keyOf("")).toEqual([{ key: "costPrice", message: "Enter what it cost." }]);
    expect(keyOf("0")).toHaveLength(1);
    expect(keyOf("-5")[0].message).toMatch(/valid amount/);
  });

  it("sends the wizard back to the earliest step carrying an issue", () => {
    expect(firstIncompleteStep([{ key: "effectiveLife", message: "" }])).toBe(3);
    expect(
      firstIncompleteStep([
        { key: "effectiveLife", message: "" },
        { key: "brand", message: "" },
      ]),
    ).toBe(1);
    expect(firstIncompleteStep([{ key: "name", message: "" }])).toBe(0);
  });
});

describe("isDisposed", () => {
  it("is the presence of the disposal date, nothing else", () => {
    expect(isDisposed({ disposedDate: "" })).toBe(false);
    expect(isDisposed({ disposedDate: "2026-02-01" })).toBe(true);
  });
});

describe("normaliseRegistry / registryMatch", () => {
  it("trims, de-dupes case-insensitively (first spelling wins) and sorts", () => {
    expect(normaliseRegistry([" Makita", "dewalt", "makita", "", "DeWalt "])).toEqual([
      "dewalt",
      "Makita",
    ]);
  });

  it("matches what was typed whatever the casing, trimmed", () => {
    expect(registryMatch(["Makita", "DeWalt"], "  dewalt ")).toBe("DeWalt");
    expect(registryMatch(["Makita"], "   ")).toBeUndefined();
  });
});
