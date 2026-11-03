import { AsYouType } from "libphonenumber-js";

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
