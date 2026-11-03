import { describe, expect, it } from "vitest";

import { mapCurrencyOptions } from "@/hooks/use-currency-options";
import { contactSchemaFor, contactFormDefaults } from "@/lib/contacts";
import {
  FALLBACK_COUNTRY_CONTEXT,
  contactDefaultCurrency,
  formFieldByKey,
  formFields,
  mapCountryContext,
  validateFormField,
} from "@/lib/country-context";

/** What `/country-context` answers for an NZ business, forms block included. */
const NZ = mapCountryContext({
  country_iso2: "NZ",
  currency: "NZD",
  identifier_schema: [{ key: "business_registration_number", label: "NZBN", pattern: "^\\d{13}$", validator: "nzbn_gs1" }],
  forms: {
    contact: {
      fields: [
        { key: "ABN", ref: "business_registration_number", type: "identifier", label: "NZBN", required: false, pattern: "^\\d{13}$", validator: "nzbn_gs1", mask: null, placeholder: "9429041234567", input_mode: "numeric" },
        { key: "currency", type: "currency", label: "Currency", required: true, default: "NZD", options_source: "exchange_rates" },
      ],
    },
  },
});

describe("forms from /country-context", () => {
  it("maps the contact form the server sends", () => {
    expect(formFields(NZ, "contact").map((f) => f.key)).toEqual(["ABN", "currency"]);
    expect(formFieldByKey(NZ, "contact", "ABN")).toMatchObject({ label: "NZBN", required: false, validator: "nzbn_gs1", placeholder: "9429041234567", inputMode: "numeric" });
    expect(contactDefaultCurrency(NZ)).toBe("NZD");
  });

  it("starts from an Australian contact form until the server answers", () => {
    expect(formFieldByKey(FALLBACK_COUNTRY_CONTEXT, "contact", "ABN")).toMatchObject({ label: "ABN", required: false, validator: "abn_mod89" });
    expect(contactDefaultCurrency(FALLBACK_COUNTRY_CONTEXT)).toBe("AUD");
  });

  it("builds the form from the identifier schema when an older server sends no forms", () => {
    const old = mapCountryContext({
      country_iso2: "NZ",
      currency: "NZD",
      identifier_schema: [{ key: "business_registration_number", label: "NZBN", required: true, pattern: "^\\d{13}$", validator: "nzbn_gs1" }],
    });
    expect(formFieldByKey(old, "contact", "ABN")).toMatchObject({ label: "NZBN", required: false });
    expect(contactDefaultCurrency(old)).toBe("NZD");
  });

  it("returns nothing for a module with no form", () => {
    expect(formFields(NZ, "invoice")).toEqual([]);
    expect(formFieldByKey(NZ, "invoice", "ABN")).toBeNull();
  });
});

describe("validateFormField", () => {
  const nzbn = formFieldByKey(NZ, "contact", "ABN");
  const abn = formFieldByKey(FALLBACK_COUNTRY_CONTEXT, "contact", "ABN");

  it("lets a contact's business number be empty", () => {
    expect(validateFormField(nzbn, "")).toBeUndefined();
    expect(validateFormField(abn, "  ")).toBeUndefined();
  });

  it("checks an NZBN's shape and check digit", () => {
    expect(validateFormField(nzbn, "9429036975273")).toBeUndefined();
    expect(validateFormField(nzbn, "9429036975274")).toMatch(/NZBN/);
    expect(validateFormField(nzbn, "123")).toMatch(/NZBN/);
  });

  it("checks an ABN's check digit", () => {
    expect(validateFormField(abn, "51 824 753 556")).toBeUndefined();
    expect(validateFormField(abn, "12345678901")).toMatch(/ABN/);
  });

  it("requires a currency to be a 3-letter code", () => {
    const currency = formFieldByKey(NZ, "contact", "currency");
    expect(validateFormField(currency, "USD")).toBeUndefined();
    expect(validateFormField(currency, "US")).toMatch(/3-letter/);
    expect(validateFormField(currency, "")).toMatch(/required/);
  });
});

describe("contactSchemaFor", () => {
  const values = { ...contactFormDefaults, businessName: "Turner", personName: "Mia Turner", email: "mia@example.com" };

  it("accepts an NZBN for a New Zealand business and rejects an ABN", () => {
    const schema = contactSchemaFor(NZ.forms.contact);
    expect(schema.safeParse({ ...values, abn: "9429036975273", currency: "NZD" }).success).toBe(true);
    const bad = schema.safeParse({ ...values, abn: "51824753556", currency: "NZD" });
    expect(bad.success).toBe(false);
    expect(bad.success ? "" : bad.error.issues[0].message).toMatch(/NZBN/);
  });

  it("accepts an empty number", () => {
    expect(contactSchemaFor(NZ.forms.contact).safeParse({ ...values, abn: "" }).success).toBe(true);
  });

  it("doesn't check a number for a country that asks for none", () => {
    expect(contactSchemaFor({ fields: [] }).safeParse({ ...values, abn: "anything" }).success).toBe(true);
  });
});

describe("mapCurrencyOptions", () => {
  it("keeps one option per valid code, labelled and sorted by name", () => {
    expect(
      mapCurrencyOptions([
        { target_currency: "NZD", target_currency_label: "New Zealand Dollar" },
        { target_currency: "AUD", target_currency_label: "Australian Dollar" },
        { target_currency: "nzd", target_currency_label: "Duplicate" },
        { target_currency: "XX", target_currency_label: "Bad" },
        { target_currency: "USD" },
      ]),
    ).toEqual([
      { code: "AUD", label: "Australian Dollar" },
      { code: "NZD", label: "New Zealand Dollar" },
      { code: "USD", label: "USD" },
    ]);
  });
});
