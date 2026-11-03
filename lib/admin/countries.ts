import axios from "axios";

import apiRoutes from "@/config/api-routes";
import api from "@/utils/axiosInstance";
import { apiErrorMessage } from "@/lib/api-error";
import type { PillTone } from "@/lib/admin/format";

/**
 * The Country Configuration Registry, for the admin console.
 *
 * Every tax rate, threshold, filing rule and label the product reads at runtime
 * is a row a super admin maintains here, so a government change — a new rate, a
 * new threshold, a new filing frequency — is a data change rather than a
 * deploy. See sole-ocr's `docs/MULTI_COUNTRY_EXPANSION_PLAN.md` §5.
 *
 * The flow the screens follow is the one the backend enforces:
 *
 *     stage  →  preview (validation + impact)  →  publish  →  (rollback)
 *
 * Nothing staged is visible to a business until it is published, and a period
 * that has already started can never be edited — only end-dated and replaced.
 * Both rules live on the server; the UI explains them rather than enforcing
 * them, so a stale tab can't talk anyone into a change the server would refuse.
 *
 * Bodies go as plain JSON: `/super/*` reads `req.body` directly and doesn't
 * decrypt.
 */

/* -------------------------------------------------------------------------- *
 * Types
 * -------------------------------------------------------------------------- */

export const COUNTRY_STATUSES = ["draft", "beta", "live", "disabled"] as const;
export type CountryStatus = (typeof COUNTRY_STATUSES)[number];

export const RATE_CATEGORIES = ["standard", "reduced", "zero", "exempt", "out_of_scope"] as const;
export type RateCategory = (typeof RATE_CATEGORIES)[number];

export const APPLIES_TO = ["both", "sales", "purchases"] as const;
export type AppliesTo = (typeof APPLIES_TO)[number];

/** Where a period sits on the timeline, as the backend labels it. */
export type RowState = "staged" | "scheduled" | "current" | "past";

export type IdentifierField = {
  key: string;
  label: string;
  required?: boolean;
  required_if?: string;
  same_as?: string;
  pattern?: string;
  validator?: string;
  mask?: string;
};

export type CountrySummary = {
  iso2: string;
  name: string;
  status: CountryStatus;
  currency: string;
  /** What to print in front of an amount: "$", "NZ$", "R". Null = use the locale's. */
  currencySymbol: string | null;
  locale: string;
  timezone: string;
  phoneDialCode: string;
  taxType: string;
  taxAuthority: string;
  taxReturnTemplate: string;
  version: number;
  hasDraft: boolean;
  businesses: number;
};

export type CountryConfig = {
  country_iso2: string;
  name: string;
  status: CountryStatus;
  currency: string;
  /**
   * What to print in front of an amount: "$", "NZ$", "R".
   *
   * Null means "derive it from the locale", which is what every country did
   * before the field existed. It is set here rather than derived because Intl
   * gives a bare "$" for NZD in en-NZ — right inside New Zealand, ambiguous on
   * an invoice read anywhere else.
   */
  currency_symbol: string | null;
  locale: string;
  default_timezone: string;
  phone_dial_code: string;
  tax_authority: string;
  tax_type: string;
  fiscal_year_start_month: number;
  fiscal_year_start_day: number;
  filing_frequencies: string[];
  default_filing_frequency: string;
  filing_due_rules: Record<string, unknown> | null;
  tax_return_template: string;
  banking_provider: string | null;
  payment_providers: string[];
  identifier_schema: IdentifierField[];
  bank_account_schema: IdentifierField[];
  address_schema: Record<string, unknown>;
  features: Record<string, boolean>;
  labels: Record<string, string | null>;
  ai_context: string | null;
  version: number;
  draft: Partial<CountryConfig> | null;
};

export type TaxRate = {
  id: number;
  taxCode: string;
  name: string;
  category: RateCategory;
  rate: number;
  appliesTo: AppliesTo;
  effectiveFrom: string;
  effectiveTo: string | null;
  isDefault: boolean;
  isCapital: boolean;
  returnBoxMap: Record<string, string> | null;
  state: RowState;
};

export type Threshold = {
  id: number;
  key: string;
  amount: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  state: RowState;
};

export type CountryVersion = {
  version: number;
  changeNote: string;
  publishedAt: string | null;
  publishedBy: number | null;
};

/** How many businesses a publish touches, and what re-prices when it lands. */
export type CountryImpact = {
  businesses: number;
  followingCountryRate: number;
  customRate: number;
  draftInvoices: number;
  draftQuotes: number;
  recurringTemplates: number;
};

export type CountryDetail = {
  config: CountryConfig;
  /** The config as it will be once the draft is published. */
  effective: CountryConfig;
  hasDraft: boolean;
  taxRates: TaxRate[];
  thresholds: Threshold[];
  versions: CountryVersion[];
  impact: CountryImpact;
};

export type StagedChange = { field: string; from: unknown; to: unknown };

/** What publishing will do to a row that is already live. */
export type Supersession = {
  entity: "tax_rate" | "threshold";
  id: number;
  effectiveTo?: string;
  isDefault?: boolean;
};

export type PublishPreview = {
  iso2: string;
  currentVersion: number;
  nextVersion: number;
  canPublish: boolean;
  errors: string[];
  changes: StagedChange[];
  stagedTaxRates: TaxRate[];
  stagedThresholds: Threshold[];
  supersedes: Supersession[];
  takesEffect: { entity: string; key: string; effectiveFrom: string }[];
  impact: CountryImpact;
};

export type AuditEntry = {
  id: number;
  iso2: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  changeNote: string | null;
  actorEmail: string | null;
  createdAt: string | null;
};

/* -------------------------------------------------------------------------- *
 * Mapping
 * -------------------------------------------------------------------------- */

type ApiRecord = Record<string, unknown>;

const str = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : value === null || value === undefined ? fallback : String(value);
const num = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const bool = (value: unknown): boolean => value === true || value === 1 || value === "1";
const nullableStr = (value: unknown): string | null =>
  value === null || value === undefined || value === "" ? null : String(value);

const asArray = (value: unknown): ApiRecord[] => (Array.isArray(value) ? (value as ApiRecord[]) : []);

export function mapCountrySummary(row: ApiRecord): CountrySummary {
  return {
    iso2: str(row.country_iso2).toUpperCase(),
    name: str(row.name, "Unnamed country"),
    status: (COUNTRY_STATUSES as readonly string[]).includes(str(row.status))
      ? (str(row.status) as CountryStatus)
      : "draft",
    currency: str(row.currency),
    currencySymbol: str(row.currency_symbol) || null,
    locale: str(row.locale),
    timezone: str(row.default_timezone),
    phoneDialCode: str(row.phone_dial_code),
    taxType: str(row.tax_type),
    taxAuthority: str(row.tax_authority),
    taxReturnTemplate: str(row.tax_return_template),
    version: num(row.version),
    hasDraft: bool(row.has_draft),
    businesses: num(row.businesses),
  };
}

export function mapTaxRate(row: ApiRecord): TaxRate {
  return {
    id: num(row.id),
    taxCode: str(row.tax_code),
    name: str(row.name),
    category: str(row.category, "standard") as RateCategory,
    rate: num(row.rate),
    appliesTo: str(row.applies_to, "both") as AppliesTo,
    effectiveFrom: str(row.effective_from),
    effectiveTo: nullableStr(row.effective_to),
    isDefault: bool(row.is_default),
    isCapital: bool(row.is_capital),
    returnBoxMap: (row.return_box_map as Record<string, string> | null) ?? null,
    state: str(row.state, "current") as RowState,
  };
}

export function mapThreshold(row: ApiRecord): Threshold {
  return {
    id: num(row.id),
    key: str(row.threshold_key),
    amount: num(row.amount),
    currency: str(row.currency),
    effectiveFrom: str(row.effective_from),
    effectiveTo: nullableStr(row.effective_to),
    notes: nullableStr(row.notes),
    state: str(row.state, "current") as RowState,
  };
}

export function mapImpact(row: ApiRecord | undefined): CountryImpact {
  const source = row ?? {};
  return {
    businesses: num(source.businesses),
    followingCountryRate: num(source.following_country_rate),
    customRate: num(source.custom_rate),
    draftInvoices: num(source.draft_invoices),
    draftQuotes: num(source.draft_quotes),
    recurringTemplates: num(source.recurring_templates),
  };
}

function mapVersion(row: ApiRecord): CountryVersion {
  return {
    version: num(row.version),
    changeNote: str(row.change_note),
    publishedAt: nullableStr(row.published_at),
    publishedBy: row.published_by === null || row.published_by === undefined ? null : num(row.published_by),
  };
}

export function mapCountryDetail(payload: ApiRecord): CountryDetail {
  return {
    config: payload.country as CountryConfig,
    effective: (payload.effective ?? payload.country) as CountryConfig,
    hasDraft: bool(payload.has_draft),
    taxRates: asArray(payload.tax_rates).map(mapTaxRate),
    thresholds: asArray(payload.thresholds).map(mapThreshold),
    versions: asArray(payload.versions).map(mapVersion),
    impact: mapImpact(payload.impact as ApiRecord | undefined),
  };
}

export function mapPreview(payload: ApiRecord): PublishPreview {
  return {
    iso2: str(payload.country_iso2).toUpperCase(),
    currentVersion: num(payload.current_version),
    nextVersion: num(payload.next_version),
    canPublish: bool(payload.can_publish),
    errors: Array.isArray(payload.errors) ? (payload.errors as unknown[]).map(String) : [],
    changes: (Array.isArray(payload.changes) ? payload.changes : []) as StagedChange[],
    stagedTaxRates: asArray(payload.staged_tax_rates).map(mapTaxRate),
    stagedThresholds: asArray(payload.staged_thresholds).map(mapThreshold),
    supersedes: asArray(payload.supersedes).map((row) => ({
      entity: str(row.entity) as Supersession["entity"],
      id: num(row.id),
      effectiveTo: row.effective_to === undefined ? undefined : str(row.effective_to),
      isDefault: row.is_default === undefined ? undefined : bool(row.is_default),
    })),
    takesEffect: asArray(payload.takes_effect).map((row) => ({
      entity: str(row.entity),
      key: str(row.key),
      effectiveFrom: str(row.effective_from),
    })),
    impact: mapImpact(payload.impact as ApiRecord | undefined),
  };
}

export function mapAuditEntry(row: ApiRecord): AuditEntry {
  return {
    id: num(row.id),
    iso2: nullableStr(row.country_iso2),
    action: str(row.action),
    entity: nullableStr(row.entity),
    entityId: nullableStr(row.entity_id),
    changeNote: nullableStr(row.change_note),
    actorEmail: nullableStr(row.actor_email),
    createdAt: nullableStr(row.created_at),
  };
}

/* -------------------------------------------------------------------------- *
 * Display
 * -------------------------------------------------------------------------- */

const COUNTRY_STATUS_PILLS: Record<CountryStatus, { label: string; tone: PillTone; help: string }> = {
  live: { label: "Live", tone: "success", help: "Open for new businesses and listed at sign-up." },
  beta: { label: "Beta", tone: "info", help: "Open for new businesses, but not advertised." },
  draft: { label: "Draft", tone: "warning", help: "Not open for sign-up. Edit freely and publish when it's ready." },
  disabled: { label: "Disabled", tone: "neutral", help: "Closed to new sign-ups. Existing books keep working." },
};

export function countryStatusPill(status: string): { label: string; tone: PillTone; help: string } {
  return (
    COUNTRY_STATUS_PILLS[status as CountryStatus] ?? {
      label: status || "Unknown",
      tone: "neutral",
      help: "",
    }
  );
}

const ROW_STATE_PILLS: Record<RowState, { label: string; tone: PillTone }> = {
  staged: { label: "Staged", tone: "warning" },
  scheduled: { label: "Scheduled", tone: "info" },
  current: { label: "In effect", tone: "success" },
  past: { label: "Ended", tone: "neutral" },
};

export function rowStatePill(state: RowState): { label: string; tone: PillTone } {
  return ROW_STATE_PILLS[state] ?? { label: state, tone: "neutral" };
}

/**
 * Whether a row can still be changed.
 *
 * The backend refuses to edit or delete a published period that has already
 * started, because returns may have been filed on it — so those rows offer
 * "Schedule a replacement" instead of Edit and Delete.
 */
export function isRowEditable(state: RowState): boolean {
  return state === "staged" || state === "scheduled";
}

/** A rate as it reads in a sentence: `GST — 10%`. */
export function rateLabel(rate: Pick<TaxRate, "taxCode" | "rate">): string {
  return `${rate.taxCode} — ${formatRate(rate.rate)}`;
}

/** `10%`, `12.5%`, `0%` — trailing zeros dropped, since rates carry 4 decimals. */
export function formatRate(rate: number): string {
  return `${Number(rate.toFixed(4))}%`;
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-AU")}`;
  }
}

/** `1 Apr 2027 – open ended`, which is how a period reads on the timeline. */
export function formatPeriod(from: string, to: string | null): string {
  return `${formatRegistryDate(from)} – ${to ? formatRegistryDate(to) : "open ended"}`;
}

/** The registry's dates are plain `YYYY-MM-DD`, with no timezone to shift them. */
export function formatRegistryDate(value: string | null | undefined): string {
  if (!value) return "–";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

export function todayIso(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * `1 July – 30 June`, from a start month and day.
 *
 * A year ending in February is written "the end of February" rather than given
 * a number: South Africa's runs to the 28th or the 29th depending on the year,
 * and printing one of them would be wrong half the time.
 */
export function describeFiscalYear(startMonth: number, startDay: number): string {
  const month = MONTH_NAMES[startMonth - 1] ?? "?";
  const endMonthIndex = (startMonth + 10) % 12;
  const endMonth = MONTH_NAMES[endMonthIndex] ?? "?";
  if (endMonthIndex === 1 && startDay === 1) {
    return `${startDay} ${month} – the end of ${endMonth}`;
  }
  const daysInEndMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][endMonthIndex];
  const endDay = startDay === 1 ? daysInEndMonth : startDay - 1;
  return `${startDay} ${month} – ${endDay} ${endMonth}`;
}

/** The human name of a filing frequency, since the registry stores slugs. */
const FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Monthly",
  bimonthly: "Two-monthly",
  quarterly: "Quarterly",
  fourmonthly: "Four-monthly",
  sixmonthly: "Six-monthly",
  annual: "Annual",
};

export function frequencyLabel(frequency: string): string {
  return FREQUENCY_LABELS[frequency] ?? frequency;
}

/** Every frequency the backend's fiscal-year maths can divide a year into. */
export const FILING_FREQUENCIES = Object.keys(FREQUENCY_LABELS);

/* -------------------------------------------------------------------------- *
 * Validation — what the backend would refuse, caught before the request
 * -------------------------------------------------------------------------- */

export type ScheduleRateInput = {
  taxCode: string;
  name: string;
  category: RateCategory;
  rate: string;
  appliesTo: AppliesTo;
  effectiveFrom: string;
  isDefault: boolean;
  isCapital: boolean;
};

export type ScheduleRateIssues = Partial<Record<keyof ScheduleRateInput, string>>;

const TAX_CODE = /^[A-Z0-9_]{1,30}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function scheduleRateIssues(input: ScheduleRateInput, existing: TaxRate[] = []): ScheduleRateIssues {
  const issues: ScheduleRateIssues = {};
  const code = input.taxCode.trim().toUpperCase();

  if (!code) issues.taxCode = "Enter a tax code, for example GST or VAT.";
  else if (!TAX_CODE.test(code))
    issues.taxCode = "Use up to 30 characters: A–Z, 0–9 and underscores only.";

  const rate = Number(input.rate);
  if (input.rate.trim() === "") issues.rate = "Enter a rate.";
  else if (!Number.isFinite(rate)) issues.rate = "Enter the rate as a number.";
  else if (rate < 0 || rate > 100) issues.rate = "A rate has to be between 0 and 100.";
  else if (Math.round(rate * 10000) !== rate * 10000)
    issues.rate = "A rate can have at most 4 decimal places.";

  if (!ISO_DATE.test(input.effectiveFrom)) issues.effectiveFrom = "Choose the date this rate starts.";
  else if (existing.some((row) => row.taxCode === code && row.effectiveFrom === input.effectiveFrom))
    issues.effectiveFrom = `${code} already has a period starting on this date.`;

  return issues;
}

/**
 * Whether a start date is in the past, which the backend refuses without an
 * explicit super-admin override and a reason — back-dating would change returns
 * that may already have been filed.
 */
export function isBackdated(effectiveFrom: string): boolean {
  return ISO_DATE.test(effectiveFrom) && effectiveFrom < todayIso();
}

export const MIN_BACKDATE_REASON = 10;

export type ScheduleThresholdInput = {
  key: string;
  amount: string;
  effectiveFrom: string;
  notes: string;
};

export type ScheduleThresholdIssues = Partial<Record<keyof ScheduleThresholdInput, string>>;

const THRESHOLD_KEY = /^[a-z0-9_]{1,50}$/;

export function scheduleThresholdIssues(
  input: ScheduleThresholdInput,
  existing: Threshold[] = [],
): ScheduleThresholdIssues {
  const issues: ScheduleThresholdIssues = {};
  const key = input.key.trim();

  if (!key) issues.key = "Choose or enter a threshold.";
  else if (!THRESHOLD_KEY.test(key))
    issues.key = "Use up to 50 characters: lowercase letters, numbers and underscores.";

  const amount = Number(input.amount);
  if (input.amount.trim() === "") issues.amount = "Enter an amount.";
  else if (!Number.isFinite(amount)) issues.amount = "Enter the amount as a number.";
  else if (amount < 0) issues.amount = "An amount can't be negative.";

  if (!ISO_DATE.test(input.effectiveFrom)) issues.effectiveFrom = "Choose the date this takes effect.";
  else if (existing.some((row) => row.key === key && row.effectiveFrom === input.effectiveFrom))
    issues.effectiveFrom = "This threshold already has a period starting on this date.";

  return issues;
}

/** Thresholds the product reads by name, offered before anyone types one. */
export const KNOWN_THRESHOLD_KEYS = [
  { key: "tax_registration", label: "Registration turnover" },
  { key: "tax_registration_voluntary", label: "Voluntary registration turnover" },
  { key: "tax_registration_nonprofit", label: "Non-profit registration turnover" },
  { key: "tax_invoice_required", label: "Tax invoice required above" },
  { key: "tax_invoice_buyer_details", label: "Buyer details required above" },
  { key: "tax_invoice_full", label: "Full tax invoice above (abridged below)" },
  { key: "monthly_filing_turnover", label: "Monthly filing mandatory above" },
  { key: "sixmonthly_max_turnover", label: "Six-monthly filing allowed below" },
  { key: "km_rate_per_km", label: "Cents-per-kilometre rate" },
  { key: "km_rate_max_km", label: "Maximum kilometres claimable" },
];

export function thresholdLabel(key: string): string {
  return KNOWN_THRESHOLD_KEYS.find((entry) => entry.key === key)?.label ?? key;
}

/**
 * A registry refusal, with the reasons it gave.
 *
 * The registry answers a rejected change with a summary *and* a list — "These
 * changes can't be published" plus the three things wrong with them — and the
 * shared `apiErrorMessage` only reads the summary. Dropping the list would
 * leave someone re-reading a form that looks fine to work out what the server
 * objected to.
 */
export function registryErrorMessage(error: unknown, fallback: string): string {
  const message = apiErrorMessage(error, fallback);
  if (!axios.isAxiosError(error)) return message;
  const errors = (error.response?.data as { errors?: unknown } | undefined)?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return message;
  return `${message} ${errors.map(String).join(" ")}`;
}

export const MIN_CHANGE_NOTE = 5;

export function publishNoteIssue(note: string): string | null {
  return note.trim().length >= MIN_CHANGE_NOTE
    ? null
    : "Say what changed and why — for example “IRD — GST rate change effective 1 Apr 2027”.";
}

/* -------------------------------------------------------------------------- *
 * API
 * -------------------------------------------------------------------------- */

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string; errors?: string[] };

function unwrap<T>(payload: ApiEnvelope<T> | undefined, what: string): T {
  if (!payload || payload.success === false || payload.data === undefined) {
    throw new Error(payload?.message ?? `The ${what} request failed.`);
  }
  return payload.data;
}

/** `GET /super/countries` — every country, with how many businesses are in it. */
export async function fetchCountries(): Promise<CountrySummary[]> {
  const response = await api.get<ApiEnvelope<ApiRecord[]>>(apiRoutes.superAdmin.countries);
  return unwrap(response.data, "countries").map(mapCountrySummary);
}

/** `GET /super/countries/:iso2` — config, draft, every period and the history. */
export async function fetchCountryDetail(iso2: string): Promise<CountryDetail> {
  const response = await api.get<ApiEnvelope<ApiRecord>>(apiRoutes.superAdmin.country(iso2));
  return mapCountryDetail(unwrap(response.data, "country"));
}

/** `GET /super/countries/:iso2/preview` — what publishing would do, and whether it can. */
export async function fetchCountryPreview(iso2: string): Promise<PublishPreview> {
  const response = await api.get<ApiEnvelope<ApiRecord>>(apiRoutes.superAdmin.countryPreview(iso2));
  return mapPreview(unwrap(response.data, "preview"));
}

export async function fetchCountryAudit(params: { iso2?: string; limit?: number } = {}): Promise<AuditEntry[]> {
  const response = await api.get<ApiEnvelope<ApiRecord[]>>(apiRoutes.superAdmin.countryAudit, {
    params: { ...(params.iso2 ? { country: params.iso2 } : {}), limit: params.limit ?? 100 },
  });
  return unwrap(response.data, "audit log").map(mapAuditEntry);
}

/**
 * `PATCH /super/countries/:iso2` — stage column edits.
 *
 * Staged, not applied: nothing a business sees changes until publish. Staging a
 * field back to its live value clears it from the draft, so the preview only
 * ever lists real changes.
 */
export async function stageCountryApi(
  iso2: string,
  patch: Record<string, unknown>,
): Promise<{ changedFields: string[] }> {
  const response = await api.patch<ApiEnvelope<{ changed_fields?: string[] }>>(
    apiRoutes.superAdmin.country(iso2),
    patch,
  );
  return { changedFields: unwrap(response.data, "staging").changed_fields ?? [] };
}

/** `DELETE /super/countries/:iso2/draft` — throw away the draft and everything staged. */
export async function discardCountryDraftApi(iso2: string): Promise<void> {
  await api.delete(apiRoutes.superAdmin.countryDraft(iso2));
}

/** `POST /super/countries/:iso2/publish`. Needs a change note; super admin only for overrides. */
export async function publishCountryApi(iso2: string, changeNote: string): Promise<{ version: number }> {
  const response = await api.post<ApiEnvelope<{ version?: number }>>(
    apiRoutes.superAdmin.countryPublish(iso2),
    { change_note: changeNote.trim() },
  );
  return { version: unwrap(response.data, "publish").version ?? 0 };
}

/** `PATCH /super/countries/:iso2/status` — draft → beta → live → disabled. */
export async function setCountryStatusApi(iso2: string, status: CountryStatus): Promise<void> {
  await api.patch(apiRoutes.superAdmin.countryStatus(iso2), { status });
}

/** `POST /super/countries/:iso2/rollback/:version` — restore a published version. */
export async function rollbackCountryApi(
  iso2: string,
  version: number,
  changeNote: string,
): Promise<{ version: number }> {
  const response = await api.post<ApiEnvelope<{ version?: number }>>(
    apiRoutes.superAdmin.countryRollback(iso2, version),
    changeNote.trim() ? { change_note: changeNote.trim() } : {},
  );
  return { version: unwrap(response.data, "rollback").version ?? 0 };
}

/** A back-dating override, which only a super admin may send and only with a reason. */
export type BackdateOverride = { allowBackdate: boolean; reason: string };

function backdateBody(override?: BackdateOverride): Record<string, unknown> {
  return override?.allowBackdate
    ? { allow_backdate: true, backdate_reason: override.reason.trim() }
    : {};
}

/** `POST /super/countries/:iso2/tax-rates` — staged until published. */
export async function scheduleRateApi(
  iso2: string,
  input: ScheduleRateInput,
  override?: BackdateOverride,
): Promise<TaxRate> {
  const code = input.taxCode.trim().toUpperCase();
  const response = await api.post<ApiEnvelope<ApiRecord>>(apiRoutes.superAdmin.countryTaxRates(iso2), {
    tax_code: code,
    name: input.name.trim() || undefined,
    category: input.category,
    rate: Number(input.rate),
    applies_to: input.appliesTo,
    effective_from: input.effectiveFrom,
    is_default: input.isDefault,
    is_capital: input.isCapital,
    ...backdateBody(override),
  });
  return mapTaxRate(unwrap(response.data, "tax rate"));
}

export async function deleteRateApi(id: number): Promise<void> {
  await api.delete(apiRoutes.superAdmin.countryTaxRate(id));
}

/** `POST /super/countries/:iso2/thresholds` — staged until published. */
export async function scheduleThresholdApi(
  iso2: string,
  input: ScheduleThresholdInput,
  override?: BackdateOverride,
): Promise<Threshold> {
  const response = await api.post<ApiEnvelope<ApiRecord>>(apiRoutes.superAdmin.countryThresholds(iso2), {
    threshold_key: input.key.trim(),
    amount: Number(input.amount),
    effective_from: input.effectiveFrom,
    notes: input.notes.trim() || undefined,
    ...backdateBody(override),
  });
  return mapThreshold(unwrap(response.data, "threshold"));
}

export async function deleteThresholdApi(id: number): Promise<void> {
  await api.delete(apiRoutes.superAdmin.countryThreshold(id));
}
