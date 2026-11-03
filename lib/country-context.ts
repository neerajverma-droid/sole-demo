/**
 * What the open business's country decides — `GET /country-context`.
 *
 * Australia was not a setting, it was an assumption: "GST", a 10% rate, "ABN",
 * "BSB", a 1 July financial year and a quarterly BAS were written into the
 * forms. Every one of those is a different answer in New Zealand and South
 * Africa, and all of them come from the Country Registry, which a super admin
 * maintains — so a rate change or a renamed field is a data change rather than
 * a release.
 *
 * This is the per-business half of that. `lib/countries.ts` is the public list
 * someone picks from at sign-up; this is the context of the business already
 * open, and it carries what the list can't: the rate in effect today, the
 * financial year, the filing frequencies and the bank-account fields.
 *
 * ── Why there is a fallback ────────────────────────────────────────────────
 *
 * Every screen that reads this renders before the request lands, and most of
 * them are forms someone is already typing in. Returning null would mean a
 * field with no label for a few hundred milliseconds, or worse, a form that
 * flips its validation rules under the cursor. So the hook starts from the
 * Australian context — which is what every existing business is — and the
 * server's answer replaces it. The backend does exactly the same thing when
 * its registry is unreachable.
 */

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { useCountryStore } from "@/stores/country";
import {
  FALLBACK_ADDRESS_FORM,
  FALLBACK_CONTACT_FORM,
  deriveForms,
  formField,
  validateFormField,
  type CountryForms,
  type FormField,
} from "@/lib/country-forms";

export { validateFormField };
export type { CountryForms, FormField, ModuleForm } from "@/lib/country-forms";

/* -------------------------------------------------------------------------- *
 * Shapes
 * -------------------------------------------------------------------------- */

/** One field a country asks for, as the registry describes it. */
export type CountryField = {
  key: string;
  label: string;
  required: boolean;
  /** Anchored regex, tested against the whitespace-stripped value. */
  pattern: string | null;
  /** e.g. "999-999" — a 9 is a digit, anything else is a literal. */
  mask: string | null;
  validator: string | null;
  /** Set when this field holds the same number as another one. */
  sameAs: string | null;
  /** Only required once the business says it's registered for tax. */
  requiredIfTaxRegistered: boolean;
};

export type CountryTaxRate = {
  taxCode: string;
  name: string;
  category: string;
  rate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isDefault: boolean;
};

/**
 * What this business charges, as the server resolved it: its own custom rate from
 * Settings, or its country's standard rate. `/country-context` → `tax.effective`.
 */
export type EffectiveTax = {
  /** False only when the business has said it isn't registered. */
  registered: boolean;
  /** Registered and not switched off in tax settings — whether documents offer tax at all. */
  enabled: boolean;
  /** Today's rate, in percentage points. */
  rate: number;
  /** What to call it: the custom rate's name, else the country's word. */
  name: string;
  source: "country" | "custom";
  /** The country's standard rate today, whatever the business uses. */
  countryRate: number | null;
};

export type FilingPeriod = {
  code: string;
  label: string;
  startDate: string;
  endDate: string;
  dueDate: string | null;
};

export type FiscalYearLabel = {
  label: string;
  longLabel: string;
  startDate: string;
  endDate: string;
};

/** Which open-banking provider connects a bank here. */
export type BankFeedProvider = "fiskil" | "akahu";

export type BankFeed = {
  /** "fiskil" (AU), "akahu" (NZ), or a provider this build doesn't know yet. */
  key: string;
  /** "Fiskil", "Akahu" — for copy such as "Sole uses Akahu to…". */
  name: string;
  /** False when the country has a provider chosen but not yet connected. */
  available: boolean;
};

export type CountryContext = {
  iso2: string;
  name: string;
  currency: string;
  /**
   * What to print in front of an amount — "$", "NZ$", "R" — as a super admin
   * set it on the country.
   *
   * Null means "derive it from the locale", which is what every country did
   * before this field existed. It is a field rather than a derivation because
   * Intl gives a bare "$" for NZD in en-NZ: correct inside New Zealand, and
   * ambiguous on an invoice read anywhere else.
   */
  currencySymbol: string | null;
  locale: string;
  timezone: string;
  phoneDialCode: string | null;

  /** "GST", "VAT" — the word this country's documents and reports use. */
  taxType: string;
  /** "ATO", "Inland Revenue", "SARS". */
  taxAuthority: string;
  /** Whether this business says it's registered. Null when never answered. */
  taxRegistered: boolean | null;
  /** The standard rate in effect today, in percentage points. Null if none is. */
  standardRate: number | null;
  standardCode: string | null;
  /** Current and scheduled rates, so a form can warn about an upcoming change. */
  rates: CountryTaxRate[];
  /** The business's own answer — custom rate or the country's. See `documentTax`. */
  effectiveTax: EffectiveTax;

  fiscalYearStartMonth: number;
  fiscalYearStartDay: number;
  currentFiscalYear: FiscalYearLabel | null;

  /** The frequency this business files on, and the ones it may choose from. */
  filingFrequency: string | null;
  filingFrequencies: string[];
  /** "BAS", "GST return", "VAT return". */
  returnName: string | null;
  currentFilingPeriod: FilingPeriod | null;
  /** The period before it — usually the return still to lodge early in the current one. */
  previousFilingPeriod: FilingPeriod | null;

  /** Every label the registry holds, e.g. `tax`, `business_id`, `bank_branch`. */
  labels: Record<string, string | null>;
  /** Country-specific products: `ndis`, `super_contributions`, … */
  features: Record<string, boolean>;

  identifierSchema: CountryField[];
  /** BSB + account number in AU; one long account number in NZ; branch code in ZA. */
  bankAccountSchema: CountryField[];

  /** The bank feed "Connect your bank" uses here; null when the country has none. */
  bankFeed: BankFeed | null;

  /** Per-module form fields and rules, served by the backend. */
  forms: CountryForms;

  hasIdentifierLookup: boolean;
  /** 0 when this is the bundled fallback rather than the server's answer. */
  registryVersion: number;
};

/* -------------------------------------------------------------------------- *
 * The fallback
 * -------------------------------------------------------------------------- */

const field = (over: Partial<CountryField> & { key: string; label: string }): CountryField => ({
  required: false,
  pattern: null,
  mask: null,
  validator: null,
  sameAs: null,
  requiredIfTaxRegistered: false,
  ...over,
});

/**
 * Australia, which is what every business was before the registry existed.
 *
 * Deliberately the same values the backend's bundled seed holds, so a screen
 * rendering from this and one rendering from the server's answer agree.
 */
export const FALLBACK_COUNTRY_CONTEXT: CountryContext = {
  iso2: "AU",
  name: "Australia",
  currency: "AUD",
  currencySymbol: "$",
  locale: "en-AU",
  timezone: "Australia/Sydney",
  phoneDialCode: "+61",
  taxType: "GST",
  taxAuthority: "ATO",
  taxRegistered: null,
  standardRate: 10,
  standardCode: "GST",
  rates: [],
  effectiveTax: { registered: true, enabled: true, rate: 10, name: "GST", source: "country", countryRate: 10 },
  fiscalYearStartMonth: 7,
  fiscalYearStartDay: 1,
  currentFiscalYear: null,
  filingFrequency: "quarterly",
  filingFrequencies: ["monthly", "quarterly", "annual"],
  returnName: "BAS",
  currentFilingPeriod: null,
  previousFilingPeriod: null,
  labels: {
    tax: "GST",
    tax_invoice: "Tax Invoice",
    tax_quote: "Tax Quote",
    tax_return: "BAS",
    tax_authority: "ATO",
    business_id: "ABN",
    tax_id: "ABN",
    bank_branch: "BSB",
    tax_free: "GST free",
    tax_inclusive: "Inc GST",
    tax_exclusive: "Ex GST",
  },
  features: {},
  identifierSchema: [
    field({ key: "business_registration_number", label: "ABN", required: true, pattern: "^\\d{11}$", validator: "abn_mod89", mask: "99 999 999 999" }),
  ],
  bankAccountSchema: [
    field({ key: "bsb", label: "BSB", required: true, pattern: "^\\d{3}-?\\d{3}$", mask: "999-999" }),
    field({ key: "account_number", label: "Account number", required: true, pattern: "^\\d{6,10}$" }),
  ],
  bankFeed: { key: "fiskil", name: "Fiskil", available: true },
  forms: { contact: FALLBACK_CONTACT_FORM, address: FALLBACK_ADDRESS_FORM },
  hasIdentifierLookup: true,
  registryVersion: 0,
};

/* -------------------------------------------------------------------------- *
 * Mapping
 * -------------------------------------------------------------------------- */

type RawField = {
  key?: string;
  label?: string;
  required?: boolean;
  required_if?: string | null;
  pattern?: string | null;
  mask?: string | null;
  validator?: string | null;
  same_as?: string | null;
};

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const nullableText = (value: unknown): string | null => text(value) || null;
const numberOr = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function mapFields(raw: unknown): CountryField[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawField[])
    // A field with no key can't be read or written, so it isn't a field.
    .filter((entry) => text(entry.key))
    .map((entry) =>
      field({
        key: text(entry.key),
        label: text(entry.label) || text(entry.key),
        required: entry.required === true,
        pattern: nullableText(entry.pattern),
        mask: nullableText(entry.mask),
        validator: nullableText(entry.validator),
        sameAs: nullableText(entry.same_as),
        requiredIfTaxRegistered: text(entry.required_if) === "tax_registered",
      }),
    );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapForms(raw: any): CountryForms {
  const forms: CountryForms = {};
  if (typeof raw !== "object" || raw === null) return forms;
  for (const [name, entry] of Object.entries<any>(raw)) {
    if (!Array.isArray(entry?.fields)) continue;
    forms[name] = {
      fields: entry.fields
        // A field with no key can't be written, so it isn't a field.
        .filter((f: any) => text(f?.key))
        .map((f: any) =>
          formField({
            key: text(f.key),
            type: text(f.type) || "identifier",
            label: text(f.label) || text(f.key),
            required: f.required === true,
            ref: nullableText(f.ref),
            pattern: nullableText(f.pattern),
            validator: nullableText(f.validator),
            mask: nullableText(f.mask),
            placeholder: nullableText(f.placeholder),
            inputMode: nullableText(f.input_mode),
            default: nullableText(f.default),
            optionsSource: nullableText(f.options_source),
            locked: f.locked === true,
            value: nullableText(f.value),
            iso2: nullableText(f.iso2),
            placeRestrictions: Array.isArray(f.place_restrictions) ? f.place_restrictions.map(text).filter(Boolean) : [],
            options: Array.isArray(f.options) ? f.options.map(text).filter(Boolean) : [],
            rate: f.rate === null || f.rate === undefined || !Number.isFinite(Number(f.rate)) ? null : Number(f.rate),
            rateLabel: nullableText(f.rate_label),
            inclusive: f.inclusive === true,
            visible: f.visible !== false,
            hint: nullableText(f.hint),
            ariaLabel: nullableText(f.aria_label),
            symbol: nullableText(f.symbol),
          }),
        ),
    };
  }
  return forms;
}

/** `tax.effective`, or — from a server that predates it — the country's standard rate. */
function mapEffectiveTax(tax: any): EffectiveTax {
  const effective = tax?.effective;
  const standard = tax?.standard_rate === null || tax?.standard_rate === undefined ? null : Number(tax.standard_rate);
  const registered = tax?.registered !== false;
  if (!effective || typeof effective !== "object") {
    return {
      registered,
      enabled: registered,
      rate: standard ?? FALLBACK_COUNTRY_CONTEXT.effectiveTax.rate,
      name: text(tax?.type) || FALLBACK_COUNTRY_CONTEXT.taxType,
      source: "country",
      countryRate: standard,
    };
  }
  const isRegistered = effective.registered !== false;
  return {
    registered: isRegistered,
    enabled: effective.enabled === undefined ? isRegistered : effective.enabled === true,
    rate: Number.isFinite(Number(effective.rate)) ? Number(effective.rate) : (standard ?? 0),
    name: text(effective.name) || text(tax?.type) || FALLBACK_COUNTRY_CONTEXT.taxType,
    source: effective.source === "custom" ? "custom" : "country",
    countryRate: effective.country_rate === null || effective.country_rate === undefined ? standard : Number(effective.country_rate),
  };
}

export function mapCountryContext(raw: any): CountryContext {
  const tax = raw?.tax ?? {};
  const fiscal = raw?.fiscal_year ?? {};
  const filing = raw?.filing ?? {};

  const filingPeriod = (entry: any): FilingPeriod | null =>
    entry
      ? {
          code: text(entry.code),
          label: text(entry.label),
          startDate: text(entry.start_date),
          endDate: text(entry.end_date),
          dueDate: nullableText(entry.due_date),
        }
      : null;
  const period = filingPeriod(filing.current_period);

  const currency = text(raw?.currency) || FALLBACK_COUNTRY_CONTEXT.currency;
  const currencySymbol = nullableText(raw?.currency_symbol);
  const identifierSchema = mapFields(raw?.identifier_schema);
  const forms = mapForms(raw?.forms);

  return {
    iso2: text(raw?.country_iso2).toUpperCase() || FALLBACK_COUNTRY_CONTEXT.iso2,
    name: text(raw?.country_name) || FALLBACK_COUNTRY_CONTEXT.name,
    currency,
    currencySymbol,
    locale: text(raw?.locale) || FALLBACK_COUNTRY_CONTEXT.locale,
    timezone: text(raw?.timezone) || FALLBACK_COUNTRY_CONTEXT.timezone,
    phoneDialCode: nullableText(raw?.phone_dial_code),

    taxType: text(tax.type) || FALLBACK_COUNTRY_CONTEXT.taxType,
    taxAuthority: text(tax.authority),
    // Null is meaningful: the business has never been asked.
    taxRegistered: tax.registered === null || tax.registered === undefined ? null : tax.registered === true,
    standardRate: tax.standard_rate === null || tax.standard_rate === undefined ? null : Number(tax.standard_rate),
    standardCode: nullableText(tax.standard_code),
    rates: Array.isArray(tax.rates)
      ? tax.rates.map((rate: any) => ({
          taxCode: text(rate.tax_code),
          name: text(rate.name),
          category: text(rate.category),
          rate: Number(rate.rate) || 0,
          effectiveFrom: text(rate.effective_from),
          effectiveTo: nullableText(rate.effective_to),
          isDefault: rate.is_default === true,
        }))
      : [],

    effectiveTax: mapEffectiveTax(tax),

    fiscalYearStartMonth: numberOr(fiscal.start_month, FALLBACK_COUNTRY_CONTEXT.fiscalYearStartMonth),
    fiscalYearStartDay: numberOr(fiscal.start_day, FALLBACK_COUNTRY_CONTEXT.fiscalYearStartDay),
    currentFiscalYear: fiscal.current
      ? {
          label: text(fiscal.current.label),
          longLabel: text(fiscal.current.long_label),
          startDate: text(fiscal.current.start_date),
          endDate: text(fiscal.current.end_date),
        }
      : null,

    filingFrequency: nullableText(filing.frequency),
    filingFrequencies: Array.isArray(filing.frequencies) ? filing.frequencies.map(text).filter(Boolean) : [],
    returnName: nullableText(filing.return_name),
    currentFilingPeriod: period,
    previousFilingPeriod: filingPeriod(filing.previous_period),

    labels: typeof raw?.labels === "object" && raw.labels !== null ? raw.labels : {},
    features: typeof raw?.features === "object" && raw.features !== null ? raw.features : {},

    identifierSchema,
    bankAccountSchema: mapFields(raw?.bank_account_schema),
    // An older server sends no `bank_feed` — and every business was on Fiskil then.
    // `null` from a newer one means the country has no feed at all.
    bankFeed:
      raw?.bank_feed === undefined
        ? FALLBACK_COUNTRY_CONTEXT.bankFeed
        : raw.bank_feed && text(raw.bank_feed.key)
          ? {
              key: text(raw.bank_feed.key),
              name: text(raw.bank_feed.name) || text(raw.bank_feed.key),
              available: raw.bank_feed.available === true,
            }
          : null,
    // An older server sends no `forms`; build the contact form from what it did send.
    forms: Object.keys(forms).length ? forms : deriveForms(identifierSchema, currency),

    hasIdentifierLookup: raw?.has_identifier_lookup === true,
    registryVersion: numberOr(raw?.registry_version, 0),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function fetchCountryContext(): Promise<CountryContext> {
  const response = await api.get<{ success?: boolean; data?: unknown }>(apiRoutes.country.context);
  if (!response.data?.data) {
    throw new Error("The country settings came back in an unexpected shape");
  }
  return mapCountryContext(response.data.data);
}

/* -------------------------------------------------------------------------- *
 * Reading a context
 * -------------------------------------------------------------------------- */

/** Every field of a module's form (`contact`, …), or none if the module has no form. */
export function formFields(ctx: CountryContext, module: string): FormField[] {
  return ctx.forms?.[module]?.fields ?? [];
}

/**
 * The business address form for this country: the locked country, the region
 * choices and the postcode rule. An older server sends no `address` form, so
 * it is built from what the context does hold — the country is still locked
 * and the Places lookup still restricted to it.
 */
export function addressForm(ctx: CountryContext): FormField[] {
  const sent = formFields(ctx, "address");
  if (sent.length) return sent;
  if (ctx.iso2 === "AU") return FALLBACK_ADDRESS_FORM.fields;
  return [
    formField({ key: "country", type: "country", label: "Country", locked: true, value: ctx.name, iso2: ctx.iso2, placeRestrictions: [ctx.iso2.toLowerCase()] }),
  ];
}

/** One field of a module's form by its API key (`ABN`, `currency`). */
export function formFieldByKey(ctx: CountryContext, module: string, key: string): FormField | null {
  return formFields(ctx, module).find((entry) => entry.key === key) ?? null;
}

/** The currency a new contact starts with: NZD for a New Zealand business, AUD for an Australian one. */
export function contactDefaultCurrency(ctx: CountryContext): string {
  return formFieldByKey(ctx, "contact", "currency")?.default || ctx.currency;
}

/** A label from the registry, or a sensible Australian default. */
export function countryLabel(ctx: CountryContext, key: string, fallback: string): string {
  return ctx.labels?.[key]?.trim() || fallback;
}

/** The word for the tax: "GST", "VAT". Used in headings and field labels. */
export function taxWord(ctx: CountryContext): string {
  return countryLabel(ctx, "tax", ctx.taxType || "GST");
}

/** A rate row is in effect on `date` (YYYY-MM-DD). */
const rateInEffect = (rate: CountryTaxRate, date: string) => rate.effectiveFrom <= date && (!rate.effectiveTo || rate.effectiveTo >= date);

/** 12.5 → "12.5", 15 → "15". */
const rateText = (rate: number) => String(Math.round(rate * 10000) / 10000);

export type DocumentTax = {
  /** Whether lines can carry tax at all: registered and not switched off in Settings. */
  offered: boolean;
  /** Percentage points for a line dated `date`. */
  rate: number;
  /** "GST", "VAT". */
  word: string;
  /** "GST (15%)". */
  rateLabel: string;
  source: "country" | "custom";
};

/**
 * The tax a document dated `date` charges: the business's custom rate when it has
 * one, otherwise the country's standard rate in effect on that date — so an invoice
 * dated after a scheduled change picks up the new rate. The same rule the server
 * applies when it fills in a line's rate.
 */
export function documentTax(ctx: CountryContext, date?: string | null): DocumentTax {
  const effective = ctx.effectiveTax;
  let rate = effective.rate;
  if (effective.source === "country" && date) {
    const live = ctx.rates.filter((row) => rateInEffect(row, date.slice(0, 10)));
    const row = live.find((r) => r.isDefault) ?? live.find((r) => r.category === "standard");
    if (row) rate = row.rate;
  }
  const word = effective.name || taxWord(ctx);
  return { offered: effective.enabled, rate, word, rateLabel: `${word} (${rateText(rate)}%)`, source: effective.source };
}

/** What this country calls its return: "BAS", "GST return", "VAT return". */
export function returnWord(ctx: CountryContext): string {
  return ctx.returnName?.trim() || countryLabel(ctx, "tax_return", "BAS");
}

/**
 * The branch-code field's label, or null where a country has none.
 *
 * New Zealand's account number carries its bank and branch inside it, so there
 * is no separate field — and a form that showed an empty "BSB" box there would
 * be asking for something that doesn't exist.
 */
export function branchLabel(ctx: CountryContext): string | null {
  const label = ctx.labels?.bank_branch;
  return label === null || label === undefined || !label.trim() ? null : label.trim();
}

/** The field a country asks for by key, or null. */
export function bankField(ctx: CountryContext, key: string): CountryField | null {
  return ctx.bankAccountSchema.find((entry) => entry.key === key) ?? null;
}

/**
 * The account-number field. Every country has one, and it is stored in the
 * business's `account_number` column.
 */
export const BANK_ACCOUNT_KEY = "account_number";

export function bankAccountField(ctx: CountryContext): CountryField | null {
  return bankField(ctx, BANK_ACCOUNT_KEY);
}

/**
 * The field that identifies the branch, where a country has one — Australia's
 * BSB, South Africa's branch code — or null.
 *
 * Found as "the bank field that isn't the account number" rather than by name,
 * because the name is exactly what differs. New Zealand has none at all: its
 * account number carries the bank and branch inside it, so a form that drew an
 * empty "BSB" box there would be asking for something that does not exist.
 *
 * Both map onto the business's existing `bsb` column — the column name is
 * Australian, the value in it is whatever its country calls a branch.
 */
export function bankBranchField(ctx: CountryContext): CountryField | null {
  return ctx.bankAccountSchema.find((entry) => entry.key !== BANK_ACCOUNT_KEY) ?? null;
}

export function identifierField(ctx: CountryContext, key: string): CountryField | null {
  return ctx.identifierSchema.find((entry) => entry.key === key && !entry.sameAs) ?? null;
}

/* -------------------------------------------------------------------------- *
 * What an invoice or quote prints
 *
 * These mirror sole-ocr's `services/country/documentRenderData.js` and
 * `documentLabels.js`, which decide the wording on the rendered PDF, so the
 * editor shows the same "NZBN" or "TAX INVOICE" the client will receive.
 * -------------------------------------------------------------------------- */

export type DocumentIdentifier = { key: string; label: string; value: string };

/**
 * The business's numbers, labelled the way its country labels them: ABN in
 * Australia, NZBN and GST number in New Zealand, company registration and VAT
 * number in South Africa. Numbers the business hasn't entered are left out.
 *
 * Australia prints the legacy `abn` column first, because that is the one the
 * profile form still writes — the same preference the PDF has.
 */
export function businessIdentifiers(
  ctx: CountryContext,
  business: { abn?: string; registrationNumber?: string; taxNumber?: string } | null | undefined,
): DocumentIdentifier[] {
  if (!business) return [];
  const valueFor: Record<string, string | undefined> = {
    business_registration_number:
      ctx.iso2 === "AU" ? business.abn?.trim() || business.registrationNumber : business.registrationNumber,
    tax_registration_number: business.taxNumber,
  };

  const seen = new Set<string>();
  const identifiers: DocumentIdentifier[] = [];
  for (const spec of ctx.identifierSchema) {
    // Australia's GST registration number IS its ABN; printing it twice says nothing.
    if (spec.sameAs) continue;
    const value = valueFor[spec.key]?.trim() ?? "";
    if (!value || seen.has(value)) continue;
    seen.add(value);
    identifiers.push({ key: spec.key, label: spec.label, value });
  }

  if (!ctx.identifierSchema.length && business.abn?.trim()) {
    identifiers.push({ key: "business_registration_number", label: countryLabel(ctx, "business_id", "ABN"), value: business.abn.trim() });
  }
  return identifiers;
}

/**
 * The business's own registration number, labelled and spaced the way its
 * country writes it: "ABN · 12 345 678 901" in Australia, "NZBN · 9429041234567"
 * in New Zealand, "Company number · 12345678" in the UK.
 *
 * Two country facts in one answer, because a screen showing this needs both and
 * getting either from somewhere else is how they drift apart.
 *
 * ── Which column holds the number ──────────────────────────────────────────
 *
 * The same precedence `businessIdentifiers` uses. `abn` is Australia's legacy
 * column and still the one its profile form writes;
 * `business_registration_number` is the general one every other country uses.
 * Reading `abn` alone — which is what a screen written when Australia was an
 * assumption does — finds nothing for a New Zealand business and silently
 * shows no number at all.
 *
 * ── The spacing ────────────────────────────────────────────────────────────
 *
 * `formatAbn`'s 2-3-3-3 grouping is Australia's mask, so it is applied only
 * there. Elsewhere the number is printed as entered: a company number can
 * contain letters (a Scottish "SC123456"), and a formatter that keeps digits
 * only would quietly drop them.
 *
 * Returns null when there is no number to show, so the caller omits the row
 * rather than rendering a label with an em dash after it.
 */
export function businessIdDisplay(
  ctx: CountryContext,
  business:
    | { abn?: string; registrationNumber?: string }
    | null
    | undefined,
): { label: string; value: string } | null {
  if (!business) return null;

  const value =
    ctx.iso2 === "AU"
      ? business.abn?.trim() || business.registrationNumber?.trim() || ""
      : business.registrationNumber?.trim() || business.abn?.trim() || "";

  if (!value) return null;

  return {
    label: countryLabel(ctx, "business_id", "ABN"),
    value: ctx.iso2 === "AU" ? formatAustralianAbn(value) : value,
  };
}

/**
 * Australia's 2-3-3-3 grouping.
 *
 * A copy of `lib/onboarding.ts`'s `formatAbn` rather than an import, because
 * that module is the sign-up flow's and this one is the country registry's —
 * and the dependency would run the wrong way, from the thing every country
 * reads to the thing one country's onboarding does. Anything that isn't eleven
 * digits is left alone, same as there: a half-typed number should look
 * half-typed, not rearranged.
 */
function formatAustralianAbn(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return value;
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
}

/** The label beside a customer's business number — "ABN", "NZBN", … */
export function customerIdLabel(ctx: CountryContext): string {
  return countryLabel(ctx, "customer_id", countryLabel(ctx, "business_id", "ABN"));
}

/**
 * The document heading: "TAX INVOICE" / "TAX QUOTE" when tax is charged by a
 * business registered for it, otherwise "INVOICE" / "QUOTE". The country's
 * tax-invoice threshold doesn't change it — a registered business may always
 * issue a tax invoice, it is only *required* above the threshold.
 */
export function documentHeading(ctx: CountryContext, kind: "invoice" | "quote", chargesTax: boolean): string {
  const taxed = chargesTax && ctx.taxRegistered !== false;
  if (kind === "quote") return taxed ? countryLabel(ctx, "tax_quote", "Tax Quote").toUpperCase() : "QUOTE";
  return taxed ? countryLabel(ctx, "tax_invoice", "Tax Invoice").toUpperCase() : "INVOICE";
}

/**
 * The bank fields this country requires, for a sentence: "BSB and account
 * number" in Australia, "account number" in New Zealand, "branch code and
 * account number" in South Africa.
 */
export function bankFieldsPhrase(ctx: CountryContext): string {
  const names = ctx.bankAccountSchema
    .filter((spec) => spec.required)
    .map((spec) => (/^[A-Z]{2,6}$/.test(spec.label) ? spec.label : spec.label.charAt(0).toLowerCase() + spec.label.slice(1)));
  if (!names.length) return "bank details";
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Which provider "Connect your bank" goes through: Akahu where the country's
 * feed is Akahu and it's connected, else Fiskil — which is every business that
 * existed before NZ, and so the safe answer while the context is still loading.
 */
export function bankFeedProvider(ctx: CountryContext): BankFeedProvider {
  return ctx.bankFeed?.key === "akahu" && ctx.bankFeed.available ? "akahu" : "fiskil";
}

/** The provider's name for copy: "Fiskil", "Akahu". */
export function bankFeedName(ctx: CountryContext): string {
  return bankFeedProvider(ctx) === "akahu" ? ctx.bankFeed?.name || "Akahu" : "Fiskil";
}

/**
 * Whether every bank field the country requires has been filled in.
 *
 * Presence only, deliberately: this gates raising an invoice, and an account
 * saved before the registry's patterns existed must not suddenly be blocked
 * for its formatting. `hasCompleteBankDetails` is the stricter check a form uses.
 */
export function hasRequiredBankFields(ctx: CountryContext, bank: { bsb: string; accountNumber: string }): boolean {
  const required = ctx.bankAccountSchema.filter((spec) => spec.required);
  if (!required.length) return Boolean(bank.accountNumber.trim());
  return required.every((spec) => (spec.key === BANK_ACCOUNT_KEY ? bank.accountNumber : bank.bsb).trim() !== "");
}

/** Whether a country-specific product is on for this business. */
export function hasFeature(ctx: CountryContext, key: string): boolean {
  return ctx.features?.[key] === true;
}

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Monthly",
  bimonthly: "Two-monthly",
  quarterly: "Quarterly",
  fourmonthly: "Four-monthly",
  sixmonthly: "Six-monthly",
  annual: "Annually",
};

export function filingFrequencyLabel(frequency: string): string {
  return FREQUENCY_LABELS[frequency] ?? frequency;
}

/** The frequencies this country files on, ready for a Select. */
export function filingFrequencyOptions(ctx: CountryContext): { value: string; label: string }[] {
  const frequencies = ctx.filingFrequencies.length ? ctx.filingFrequencies : ["quarterly"];
  return frequencies.map((value) => ({ value, label: filingFrequencyLabel(value) }));
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** `1 July`, from the country's financial-year start. */
export function fiscalYearStartLabel(ctx: CountryContext): string {
  return `${ctx.fiscalYearStartDay} ${MONTHS[ctx.fiscalYearStartMonth - 1] ?? ""}`.trim();
}

/** `1 July – 30 June`, for a hint under a financial-year field. */
export function fiscalYearRangeLabel(ctx: CountryContext): string {
  const endMonthIndex = (ctx.fiscalYearStartMonth + 10) % 12;
  const endMonth = MONTHS[endMonthIndex] ?? "";
  if (endMonthIndex === 1 && ctx.fiscalYearStartDay === 1) {
    return `${fiscalYearStartLabel(ctx)} – the end of ${endMonth}`;
  }
  const daysInEndMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][endMonthIndex];
  const endDay = ctx.fiscalYearStartDay === 1 ? daysInEndMonth : ctx.fiscalYearStartDay - 1;
  return `${fiscalYearStartLabel(ctx)} – ${endDay} ${endMonth}`;
}

/**
 * Money in this country's own currency and locale.
 *
 * Replaces the `$`-prefixed `toLocaleString("en-AU")` calls scattered through
 * the forms, which printed Australian dollars at a South African business.
 */
/**
 * How a tax-inclusive amount splits, worked through at the rate: "$110.00 contains
 * $10.00 of GST" at 10%, "$115.00 contains $15.00" at 15%. Shown wherever a figure
 * already includes the tax — an expense, a bank line — so nobody reads it as
 * "add the tax on top", and nobody is told "÷ 11" in a country where it's 3/23.
 */
export function inclusiveTaxHint(ctx: CountryContext, ratePercent: number, word: string = taxWord(ctx)): string {
  const rate = Number(ratePercent) || 0;
  const money = (amount: number) => formatCountryMoney(ctx, amount);
  const exclusive = countryLabel(ctx, "tax_exclusive", `ex-${word}`);
  return `On means the price above already includes ${word} — it isn't added on top. At ${rateText(rate)}%, ${money(100 + rate)} contains ${money(rate)} of ${word}, leaving ${money(100)} ${exclusive}.`;
}

/**
 * The same split worked through on a real tax-inclusive amount — the price someone
 * just typed: "$100.00 contains $13.04 of GST, leaving $86.96 Excl GST" at 15%.
 * Rounded to the cent the way the server stores it (tax first, the rest is net),
 * so the hint shows the figures the expense will be saved with.
 */
export function inclusiveTaxSplitHint(ctx: CountryContext, amount: number, ratePercent: number, word: string = taxWord(ctx)): string {
  const gross = Math.round((Number(amount) || 0) * 100) / 100;
  const rate = Number(ratePercent) || 0;
  // Divided by (100 + rate) / rate rather than multiplied out, so 10% is exactly ÷ 11.
  const tax = rate > 0 ? Math.round((gross / ((100 + rate) / rate)) * 100) / 100 : 0;
  const net = Math.round((gross - tax) * 100) / 100;
  const money = (value: number) => formatCountryMoney(ctx, value);
  const exclusive = countryLabel(ctx, "tax_exclusive", `ex-${word}`);
  return `The price includes ${word}: ${money(gross)} contains ${money(tax)} of ${word}, leaving ${money(net)} ${exclusive}.`;
}

/**
 * Money with the country's own symbol ("$", "R"), the digits always written
 * 1,234.50 — as on the invoice PDF and email. en-ZA would write "R 1 234,50";
 * the decimal comma is deliberately not used anywhere yet. A code ("USD 1.00")
 * keeps its space; a symbol doesn't ("R1.00").
 */
export function formatMoneyIn(
  ctx: Pick<CountryContext, "locale" | "currency"> & { currencySymbol?: string | null },
  amount: number,
  options: Intl.NumberFormatOptions = {},
): string {
  // The symbol a super admin set, if there is one. Only the symbol is swapped:
  // the country's own grouping and the digits stay exactly as Intl writes them.
  const registrySymbol = ctx.currencySymbol?.trim() || null;
  try {
    const parts = new Intl.NumberFormat(ctx.locale || "en-AU", {
      style: "currency",
      currency: ctx.currency || "AUD",
      ...options,
    }).formatToParts(amount);
    return parts
      .map((part, index) => {
        if (part.type === "currency" && registrySymbol) return registrySymbol;
        if (part.type === "group") return ",";
        if (part.type === "decimal") return ".";
        const previous = parts[index - 1];
        const afterSymbol = previous?.type === "currency" && !/^[A-Z]{3}$/.test(previous.value);
        if (part.type === "literal" && afterSymbol && !part.value.trim()) return "";
        return part.value;
      })
      .join("");
  } catch {
    return `${registrySymbol ?? `${ctx.currency} `}${amount.toFixed(2)}`;
  }
}

export function formatCountryMoney(ctx: CountryContext, amount: number): string {
  return formatMoneyIn(ctx, amount);
}

/**
 * The prefix a money field shows: what `formatCountryMoney` writes before the
 * digits — "$" in Australia, "NZ$" in New Zealand, "R" in South Africa.
 *
 * The registry's own symbol first, so this and every rendered amount agree and
 * a super admin can correct either without a deploy. The locale is only the
 * fallback for a country that hasn't been given one.
 */
export function countryCurrencySymbol(ctx: CountryContext): string {
  const registrySymbol = ctx.currencySymbol?.trim();
  if (registrySymbol) return registrySymbol;
  try {
    const parts = new Intl.NumberFormat(ctx.locale || "en-AU", {
      style: "currency",
      currency: ctx.currency || "AUD",
    }).formatToParts(0);
    return parts.find((part) => part.type === "currency")?.value || ctx.currency || "$";
  } catch {
    return ctx.currency || "$";
  }
}

/**
 * The open business's country, for the plain formatters called from hundreds of
 * places outside a component (`invoiceMoney`, `reportMoney` …). `useCountryContext`
 * fills the store; until it has, this is the bundled Australian context, and
 * `CurrencyBoundary` re-renders the page once the real one lands.
 */
export function activeCountryContext(): CountryContext {
  return useCountryStore.getState().context ?? FALLBACK_COUNTRY_CONTEXT;
}

/** The open business's base currency code: AUD, NZD, ZAR. */
export function activeBaseCurrency(): string {
  return activeCountryContext().currency || FALLBACK_COUNTRY_CONTEXT.currency;
}

/** The open business's currency symbol: "$" in AU and NZ, "R" in ZA, "\u20b9" in IN. */
export function activeCurrencySymbol(): string {
  return countryCurrencySymbol(activeCountryContext());
}

/**
 * The digits of an amount, grouped the way the open business's country writes
 * them. Only the digits — the symbol in front comes from
 * `activeCurrencySymbol`, which is how every formatter here already builds a
 * figure.
 *
 * Those formatters used to ask for `toLocaleString("en-AU")` and put the
 * country's symbol on the front, which was right for the first three countries
 * by accident: Australia, New Zealand and South Africa all group in threes.
 * India does not. A rupee figure runs 12,34,567.50 — the last three digits,
 * then pairs — and writing an Indian business's money in thousands is as wrong
 * as writing it in dollars.
 *
 * The group and decimal marks are then forced to "," and ".", which is what
 * the backend writes on an invoice PDF (services/country/currency.js). That
 * keeps South Africa unchanged, where en-ZA would otherwise give "1 234,56",
 * and it is the point: the same figure cannot read one way on the screen and
 * another on the document the customer receives.
 */
export function activeAmountDigits(
  value: number,
  options: Intl.NumberFormatOptions = {},
): string {
  const locale = activeCountryContext().locale || "en-AU";
  try {
    return new Intl.NumberFormat(locale, options)
      .formatToParts(value)
      .map((part) =>
        part.type === "group" ? "," : part.type === "decimal" ? "." : part.value,
      )
      .join("");
  } catch {
    return value.toLocaleString("en-AU", options);
  }
}

/* -------------------------------------------------------------------------- *
 * Validating what someone types
 * -------------------------------------------------------------------------- */

const digitsOnly = (value: string): string => value.replace(/[^0-9]/g, "");

/**
 * Whether a bank field holds something this country would accept.
 *
 * Pattern only — no check digits, because none of the three countries' bank
 * numbers carry one that is published. Blank is not an error here even for a
 * required field: these forms save partial payout details all the time, and
 * the "can this business be paid" question is asked separately
 * (`hasCompleteBankDetails`).
 *
 * The message names the field as this country calls it, so a New Zealand
 * business is never told its "BSB" is wrong.
 */
export function bankFieldError(ctx: CountryContext, key: string, value: string): string | undefined {
  const spec = bankField(ctx, key);
  const trimmed = value.trim();
  if (!spec || !trimmed) return undefined;

  if (spec.pattern && !new RegExp(spec.pattern).test(trimmed.replace(/\s/g, ""))) {
    return bankFieldHelp(ctx, key)
      ? `${spec.label} should be ${bankFieldHelp(ctx, key)}.`
      : `${spec.label} is not in the expected format.`;
  }
  return undefined;
}

/**
 * A plain-language description of what a field wants, derived from its pattern.
 *
 * The registry stores a regex, which is the right thing to validate with and
 * the wrong thing to show someone. These cover the shapes the three live
 * countries actually use; anything else falls back to the mask, then to
 * nothing at all rather than a guess.
 */
export function bankFieldHelp(ctx: CountryContext, key: string): string | null {
  const spec = bankField(ctx, key);
  if (!spec?.pattern) return spec?.mask ? `in the form ${spec.mask.replace(/9/g, "0")}` : null;

  const exact = /^\^\\d\{(\d+)\}\$$/.exec(spec.pattern);
  if (exact) return `${exact[1]} digits`;

  const range = /^\^\\d\{(\d+),(\d+)\}\$$/.exec(spec.pattern);
  if (range) return `${range[1]} to ${range[2]} digits`;

  const grouped = /^\^\\d\{(\d+)\}-\?\\d\{(\d+)\}\$$/.exec(spec.pattern);
  if (grouped) return `${Number(grouped[1]) + Number(grouped[2])} digits`;

  return spec.mask ? `in the form ${spec.mask.replace(/9/g, "0")}` : null;
}

/** Every bank-field problem at once, so a caller can gate its own Save. */
export function bankDetailsError(
  ctx: CountryContext,
  values: Record<string, string>,
): string | undefined {
  for (const spec of ctx.bankAccountSchema) {
    const issue = bankFieldError(ctx, spec.key, values[spec.key] ?? "");
    if (issue) return issue;
  }
  return undefined;
}

/**
 * Whether this business can actually be paid: every required field filled and
 * valid. What decides whether an invoice prints a "pay to" block.
 */
export function hasCompleteBankDetails(
  ctx: CountryContext,
  values: Record<string, string>,
): boolean {
  return ctx.bankAccountSchema
    .filter((spec) => spec.required)
    .every((spec) => {
      const value = (values[spec.key] ?? "").trim();
      return value !== "" && !bankFieldError(ctx, spec.key, value);
    });
}

export { digitsOnly as bankDigitsOnly };
