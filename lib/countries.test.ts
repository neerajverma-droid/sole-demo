import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@/utils/axiosInstance", () => ({
  default: { get: (...args: unknown[]) => get(...args) },
}));

import {
  countryByIso2,
  detectCountry,
  fetchCountries,
  type Country,
} from "@/lib/countries";

beforeEach(() => {
  get.mockReset();
});

/** The shape `publicCountryFields` in sole-ocr's country controller emits. */
function envelope(data: unknown) {
  return { data: { success: true, data } };
}

describe("fetchCountries", () => {
  it("maps the registry's fields onto the ones the UI reads", async () => {
    get.mockResolvedValue(
      envelope([
        {
          country_iso2: "au",
          name: "Australia",
          currency: "AUD",
          phone_dial_code: "+61",
          tax_type: "GST",
          has_lookup: true,
          identifier_schema: [
            {
              key: "business_registration_number",
              label: "ABN",
              required: true,
              pattern: "^\\d{11}$",
              validator: "abn_mod89",
              mask: "99 999 999 999",
            },
            // AU's tax number IS its ABN — carried through so the form can see
            // it is `same_as` and not ask for it twice.
            {
              key: "tax_registration_number",
              label: "ABN",
              same_as: "business_registration_number",
            },
          ],
        },
      ]),
    );

    await expect(fetchCountries()).resolves.toEqual([
      {
        // Upper-cased, because this is compared against the business's stored
        // `country_iso2` and a case mismatch would read as "not set".
        iso2: "AU",
        name: "Australia",
        currency: "AUD",
        phoneDialCode: "+61",
        taxType: "GST",
        hasLookup: true,
        identifierSchema: [
          {
            key: "business_registration_number",
            label: "ABN",
            required: true,
            pattern: "^\\d{11}$",
            validator: "abn_mod89",
            mask: "99 999 999 999",
            sameAs: null,
          },
          {
            key: "tax_registration_number",
            label: "ABN",
            required: false,
            pattern: null,
            mask: null,
            validator: null,
            sameAs: "business_registration_number",
          },
        ],
      },
    ]);
  });

  it("sorts by name, so the list isn't in whatever order the table returned", async () => {
    get.mockResolvedValue(
      envelope([
        { country_iso2: "NZ", name: "New Zealand" },
        { country_iso2: "AU", name: "Australia" },
        { country_iso2: "GB", name: "United Kingdom" },
      ]),
    );

    const names = (await fetchCountries()).map((country) => country.name);
    expect(names).toEqual(["Australia", "New Zealand", "United Kingdom"]);
  });

  it("drops a row with no code, which could never be saved anyway", async () => {
    get.mockResolvedValue(
      envelope([{ name: "Nowhere" }, { country_iso2: "AU", name: "Australia" }]),
    );

    const result = await fetchCountries();
    expect(result).toHaveLength(1);
    expect(result[0].iso2).toBe("AU");
  });

  it("treats an absent has_lookup as no register, not as undefined", async () => {
    // The form renders a button off this; `undefined` would be falsy by luck
    // rather than by contract.
    get.mockResolvedValue(envelope([{ country_iso2: "ZA", name: "South Africa" }]));
    expect((await fetchCountries())[0].hasLookup).toBe(false);
  });

  it("falls back to the code when the registry gives no name", async () => {
    get.mockResolvedValue(envelope([{ country_iso2: "FJ" }]));
    expect((await fetchCountries())[0].name).toBe("FJ");
  });

  it("reports an empty optional field as null rather than an empty string", async () => {
    // So a caller can test it with `??` instead of trimming it again.
    get.mockResolvedValue(
      envelope([
        { country_iso2: "AU", name: "Australia", phone_dial_code: "", tax_type: null },
      ]),
    );
    const [country] = await fetchCountries();
    expect(country.phoneDialCode).toBeNull();
    expect(country.taxType).toBeNull();
  });

  it("throws on a malformed response rather than showing an empty picker", async () => {
    // An empty country list would block onboarding with no explanation; the
    // query surfaces this as isError and the field says so.
    get.mockResolvedValue({ data: { success: false } });
    await expect(fetchCountries()).rejects.toThrow(/unexpected shape/i);
  });
});

describe("countryByIso2", () => {
  const countries: Country[] = [
    { iso2: "AU", name: "Australia", currency: "AUD", phoneDialCode: "+61", taxType: "GST", identifierSchema: [], hasLookup: true },
    { iso2: "NZ", name: "New Zealand", currency: "NZD", phoneDialCode: "+64", taxType: "GST", identifierSchema: [], hasLookup: true },
  ];

  it("finds the business's country", () => {
    expect(countryByIso2(countries, "NZ")?.name).toBe("New Zealand");
  });

  it("ignores case, since the stored value isn't guaranteed upper", () => {
    expect(countryByIso2(countries, "au")?.name).toBe("Australia");
  });

  it("is null for an unset or unknown country rather than guessing one", () => {
    expect(countryByIso2(countries, "")).toBeNull();
    expect(countryByIso2(countries, null)).toBeNull();
    expect(countryByIso2(countries, "ZZ")).toBeNull();
  });
});

describe("detectCountry", () => {
  it("sends the browser's timezone as the fallback and returns the code", async () => {
    get.mockResolvedValue(envelope({ country_iso2: "nz", source: "ip" }));

    await expect(detectCountry()).resolves.toBe("NZ");
    expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/countries\/detect$/), {
      params: { tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
    });
  });

  it("is null when nothing named a live country", async () => {
    get.mockResolvedValue(envelope({ country_iso2: null, source: null }));
    await expect(detectCountry()).resolves.toBeNull();
  });
});
