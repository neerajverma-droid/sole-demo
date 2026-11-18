import { describe, expect, it } from "vitest";

import { amountFilterError } from "@/components/invoices/invoices-filters";

describe("amountFilterError — the amount and balance filters", () => {
  it("accepts a blank field, which means no limit", () => {
    expect(amountFilterError("")).toBeUndefined();
    expect(amountFilterError("   ")).toBeUndefined();
  });

  it("accepts plain non-negative numbers, with or without decimals", () => {
    for (const value of ["0", "4345", "12.50", "0.5", ".5", "7.", " 99 "]) {
      expect(amountFilterError(value), value).toBeUndefined();
    }
  });

  it("rejects letters, symbols, signs, commas and a second point", () => {
    for (const value of ["xadsfd", "c43", "12a", "$100", "-5", "1,200", "1.2.3", "1e5", "--", "."]) {
      expect(amountFilterError(value), value).toBe("Enter numbers only");
    }
  });
});
