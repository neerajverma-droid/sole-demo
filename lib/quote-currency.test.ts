import { describe, expect, it } from "vitest";

import { getDisplayCurrencyCode, isMultiCurrencyQuote } from "@/lib/quote-respond";
import { isForeignQuote, type Quote } from "@/lib/quotes";

describe("quote currency for a non-Australian business", () => {
  it("treats an AUD quote under an NZ business as multi-currency", () => {
    // The server sets is_multicurrency only when the code differs from the business's own.
    const quote = { is_multicurrency: 1, currency_code: "AUD", base_currency: "NZD" };
    expect(isMultiCurrencyQuote(quote)).toBe(true);
    expect(getDisplayCurrencyCode(quote)).toBe("AUD");
  });

  it("shows a plain quote in the business's currency, not AUD", () => {
    expect(getDisplayCurrencyCode({ is_multicurrency: 0, currency_code: "NZD", base_currency: "NZD" })).toBe("NZD");
    expect(getDisplayCurrencyCode({ is_multicurrency: 0, base_currency: "NZD" })).toBe("NZD");
  });

  it("keeps the Australian behaviour", () => {
    expect(getDisplayCurrencyCode({ is_multicurrency: 0, base_currency: "AUD" })).toBe("AUD");
    expect(getDisplayCurrencyCode({ is_multicurrency: 1, currency_code: "USD", base_currency: "AUD" })).toBe("USD");
    expect(getDisplayCurrencyCode(null)).toBe("AUD");
  });

  it("calls a quote foreign exactly when it carries its own currency", () => {
    expect(isForeignQuote({ currency: "AUD" } as Quote)).toBe(true);
    expect(isForeignQuote({} as Quote)).toBe(false);
  });
});
