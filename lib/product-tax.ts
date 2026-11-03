/**
 * A product's tax setting — taxed, not taxed, or tax-free — and the words it
 * goes by in the business's country.
 *
 * A product only ever says *whether* a line is taxed. The rate on an invoice
 * line comes from the business (its custom rate, or its country's standard
 * one), so "GST (15%)" on a product is a label, not a rate anything applies.
 * The server stores the label as free text beside a numeric `gst` flag and
 * never parses it, which is why reading one has to accept every label this
 * app has ever written — "GST (10%)", "GST_10", "GST Free", "— None —" — from
 * any country, while writing one uses the open business's own words.
 *
 * Kept apart from lib/inventory so lib/invoices can share the same predicate
 * without importing the module that imports it.
 */
import {
  FALLBACK_COUNTRY_CONTEXT,
  countryLabel,
  documentTax,
  type CountryContext,
} from "@/lib/country-context";

/** The three choices a product's tax select offers, in the open business's words. */
export type ProductTaxLabels = {
  /** "— None —" everywhere. */
  none: string;
  /** "GST (10%)", "GST (15%)", "VAT (15%)" — or the business's custom rate. */
  taxed: string;
  /** "GST Free", or what the country calls it ("Zero-rated"). */
  free: string;
};

export const NO_TAX_RATE = "— None —";

/**
 * What a row carrying only the `gst` flag has always read back as. Any screen
 * that shows it goes through `taxRateOption`, so a business elsewhere sees its
 * own label in its place.
 */
export const LEGACY_TAXED_RATE = "GST (10%)";

/**
 * The labels for `country`. Pure — a component passes in what
 * `useCountryContext()` gave it.
 */
export function productTaxLabels(country: CountryContext): ProductTaxLabels {
  const { word, rateLabel } = documentTax(country);
  const free = countryLabel(country, "tax_free", `${word} Free`);
  return {
    none: NO_TAX_RATE,
    taxed: rateLabel,
    // The registry's "GST free" is the same words as the "GST Free" every
    // existing Australian row holds — keep that spelling so those still match.
    free:
      free.toLowerCase() === `${word} free`.toLowerCase()
        ? `${word} Free`
        : free,
  };
}

/** Australia's labels — what every business is until its country loads. */
export const DEFAULT_PRODUCT_TAX_LABELS: ProductTaxLabels = productTaxLabels(
  FALLBACK_COUNTRY_CONTEXT,
);

/** The tax select's options, in display order. */
export function taxRateOptions(labels: ProductTaxLabels): string[] {
  return [labels.none, labels.taxed, labels.free];
}

/** "GST Free", "VAT exempt", "Zero-rated" — a label that names no tax. */
export function isTaxFreeRate(value: string | null | undefined): boolean {
  return /\b(free|exempt|zero)/i.test(value ?? "");
}

/**
 * Whether a stored label means the product is taxed. Country-agnostic, so an
 * NZ "GST (15%)", an older "GST (10%)" and a "GST_10" from before either all
 * count — the business decides the rate, not this string.
 */
export function isTaxedRate(
  value: string | null | undefined,
  taxedLabel?: string,
): boolean {
  const text = value?.trim() ?? "";
  if (!text || text === NO_TAX_RATE || isTaxFreeRate(text)) return false;
  if (taxedLabel && text === taxedLabel) return true;
  const percent =
    /\(\s*(\d+(?:\.\d+)?)\s*%\s*\)/.exec(text)?.[1] ??
    /^(?:GST|VAT)_(\d+(?:\.\d+)?)/i.exec(text)?.[1];
  return percent !== undefined && Number(percent) > 0;
}

/**
 * A stored label as one of `labels` — what a screen shows, and what the tax
 * select holds, whatever country or era the row was written in.
 */
export function taxRateOption(
  value: string | null | undefined,
  labels: ProductTaxLabels,
): string {
  if (isTaxedRate(value, labels.taxed)) return labels.taxed;
  return value?.trim() === labels.free || isTaxFreeRate(value)
    ? labels.free
    : labels.none;
}
