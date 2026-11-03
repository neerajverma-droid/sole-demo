/**
 * The bulk importers' view of the business's country.
 *
 * Kept apart from `lib/bulk-import.ts` on purpose: this reads the country
 * context, whose module fetches (it imports the axios instance), and the
 * import specs and payload builders are pure data and functions that tests
 * load without a network client.
 */
import {
  contactDefaultCurrency,
  documentTax,
  formFieldByKey,
  taxWord,
  type CountryContext,
} from "@/lib/country-context";
import type { BulkImportCountry } from "@/lib/bulk-import";

/**
 * What an import needs from a country context: its tax word ("GST", "VAT"),
 * the currency a new contact starts in, the rate on a row's date (the
 * business's custom rate when it has one, otherwise the country's rate in
 * effect then) and the contact form's business-number field (ABN, NZBN).
 */
export function bulkImportCountry(ctx: CountryContext): BulkImportCountry {
  return {
    taxWord: taxWord(ctx),
    currency: contactDefaultCurrency(ctx),
    taxOffered: documentTax(ctx).offered,
    taxRateOn: (date) => documentTax(ctx, date).rate,
    businessNumber: formFieldByKey(ctx, "contact", "ABN"),
  };
}
