import {
  AsYouType,
  getCountryCallingCode,
  getExampleNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import examples from "libphonenumber-js/examples.mobile.json";
import metadata from "libphonenumber-js/metadata.min.json";

/**
 * Splits one phone string into the two fields the API stores separately —
 * ported from sole-webapp's `helpers/common.js` (`getCountryCallingAndPhoneNumber`),
 * same fallback behaviour: anything unparseable (empty, junk, a lone "+")
 * returns the default calling code with an empty national number rather than
 * throwing.
 */
export function getCountryCallingAndPhoneNumber(
  phone: string | null | undefined,
  phoneNumberDefaultVal = "+61",
): { countryCallingCode: string; nationalNumber: string } {
  const defaultCode = phoneNumberDefaultVal
    ? phoneNumberDefaultVal.startsWith("+")
      ? phoneNumberDefaultVal
      : `+${phoneNumberDefaultVal}`
    : "+61";

  if (!phone || typeof phone !== "string") {
    return { countryCallingCode: defaultCode, nationalNumber: "" };
  }

  // Remove any literal 'undefined' or 'null' substrings from previous bugs or DB records.
  const cleanPhone = phone.replace(/undefined|null/gi, "").trim();
  if (!cleanPhone || cleanPhone === "+") {
    return { countryCallingCode: defaultCode, nationalNumber: "" };
  }

  const normalizedPhone = cleanPhone.startsWith("+")
    ? cleanPhone
    : `+${cleanPhone}`;

  const asYouType = new AsYouType();
  asYouType.input(normalizedPhone);

  const number = asYouType.getNumber();
  const rawCallingCode = number?.countryCallingCode || asYouType.getCallingCode();
  const countryCallingCode = rawCallingCode ? `+${rawCallingCode}` : defaultCode;
  const nationalNumber = number?.nationalNumber || "";

  return { countryCallingCode, nationalNumber };
}

/* ------------------------------------------------------------------ *
 * PhoneInput
 *
 * The logic behind `components/ui/phone-input.tsx`, kept free of React so the
 * awkward parts — trunk prefixes, international paste, deleting through a
 * space — can be tested on their own.
 *
 * The shape it works in: the country picker owns the dial code, and the text
 * field holds only the national number the way a person types it ("0412 345
 * 678"). What leaves the field is always the international form ("+61 412 345
 * 678", or "" while nothing is typed), so every caller that stores or validates
 * the value keeps getting the dial code first.
 * ------------------------------------------------------------------ */

export type PhoneState = {
  country: CountryCode;
  /** What the text field shows — national format, or raw "+…" while a typed
   *  international number hasn't resolved to a country yet. */
  text: string;
};

/** Longest a phone number can be, country code included (E.164). */
export const MAX_PHONE_DIGITS = 15;

const digitsOf = (value: string) => value.replace(/\D/g, "");

/** Saved values have been seen carrying a literal "undefined" or "null". */
export function cleanPhoneValue(value: string | undefined | null): string {
  if (!value) return "";
  return value.replace(/undefined|null/gi, "").trim();
}

/** The dial code the picker shows, without the "+". */
export function dialCodeFor(country: CountryCode): string {
  return getCountryCallingCode(country);
}

/**
 * The country a stored dial code ("+44") stands for, when only the code was
 * saved. Several countries share most codes — libphonenumber lists the main one
 * first (+1 → US, +44 → GB), which is the one to show. Unknown codes give
 * `undefined`.
 */
export function countryForDialCode(code: string): CountryCode | undefined {
  const digits = digitsOf(code);
  const countries = (
    metadata.country_calling_codes as Record<string, string[] | undefined>
  )[digits];
  return countries?.[0] as CountryCode | undefined;
}

/**
 * Which flag a dial-code picker shows when only the code is stored.
 *
 * +1, +44, +7… cover several countries, so the one the person picked is kept
 * while the code still matches it; a code from outside (a saved contact, the
 * business default) shows its main country, and an unknown code shows
 * `fallback`.
 */
export function pickerCountryFor(
  code: string,
  picked: CountryCode | undefined,
  fallback: CountryCode = "AU",
): CountryCode {
  if (picked && `+${dialCodeFor(picked)}` === `+${digitsOf(code)}`) return picked;
  return countryForDialCode(code) ?? fallback;
}

/**
 * What the field shows for a value that came from outside — a saved number, or
 * a form being reset. Accepts "+61412345678", "+61 412 345 678" and
 * "0412345678" alike; the last is read against `fallback`.
 */
export function phoneStateFromValue(
  value: string | undefined | null,
  fallback: CountryCode,
): PhoneState {
  const clean = cleanPhoneValue(value);
  if (!clean) return { country: fallback, text: "" };

  const parsed = parsePhoneNumberFromString(clean, fallback);
  if (parsed?.country) {
    return { country: parsed.country, text: parsed.formatNational() };
  }

  const typed = new AsYouType(fallback);
  typed.input(clean);
  const country = typed.getCountry() ?? fallback;
  return { country, text: typed.getNumber()?.formatNational() ?? "" };
}

/**
 * What the field shows after the person types or pastes `raw`.
 *
 * Typed without a "+", it's a national number for `current`: libphonenumber
 * formats it as they go and drops the trunk "0" when it builds the full number.
 * Typed *with* a "+", the dial code is theirs to choose: the country follows it
 * as soon as it can be told (immediately, when it's the one already selected)
 * and the field keeps only the national part, so the dial code is never shown
 * twice. Until then the raw "+…" stays put rather than being rewritten under
 * their fingers.
 */
export function phoneStateFromInput(
  raw: string,
  current: CountryCode,
): PhoneState {
  // Only digits and a leading "+" mean anything. The formatter gives up at the
  // first character it doesn't know, so "Mobile: 0412 345 678" pasted as-is
  // would lose everything after the letters.
  const international = raw.trimStart().startsWith("+");
  const sanitized = `${international ? "+" : ""}${digitsOf(raw)}`;

  if (international) {
    const typed = new AsYouType();
    const shown = typed.input(sanitized);
    const callingCode = typed.getCallingCode();

    let country = typed.getCountry();
    if (!country && callingCode && callingCode === dialCodeFor(current)) {
      country = current;
    }
    if (country) {
      // National form, as a saved number reads back — so a pasted number looks
      // the same as one that was typed or loaded.
      return { country, text: typed.getNumber()?.formatNational() ?? "" };
    }
    return { country: current, text: shown };
  }

  return { country: current, text: new AsYouType(current).input(sanitized) };
}

/** The same typed digits, under a country the person just picked. */
export function phoneStateForCountry(
  text: string,
  country: CountryCode,
): PhoneState {
  // A half-typed "+…" belonged to the country they are leaving.
  if (text.trimStart().startsWith("+")) return { country, text: "" };
  return { country, text: new AsYouType(country).input(text) };
}

/**
 * The international string handed to the form, or "" when no number has been
 * typed — which is what lets a required field say "Enter your mobile number"
 * instead of passing on a bare dial code.
 */
export function phoneValue({ country, text }: PhoneState): string {
  const trimmed = text.trim();
  if (!digitsOf(trimmed)) return "";

  if (trimmed.startsWith("+")) return new AsYouType().input(trimmed);

  const typed = new AsYouType(country);
  typed.input(trimmed);
  const number = typed.getNumber();
  return number?.nationalNumber ? number.formatInternational() : "";
}

/** "0412 345 678" for AU — shows the shape the field wants. */
export function phonePlaceholder(country: CountryCode): string {
  return getExampleNumber(country, examples)?.formatNational() ?? "Phone number";
}

/* ------------------------------------------------------------------ *
 * Editing: deletion and caret
 *
 * The field re-formats on every keystroke, which has two classic side effects
 * this undoes: Backspace over a space only deletes the space (the formatter
 * puts it straight back, so the field looks stuck), and the caret jumps to the
 * end when you edit in the middle.
 * ------------------------------------------------------------------ */

/**
 * If the edit removed nothing but formatting (a space, a bracket, a dash),
 * remove the digit before the caret too — what Backspace was plainly meant to
 * do. Anything else is left as typed.
 */
export function resolveDeletion(
  raw: string,
  caret: number,
  previous: string,
): { raw: string; caret: number } {
  const significant = (value: string) => value.replace(/[^\d+]/g, "");
  const removedOnlyFormatting =
    raw.length < previous.length && significant(raw) === significant(previous);
  if (!removedOnlyFormatting) return { raw, caret };

  let index = Math.min(caret, raw.length) - 1;
  while (index >= 0 && !/\d/.test(raw[index])) index -= 1;
  if (index < 0) return { raw, caret };

  return { raw: raw.slice(0, index) + raw.slice(index + 1), caret: index };
}

/** Where the caret belongs in `formatted`, given `raw` was edited at `caret`. */
export function caretAfterFormatting(
  raw: string,
  caret: number,
  formatted: string,
): number {
  // At the end is where typing and pasting happen — and the one case where the
  // digit count can legitimately change (a pasted "+61" moves into the picker).
  if (caret >= raw.length) return formatted.length;

  let remaining = digitsOf(raw.slice(0, caret)).length;
  if (remaining === 0) return formatted.startsWith("+") ? 1 : 0;

  for (let index = 0; index < formatted.length; index += 1) {
    if (/\d/.test(formatted[index])) remaining -= 1;
    if (remaining === 0) return index + 1;
  }
  return formatted.length;
}

/** Whether `raw` has more digits than any phone number can. */
export function exceedsMaxDigits(raw: string): boolean {
  return digitsOf(raw).length > MAX_PHONE_DIGITS;
}
