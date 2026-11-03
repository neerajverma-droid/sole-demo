import { describe, expect, it } from "vitest";

import {
  FALLBACK_COUNTRY_CONTEXT,
  mapCountryContext,
  type CountryContext,
} from "@/lib/country-context";
import {
  DEFAULT_PRODUCT_TAX_LABELS,
  isTaxFreeRate,
  isTaxedRate,
  productTaxLabels,
  taxRateOption,
  taxRateOptions,
} from "@/lib/product-tax";

/** A business in `iso2` charging `rate`% of `word`, with the registry's own labels. */
function countryWith(
  iso2: string,
  word: string,
  rate: number,
  labels: Record<string, string>,
  source: "country" | "custom" = "country",
): CountryContext {
  return mapCountryContext({
    country_iso2: iso2,
    tax: {
      type: word,
      standard_rate: rate,
      rates: [],
      effective: { registered: true, enabled: true, rate, name: word, source, country_rate: rate },
    },
    labels,
  });
}

const NZ = countryWith("NZ", "GST", 15, { tax: "GST", tax_free: "GST free" });
const ZA = countryWith("ZA", "VAT", 15, { tax: "VAT", tax_free: "Zero-rated" });

describe("productTaxLabels", () => {
  it("keeps Australia's existing strings exactly", () => {
    expect(productTaxLabels(FALLBACK_COUNTRY_CONTEXT)).toEqual({
      none: "— None —",
      taxed: "GST (10%)",
      free: "GST Free",
    });
    expect(DEFAULT_PRODUCT_TAX_LABELS).toEqual(
      productTaxLabels(FALLBACK_COUNTRY_CONTEXT),
    );
    expect(taxRateOptions(DEFAULT_PRODUCT_TAX_LABELS)).toEqual([
      "— None —",
      "GST (10%)",
      "GST Free",
    ]);
  });

  it("uses New Zealand's rate and South Africa's own tax-free word", () => {
    expect(productTaxLabels(NZ)).toEqual({
      none: "— None —",
      taxed: "GST (15%)",
      free: "GST Free",
    });
    expect(productTaxLabels(ZA)).toEqual({
      none: "— None —",
      taxed: "VAT (15%)",
      free: "Zero-rated",
    });
  });

  it("follows the business's custom rate", () => {
    const custom = countryWith("AU", "GST", 12.5, { tax: "GST" }, "custom");
    expect(productTaxLabels(custom).taxed).toBe("GST (12.5%)");
  });
});

describe("isTaxedRate", () => {
  it("counts every taxed label, whatever country or era it came from", () => {
    for (const value of ["GST (10%)", "GST (15%)", "VAT (15%)", "GST (12.5%)", "GST_10", "vat_15"]) {
      expect(isTaxedRate(value), value).toBe(true);
    }
  });

  it("doesn't count none, tax-free, zero or empty labels", () => {
    for (const value of ["— None —", "GST Free", "GST free", "VAT exempt", "Zero-rated", "GST (0%)", "", "  ", null, undefined]) {
      expect(isTaxedRate(value), String(value)).toBe(false);
    }
  });

  it("accepts the business's own taxed label even without a percentage", () => {
    expect(isTaxedRate("Standard")).toBe(false);
    expect(isTaxedRate("Standard", "Standard")).toBe(true);
  });

  it("recognises tax-free labels", () => {
    expect(isTaxFreeRate("GST Free")).toBe(true);
    expect(isTaxFreeRate("Zero-rated")).toBe(true);
    expect(isTaxFreeRate("GST (10%)")).toBe(false);
  });
});

describe("taxRateOption", () => {
  it("shows a legacy Australian row in New Zealand's words", () => {
    const labels = productTaxLabels(NZ);
    expect(taxRateOption("GST (10%)", labels)).toBe("GST (15%)");
    expect(taxRateOption("GST_10", labels)).toBe("GST (15%)");
    expect(taxRateOption("GST Free", labels)).toBe("GST Free");
    expect(taxRateOption("", labels)).toBe("— None —");
    expect(taxRateOption("some-old-value", labels)).toBe("— None —");
  });

  it("leaves Australian rows as they were", () => {
    for (const value of ["— None —", "GST (10%)", "GST Free"]) {
      expect(taxRateOption(value, DEFAULT_PRODUCT_TAX_LABELS)).toBe(value);
    }
  });

  it("maps any tax-free label onto the country's own", () => {
    expect(taxRateOption("GST Free", productTaxLabels(ZA))).toBe("Zero-rated");
    expect(taxRateOption("Zero-rated", productTaxLabels(ZA))).toBe("Zero-rated");
  });
});
