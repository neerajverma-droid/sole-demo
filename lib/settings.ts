/**
 * Settings domain. Australian defaults throughout — ABN, GST, BAS, a 1 July
 * financial year and AUD.
 */
import { digitsOnly } from "@/lib/contacts";

export const SETTINGS_SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "business", label: "Business details" },
  // { id: "documents", label: "Invoice & quote defaults" },
  { id: "tax", label: "Tax & GST" },
  { id: "bank", label: "Bank & payments" },
  { id: "security", label: "Security" },
  { id: "subscription", label: "Subscription" },
  { id: "account-sharing", label: "Account sharing" },
  { id: "notifications", label: "Notifications" },
  { id: "danger-zone", label: "Delete account" },
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"];

export function isSettingsSection(value: string): value is SettingsSection {
  return SETTINGS_SECTIONS.some((section) => section.id === value);
}

/* ------------------------------------------------------------------ *
 * Option lists
 * ------------------------------------------------------------------ */

/**
 * The industry that unlocks NDIS invoicing. Named because three screens gate on
 * it — the create chooser, the template gallery and the NDIS editor's guard.
 */
export const NDIS_INDUSTRY = "NDIS (Health and Social Care)";

/**
 * What the business does. The single field behind which invoice types and
 * template collections it's offered — there's no separate category.
 */
export const INDUSTRIES = [
  "Admin Services",
  "Arts",
  "Make up",
  "Construction",
  "Creatives",
  "Finance",
  "Personal Trainers / Fitness",
  "Food services",
  NDIS_INDUSTRY,
  // Added for onboarding, which offers it by name. Existing profiles are
  // unaffected — `isIndustry` simply accepts one more value.
  "Consulting",
  "Influencers",
  "Insurance",
  "Manufacturers",
  "Professional services",
  "Retail",
  "Trades",
  "Transport & logistics",
  "Other",
] as const;

export type Industry = (typeof INDUSTRIES)[number];

export function isIndustry(value: unknown): value is Industry {
  return (INDUSTRIES as readonly unknown[]).includes(value);
}

/**
 * Where a sale posts. Lives here rather than in lib/inventory so both an item and
 * the sales-wide default can share it — lib/inventory imports settings, and the
 * reverse would be a cycle.
 */
export const INCOME_ACCOUNTS = [
  "Sales income",
  "Service income",
  "Other income",
] as const;
export type IncomeAccount = (typeof INCOME_ACCOUNTS)[number];

/** How line prices on a new document are read. The editors add GST on top. */
export const GST_TREATMENTS = [
  "GST exclusive",
  "GST inclusive",
  "GST free",
] as const;
export type GstTreatment = (typeof GST_TREATMENTS)[number];

/** Payment terms offered on the sales side. "Due on receipt" is zero days. */
export const SALES_PAYMENT_TERMS = ["Due on receipt", "7", "14", "30"] as const;
export type SalesPaymentTerm = (typeof SALES_PAYMENT_TERMS)[number];

/** Days a term resolves to — "Due on receipt" is the same day. */
export function paymentTermDays(term: SalesPaymentTerm): number {
  return term === "Due on receipt" ? 0 : Number(term);
}

export const BUSINESS_TYPES = [
  "Sole trader",
  "Company",
  "Partnership",
  "Trust",
] as const;

export const TERM_DAYS = ["7", "14", "21", "30"] as const;
export const ACCOUNTING_BASES = ["Cash", "Accrual"] as const;
/**
 * Kept for the stored default only. The frequencies a business may actually
 * choose come from its country — Australia files monthly, quarterly or
 * annually; New Zealand monthly, two-monthly or six-monthly; South Africa has
 * four — so the Select reads `filingFrequencyOptions(country)` and this is
 * just what an account starts on.
 */
export const BAS_FREQUENCIES = ["Monthly", "Quarterly", "Annually"] as const;
/**
 * Substituted financial years. The country's own start is read from the
 * registry; these are the alternatives a tax authority may approve, which is
 * why 1 April and 1 March are in the list rather than only 1 July.
 */
export const FINANCIAL_YEAR_STARTS = [
  "1 July",
  "1 January",
  "1 March",
  "1 April",
  "1 October",
] as const;

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

/**
 * The half of Invoice & quote defaults with no server field behind it.
 *
 * Payment terms, quote expiry, GST treatment and the income account are all
 * applied client-side when a document is created; sole-ocr has no column for
 * any of the four. They stay in `stores/preferences.ts`, keyed per business.
 * The notes and the logo are real and live on the branding record — see
 * `DocumentsSectionForm`.
 */
export type DocumentDefaults = {
  paymentTermsDays: SalesPaymentTerm;
  quoteExpiryDays: (typeof TERM_DAYS)[number];
  /** How a new document reads its line prices. */
  gstTreatment: GstTreatment;
  /** Where a sale posts by default; an item can override it. */
  incomeAccount: IncomeAccount;
};

/**
 * The whole Invoice & quote defaults section, local part and server part.
 *
 * The three added here are fields on `get-branding`/`save-branding`, the same
 * record the Sales settings screen edits — which is why the section saves
 * through `saveBrandingApi` with the full record rather than a slice of it.
 */
export type DocumentsSectionForm = DocumentDefaults & {
  /** Standard terms shown on every invoice — `invoice_note`. */
  invoiceNotes: string;
  /** Boilerplate appended to every quote — `quote_note`. */
  quoteNotes: string;
  /** The account's profile picture, served from a URL once uploaded. */
  logo: string | null;
};

/**
 * The half of Tax & GST with no server field behind it.
 *
 * `/v2/settings/tax-settings` holds a tax name, a percentage and an is-default
 * flag — nothing that could carry a BAS lodgement frequency or a substituted
 * financial year, and `businesses` has no column for either. See
 * `stores/preferences.ts`.
 */
export type TaxSettings = {
  /**
   * How often this business files. A plain string, not a union: the choices
   * are its country's, and a New Zealand business files two-monthly, which no
   * list written here could have known about.
   */
  basFrequency: string;
  financialYearStart: string;
};

/**
 * The whole Tax & GST section.
 *
 * `gstRegistered` and `gstRate` are the default tax rate on
 * `/v2/settings/tax-settings` (`is_default` and `tax_percentage` — see
 * `lib/tax-settings.ts`); `accountingBasis` is `accounting_type` on the
 * business record. Only the two inherited fields are device-local.
 */
export type TaxSectionForm = TaxSettings & {
  /** Whether GST applies by default — the rate's `is_default` flag. */
  gstRegistered: boolean;
  /** Percentage points as typed, e.g. "10". Validated by `taxPercentageError`. */
  gstRate: string;
  /**
   * "country" follows the country's standard rate — the registry's rate for each
   * document's date, so a government change applies itself; "custom" pins
   * `gstRate`. The record's `follow_country_rate`.
   */
  rateMode: "country" | "custom";
  accountingBasis: (typeof ACCOUNTING_BASES)[number];
};

export type NotificationSettings = {
  /** Server-backed: `/v2/notification-setting`, module `invoice`. */
  invoiceEmails: boolean;
  /** Server-backed: `/v2/notification-setting`, module `quote`. */
  quoteEmails: boolean;
  /** Device-local until the backend has a weekly-summary setting. */
  weeklySummary: boolean;
};

/** The part of `NotificationSettings` with no server home yet. */
export type LocalNotificationPrefs = Pick<NotificationSettings, "weeklySummary">;

/* ------------------------------------------------------------------ *
 * Validation — live, never blocking keystrokes
 * ------------------------------------------------------------------ */

/** Same rule and copy as the Contacts drawer. */
export function abnError(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const digits = digitsOnly(value);
  return digits.length === 11
    ? undefined
    : `ABN must be 11 digits (you entered ${digits.length}).`;
}

/** A Select can't produce a blank, so this only fires on migrated or bad data. */
export function industryError(value: string): string | undefined {
  return isIndustry(value) ? undefined : "Industry is required.";
}

export const NDIS_NUMBER_LENGTH = 9;
/** A 9-digit example, so the shape is obvious before anything is typed. */
export const NDIS_NUMBER_PLACEHOLDER = "405 000 123";

/**
 * Provider and participant NDIS numbers are both exactly 9 digits. Unlike the
 * ABN and BSB rules this treats a blank as an error rather than staying quiet:
 * the field only renders once NDIS is the chosen industry, where it gates the
 * whole feature and so can't be left empty.
 */
export function ndisNumberError(value: string): string | undefined {
  if (!value.trim()) return "NDIS number is required.";
  const digits = digitsOnly(value);
  return digits.length === NDIS_NUMBER_LENGTH
    ? undefined
    : `NDIS number must be ${NDIS_NUMBER_LENGTH} digits (you entered ${digits.length}).`;
}

/** Australian BSBs are six digits, usually written 123-456. */
export function bsbError(value: string): string | undefined {
  if (!value.trim()) return undefined;
  return digitsOnly(value).length === 6 ? undefined : "BSB must be 6 digits.";
}

export function accountNumberError(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const digits = digitsOnly(value);
  return digits.length >= 6 && digits.length <= 10
    ? undefined
    : "Account number must be 6 to 10 digits.";
}

export function wholeNumberError(value: string): string | undefined {
  if (!value.trim()) return undefined;
  return /^\d+$/.test(value.trim())
    ? undefined
    : "Enter a whole number (0 or more).";
}

/** Preview of the next document number, e.g. `INV-0025`. */
export function nextNumberPreview(prefix: string, next: string): string {
  const digits = next.trim().replace(/\D/g, "") || "1";
  return `${prefix.trim() || "INV"}-${digits.padStart(4, "0")}`;
}

/* ------------------------------------------------------------------ *
 * Defaults
 * ------------------------------------------------------------------ */

export const DEFAULT_DOCUMENT_DEFAULTS: DocumentDefaults = {
  paymentTermsDays: "7",
  quoteExpiryDays: "14",
  gstTreatment: "GST exclusive",
  incomeAccount: "Sales income",
};

export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  basFrequency: "Quarterly",
  financialYearStart: "1 July",
};

export const DEFAULT_NOTIFICATIONS: LocalNotificationPrefs = {
  weeklySummary: false,
};

/**
 * What the Free plan covers, and what a paid plan unlocks. Feature names come
 * from the handoff's plan comparison.
 */
export const PLAN_FEATURES: { label: string; included: boolean }[] = [
  { label: "Invoices & quotes — up to 5 a month", included: true },
  { label: "Expense tracking & receipts", included: true },
  { label: "Dashboard & reports", included: true },
  { label: "Unlimited invoices & quotes", included: false },
  { label: "Bank feed & automatic matching", included: false },
  { label: "Mobile apps", included: false },
];

/** Shallow value comparison — enough for these flat setting objects. */
export function sameValues<T extends object>(a: T, b: T): boolean {
  return (Object.keys(a) as (keyof T)[]).every((key) => a[key] === b[key]);
}

