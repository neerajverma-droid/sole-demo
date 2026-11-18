/**
 * Quick Actions — every figure in the open business's own currency.
 *
 * sole-webapp's Unibox printed "$" and en-AU digits whatever the business.
 * Under the multi-country plan the symbol and the digit grouping follow the
 * business's country, exactly as invoices do (`invoiceMoney`).
 */
import { afterEach, describe, expect, it } from "vitest";

import { FALLBACK_COUNTRY_CONTEXT, type CountryContext } from "@/lib/country-context";
import { invoiceMoney } from "@/lib/invoices";
import {
  bankAmountText,
  describePriority,
  optionalMoney,
  uniboxMoney,
} from "@/lib/unibox-rules";
import { useCountryStore } from "@/stores/country";

const AU: CountryContext = FALLBACK_COUNTRY_CONTEXT;
const NZ: CountryContext = { ...FALLBACK_COUNTRY_CONTEXT, iso2: "NZ", currency: "NZD", currencySymbol: "NZ$", locale: "en-NZ" };
const ZA: CountryContext = { ...FALLBACK_COUNTRY_CONTEXT, iso2: "ZA", currency: "ZAR", currencySymbol: "R", locale: "en-ZA" };
const IN: CountryContext = { ...FALLBACK_COUNTRY_CONTEXT, iso2: "IN", currency: "INR", currencySymbol: "₹", locale: "en-IN" };

const open = (ctx: CountryContext) => useCountryStore.getState().setContext(1, ctx);

afterEach(() => useCountryStore.getState().reset());

const NOW = new Date("2026-03-10T12:00:00").getTime();

describe("uniboxMoney", () => {
  it.each([
    ["Australia", AU, "$1,234.50"],
    ["New Zealand", NZ, "NZ$1,234.50"],
    ["South Africa", ZA, "R1,234.50"],
    ["India", IN, "₹1,234.50"],
  ])("writes %s money with its own symbol", (_name, ctx, expected) => {
    open(ctx);
    expect(uniboxMoney(1234.5)).toBe(expected);
  });

  it("is written exactly as invoices write it", () => {
    for (const ctx of [AU, NZ, ZA, IN]) {
      open(ctx);
      expect(uniboxMoney(98765.4)).toBe(invoiceMoney(98765.4));
    }
  });

  it("groups digits the country's way — lakhs in India", () => {
    open(IN);
    expect(uniboxMoney(1234567.5)).toBe("₹12,34,567.50");
  });

  it("always shows cents", () => {
    open(ZA);
    expect(uniboxMoney(11)).toBe("R11.00");
  });

  it("reads the server's numeric strings", () => {
    open(ZA);
    expect(uniboxMoney("128.5")).toBe("R128.50");
  });

  it("falls back to Australian dollars before the business's country has loaded", () => {
    expect(uniboxMoney(10)).toBe("$10.00");
  });

  it("follows a switch to another business's country", () => {
    open(AU);
    expect(uniboxMoney(10)).toBe("$10.00");
    open(ZA);
    expect(uniboxMoney(10)).toBe("R10.00");
  });
});

describe("optionalMoney", () => {
  it("is null for a row with no figure, rather than a zero", () => {
    open(ZA);
    expect(optionalMoney(null)).toBeNull();
    expect(optionalMoney(undefined)).toBeNull();
  });

  it("formats a zero that is really there", () => {
    open(ZA);
    expect(optionalMoney(0)).toBe("R0.00");
  });
});

describe("bank feed amounts", () => {
  it("signs money in with + and money out with -, in the country's currency", () => {
    open(ZA);
    expect(bankAmountText({ id: 1, amount: 58, direction: "credit" })).toBe("+R58.00");
    expect(bankAmountText({ id: 2, amount: -490, direction: "debit" })).toBe("-R490.00");
  });

  it("uses the country's grouping", () => {
    open(IN);
    expect(bankAmountText({ id: 1, amount: 150000, direction: "credit" })).toBe("+₹1,50,000.00");
  });
});

describe("urgent five amounts", () => {
  it("shows an invoice total in the country's currency", () => {
    open(NZ);
    const row = describePriority(
      { id: "invoice:3", resource_type: "invoice", type: "overdue_invoice", data: { total: 110 } },
      NOW,
    );
    expect(row.amountText).toBe("NZ$110.00");
  });

  it("puts + in front of a bank credit, nothing in front of a debit", () => {
    open(ZA);
    expect(
      describePriority({ id: "b", resource_type: "bank_feed", data: { amount: 58, direction: "credit" } }, NOW).amountText,
    ).toBe("+R58.00");
    expect(
      describePriority({ id: "b", resource_type: "bank_feed", data: { amount: -58, direction: "debit" } }, NOW).amountText,
    ).toBe("R58.00");
  });

  it("shows an expense price in the country's currency", () => {
    open(IN);
    expect(describePriority({ id: "e", resource_type: "expense", data: { price: 100 } }, NOW).amountText).toBe(
      "₹100.00",
    );
  });

  it("shows nothing when the item has no figure", () => {
    open(ZA);
    expect(describePriority({ id: "e", resource_type: "expense", data: {} }, NOW).amountText).toBeNull();
  });
});
