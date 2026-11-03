import { describe, expect, it } from "vitest";

import {
  FALLBACK_COUNTRY_CONTEXT,
  bankFieldsPhrase,
  businessIdentifiers,
  customerIdLabel,
  documentHeading,
  hasRequiredBankFields,
  mapCountryContext,
  type CountryContext,
} from "@/lib/country-context";

/** The three countries' document wording, as `/country-context` answers. */
const AU: CountryContext = {
  ...FALLBACK_COUNTRY_CONTEXT,
  taxRegistered: true,
  identifierSchema: mapCountryContext({
    identifier_schema: [
      { key: "business_registration_number", label: "ABN", required: true },
      { key: "tax_registration_number", label: "ABN", same_as: "business_registration_number" },
    ],
  }).identifierSchema,
};

const NZ = mapCountryContext({
  country_iso2: "NZ",
  tax: { type: "GST", registered: true },
  labels: { tax: "GST", tax_invoice: "Tax Invoice", business_id: "NZBN", tax_id: "GST number", bank_branch: null },
  identifier_schema: [
    { key: "business_registration_number", label: "NZBN" },
    { key: "tax_registration_number", label: "GST number", required_if: "tax_registered" },
  ],
  bank_account_schema: [{ key: "account_number", label: "Account number", required: true }],
});

const ZA = mapCountryContext({
  country_iso2: "ZA",
  tax: { type: "VAT", registered: false },
  labels: { tax: "VAT", tax_invoice: "Tax Invoice", business_id: "Company registration number", bank_branch: "Branch code" },
  identifier_schema: [
    { key: "business_registration_number", label: "Company registration number" },
    { key: "tax_registration_number", label: "VAT number", required_if: "tax_registered" },
  ],
  bank_account_schema: [
    { key: "branch_code", label: "Branch code", required: true },
    { key: "account_number", label: "Account number", required: true },
  ],
});

describe("businessIdentifiers", () => {
  it("prints Australia's ABN once, preferring the legacy abn column the PDF prints", () => {
    expect(businessIdentifiers(AU, { abn: "51 824 753 556", registrationNumber: "51824753556" })).toEqual([
      { key: "business_registration_number", label: "ABN", value: "51 824 753 556" },
    ]);
    expect(businessIdentifiers(AU, { abn: "", registrationNumber: "51824753556" })[0]?.value).toBe("51824753556");
  });

  it("prints New Zealand's NZBN and GST number, never the legacy abn", () => {
    const identifiers = businessIdentifiers(NZ, { abn: "stale", registrationNumber: "9429041234567", taxNumber: "123-456-789" });
    expect(identifiers.map(({ label, value }) => `${label} ${value}`)).toEqual(["NZBN 9429041234567", "GST number 123-456-789"]);
  });

  it("leaves out numbers the business hasn't entered", () => {
    expect(businessIdentifiers(ZA, { taxNumber: "4123456789" })).toEqual([
      { key: "tax_registration_number", label: "VAT number", value: "4123456789" },
    ]);
    expect(businessIdentifiers(NZ, null)).toEqual([]);
  });
});

describe("document wording", () => {
  it("labels the customer's number by the business's country", () => {
    expect(customerIdLabel(AU)).toBe("ABN");
    expect(customerIdLabel(NZ)).toBe("NZBN");
  });

  it("heads a document by whether tax is charged and the business is registered", () => {
    expect(documentHeading(AU, "invoice", true)).toBe("TAX INVOICE");
    expect(documentHeading(AU, "quote", true)).toBe("TAX QUOTE");
    expect(documentHeading(NZ, "invoice", false)).toBe("INVOICE");
    // Not registered: never a tax invoice, whatever the lines say.
    expect(documentHeading(ZA, "invoice", true)).toBe("INVOICE");
  });

  it("names the bank fields each country asks for", () => {
    expect(bankFieldsPhrase(AU)).toBe("BSB and account number");
    expect(bankFieldsPhrase(NZ)).toBe("account number");
    expect(bankFieldsPhrase(ZA)).toBe("branch code and account number");
  });

  it("doesn't ask a New Zealand business for a BSB before it can invoice", () => {
    expect(hasRequiredBankFields(NZ, { bsb: "", accountNumber: "01-0123-0123456-00" })).toBe(true);
    expect(hasRequiredBankFields(AU, { bsb: "", accountNumber: "12345678" })).toBe(false);
    // Presence only: a legacy-format number on file must not block invoicing.
    expect(hasRequiredBankFields(AU, { bsb: "62", accountNumber: "1" })).toBe(true);
  });
});
