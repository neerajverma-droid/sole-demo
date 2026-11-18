import { describe, expect, it, vi } from "vitest";

const trackMock = vi.fn();
vi.mock("@/lib/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics")>()),
  track: (...args: unknown[]) => trackMock(...args),
}));

const { addonEventProps, trackAddonSelected, trackAddonsAddedToPlan } =
  await import("@/lib/addon-analytics");
const { addonById } = await import("@/lib/addons");

const time = addonById("time-tracker")!;
const km = addonById("km-tracker")!;
const prices = { catalogue: [], interval: "monthly" };

describe("add-on cart events", () => {
  it("flags exactly the add-ons chosen, with their price and category", () => {
    const props = addonEventProps([time, km], prices);
    expect(props).toEqual(
      expect.objectContaining({
        is_time_tracker_add_on: true,
        is_km_tracker_add_on: true,
        is_accounting_add_on: false,
        paid_amount:
          Math.round((time.priceMonthly + km.priceMonthly) * 100) / 100,
      }),
    );
    expect(typeof props.currency).toBe("string");
    expect(props.category).toBeTruthy();
  });

  it("sends add_on_selected for one add-on", () => {
    trackMock.mockClear();
    trackAddonSelected(time, prices);
    expect(trackMock).toHaveBeenCalledWith(
      "add_on_selected",
      expect.objectContaining({ is_time_tracker_add_on: true }),
    );
  });

  it("sends add_on_added_to_plan with the count, and nothing for an empty cart", () => {
    trackMock.mockClear();
    trackAddonsAddedToPlan([], prices, false);
    expect(trackMock).not.toHaveBeenCalled();
    trackAddonsAddedToPlan([time, km], prices, true);
    expect(trackMock).toHaveBeenCalledWith(
      "add_on_added_to_plan",
      expect.objectContaining({ addon_count: 2, via_checkout: true }),
    );
  });
});
