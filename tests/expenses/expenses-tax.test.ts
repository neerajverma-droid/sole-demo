import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/axiosInstance", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const { expenseExGst, expenseGst, taxInsideAmount } =
  await import("@/lib/expenses");
const { splitGst } = await import("@/lib/expense-import");
const {
  FALLBACK_COUNTRY_CONTEXT,
  inclusiveTaxHint,
  inclusiveTaxSplitHint,
  mapCountryContext,
} = await import("@/lib/country-context");

describe("expense GST at the business's rate", () => {
  it("takes the tax-inclusive share: 1/11 at 10%, 3/23 at 15%", () => {
    expect(taxInsideAmount(110, 10)).toBeCloseTo(10);
    expect(taxInsideAmount(115, 15)).toBeCloseTo(15);
    expect(taxInsideAmount(115, 0)).toBe(0);
  });

  it("uses the expense's recorded rate first, then the business's rate", () => {
    expect(expenseGst({ amount: 115, gst: true }, 15)).toBeCloseTo(15);
    expect(
      expenseGst({ amount: 110, gst: true, gstPercent: 10 }, 15),
    ).toBeCloseTo(10);
    expect(
      expenseExGst({ amount: 115, gst: true, gstPercent: null }, 15),
    ).toBeCloseTo(100);
    expect(expenseGst({ amount: 115, gst: false }, 15)).toBe(0);
  });

  it("still splits at 10% by default, as before", () => {
    expect(expenseGst({ amount: 110, gst: true })).toBeCloseTo(10);
  });
});

describe("CSV import split", () => {
  it("divides out the business's rate", () => {
    expect(splitGst(110, true)).toEqual({ subTotal: 100, totalGst: 10 });
    expect(splitGst(115, true, 15)).toEqual({ subTotal: 100, totalGst: 15 });
    expect(splitGst(115, false, 15)).toEqual({ subTotal: 115, totalGst: 0 });
  });
});

describe("inclusiveTaxHint", () => {
  it("works the split through in the country's money and words", () => {
    expect(inclusiveTaxHint(FALLBACK_COUNTRY_CONTEXT, 10)).toBe(
      "On means the price above already includes GST — it isn't added on top. At 10%, $110.00 contains $10.00 of GST, leaving $100.00 Ex GST.",
    );
    const nz = mapCountryContext({
      currency: "NZD",
      locale: "en-NZ",
      tax: { type: "GST" },
      labels: { tax: "GST", tax_exclusive: "Excl GST" },
    });
    expect(inclusiveTaxHint(nz, 15)).toBe(
      "On means the price above already includes GST — it isn't added on top. At 15%, $115.00 contains $15.00 of GST, leaving $100.00 Excl GST.",
    );
  });
});

describe("inclusiveTaxSplitHint", () => {
  const nz = mapCountryContext({
    currency: "NZD",
    locale: "en-NZ",
    tax: { type: "GST" },
    labels: { tax: "GST", tax_exclusive: "Excl GST" },
  });

  it("works the split through on the amount typed, as it will be saved", () => {
    expect(inclusiveTaxSplitHint(nz, 100, 15)).toBe(
      "The price includes GST: $100.00 contains $13.04 of GST, leaving $86.96 Excl GST.",
    );
    expect(inclusiveTaxSplitHint(FALLBACK_COUNTRY_CONTEXT, 110, 10)).toBe(
      "The price includes GST: $110.00 contains $10.00 of GST, leaving $100.00 Ex GST.",
    );
    expect(inclusiveTaxSplitHint(nz, 0.01, 15)).toBe(
      "The price includes GST: $0.01 contains $0.00 of GST, leaving $0.01 Excl GST.",
    );
  });
});
