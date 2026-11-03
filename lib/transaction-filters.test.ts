import { describe, expect, it } from "vitest";

import {
  EMPTY_TRANSACTION_FILTERS,
  activeTransactionFilterCount,
  presetRange,
  resolveTransactionFilters,
  toggleCategoryGroup,
} from "@/lib/transaction-filters";

const draft = (overrides = {}) => ({ ...EMPTY_TRANSACTION_FILTERS, ...overrides });

describe("presetRange", () => {
  it("covers last calendar month", () => {
    expect(presetRange("prev_month", new Date(2026, 9, 7))).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(presetRange("prev_month", new Date(2026, 0, 15))).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });

  it("covers the financial year before this one", () => {
    expect(presetRange("prev_fy", new Date(2026, 9, 7))).toEqual({
      from: "2025-07-01",
      to: "2026-06-30",
    });
    expect(presetRange("prev_fy", new Date(2026, 3, 1))).toEqual({
      from: "2024-07-01",
      to: "2025-06-30",
    });
  });
});

describe("resolveTransactionFilters", () => {
  it("sends type as sole-webapp does", () => {
    expect(resolveTransactionFilters(draft({ credit: true }), "unmatched").type).toBe("credit");
    expect(resolveTransactionFilters(draft({ debit: true }), "unmatched").type).toBe("debit");
    expect(resolveTransactionFilters(draft({ credit: true, debit: true }), "unmatched").type).toBe(
      "credit|debit",
    );
    expect(resolveTransactionFilters(draft(), "unmatched").type).toBeUndefined();
  });

  it("swaps a min above the max, and ignores empty amounts", () => {
    expect(resolveTransactionFilters(draft({ minAmount: "50", maxAmount: "10" }), "matched")).toMatchObject({
      minPrice: 10,
      maxPrice: 50,
    });
    expect(resolveTransactionFilters(draft({ minAmount: " " }), "matched")).toEqual({});
  });

  it("keeps each tab's own fields only", () => {
    const both = draft({ accountIds: ["1"], categoryIds: ["9"], cash: true, from: "2026-01-01" });
    expect(resolveTransactionFilters(both, "unmatched")).toEqual({
      startDate: "2026-01-01",
      bankAccountIds: ["1"],
    });
    expect(resolveTransactionFilters(both, "matched")).toEqual({
      startDate: "2026-01-01",
      categoryIds: ["9"],
      cash: true,
    });
  });
});

describe("activeTransactionFilterCount", () => {
  it("counts each narrowing once, per tab", () => {
    const value = draft({ from: "2026-01-01", to: "2026-02-01", credit: true, accountIds: ["1"], cash: true });
    expect(activeTransactionFilterCount(value, "unmatched")).toBe(3);
    expect(activeTransactionFilterCount(value, "matched")).toBe(3);
    expect(activeTransactionFilterCount(draft(), "matched")).toBe(0);
  });
});

describe("toggleCategoryGroup", () => {
  it("selects the missing ones, or clears the group once all are on", () => {
    expect(toggleCategoryGroup(["1"], ["1", "2"])).toEqual(["1", "2"]);
    expect(toggleCategoryGroup(["1", "2", "5"], ["1", "2"])).toEqual(["5"]);
  });
});
