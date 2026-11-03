import { describe, expect, it } from "vitest";

import { parseLadderAmount } from "@/lib/ladder-report";

describe("parseLadderAmount", () => {
  it("reads the backend's pre-formatted money, sign included", () => {
    expect(parseLadderAmount("$1,234.56")).toBe(1234.56);
    expect(parseLadderAmount("-$700.00")).toBe(-700);
  });

  it("passes a finite number straight through", () => {
    expect(parseLadderAmount(42.5)).toBe(42.5);
  });

  it("is 0 for anything unreadable, rather than NaN reaching a total row", () => {
    expect(parseLadderAmount(Number.NaN)).toBe(0);
    expect(parseLadderAmount(Infinity)).toBe(0);
    expect(parseLadderAmount(null)).toBe(0);
    expect(parseLadderAmount(undefined)).toBe(0);
    expect(parseLadderAmount({})).toBe(0);
    expect(parseLadderAmount("1-2")).toBe(0);
  });

  it("reads an empty string as 0", () => {
    expect(parseLadderAmount("")).toBe(0);
  });
});
