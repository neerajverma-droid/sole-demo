import { describe, expect, it } from "vitest";

import {
  EMPTY_EXPENSE_FILTERS,
  activeFilterCount,
  type ExpenseFilterDraft,
} from "@/components/expenses/expenses-filters";

describe("activeFilterCount — drives the popover's badge, independent of clientSideMode", () => {
  it("is zero for the empty draft", () => {
    expect(activeFilterCount(EMPTY_EXPENSE_FILTERS)).toBe(0);
  });

  it("counts a non-default match status", () => {
    expect(
      activeFilterCount({ ...EMPTY_EXPENSE_FILTERS, status: "Matched" }),
    ).toBe(1);
  });

  it("counts a date range as one filter, whichever end is set", () => {
    expect(
      activeFilterCount({ ...EMPTY_EXPENSE_FILTERS, dateFrom: "2026-01-01" }),
    ).toBe(1);
    expect(
      activeFilterCount({ ...EMPTY_EXPENSE_FILTERS, dateTo: "2026-01-31" }),
    ).toBe(1);
    expect(
      activeFilterCount({
        ...EMPTY_EXPENSE_FILTERS,
        dateFrom: "2026-01-01",
        dateTo: "2026-01-31",
      }),
    ).toBe(1);
  });

  it("counts a price range as one filter, whichever end is set", () => {
    expect(
      activeFilterCount({ ...EMPTY_EXPENSE_FILTERS, minPrice: "10" }),
    ).toBe(1);
    expect(
      activeFilterCount({ ...EMPTY_EXPENSE_FILTERS, maxPrice: "500" }),
    ).toBe(1);
  });

  it("counts the paid-with-cash checkbox", () => {
    expect(
      activeFilterCount({ ...EMPTY_EXPENSE_FILTERS, paidWithCashOnly: true }),
    ).toBe(1);
  });

  it("counts any non-empty category selection as one filter, regardless of how many are picked", () => {
    expect(
      activeFilterCount({ ...EMPTY_EXPENSE_FILTERS, categories: ["Travel"] }),
    ).toBe(1);
    expect(
      activeFilterCount({
        ...EMPTY_EXPENSE_FILTERS,
        categories: ["Travel", "Office Expenses", "Meals"],
      }),
    ).toBe(1);
  });

  it("counts any non-empty supplier selection as one filter, regardless of how many are picked", () => {
    expect(
      activeFilterCount({
        ...EMPTY_EXPENSE_FILTERS,
        suppliers: ["Acme", "Beta Co"],
      }),
    ).toBe(1);
  });

  it("sums every distinct facet that's active at once", () => {
    const filters: ExpenseFilterDraft = {
      status: "Pending",
      dateFrom: "2026-01-01",
      dateTo: "",
      minPrice: "10",
      maxPrice: "",
      paidWithCashOnly: true,
      categories: ["Travel"],
      suppliers: ["Acme"],
    };
    expect(activeFilterCount(filters)).toBe(6);
  });
});
