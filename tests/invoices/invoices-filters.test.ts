import { describe, expect, it } from "vitest";

import {
  EMPTY_INVOICE_FILTERS,
  activeFilterCount,
  resolveInvoiceFilters,
} from "@/components/invoices/invoices-filters";

describe("activeFilterCount — drives the popover's badge", () => {
  it("is zero for the empty draft", () => {
    expect(activeFilterCount(EMPTY_INVOICE_FILTERS)).toBe(0);
  });

  it("counts each range as one filter, whichever end is set", () => {
    for (const over of [
      { issuedFrom: "2026-01-01" },
      { issuedTo: "2026-01-31" },
      { issuedFrom: "2026-01-01", issuedTo: "2026-01-31" },
      { minTotal: "10" },
      { maxTotal: "500" },
      { minTotal: "10", maxTotal: "500" },
      { balanceMin: "1" },
      { balanceMin: "1", balanceMax: "9" },
    ]) {
      expect(activeFilterCount({ ...EMPTY_INVOICE_FILTERS, ...over })).toBe(1);
    }
  });

  it("counts sent, matched, paid-with-cash and a client selection", () => {
    expect(activeFilterCount({ ...EMPTY_INVOICE_FILTERS, sent: "not_sent" })).toBe(1);
    expect(activeFilterCount({ ...EMPTY_INVOICE_FILTERS, matchedOnly: true })).toBe(1);
    expect(activeFilterCount({ ...EMPTY_INVOICE_FILTERS, paidWithCashOnly: true })).toBe(1);
    expect(activeFilterCount({ ...EMPTY_INVOICE_FILTERS, clientIds: ["1", "2"] })).toBe(1);
  });

  it("adds them up when everything is set", () => {
    expect(
      activeFilterCount({
        issuedFrom: "2026-01-01",
        issuedTo: "",
        minTotal: "",
        maxTotal: "500",
        balanceMin: "",
        balanceMax: "9",
        sent: "sent",
        matchedOnly: true,
        paidWithCashOnly: true,
        clientIds: ["1"],
      }),
    ).toBe(7);
  });
});

describe("resolveInvoiceFilters — what the server-side fetch takes", () => {
  it("resolves the empty draft to no filters at all", () => {
    expect(resolveInvoiceFilters(EMPTY_INVOICE_FILTERS)).toEqual({
      issuedFrom: undefined,
      issuedTo: undefined,
      minTotal: undefined,
      maxTotal: undefined,
      balanceMin: undefined,
      balanceMax: undefined,
      sent: undefined,
      matchedOnly: undefined,
      paidWithCashOnly: undefined,
    });
  });

  it("parses the typed figures as numbers, 0 included", () => {
    expect(
      resolveInvoiceFilters({
        ...EMPTY_INVOICE_FILTERS,
        minTotal: "0",
        maxTotal: " 250.5 ",
        balanceMin: "10",
        balanceMax: "20",
      }),
    ).toMatchObject({ minTotal: 0, maxTotal: 250.5, balanceMin: 10, balanceMax: 20 });
  });

  it("treats blank, whitespace-only and non-numeric input as no bound", () => {
    expect(
      resolveInvoiceFilters({
        ...EMPTY_INVOICE_FILTERS,
        minTotal: "   ",
        maxTotal: "abc",
        balanceMin: "1e",
      }),
    ).toMatchObject({ minTotal: undefined, maxTotal: undefined, balanceMin: undefined });
  });

  it("passes dates through and maps 'any' to no sent filter", () => {
    expect(
      resolveInvoiceFilters({
        ...EMPTY_INVOICE_FILTERS,
        issuedFrom: "2026-01-01",
        issuedTo: "2026-01-31",
        sent: "sent",
      }),
    ).toMatchObject({ issuedFrom: "2026-01-01", issuedTo: "2026-01-31", sent: "sent" });
    expect(resolveInvoiceFilters({ ...EMPTY_INVOICE_FILTERS, sent: "not_sent" }).sent).toBe(
      "not_sent",
    );
  });

  it("sends the two checkboxes only when ticked", () => {
    expect(
      resolveInvoiceFilters({ ...EMPTY_INVOICE_FILTERS, matchedOnly: true, paidWithCashOnly: true }),
    ).toMatchObject({ matchedOnly: true, paidWithCashOnly: true });
  });

  it("leaves clientIds to the caller — they're not part of the resolved shape", () => {
    expect(
      resolveInvoiceFilters({ ...EMPTY_INVOICE_FILTERS, clientIds: ["1"] }),
    ).not.toHaveProperty("clientIds");
  });
});
