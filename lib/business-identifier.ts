/**
 * The business number a country asks for — ABN, NZBN, company registration —
 * and whether what's been typed is one.
 *
 * The field is not "ABN" any more. An ABN is Australia's answer to a question
 * every country answers differently: New Zealand issues a 13-digit NZBN, South
 * Africa a `1234/567890/12` company registration number, and neither is 11
 * digits. The Country Registry stores each one's label, pattern, mask and
 * check-digit algorithm (`identifier_schema`), so the form reads the shape of
 * the field out of the registry rather than hardcoding one country's.
 *
 * ── Why the check digits are reimplemented here ────────────────────────────
 *
 * sole-ocr validates all of this on save (`src/services/country/identifiers.js`)
 * and is the authority — nothing here is a substitute for that. But a number
 * that fails its check digit is a typo, and finding out about a typo on submit,
 * after the country has already been written, is the worst moment to be told.
 * These two are transcribed from that file deliberately: same weights, same
 * modulus, so the two cannot disagree about a given number.
 *
 * An algorithm the registry names but this build doesn't have PASSES here,
 * exactly as it does on the server — a config/deploy mismatch shouldn't block
 * someone from signing up, and the server still gets the final say.
 */

export type CountryIdentifierField = {
  /** `business_registration_number` or `tax_registration_number`. */
  key: string;
  /** What this country calls it: "ABN", "NZBN", "GST number". */
  label: string;
  required: boolean;
  /** Anchored regex from the registry, tested against the whitespace-stripped value. */
  pattern: string | null;
  /** e.g. "99 999 999 999" — a 9 is a digit, anything else is a literal. */
  mask: string | null;
  /** Names a check-digit algorithm; null when the country has none. */
  validator: string | null;
  /**
   * Set when this field is the same number as another one (AU's tax number is
   * its ABN). Such a field is never asked for separately.
   */
  sameAs: string | null;
};

const digitsOnly = (value: string): string => value.replace(/[^0-9]/g, "");

/**
 * Australian Business Number: 11 digits, subtract 1 from the first, weighted
 * sum divisible by 89.
 */
function abnMod89(value: string): boolean {
  const abn = digitsOnly(value);
  if (abn.length !== 11) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const sum = abn
    .split("")
    .reduce(
      (acc, char, i) => acc + (Number(char) - (i === 0 ? 1 : 0)) * weights[i],
      0,
    );
  return sum % 89 === 0;
}

/**
 * New Zealand Business Number: a 13-digit GS1 GLN. The check digit brings the
 * 1-3 weighted sum of the first 12 digits up to the next multiple of 10 — the
 * same rule as an EAN-13 barcode.
 */
function nzbnGs1(value: string): boolean {
  const nzbn = digitsOnly(value);
  if (nzbn.length !== 13) return false;
  const sum = nzbn
    .slice(0, 12)
    .split("")
    .reduce((acc, char, i) => acc + Number(char) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === Number(nzbn[12]);
}

/** IRD / GST number: 8 or 9 digits, mod-11 with a fallback weighting. */
function nzIrdMod11(value: string): boolean {
  const ird = digitsOnly(value);
  if (ird.length < 8 || ird.length > 9) return false;
  // IRD issues numbers in this range; outside it the checksum means nothing.
  const numeric = Number(ird);
  if (numeric < 10_000_000 || numeric > 150_000_000) return false;

  const padded = ird.padStart(9, "0");
  const base = padded.slice(0, 8).split("").map(Number);
  const check = Number(padded[8]);

  const checkDigitFor = (weights: number[]): number => {
    const remainder = base.reduce(
      (acc, digit, i) => acc + digit * weights[i],
      0,
    ) % 11;
    return remainder === 0 ? 0 : 11 - remainder;
  };

  const primary = checkDigitFor([3, 2, 7, 6, 5, 4, 3, 2]);
  if (primary < 10) return primary === check;
  // Inland Revenue's secondary weighting, used only when the primary one
  // produces a check digit of 10.
  const secondary = checkDigitFor([7, 4, 3, 2, 5, 2, 7, 6]);
  return secondary < 10 && secondary === check;
}

const VALIDATORS: Record<string, (value: string) => boolean> = {
  abn_mod89: abnMod89,
  nzbn_gs1: nzbnGs1,
  nz_ird_mod11: nzIrdMod11,
};

/**
 * The field a country asks for as its main business number, or null when it
 * asks for none.
 *
 * `same_as` fields are skipped: Australia's tax number IS its ABN, so asking
 * for it twice would be asking the same question twice.
 */
export function registrationField(
  schema: CountryIdentifierField[],
): CountryIdentifierField | null {
  return (
    schema.find(
      (field) => field.key === "business_registration_number" && !field.sameAs,
    ) ?? null
  );
}

/**
 * What's wrong with this number, or undefined if nothing is.
 *
 * Empty is only an error when the country marks the field required — Australia
 * does, New Zealand doesn't. Everything else is checked in the order a person
 * would: is it the right shape, then is it a real number.
 */
export function identifierError(
  field: CountryIdentifierField | null,
  value: string,
  { require: requireValue }: { require?: boolean } = {},
): string | undefined {
  if (!field) return undefined;

  const raw = value.trim();
  if (!raw) {
    /*
     * `require` overrides the registry's own flag, and the two say different
     * things on purpose. The registry's `required` is the COUNTRY's position —
     * New Zealand does not oblige every trader to hold an NZBN, so it is
     * `false` there. Whether SOLE needs the number before it will open an
     * account is a product decision, and sign-up makes it: the number is what
     * identifies the business on an invoice and what the register is looked up
     * by. A caller that passes nothing gets the country's answer.
     */
    const mandatory = requireValue ?? field.required;
    return mandatory ? `${field.label} is required.` : undefined;
  }

  // The registry's patterns are written against the value with its separators
  // stripped, the same way the server tests them.
  const compact = raw.replace(/\s/g, "");

  if (field.pattern && !new RegExp(field.pattern).test(compact)) {
    return `${field.label} is not in the expected format.`;
  }

  const checksum = field.validator ? VALIDATORS[field.validator] : undefined;
  // Named but not implemented here: pass, and let the server decide. Blocking
  // on a config/deploy mismatch would strand someone with a valid number.
  if (!checksum) return undefined;

  return checksum(compact)
    ? undefined
    : `${field.label} doesn't look right — check the number and try again.`;
}

/**
 * Group a number the way its country writes it, using the registry's mask.
 *
 * "99 999 999 999" + "12345678901" → "12 345 678 901". A 9 takes the next
 * digit, anything else is printed as-is. Extra digits are appended rather than
 * dropped, so the field never silently eats what someone typed.
 */
export function formatIdentifier(
  field: CountryIdentifierField | null,
  value: string,
): string {
  if (!field?.mask) return value;

  const digits = digitsOnly(value);
  if (!digits) return "";

  let out = "";
  let index = 0;
  for (const char of field.mask) {
    if (index >= digits.length) break;
    if (char === "9") {
      out += digits[index];
      index += 1;
    } else {
      out += char;
    }
  }
  return index < digits.length ? out + digits.slice(index) : out;
}

/**
 * An example value in this country's format, for a placeholder — "ABN" gets
 * "12 345 678 901", a company registration number "1234/567890/12".
 *
 * Separate from `formatIdentifier` because the two want opposite things from
 * an overlong input: that one appends the extra digits so a field never
 * silently eats what someone typed, which for an example would print
 * "12 345 678 90123456789". This fills the mask exactly and stops.
 *
 * Undefined when the country publishes no mask — no placeholder at all is
 * better than one borrowed from a country with a different format.
 */
export function maskExample(
  field: CountryIdentifierField | null,
): string | undefined {
  if (!field?.mask) return undefined;

  let out = "";
  let digit = 1;
  for (const char of field.mask) {
    if (char === "9") {
      out += String(digit % 10);
      digit += 1;
    } else {
      out += char;
    }
  }
  return out;
}
