import { describe, expect, it } from "vitest";

import { axisMoney, niceMoneyDomain } from "@/lib/chart-axis";

describe("axisMoney", () => {
  it("spells small amounts out", () => {
    expect(axisMoney(0)).toBe("$0");
    expect(axisMoney(450)).toBe("$450");
    expect(axisMoney(999)).toBe("$999");
  });

  it("shortens thousands", () => {
    expect(axisMoney(1_000)).toBe("$1k");
    expect(axisMoney(66_908)).toBe("$67k");
  });

  it("keeps one decimal only while it says something", () => {
    // $1.2k distinguishes itself from $1k; $67.4k is noise beside $67k.
    expect(axisMoney(1_200)).toBe("$1.2k");
    expect(axisMoney(67_400)).toBe("$67k");
  });

  it("drops a trailing .0 rather than printing a digit that says nothing", () => {
    expect(axisMoney(2_000)).toBe("$2k");
    expect(axisMoney(3_000_000)).toBe("$3m");
  });

  it("shortens millions", () => {
    expect(axisMoney(1_250_000)).toBe("$1.3m");
    expect(axisMoney(12_000_000)).toBe("$12m");
  });

  it("signs negatives before the dollar, as money is written", () => {
    expect(axisMoney(-450)).toBe("-$450");
    expect(axisMoney(-66_908)).toBe("-$67k");
  });
});

describe("niceMoneyDomain", () => {
  it("anchors at zero for positive data, because the mark is a filled area", () => {
    // A fill starting at $64k would draw a small balance as a tall block.
    const { domain } = niceMoneyDomain([64_000, 65_000, 66_908]);
    expect(domain[0]).toBe(0);
  });

  it("puts every tick on a round number", () => {
    const { ticks } = niceMoneyDomain([1_200, 18_400, 66_908]);
    // The whole point of the helper: no $63,408-style ticks.
    for (const tick of ticks) {
      expect(tick % 1000).toBe(0);
    }
  });

  it("covers the data it was given", () => {
    const values = [1_200, 18_400, 66_908];
    const { domain } = niceMoneyDomain(values);
    expect(domain[0]).toBeLessThanOrEqual(Math.min(...values));
    expect(domain[1]).toBeGreaterThanOrEqual(Math.max(...values));
  });

  it("lands near the requested number of intervals", () => {
    const { ticks } = niceMoneyDomain([0, 66_908], 4);
    // Rounding the step to something readable moves the count a little; a wild
    // miss means the step rounding is wrong.
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(7);
  });

  it("extends below zero for an overdrawn balance rather than clipping it", () => {
    const { domain } = niceMoneyDomain([-4_200, 1_000, 5_000]);
    expect(domain[0]).toBeLessThanOrEqual(-4_200);
    expect(domain[1]).toBeGreaterThanOrEqual(5_000);
  });

  it("keeps the gutter sized when there's no data yet", () => {
    // So the plot doesn't jump sideways the moment the first figure lands.
    expect(niceMoneyDomain([]).domain).toEqual([0, 100]);
    expect(niceMoneyDomain([]).ticks.length).toBeGreaterThan(1);
  });

  it("survives a flat series at zero", () => {
    expect(niceMoneyDomain([0, 0, 0]).domain).toEqual([0, 100]);
  });

  it("produces no tick with float drift on it", () => {
    const { ticks } = niceMoneyDomain([0, 0.5, 1.2]);
    for (const tick of ticks) {
      expect(String(tick)).not.toMatch(/\d{6,}/);
    }
  });

  it("ignores NaN and Infinity instead of producing an unusable axis", () => {
    const { domain } = niceMoneyDomain([NaN, Infinity, 5_000]);
    expect(Number.isFinite(domain[0])).toBe(true);
    expect(Number.isFinite(domain[1])).toBe(true);
    expect(domain[1]).toBeGreaterThanOrEqual(5_000);
  });
});
