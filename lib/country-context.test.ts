import { describe, expect, it } from "vitest";

import {
  FALLBACK_COUNTRY_CONTEXT,
  bankAccountField,
  bankBranchField,
  bankDetailsError,
  bankFeedName,
  bankFeedProvider,
  bankFieldError,
  bankFieldHelp,
  countryCurrencySymbol,
  countryLabel,
  filingFrequencyOptions,
  fiscalYearRangeLabel,
  fiscalYearStartLabel,
  formatCountryMoney,
  hasCompleteBankDetails,
  hasFeature,
  mapCountryContext,
  returnWord,
  taxWord,
  type CountryContext,
} from "@/lib/country-context";

/** The three live countries, as `/country-context` answers for each. */
const AU = FALLBACK_COUNTRY_CONTEXT;

const NZ: CountryContext = mapCountryContext({
  country_iso2: "nz",
  country_name: "New Zealand",
  currency: "NZD",
  locale: "en-NZ",
  timezone: "Pacific/Auckland",
  phone_dial_code: "+64",
  tax: { type: "GST", authority: "Inland Revenue", registered: true, standard_rate: 15, standard_code: "GST", rates: [] },
  fiscal_year: { start_month: 4, start_day: 1, current: { label: "2026-27", long_label: "FY2026-2027", start_date: "2026-04-01", end_date: "2027-03-31" } },
  filing: { frequency: "bimonthly", frequencies: ["monthly", "bimonthly", "sixmonthly"], return_name: "GST return", current_period: null },
  labels: { tax: "GST", business_id: "NZBN", bank_branch: null, tax_return: "GST return" },
  features: { ndis: false },
  identifier_schema: [{ key: "business_registration_number", label: "NZBN", required: false, pattern: "^\\d{13}$", validator: "nzbn_gs1" }],
  bank_account_schema: [{ key: "account_number", label: "Account number", required: true, pattern: "^\\d{2}-?\\d{4}-?\\d{7}-?\\d{2,3}$", mask: "99-9999-9999999-999" }],
  has_identifier_lookup: true,
  registry_version: 4,
});

const ZA: CountryContext = mapCountryContext({
  country_iso2: "ZA",
  country_name: "South Africa",
  currency: "ZAR",
  locale: "en-ZA",
  tax: { type: "VAT", authority: "SARS", registered: null, standard_rate: 15, standard_code: "VAT", rates: [] },
  fiscal_year: { start_month: 3, start_day: 1 },
  filing: { frequency: "bimonthly", frequencies: ["monthly", "bimonthly", "fourmonthly", "sixmonthly", "annual"], return_name: "VAT return" },
  labels: { tax: "VAT", business_id: "Company registration number", bank_branch: "Branch code", tax_return: "VAT return" },
  features: { ndis: false, super_contributions: false },
  identifier_schema: [],
  bank_account_schema: [
    { key: "branch_code", label: "Branch code", required: true, pattern: "^\\d{6}$" },
    { key: "account_number", label: "Account number", required: true, pattern: "^\\d{7,11}$" },
  ],
  has_identifier_lookup: false,
  registry_version: 2,
});

describe("mapCountryContext", () => {
  it("reads the whole payload, upper-casing the code", () => {
    expect(NZ).toMatchObject({
      iso2: "NZ",
      name: "New Zealand",
      currency: "NZD",
      taxType: "GST",
      standardRate: 15,
      fiscalYearStartMonth: 4,
      filingFrequency: "bimonthly",
      returnName: "GST return",
      registryVersion: 4,
    });
  });

  it("keeps 'never asked' distinct from 'not registered'", () => {
    expect(NZ.taxRegistered).toBe(true);
    // ZA's payload says null, which means the business has never answered —
    // treating that as false would wrongly drop the tax off its invoices.
    expect(ZA.taxRegistered).toBeNull();
  });

  it("falls back to the Australian context field by field, not wholesale", () => {
    const sparse = mapCountryContext({ country_iso2: "NZ", country_name: "New Zealand" });
    expect(sparse.iso2).toBe("NZ");
    expect(sparse.taxType).toBe(FALLBACK_COUNTRY_CONTEXT.taxType);
    expect(sparse.fiscalYearStartMonth).toBe(7);
    expect(sparse.standardRate).toBeNull();
  });

  it("survives a payload with nothing in it", () => {
    const empty = mapCountryContext({});
    expect(empty.iso2).toBe("AU");
    expect(empty.identifierSchema).toEqual([]);
    expect(empty.bankAccountSchema).toEqual([]);
  });

  it("drops a schema entry with no key, which could be neither read nor written", () => {
    const ctx = mapCountryContext({
      bank_account_schema: [{ label: "Nameless" }, { key: "account_number", label: "Account number" }],
    });
    expect(ctx.bankAccountSchema.map((f) => f.key)).toEqual(["account_number"]);
  });

  it("reads required_if as the flag it is", () => {
    const ctx = mapCountryContext({
      identifier_schema: [{ key: "tax_registration_number", label: "GST number", required_if: "tax_registered" }],
    });
    expect(ctx.identifierSchema[0]).toMatchObject({ required: false, requiredIfTaxRegistered: true });
  });
});

describe("words", () => {
  it("names the tax the way each country does", () => {
    expect(taxWord(AU)).toBe("GST");
    expect(taxWord(NZ)).toBe("GST");
    expect(taxWord(ZA)).toBe("VAT");
  });

  it("names the return the way each country does", () => {
    expect(returnWord(AU)).toBe("BAS");
    expect(returnWord(NZ)).toBe("GST return");
    expect(returnWord(ZA)).toBe("VAT return");
  });

  it("falls back rather than printing an empty label", () => {
    expect(countryLabel(ZA, "not_a_label", "Fallback")).toBe("Fallback");
    expect(countryLabel(ZA, "business_id", "ABN")).toBe("Company registration number");
  });
});

describe("bank fields", () => {
  it("finds Australia's BSB and account number", () => {
    expect(bankBranchField(AU)?.label).toBe("BSB");
    expect(bankAccountField(AU)?.label).toBe("Account number");
  });

  it("finds South Africa's branch code under its own name", () => {
    expect(bankBranchField(ZA)?.key).toBe("branch_code");
    expect(bankBranchField(ZA)?.label).toBe("Branch code");
  });

  it("reports no branch field at all for New Zealand", () => {
    // NZ's account number carries the bank and branch inside it, so a form
    // that drew a branch box would ask for something that does not exist.
    expect(bankBranchField(NZ)).toBeNull();
    expect(bankAccountField(NZ)?.label).toBe("Account number");
  });

  it("validates against each country's own pattern", () => {
    expect(bankFieldError(AU, "bsb", "083-004")).toBeUndefined();
    expect(bankFieldError(AU, "bsb", "0830")).toBeTruthy();
    expect(bankFieldError(AU, "account_number", "12345678")).toBeUndefined();

    expect(bankFieldError(NZ, "account_number", "01-0123-0123456-00")).toBeUndefined();
    // Australia's 8-digit account number is not a New Zealand one.
    expect(bankFieldError(NZ, "account_number", "12345678")).toBeTruthy();

    expect(bankFieldError(ZA, "branch_code", "250655")).toBeUndefined();
    expect(bankFieldError(ZA, "branch_code", "25065")).toBeTruthy();
  });

  it("names the field the way its country does when it complains", () => {
    expect(bankFieldError(ZA, "branch_code", "1")).toContain("Branch code");
    expect(bankFieldError(AU, "bsb", "1")).toContain("BSB");
  });

  it("stays quiet on a blank, because these forms save partial details", () => {
    expect(bankFieldError(AU, "bsb", "")).toBeUndefined();
    expect(bankFieldError(AU, "bsb", "   ")).toBeUndefined();
  });

  it("ignores a field this country doesn't have", () => {
    expect(bankFieldError(NZ, "bsb", "nonsense")).toBeUndefined();
  });

  it("describes a pattern in words a person can act on", () => {
    expect(bankFieldHelp(AU, "bsb")).toBe("6 digits");
    expect(bankFieldHelp(AU, "account_number")).toBe("6 to 10 digits");
    expect(bankFieldHelp(ZA, "branch_code")).toBe("6 digits");
    // NZ's is too irregular to describe, so it shows the mask instead.
    expect(bankFieldHelp(NZ, "account_number")).toContain("00-0000-");
  });

  it("reports the first problem across every field", () => {
    expect(bankDetailsError(AU, { bsb: "083-004", account_number: "12345678" })).toBeUndefined();
    expect(bankDetailsError(AU, { bsb: "1", account_number: "12345678" })).toContain("BSB");
  });
});

describe("whether a business can be paid", () => {
  it("needs every required field for its own country", () => {
    expect(hasCompleteBankDetails(AU, { bsb: "083-004", account_number: "12345678" })).toBe(true);
    expect(hasCompleteBankDetails(AU, { bsb: "", account_number: "12345678" })).toBe(false);
  });

  it("doesn't ask New Zealand for a BSB it never had", () => {
    // The whole point: this account is payable, and the old `bsb && account`
    // check would have called it incomplete.
    expect(hasCompleteBankDetails(NZ, { account_number: "01-0123-0123456-00" })).toBe(true);
  });

  it("refuses a filled but malformed number", () => {
    expect(hasCompleteBankDetails(ZA, { branch_code: "250655", account_number: "12" })).toBe(false);
    expect(hasCompleteBankDetails(ZA, { branch_code: "250655", account_number: "1234567" })).toBe(true);
  });
});

describe("filing and the financial year", () => {
  it("offers each country's own frequencies, named in English", () => {
    expect(filingFrequencyOptions(AU).map((o) => o.label)).toEqual(["Monthly", "Quarterly", "Annually"]);
    expect(filingFrequencyOptions(NZ).map((o) => o.label)).toEqual(["Monthly", "Two-monthly", "Six-monthly"]);
    expect(filingFrequencyOptions(ZA).map((o) => o.value)).toContain("fourmonthly");
  });

  it("falls back to quarterly rather than an empty Select", () => {
    expect(filingFrequencyOptions(mapCountryContext({})).map((o) => o.value)).toEqual(["quarterly"]);
  });

  it("describes each financial year the way its country writes it", () => {
    expect(fiscalYearStartLabel(AU)).toBe("1 July");
    expect(fiscalYearRangeLabel(AU)).toBe("1 July – 30 June");
    expect(fiscalYearRangeLabel(NZ)).toBe("1 April – 31 March");
    // February is named, not numbered: it's the 28th or the 29th.
    expect(fiscalYearRangeLabel(ZA)).toBe("1 March – the end of February");
  });
});

describe("features", () => {
  it("is false for a flag a country doesn't set, not undefined", () => {
    expect(hasFeature(NZ, "ndis")).toBe(false);
    expect(hasFeature(NZ, "never_heard_of_it")).toBe(false);
  });
});

describe("money", () => {
  it("is denominated in the country's own currency, with its own symbol", () => {
    expect(formatCountryMoney(AU, 1234.5)).toContain("$");
    expect(formatCountryMoney(NZ, 1234.5)).toContain("1,234.50");
    // en-ZA would write "R 1 234,50"; the digits stay 1,234.50 as on the PDF.
    expect(formatCountryMoney(ZA, 1234.5)).toBe("R1,234.50");
    expect(formatCountryMoney(ZA, -1234.5)).toBe("-R1,234.50");
    expect(formatCountryMoney(AU, 1234.5)).toBe("$1,234.50");
  });

  it("prints the symbol a super admin set, even over the locale's own", () => {
    // Intl gives a bare "$" for NZD in en-NZ, which reads as Australian on an
    // invoice sent anywhere else — which is why the symbol is a field.
    expect(formatCountryMoney({ ...NZ, currencySymbol: "NZ$" }, 1234.5)).toBe("NZ$1,234.50");
    // Setting one must not add a space the unset path doesn't have.
    expect(formatCountryMoney({ ...ZA, currencySymbol: "R" }, 1234.5)).toBe("R1,234.50");
  });

  it("falls back to the code rather than throwing inside a table cell", () => {
    // No symbol set, and a code Intl can't read: the code itself is all that's
    // left to print, and it beats throwing inside a table.
    const broken = { ...AU, currency: "NOT-A-CODE", currencySymbol: null };
    expect(formatCountryMoney(broken, 10)).toContain("NOT-A-CODE");
  });

  it("gives a money field the symbol the formatter writes, in the business's own currency", () => {
    expect(countryCurrencySymbol(AU)).toBe("$");
    expect(countryCurrencySymbol(NZ)).toBe("$");
    expect(countryCurrencySymbol(ZA)).toBe("R");
    expect(countryCurrencySymbol({ ...AU, currency: "NOT-A-CODE", currencySymbol: null })).toBe("NOT-A-CODE");
    // The registry's own answer wins outright — it is the considered one.
    expect(countryCurrencySymbol({ ...NZ, currencySymbol: "NZ$" })).toBe("NZ$");
  });
});

describe("bank feed", () => {
  it("is Akahu for a country whose connected feed is Akahu", () => {
    const nz = mapCountryContext({ country_iso2: "NZ", bank_feed: { key: "akahu", name: "Akahu", available: true } });
    expect(nz.bankFeed).toEqual({ key: "akahu", name: "Akahu", available: true });
    expect(bankFeedProvider(nz)).toBe("akahu");
    expect(bankFeedName(nz)).toBe("Akahu");
  });

  it("is Fiskil for Australia, and while the context is still the fallback", () => {
    const au = mapCountryContext({ country_iso2: "AU", bank_feed: { key: "fiskil", name: "Fiskil", available: true } });
    expect(bankFeedProvider(au)).toBe("fiskil");
    expect(bankFeedProvider(FALLBACK_COUNTRY_CONTEXT)).toBe("fiskil");
  });

  it("treats an older server that sends no bank_feed as Fiskil", () => {
    expect(mapCountryContext({ country_iso2: "AU" }).bankFeed).toEqual(FALLBACK_COUNTRY_CONTEXT.bankFeed);
  });

  it("keeps null when the country has no feed", () => {
    expect(mapCountryContext({ country_iso2: "ZA", bank_feed: null }).bankFeed).toBeNull();
  });

  it("doesn't route to Akahu before it is connected", () => {
    const pending = mapCountryContext({ country_iso2: "NZ", bank_feed: { key: "akahu", name: "Akahu", available: false } });
    expect(bankFeedProvider(pending)).toBe("fiskil");
  });
});

describe("the currency symbol comes from the registry", () => {
  it("is read off the payload", () => {
    const ctx = mapCountryContext({ country_iso2: "NZ", currency: "NZD", currency_symbol: "NZ$" });
    expect(ctx.currencySymbol).toBe("NZ$");
  });

  it("is null when a super admin hasn't set one, which means 'use the locale'", () => {
    expect(mapCountryContext({ country_iso2: "NZ", currency: "NZD" }).currencySymbol).toBeNull();
    expect(mapCountryContext({ country_iso2: "NZ", currency_symbol: "   " }).currencySymbol).toBeNull();
  });

  it("applies to every amount, not just the symbol helper", () => {
    const ctx = mapCountryContext({
      country_iso2: "NZ",
      currency: "NZD",
      locale: "en-NZ",
      currency_symbol: "NZ$",
    });
    expect(countryCurrencySymbol(ctx)).toBe("NZ$");
    expect(formatCountryMoney(ctx, 0)).toBe("NZ$0.00");
    expect(formatCountryMoney(ctx, -5)).toBe("-NZ$5.00");
  });

  it("keeps the fallback Australian context on the dollar it has always printed", () => {
    expect(FALLBACK_COUNTRY_CONTEXT.currencySymbol).toBe("$");
    expect(formatCountryMoney(FALLBACK_COUNTRY_CONTEXT, 1234.5)).toBe("$1,234.50");
  });
});
