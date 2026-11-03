import { describe, expect, it } from "vitest";

import {
  formatIdentifier,
  identifierError,
  maskExample,
  registrationField,
  type CountryIdentifierField,
} from "@/lib/business-identifier";

/** The AU and NZ rows exactly as sole-ocr's fallback-countries.json seeds them. */
const AU: CountryIdentifierField = {
  key: "business_registration_number",
  label: "ABN",
  required: true,
  pattern: "^\\d{11}$",
  mask: "99 999 999 999",
  validator: "abn_mod89",
  sameAs: null,
};

const NZ: CountryIdentifierField = {
  key: "business_registration_number",
  label: "NZBN",
  required: false,
  pattern: "^\\d{13}$",
  mask: null,
  validator: "nzbn_gs1",
  sameAs: null,
};

/** A valid ABN (mod-89) and a valid NZBN (GS1), for the happy paths. */
const VALID_ABN = "51824753556"; // ATO's own published example
const VALID_NZBN = "9429038053894"; // GS1 check digit verified against sole-ocr

describe("registrationField", () => {
  it("picks the country's business number", () => {
    expect(registrationField([AU])?.label).toBe("ABN");
  });

  it("skips a field that is the same number under another name", () => {
    // Australia's tax number IS its ABN, so asking for it separately would be
    // asking the same question twice.
    const sameAs: CountryIdentifierField = {
      ...AU,
      key: "tax_registration_number",
      sameAs: "business_registration_number",
    };
    expect(registrationField([sameAs])).toBeNull();
  });

  it("is null for a country that asks for no number", () => {
    expect(registrationField([])).toBeNull();
  });
});

describe("identifierError", () => {
  it("accepts a real ABN", () => {
    expect(identifierError(AU, VALID_ABN)).toBeUndefined();
  });

  it("accepts an ABN written with the spacing people actually use", () => {
    expect(identifierError(AU, "51 824 753 556")).toBeUndefined();
  });

  it("rejects an ABN that fails its check digit", () => {
    // Right length, right shape, wrong number — the case a length check misses
    // and the reason the checksum is here at all.
    expect(identifierError(AU, "12345678901")).toMatch(/doesn't look right/i);
  });

  it("names the country's own label in the message", () => {
    // Not "ABN must be 11 digits" for a New Zealander.
    expect(identifierError(NZ, "123")).toMatch(/^NZBN/);
    expect(identifierError(AU, "123")).toMatch(/^ABN/);
  });

  it("requires the number where the country requires it", () => {
    expect(identifierError(AU, "")).toMatch(/ABN is required/);
  });

  it("allows it to be blank where the country doesn't require it", () => {
    // New Zealand does not oblige every trader to hold an NZBN.
    expect(identifierError(NZ, "")).toBeUndefined();
    expect(identifierError(NZ, "   ")).toBeUndefined();
  });

  it("can be required over the country's own answer", () => {
    /*
     * Two different questions. The registry's `required` is the COUNTRY's
     * position; `require` is Sole's. Sign-up asks for the number whatever the
     * country says, because the business name is filled from it.
     */
    expect(identifierError(NZ, "", { require: true })).toMatch(
      /NZBN is required/,
    );
  });

  it("can be made optional over the country's own answer", () => {
    expect(identifierError(AU, "", { require: false })).toBeUndefined();
  });

  it("only overrides emptiness, never the format or check digit", () => {
    // `require: false` must not wave through a number that is simply wrong.
    expect(identifierError(AU, "12345678901", { require: false })).toMatch(
      /doesn't look right/i,
    );
  });

  it("accepts a real NZBN and rejects an 11-digit one", () => {
    expect(identifierError(NZ, VALID_NZBN)).toBeUndefined();
    // The exact bug this replaces: an ABN-shaped number passing in NZ.
    expect(identifierError(NZ, VALID_ABN)).toMatch(/expected format/i);
  });

  it("passes a checksum this build doesn't implement, leaving it to the server", () => {
    // Blocking on a registry/deploy mismatch would strand someone holding a
    // perfectly valid number; sole-ocr makes the same choice.
    const unknown: CountryIdentifierField = {
      ...NZ,
      label: "Company registration number",
      pattern: "^\\d{4}/\\d{6}/\\d{2}$",
      validator: "za_company_reg",
    };
    expect(identifierError(unknown, "2019/123456/07")).toBeUndefined();
    expect(identifierError(unknown, "nope")).toMatch(/expected format/i);
  });

  it("is undefined when the country has no such field at all", () => {
    expect(identifierError(null, "anything")).toBeUndefined();
  });
});

describe("formatIdentifier", () => {
  it("groups a number the way its country writes it", () => {
    expect(formatIdentifier(AU, "51824753556")).toBe("51 824 753 556");
  });

  it("leaves a country with no mask alone", () => {
    expect(formatIdentifier(NZ, VALID_NZBN)).toBe(VALID_NZBN);
  });

  it("keeps extra digits rather than silently eating them", () => {
    // A field that drops what someone typed is worse than one that looks odd.
    expect(formatIdentifier(AU, "518247535561234")).toBe("51 824 753 5561234");
  });

  it("handles a partially typed number", () => {
    expect(formatIdentifier(AU, "518")).toBe("51 8");
  });

  it("is empty for an empty value", () => {
    expect(formatIdentifier(AU, "")).toBe("");
  });
});

describe("maskExample", () => {
  it("fills the mask exactly, unlike formatIdentifier", () => {
    expect(maskExample(AU)).toBe("12 345 678 901");
  });

  it("keeps non-digit separators", () => {
    expect(maskExample({ ...NZ, mask: "9999/999999/99" })).toBe(
      "1234/567890/12",
    );
  });

  it("is undefined without a mask, rather than borrowing another country's", () => {
    expect(maskExample(NZ)).toBeUndefined();
    expect(maskExample(null)).toBeUndefined();
  });
});
