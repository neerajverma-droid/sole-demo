"use client";

import { addressForm, validateFormField, type FormField } from "@/lib/country-context";
import { useCountryContext } from "@/hooks/use-country-context";

/**
 * What the open business's country says about its address: the country itself
 * (fixed — a business never changes country), the Google Places restriction,
 * and the region and postcode rules.
 *
 * Everything comes from `forms.address` in the country context, held in the
 * country store, so an Australian business gets Australia's rules and a New
 * Zealand one New Zealand's — nothing here names a country.
 */
export function useAddressRules() {
  const { country } = useCountryContext();
  const fields = addressForm(country);
  const find = (type: string): FormField | null => fields.find((entry) => entry.type === type) ?? null;

  const countryField = find("country");
  const regionField = find("region");
  const postcodeField = find("postcode");

  const countryName = countryField?.value || country.name;
  const restrictions = countryField?.placeRestrictions.length
    ? countryField.placeRestrictions
    : [country.iso2.toLowerCase()];

  return {
    /** The business's country as written on its address. Not editable. */
    countryName,
    /** Country codes the address search may return — the business's own only. */
    restrictions,
    regionLabel: regionField?.label || "State / province",
    regionOptions: regionField?.options ?? [],
    postcodeLabel: postcodeField?.label || "Postcode",
    /** What's wrong with a postcode for this country, or undefined. */
    postcodeError: (value: string) => validateFormField(postcodeField, value),
    /** Why a picked place can't be used, or undefined when it is in this country. */
    placeError: (placeCountry: string) =>
      placeCountry ? validateFormField(countryField, placeCountry) : undefined,
  };
}
