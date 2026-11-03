/**
 * The countries a business can be created in — `GET /countries`, the Country
 * Registry's public list.
 *
 * Only entries the registry marks `live` come back, so this is already "what
 * Sole actually supports" rather than a list of every country in the world. It
 * carries the currency, dialling code and tax label with it, which is what
 * lets the rest of the product stop hardcoding "GST" and "$".
 *
 * No local fallback list. A country the registry doesn't know can't be saved —
 * `resolveCreateFields` rejects it with "not a supported country" — so offering
 * one would be offering a choice that fails on submit.
 */

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import type { CountryIdentifierField } from "@/lib/business-identifier";

export type Country = {
  /** ISO 3166-1 alpha-2, and the value stored on the business. */
  iso2: string;
  name: string;
  /** ISO 4217 — what this business's money is denominated in. */
  currency: string;
  /** e.g. "+61". Null when the registry has none. */
  phoneDialCode: string | null;
  /** What this country calls its consumption tax: "GST", "VAT", … */
  taxType: string | null;
  /**
   * The business/tax numbers this country asks for, with each one's label,
   * pattern, mask and check-digit algorithm. Australia's is an 11-digit ABN,
   * New Zealand's a 13-digit NZBN — so the form reads the field's shape from
   * here instead of hardcoding one country's.
   */
  identifierSchema: CountryIdentifierField[];
  /**
   * Whether this country has a business register sole-ocr can query — the ABR
   * for Australia, the NZBN register for New Zealand. The form offers its
   * "look this up" button off this rather than testing for "AU", so a country
   * without one is never shown a button that can only fail.
   */
  hasLookup: boolean;
};

type RawIdentifierField = {
  key?: string;
  label?: string;
  required?: boolean;
  pattern?: string | null;
  mask?: string | null;
  validator?: string | null;
  same_as?: string | null;
};

type RawCountry = {
  country_iso2?: string;
  name?: string;
  currency?: string;
  phone_dial_code?: string | null;
  tax_type?: string | null;
  identifier_schema?: RawIdentifierField[] | null;
  has_lookup?: boolean;
};

function mapIdentifierSchema(
  raw: RawIdentifierField[] | null | undefined,
): CountryIdentifierField[] {
  if (!Array.isArray(raw)) return [];
  return raw
    // A field with no key can't be read or written, so it isn't a field.
    .filter((entry) => text(entry.key))
    .map((entry) => ({
      key: text(entry.key),
      label: text(entry.label) || text(entry.key),
      required: entry.required === true,
      pattern: text(entry.pattern) || null,
      mask: text(entry.mask) || null,
      validator: text(entry.validator) || null,
      sameAs: text(entry.same_as) || null,
    }));
}

function text(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export async function fetchCountries(): Promise<Country[]> {
  const response = await api.get<{ success?: boolean; data?: RawCountry[] }>(
    apiRoutes.country.list,
  );

  const raw = response.data?.data;
  if (!Array.isArray(raw)) {
    throw new Error("The countries list came back in an unexpected shape");
  }

  return raw
    // A row with no code can't be stored, so it isn't a choice.
    .filter((entry) => text(entry.country_iso2))
    .map((entry) => ({
      iso2: text(entry.country_iso2).toUpperCase(),
      name: text(entry.name) || text(entry.country_iso2).toUpperCase(),
      currency: text(entry.currency),
      phoneDialCode: text(entry.phone_dial_code) || null,
      taxType: text(entry.tax_type) || null,
      identifierSchema: mapIdentifierSchema(entry.identifier_schema),
      hasLookup: entry.has_lookup === true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The live country this visitor is most likely in, or null.
 *
 * sole-ocr reads the request's IP; the browser's timezone goes with it as the
 * fallback for an IP that can't say (a VPN, an office proxy, localhost). A
 * suggestion to pre-select and label as such — never something to save
 * unconfirmed.
 */
export async function detectCountry(): Promise<string | null> {
  let tz: string | undefined;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // No Intl timezone support: the IP alone decides.
  }

  const response = await api.get<{
    success?: boolean;
    data?: { country_iso2?: string | null };
  }>(apiRoutes.country.detect, { params: tz ? { tz } : undefined });

  return text(response.data?.data?.country_iso2).toUpperCase() || null;
}

/** The country a business is in, resolved to its row. Null until both load. */
export function countryByIso2(
  countries: Country[],
  iso2: string | null | undefined,
): Country | null {
  if (!iso2) return null;
  const code = iso2.toUpperCase();
  return countries.find((country) => country.iso2 === code) ?? null;
}
