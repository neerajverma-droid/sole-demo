import { afterEach, describe, expect, it } from "vitest";

import { FALLBACK_COUNTRY_CONTEXT, activeBaseCurrency, activeCurrencySymbol, type CountryContext } from "@/lib/country-context";
import { currencySymbol, formatDocumentMoney, invoiceMoney, isForeignCurrency } from "@/lib/invoices";
import { reportMoney } from "@/lib/report-periods";
import { reportTableMoney } from "@/lib/report-table";
import { money } from "@/lib/dashboard-data";
import { axisMoney } from "@/lib/chart-axis";
import { formatPaymentMoney } from "@/lib/payments";
import { useCountryStore } from "@/stores/country";

/*
 * Each country brings its own `currencySymbol`, because the real context does:
 * it is a registry column a super admin sets, not something derived from the
 * locale. Spreading the Australian fallback without overriding it would leave
 * a South African business printing dollars.
 *
 * New Zealand's is left null here on purpose, so these cases still cover the
 * fallback path — a country with no symbol set uses its locale's, which for
 * NZD in en-NZ is a bare "$".
 */
const ZA: CountryContext = { ...FALLBACK_COUNTRY_CONTEXT, iso2: "ZA", currency: "ZAR", currencySymbol: "R", locale: "en-ZA" };
const NZ: CountryContext = { ...FALLBACK_COUNTRY_CONTEXT, iso2: "NZ", currency: "NZD", currencySymbol: null, locale: "en-NZ" };
const IN: CountryContext = { ...FALLBACK_COUNTRY_CONTEXT, iso2: "IN", currency: "INR", currencySymbol: "\u20b9", locale: "en-IN" };

const open = (ctx: CountryContext) => useCountryStore.getState().setContext(1, ctx);

afterEach(() => useCountryStore.getState().reset());

describe("money in the open business's own currency", () => {
  it("prints Australian dollars as before when no business is loaded, or an Australian one is", () => {
    expect(activeBaseCurrency()).toBe("AUD");
    expect(invoiceMoney(1234.5)).toBe("$1,234.50");
    open(FALLBACK_COUNTRY_CONTEXT);
    expect(invoiceMoney(1234.5)).toBe("$1,234.50");
    expect(formatDocumentMoney(1234.5)).toBe("$1,234.50");
    expect(formatDocumentMoney(1234.5, "AUD")).toBe("$1,234.50");
    expect(formatDocumentMoney(1234.5, "USD")).toBe("US$1,234.50");
    expect(reportMoney(-1200)).toBe("-$1,200.00");
  });

  it("prints rand for a South African business across the shared formatters", () => {
    open(ZA);
    expect(activeCurrencySymbol()).toBe("R");
    expect(invoiceMoney(1234.5)).toBe("R1,234.50");
    expect(formatDocumentMoney(1234.5)).toBe("R1,234.50");
    expect(formatDocumentMoney(1234.5, "ZAR")).toBe("R1,234.50");
    expect(currencySymbol()).toBe("R");
    expect(reportMoney(-1200)).toBe("-R1,200.00");
    expect(reportTableMoney(50)).toBe("R50.00");
    expect(money(1500)).toBe("R1,500");
    expect(axisMoney(67_000)).toBe("R67k");
    expect(formatPaymentMoney(10)).toBe("R10.00");
  });

  it("keeps a foreign document in its own currency, and says whose dollar AUD is outside Australia", () => {
    open(NZ);
    expect(formatDocumentMoney(100)).toBe("$100.00");
    expect(formatDocumentMoney(100, "AUD")).toBe("A$100.00");
    expect(formatPaymentMoney(100, "aud")).toBe("A$100.00");
    open(ZA);
    expect(formatDocumentMoney(100, "USD")).toBe("US$100.00");
    expect(isForeignCurrency("ZAR")).toBe(false);
    expect(isForeignCurrency("AUD")).toBe(true);
  });

  it("writes rupees the way India groups them, not in thousands", () => {
    // 12,34,567.50, not 1,234,567.50. The symbol is ours to set; where the
    // commas fall is the locale's, and swapping one must not disturb the other.
    open(IN);
    expect(activeCurrencySymbol()).toBe("\u20b9");
    expect(invoiceMoney(1234567.5)).toBe("\u20b912,34,567.50");
    expect(invoiceMoney(1234.5)).toBe("\u20b91,234.50");
    expect(reportMoney(-1234567.5)).toBe("-\u20b912,34,567.50");
    expect(reportTableMoney(1234567.5)).toBe("\u20b912,34,567.50");
  });

  it("uses the symbol a super admin set over the one the locale gives", () => {
    // Intl's answer for NZD in en-NZ is a bare "$", which reads as Australian
    // on an invoice sent anywhere else. Setting "NZ$" on the country is how
    // that is fixed, without a deploy.
    open({ ...NZ, currencySymbol: "NZ$" });
    expect(activeCurrencySymbol()).toBe("NZ$");
    expect(invoiceMoney(1234.5)).toBe("NZ$1,234.50");
    expect(reportMoney(-1200)).toBe("-NZ$1,200.00");
    // A foreign-currency line is unaffected: the symbol is what this country
    // calls ITS money, not what every currency looks like.
    expect(formatDocumentMoney(100, "USD")).toBe("US$100.00");
  });
});
