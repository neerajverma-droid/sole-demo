/**
 * The shape of a module's form as `/country-context` → `forms` describes it, and
 * the pure helpers that read it.
 *
 * Kept apart from `lib/country-context.ts` on purpose: that file fetches (it
 * imports the axios instance), and the contact schema in `lib/contacts.ts`
 * needs these types and the validator without dragging a network client into
 * everything that validates a form.
 */

import { identifierError, type CountryIdentifierField } from "@/lib/business-identifier";

/**
 * One field of a module's form, as `/country-context` → `forms.<module>` sends it.
 *
 * Unlike a `CountryField` (a number the BUSINESS holds, where AU makes the ABN
 * required) this is a field on a form about someone else, so `required`,
 * `key` and `default` are the form's own: `key` is the API field it is
 * written to, `ref` the registry identifier it borrows its rules from.
 */
export type FormField = {
  key: string;
  type: "identifier" | "currency" | string;
  label: string;
  required: boolean;
  /** Registry identifier this field follows, e.g. `business_registration_number`. */
  ref: string | null;
  pattern: string | null;
  validator: string | null;
  mask: string | null;
  placeholder: string | null;
  inputMode: string | null;
  /** The value a new record starts with — the currency, for a currency field. */
  default: string | null;
  /** Where a select's choices come from, e.g. `exchange_rates`. */
  optionsSource: string | null;
  /** A value the user can't change, e.g. the address country. */
  locked: boolean;
  /** The fixed value of a locked field. */
  value: string | null;
  /** ISO 3166-1 alpha-2 of a country field. */
  iso2: string | null;
  /** Lower-case country codes an address lookup may return. */
  placeRestrictions: string[];
  /** A select's own choices, e.g. a country's regions. */
  options: string[];

  /* Document tax fields (`type: "tax_toggle"`) — invoice, quote and expense. */
  /** The business's rate behind the field, in percentage points. */
  rate: number | null;
  /** "GST (15%)". */
  rateLabel: string | null;
  /** Prices include the tax (an expense) rather than having it added (an invoice line). */
  inclusive: boolean;
  /** Whether the form offers the field at all. */
  visible: boolean;
  /** Explanatory text under the field, e.g. how the inclusive split works. */
  hint: string | null;
  ariaLabel: string | null;
  /** A money field's currency symbol. */
  symbol: string | null;
};

export type ModuleForm = { fields: FormField[] };

/** Forms by module name: `contact`, `address`, and the tax fields of `invoice`, `quote` and `expense`. */
export type CountryForms = Record<string, ModuleForm>;

export const formField = (over: Partial<FormField> & { key: string; label: string }): FormField => ({
  type: "identifier",
  required: false,
  ref: null,
  pattern: null,
  validator: null,
  mask: null,
  placeholder: null,
  inputMode: null,
  default: null,
  optionsSource: null,
  locked: false,
  value: null,
  iso2: null,
  placeRestrictions: [],
  options: [],
  rate: null,
  rateLabel: null,
  inclusive: false,
  visible: true,
  hint: null,
  ariaLabel: null,
  symbol: null,
  ...over,
});

/**
 * The contact form built from what a context already holds, for a server that
 * doesn't send `forms` yet and for the bundled fallback. It mirrors the
 * backend's builder: the business-number rules come from the registry's
 * `business_registration_number`, but it is never required of a contact.
 */
export function deriveForms(identifierSchema: CountryIdentifierField[], currency: string): CountryForms {
  const number = identifierSchema.find((entry) => entry.key === "business_registration_number" && !entry.sameAs);
  const fields: FormField[] = [];
  if (number) {
    fields.push(
      formField({
        key: "ABN",
        ref: number.key,
        label: number.label,
        pattern: number.pattern,
        validator: number.validator,
        mask: number.mask,
        inputMode: "numeric",
      }),
    );
  }
  fields.push(formField({ key: "currency", type: "currency", label: "Currency", required: true, default: currency, optionsSource: "exchange_rates" }));
  return { contact: { fields } };
}

/**
 * What's wrong with a value for this field, or undefined. Pattern and check
 * digit come from the server's rules; the server re-checks on save and is the
 * authority, so an algorithm this build lacks passes here.
 */
export function validateFormField(field: FormField | null, value: string): string | undefined {
  if (!field) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return field.required ? `${field.label} is required.` : undefined;

  if (field.type === "currency") {
    return /^[A-Za-z]{3}$/.test(trimmed) ? undefined : `${field.label} must be a 3-letter currency code.`;
  }

  // A fixed-length number (11 digits, 13 digits) is better told how far off it is
  // than that it is "not in the expected format".
  const fixed = field.pattern?.match(/^\^\\d\{(\d+)\}\$$/);
  if (fixed) {
    const expected = Number(fixed[1]);
    const typed = trimmed.replace(/\D/g, "").length;
    if (/^[\d\s-]+$/.test(trimmed) && typed !== expected) {
      return `${field.label} must be ${expected} digits (you entered ${typed}).`;
    }
  }

  if (field.type === "country") {
    const known = [field.value, field.iso2].some((v) => v && v.toLowerCase() === trimmed.toLowerCase());
    return known ? undefined : `The address must be in ${field.value ?? "your country"}.`;
  }

  if (field.type === "postcode") {
    if (!field.pattern) return undefined;
    try {
      return new RegExp(field.pattern).test(trimmed) ? undefined : `${field.label} isn't a valid ${field.value ?? "postcode"}.`;
    } catch {
      return undefined;
    }
  }

  return identifierError(
    {
      key: field.ref ?? field.key,
      label: field.label,
      required: field.required,
      pattern: field.pattern,
      mask: field.mask,
      validator: field.validator,
      sameAs: null,
    },
    value,
    { require: field.required },
  );
}


/**
 * The contact form for the bundled Australian context, shown until the
 * server's answer lands. Mirrors what the backend builds for an AU business.
 */
export const FALLBACK_CONTACT_FORM: ModuleForm = {
  fields: [
    formField({ key: "ABN", ref: "business_registration_number", label: "ABN", pattern: "^\\d{11}$", validator: "abn_mod89", mask: "99 999 999 999", inputMode: "numeric" }),
    formField({ key: "currency", type: "currency", label: "Currency", required: true, default: "AUD", optionsSource: "exchange_rates" }),
  ],
};

/**
 * The address form for the bundled Australian context. Mirrors what the
 * backend builds for an AU business, so the Australian flow looks the same
 * before the server answers.
 */
export const FALLBACK_ADDRESS_FORM: ModuleForm = {
  fields: [
    formField({ key: "country", type: "country", label: "Country", locked: true, value: "Australia", iso2: "AU", placeRestrictions: ["au"] }),
    formField({ key: "state", type: "region", label: "State", options: ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"] }),
    formField({ key: "postcode", type: "postcode", label: "Postcode", pattern: "^\\d{4}$" }),
  ],
};
