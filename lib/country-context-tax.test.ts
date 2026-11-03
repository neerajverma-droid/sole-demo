import { describe, expect, it } from "vitest";

import {
  FALLBACK_COUNTRY_CONTEXT,
  documentTax,
  mapCountryContext,
} from "@/lib/country-context";

/** An NZ business following the country rate, with a scheduled change to 16% from 1 April 2027. */
const NZ = mapCountryContext({
  country_iso2: "NZ",
  currency: "NZD",
  tax: {
    type: "GST",
    registered: null,
    standard_rate: 15,
    rates: [
      {
        tax_code: "GST",
        name: "GST",
        category: "standard",
        rate: 15,
        effective_from: "2010-10-01",
        effective_to: "2027-03-31",
        is_default: true,
      },
      {
        tax_code: "GST",
        name: "GST",
        category: "standard",
        rate: 16,
        effective_from: "2027-04-01",
        effective_to: null,
        is_default: true,
      },
      {
        tax_code: "ZERO",
        name: "Zero-rated",
        category: "zero",
        rate: 0,
        effective_from: "2010-10-01",
        effective_to: null,
        is_default: false,
      },
    ],
    effective: {
      registered: true,
      enabled: true,
      rate: 15,
      name: "GST",
      source: "country",
      follows_country: true,
      country_rate: 15,
    },
  },
  labels: { tax: "GST" },
});

describe("documentTax", () => {
  it("is the AU 10% for the bundled fallback", () => {
    expect(documentTax(FALLBACK_COUNTRY_CONTEXT, "2026-10-21")).toEqual({
      offered: true,
      rate: 10,
      word: "GST",
      rateLabel: "GST (10%)",
      source: "country",
    });
  });

  it("follows the country rate in effect on the document date", () => {
    expect(documentTax(NZ, "2027-03-31").rate).toBe(15);
    expect(documentTax(NZ, "2027-04-01")).toMatchObject({
      rate: 16,
      rateLabel: "GST (16%)",
    });
    // No date: today's answer from the server.
    expect(documentTax(NZ).rate).toBe(15);
  });

  it("uses the business's custom rate whatever the date", () => {
    const custom = mapCountryContext({
      tax: {
        type: "GST",
        standard_rate: 15,
        rates: [],
        effective: {
          registered: true,
          enabled: true,
          rate: 12.5,
          name: "GST",
          source: "custom",
          country_rate: 15,
        },
      },
    });
    expect(documentTax(custom, "2027-04-01")).toMatchObject({
      rate: 12.5,
      rateLabel: "GST (12.5%)",
      source: "custom",
    });
  });

  it("offers no tax when the business isn't registered or switched it off in Settings", () => {
    const off = mapCountryContext({
      tax: {
        type: "GST",
        standard_rate: 10,
        effective: {
          registered: true,
          enabled: false,
          rate: 10,
          name: "GST",
          source: "country",
        },
      },
    });
    expect(documentTax(off).offered).toBe(false);
    const unregistered = mapCountryContext({
      tax: {
        type: "GST",
        standard_rate: 10,
        effective: {
          registered: false,
          rate: 10,
          name: "GST",
          source: "country",
        },
      },
    });
    expect(documentTax(unregistered).offered).toBe(false);
  });

  it("falls back to the standard rate from a server that sends no effective tax", () => {
    const older = mapCountryContext({
      tax: { type: "VAT", standard_rate: 15, registered: null },
    });
    expect(older.effectiveTax).toEqual({
      registered: true,
      enabled: true,
      rate: 15,
      name: "VAT",
      source: "country",
      countryRate: 15,
    });
  });
});
