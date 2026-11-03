import { describe, expect, it } from "vitest";

import { FALLBACK_COUNTRY_CONTEXT, addressForm, mapCountryContext, validateFormField } from "@/lib/country-context";

const nzRaw = {
  country_iso2: "NZ",
  name: "New Zealand",
  currency: "NZD",
  forms: {
    address: {
      fields: [
        { key: "country", type: "country", label: "Country", locked: true, value: "New Zealand", iso2: "NZ", place_restrictions: ["nz"] },
        { key: "state", type: "region", label: "Region", options: ["Auckland", "Otago"] },
        { key: "postcode", type: "postcode", label: "Postcode", pattern: "^\\d{4}$" },
      ],
    },
  },
};

describe("address form", () => {
  it("is read from the server's forms.address", () => {
    const nz = mapCountryContext(nzRaw);
    const [country, state] = addressForm(nz);
    expect(country).toMatchObject({ locked: true, value: "New Zealand", placeRestrictions: ["nz"] });
    expect(state.options).toEqual(["Auckland", "Otago"]);
  });

  it("falls back to Australia, locked, until the server answers", () => {
    const [country] = addressForm(FALLBACK_COUNTRY_CONTEXT);
    expect(country).toMatchObject({ locked: true, value: "Australia", placeRestrictions: ["au"] });
  });

  it("keeps the country locked for a server that sends no address form", () => {
    const [country] = addressForm({ ...mapCountryContext({ country_iso2: "NZ", name: "New Zealand", currency: "NZD" }), forms: {} });
    expect(country).toMatchObject({ locked: true, iso2: "NZ", placeRestrictions: ["nz"] });
  });

  it("validates only against the business's own country", () => {
    const [country, , postcode] = addressForm(mapCountryContext(nzRaw));
    expect(validateFormField(country, "New Zealand")).toBeUndefined();
    expect(validateFormField(country, "Australia")).toMatch(/New Zealand/);
    expect(validateFormField(postcode, "1010")).toBeUndefined();
    expect(validateFormField(postcode, "ABC")).toBeDefined();

    const [auCountry, , auPostcode] = addressForm(FALLBACK_COUNTRY_CONTEXT);
    expect(validateFormField(auCountry, "Australia")).toBeUndefined();
    expect(validateFormField(auPostcode, "3121")).toBeUndefined();
  });
});
