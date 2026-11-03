/**
 * GST out of an asset's price at the business's rate: 10% in Australia (price ÷
 * 11, unchanged), 15% in New Zealand and South Africa.
 */
import { describe, expect, it, vi } from "vitest";

import type { AssetDepreciation } from "@/lib/assets";

vi.mock("@/utils/axiosInstance", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const {
  GST_DIVISOR,
  assetExGstValue,
  depreciationPreview,
  depreciationSchedule,
  gstBreakdown,
  EMPTY_DEPRECIATION,
} = await import("@/lib/assets");

const straightLine: AssetDepreciation = {
  ...EMPTY_DEPRECIATION,
  enabled: true,
  method: "Straight line",
  effectiveLife: "4",
};

describe("asset GST at the business's rate", () => {
  it("defaults to 10%: exactly the price less price ÷ 11", () => {
    for (const price of [1100, 1234.56, 99.99]) {
      const asset = { costPrice: String(price), gst: true };
      expect(assetExGstValue(asset)).toBe(price - price / GST_DIVISOR);
      expect(assetExGstValue(asset, 10)).toBe(assetExGstValue(asset));
      expect(gstBreakdown(String(price), true).gst).toBe(price / GST_DIVISOR);
    }
  });

  it("takes 15% out of a 15%-inclusive price", () => {
    expect(assetExGstValue({ costPrice: "1150", gst: true }, 15)).toBeCloseTo(
      1000,
    );
    const split = gstBreakdown("1,150", true, 15);
    expect(split.total).toBe(1150);
    expect(split.gst).toBeCloseTo(150);
    expect(split.subTotal).toBeCloseTo(1000);
  });

  it("leaves a price without GST alone, whatever the rate", () => {
    expect(assetExGstValue({ costPrice: "1150", gst: false }, 15)).toBe(1150);
    expect(gstBreakdown("1150", false, 15)).toEqual({
      subTotal: 1150,
      gst: 0,
      total: 1150,
    });
    expect(gstBreakdown("1150", true, 0).gst).toBe(0);
  });

  it("depreciates the ex-GST cost at the rate it's given", () => {
    const asset = { costPrice: "11500", gst: true };
    expect(
      depreciationPreview(asset, straightLine, 15).depreciableCost,
    ).toBeCloseTo(10000);
    expect(
      depreciationPreview(asset, straightLine).depreciableCost,
    ).toBeCloseTo(11500 - 11500 / 11);
    const schedule = depreciationSchedule(asset, straightLine, "", 15);
    expect(schedule.preview).toEqual(
      depreciationPreview(asset, straightLine, 15),
    );
    expect(schedule.depreciableCost).toBeCloseTo(10000);
  });
});
