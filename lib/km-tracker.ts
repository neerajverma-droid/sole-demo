/**
 * KM Tracker — business trips logged against a vehicle, and the motor-vehicle
 * claim they add up to under the methods the business's country allows: the
 * ATO's cents per kilometre or logbook in Australia, Inland Revenue's
 * kilometre rate or actual costs in New Zealand. Which ones, and every rate,
 * limit and piece of guidance that goes with them, come from the server's
 * `/km-tracker/rules` (`KmRules`) — nothing below names a country except the
 * Australian fallback used until that answers.
 *
 * Backed by sole-ocr's `/km-tracker` routes, the same ones sole-webapp's
 * `components/KmTracker/` and `services/km-tracker.services.js` call: the
 * paginated list, the stats band, the method report, per-trip CRUD and the
 * per-business settings record (calculation method, rates, vehicles).
 *
 * Every write goes through `buildEncryptedRequestBody`. sole-webapp sent trip
 * creates and updates as plain JSON and only encrypted the settings save; the
 * controllers (`kmTracker.js`, `kmTrackerSettings.js`) already read
 * `req.body.data` through `decryptPayload`, so both shapes land the same way.
 *
 * One thing encryption changes: `encryptPayload` writes `undefined` and `null`
 * as `""`, where plain JSON simply dropped the key. A `""` reaching a BIGINT
 * column (`client_id`, `project_id`, `job_id`) or the `is_invoiced` TINYINT
 * is a MySQL error rather than "unset", so `compactPayload` strips absent
 * keys before encrypting and the invoice link sends `is_invoiced` as a number.
 */
import {
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  subMonths,
} from "date-fns";
import axios from "axios";

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { apiErrorMessage } from "@/lib/api-error";
import { EVENTS } from "@/lib/analytics-events";
import { formatCountryMoney, type CountryContext } from "@/lib/country-context";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import {
  invoiceMoney,
  newLineItem,
  type InvoiceLineItem,
} from "@/lib/invoices";

/* ------------------------------------------------------------------ *
 * Vocabulary
 * ------------------------------------------------------------------ */

/**
 * `cents_per_kilometre` is the ATO's flat rate (capped per vehicle),
 * `kilometre_rate` Inland Revenue's two-tier one; `logbook` is actual costs ×
 * business use in both. The server maps the two statutory keys onto each
 * other, but a client sends the one `KmRules.methods` offers.
 */
export type KmCalculationMethod = "logbook" | "cents_per_kilometre" | "kilometre_rate";
export type KmTripType = "business" | "personal" | "split";

/**
 * Australia's two methods — the bundled copy `FALLBACK_KM_RULES` is built
 * from, and where a method's short name ("Cents per KM") comes from. Screens
 * list the methods from `KmRules.methods`, not from here.
 */
export const KM_METHODS: {
  value: KmCalculationMethod;
  label: string;
  short: string;
  description: string;
  href: string;
}[] = [
  {
    value: "cents_per_kilometre",
    label: "Cents per kilometre",
    short: "Cents per KM",
    description:
      "Use a rate per business kilometre. Fuel and other covered running costs must not be claimed separately.",
    href: "https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/income-and-deductions-for-business/deductions/deductions-for-motor-vehicle-expenses/cents-per-kilometre-method",
  },
  {
    value: "logbook",
    label: "Logbook",
    short: "Logbook",
    description:
      "Use actual car expenses and apply the business-use percentage supported by a valid logbook.",
    href: "https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/income-and-deductions-for-business/deductions/deductions-for-motor-vehicle-expenses/logbook-method",
  },
];

export function toKmMethod(value: unknown): KmCalculationMethod {
  return value === "cents_per_kilometre" || value === "kilometre_rate" ? value : "logbook";
}

/** A rate set by the tax authority (either country's), as opposed to actual costs. */
export function isStatutoryKmMethod(method: KmCalculationMethod | null): boolean {
  return method === "cents_per_kilometre" || method === "kilometre_rate";
}

/**
 * A method's name in a list or a badge. Australia's keep their short forms
 * ("Cents per KM"); anything the rules name differently — New Zealand's
 * "Actual costs" for `logbook`, its "Kilometre rate" — uses the rules' label.
 */
export function kmMethodLabel(value: KmCalculationMethod | null, rules: KmRules): string {
  if (!value) return "—";
  const known = KM_METHODS.find((method) => method.value === value);
  const offered = rules.methods.find((method) => method.key === value);
  if (offered && (!known || offered.label !== known.label)) return offered.label;
  return known?.short ?? offered?.label ?? (value === "kilometre_rate" ? "Kilometre rate" : "—");
}

/**
 * The method a saved setting or trip means in this country: itself when the
 * rules offer it, the country's statutory method for the other country's
 * statutory key (as the server maps them), otherwise logbook.
 */
export function kmMethodFor(rules: KmRules, method: KmCalculationMethod): KmCalculationMethod {
  if (rules.methods.some((offered) => offered.key === method)) return method;
  if (isStatutoryKmMethod(method) && rules.statutoryMethod) return rules.statutoryMethod;
  return "logbook";
}

/** "the cents per kilometre rate", "the kilometre rate" — for messages. */
function statutoryRateName(rules: KmRules, method: KmCalculationMethod): string {
  const label = (
    rules.methods.find((offered) => offered.key === method)?.label ??
    (method === "cents_per_kilometre" ? "Cents per kilometre" : "Kilometre rate")
  ).toLowerCase();
  return /\brate$/.test(label) ? `the ${label}` : `the ${label} rate`;
}

/* ------------------------------------------------------------------ *
 * Country rules
 * ------------------------------------------------------------------ */

export type KmEngine = "au_cents_per_km" | "nz_tiered_km" | "none";
export type KmBusinessUseBasis = "records" | "logbook" | "estimate";
export type KmIncomeYear = { label: string; startDate: string; endDate: string };

export type KmRuleMethod = {
  key: KmCalculationMethod;
  label: string;
  statutory: boolean;
  description: string;
  guidanceUrl: string;
  guidanceLabel: string;
};

export type KmVehicleTypeOption = {
  key: string;
  label: string;
  /** False for a type the statutory rate doesn't cover (motorcycles, LPG…). */
  statutory: boolean;
};

export type KmTierRates = { tier1: number; tier2: number };

/**
 * What the business's country decides about claiming vehicle use — sole-ocr's
 * `/km-tracker/rules` for a date, camel-cased. Never null in a component:
 * `useKmRules` hands out `FALLBACK_KM_RULES` until the server answers.
 */
export type KmRules = {
  countryIso2: string;
  countryName: string;
  engine: KmEngine;
  /** "ATO", "Inland Revenue". */
  authority: string;
  currency: string;
  locale: string;
  incomeYear: KmIncomeYear | null;
  statutoryMethod: KmCalculationMethod | null;
  /** Only the methods this country offers. */
  methods: KmRuleMethod[];
  /** Null where a vehicle needs no type (Australia). */
  vehicleTypes: KmVehicleTypeOption[] | null;
  vehicleTypeRequired: boolean;
  rates: {
    /** New Zealand's current year: last year's rates, until this year's are published. */
    provisional: boolean;
    rateYear: string;
    /** Australia's flat rate for the date asked about. */
    perKm: number | null;
    /** Australia's business-km cap per vehicle per year. */
    maxKm: number | null;
    /** New Zealand's tier boundary, in total km per vehicle per year. */
    tier1MaxKm: number | null;
    byVehicleType: Record<string, KmTierRates> | null;
    source: "country" | "custom";
    followsCountry: boolean;
    /** Whether the business may pin its own rate per km (Australia). */
    allowCustomRate: boolean;
  };
  businessUse: {
    /** New Zealand's ways of arriving at the business-use %. Null elsewhere. */
    bases: KmBusinessUseBasis[] | null;
    /** The most an estimate without a logbook may claim. */
    noLogbookMaxPct: number | null;
  };
  logbook: {
    minDays: number;
    validYears: number;
    odometerPerTrip: boolean;
    odometerAtYearEnd: boolean;
  };
  expenseRules: Partial<Record<KmCalculationMethod, KmExpenseRules>>;
  map: {
    /** [lat, lng]. */
    center: [number, number];
    /** [[south, west], [north, east]]. */
    bounds: [[number, number], [number, number]];
    region: string;
    placeRestrictions: string[];
  };
  copy: {
    rateLabel: string;
    rateHint: string;
    capTip: string;
    rateTooltip: string;
    /** Null unless the rates are provisional. */
    provisionalNote: string | null;
  };
};

const AU_CENTS_RULES: KmExpenseRules = {
  allowTolls: true,
  allowParking: true,
  allowFuel: false,
  allowOther: false,
  notes: [
    "Fuel cost is already included in the cents per kilometre rate and must not be claimed separately.",
    "Tolls and parking can be claimed separately when they are work or business related.",
    "Other running costs must not be separately claimed if they are already covered by the cents per kilometre rate.",
  ],
};

const AU_LOGBOOK_RULES: KmExpenseRules = {
  allowTolls: true,
  allowParking: true,
  allowFuel: true,
  allowOther: true,
  notes: [
    "Under the logbook method, actual vehicle expenses can be claimed when they are work or business related.",
    "Claims should be adjusted using the business use percentage from the logbook.",
  ],
};

/**
 * Australia, which is what every business was before New Zealand — used
 * while the rules load and if they can't be fetched, the same way
 * `FALLBACK_COUNTRY_CONTEXT` is. Every value is what these screens showed
 * before the rules existed, except the rate: 0.91, the ATO's rate from
 * 1 July 2026, rather than the 0.88 that used to be hard-coded.
 */
export const FALLBACK_KM_RULES: KmRules = {
  countryIso2: "AU",
  countryName: "Australia",
  engine: "au_cents_per_km",
  authority: "ATO",
  currency: "AUD",
  locale: "en-AU",
  incomeYear: null,
  statutoryMethod: "cents_per_kilometre",
  methods: KM_METHODS.map((method) => ({
    key: method.value,
    label: method.label,
    statutory: isStatutoryKmMethod(method.value),
    description: method.description,
    guidanceUrl: method.href,
    guidanceLabel: "ATO guidance",
  })),
  vehicleTypes: null,
  vehicleTypeRequired: false,
  rates: {
    provisional: false,
    rateYear: "",
    perKm: 0.91,
    maxKm: 5000,
    tier1MaxKm: null,
    byVehicleType: null,
    source: "country",
    followsCountry: true,
    allowCustomRate: true,
  },
  businessUse: { bases: null, noLogbookMaxPct: null },
  logbook: { minDays: 84, validYears: 5, odometerPerTrip: true, odometerAtYearEnd: true },
  expenseRules: { cents_per_kilometre: AU_CENTS_RULES, logbook: AU_LOGBOOK_RULES },
  map: {
    // Mainland, Tasmania and the Torres Strait — the bounds the route map has
    // always been held to.
    center: [-25.2744, 133.7751],
    bounds: [
      [-44.5, 112],
      [-9, 154.5],
    ],
    region: "au",
    placeRestrictions: ["au"],
  },
  copy: {
    rateLabel: "Rate per KM (ATO rate)",
    rateHint: "Used for cents-per-km claims. The ATO sets this each financial year.",
    capTip:
      "The ATO caps the cents-per-kilometre method at 5,000 business km per car each financial year. The rate is all-inclusive: it already covers fuel, insurance, rego and depreciation.",
    rateTooltip:
      "The ATO cents-per-kilometre rate set in KM Tracker settings. It covers fuel, insurance, rego and depreciation.",
    provisionalNote: null,
  },
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapIncomeYear(raw: any): KmIncomeYear | null {
  if (!raw || typeof raw !== "object") return null;
  const label = str(raw.label);
  const startDate = str(raw.start_date);
  const endDate = str(raw.end_date);
  return label || startDate || endDate ? { label, startDate, endDate } : null;
}

function mapExpenseRule(raw: any): KmExpenseRules | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    allowTolls: toFlag(raw.tolls),
    allowParking: toFlag(raw.parking),
    allowFuel: toFlag(raw.fuel),
    allowOther: toFlag(raw.other),
    notes: Array.isArray(raw.notes) ? raw.notes.map(str).filter(Boolean) : [],
  };
}

function mapPoint(raw: any, fallback: [number, number]): [number, number] {
  if (!Array.isArray(raw) || raw.length < 2) return fallback;
  const lat = optionalNum(raw[0]);
  const lng = optionalNum(raw[1]);
  return lat === null || lng === null ? fallback : [lat, lng];
}

/**
 * `/km-tracker/rules` as the screens read it. Anything missing is left empty
 * rather than filled in from Australia — an Australian default in a New
 * Zealand answer is the one wrong thing worse than a gap — except the map,
 * which needs somewhere to stand.
 */
export function mapKmRules(raw: any): KmRules {
  const methods: KmRuleMethod[] = (Array.isArray(raw?.methods) ? raw.methods : [])
    .filter((method: any) => ["logbook", "cents_per_kilometre", "kilometre_rate"].includes(method?.key))
    .map((method: any) => ({
      key: toKmMethod(method.key),
      label: str(method.label) || toKmMethod(method.key),
      statutory: toFlag(method.statutory, isStatutoryKmMethod(toKmMethod(method.key))),
      description: str(method.description),
      guidanceUrl: str(method.guidance_url),
      guidanceLabel: str(method.guidance_label) || "Guidance",
    }));
  const statutory = raw?.statutory_method;

  const vehicleTypes: KmVehicleTypeOption[] | null = Array.isArray(raw?.vehicle_types)
    ? raw.vehicle_types
        .filter((type: any) => str(type?.key))
        .map((type: any) => ({
          key: str(type.key),
          label: str(type.label) || str(type.key),
          statutory: toFlag(type.statutory, true),
        }))
    : null;

  const rates = raw?.rates ?? {};
  const byVehicleType: Record<string, KmTierRates> | null =
    rates.by_vehicle_type && typeof rates.by_vehicle_type === "object"
      ? Object.fromEntries(
          Object.entries(rates.by_vehicle_type as Record<string, any>).map(([key, tiers]) => [
            key,
            { tier1: num(tiers?.tier1), tier2: num(tiers?.tier2) },
          ]),
        )
      : null;

  const bases = Array.isArray(raw?.business_use?.bases)
    ? (raw.business_use.bases as unknown[]).filter((basis): basis is KmBusinessUseBasis =>
        basis === "records" || basis === "logbook" || basis === "estimate",
      )
    : null;

  const expenseRules: Partial<Record<KmCalculationMethod, KmExpenseRules>> = {};
  Object.entries((raw?.expense_rules ?? {}) as Record<string, any>).forEach(([key, rule]) => {
    const mapped = mapExpenseRule(rule);
    if (mapped && key === toKmMethod(key)) expenseRules[key as KmCalculationMethod] = mapped;
  });

  const map = raw?.map ?? {};
  const fallbackMap = FALLBACK_KM_RULES.map;
  const bounds: [[number, number], [number, number]] =
    Array.isArray(map.bounds) && map.bounds.length === 2
      ? [mapPoint(map.bounds[0], fallbackMap.bounds[0]), mapPoint(map.bounds[1], fallbackMap.bounds[1])]
      : fallbackMap.bounds;
  const engine: KmEngine =
    raw?.engine === "au_cents_per_km" || raw?.engine === "nz_tiered_km" ? raw.engine : "none";
  const copy = raw?.copy ?? {};

  return {
    countryIso2: str(raw?.country_iso2).toUpperCase(),
    countryName: str(raw?.country_name),
    engine,
    authority: str(raw?.authority),
    currency: str(raw?.currency),
    locale: str(raw?.locale),
    incomeYear: mapIncomeYear(raw?.income_year),
    statutoryMethod:
      statutory === "cents_per_kilometre" || statutory === "kilometre_rate" ? statutory : null,
    methods: methods.length
      ? methods
      : [{ key: "logbook", label: "Logbook", statutory: false, description: "", guidanceUrl: "", guidanceLabel: "" }],
    vehicleTypes: vehicleTypes && vehicleTypes.length ? vehicleTypes : null,
    vehicleTypeRequired: toFlag(raw?.vehicle_type_required),
    rates: {
      provisional: toFlag(rates.provisional),
      rateYear: str(rates.rate_year),
      perKm: optionalNum(rates.per_km),
      maxKm: optionalNum(rates.max_km),
      tier1MaxKm: optionalNum(rates.tier1_max_km),
      byVehicleType,
      source: rates.source === "custom" ? "custom" : "country",
      followsCountry: toFlag(rates.follows_country, true),
      allowCustomRate: toFlag(rates.allow_custom_rate),
    },
    businessUse: {
      bases: bases && bases.length ? bases : null,
      noLogbookMaxPct: optionalNum(raw?.business_use?.no_logbook_max_pct),
    },
    logbook: {
      minDays: num(raw?.logbook?.min_days, FALLBACK_KM_RULES.logbook.minDays),
      validYears: num(raw?.logbook?.valid_years, 0),
      odometerPerTrip: toFlag(raw?.logbook?.odometer_per_trip),
      odometerAtYearEnd: toFlag(raw?.logbook?.odometer_at_year_end),
    },
    expenseRules,
    map: {
      center: mapPoint(map.center, fallbackMap.center),
      bounds,
      region: str(map.region) || str(raw?.country_iso2).toLowerCase() || fallbackMap.region,
      placeRestrictions: Array.isArray(map.place_restrictions)
        ? map.place_restrictions.map(str).filter(Boolean).map((code: string) => code.toLowerCase())
        : [],
    },
    copy: {
      rateLabel: str(copy.rate_label),
      rateHint: str(copy.rate_hint),
      capTip: str(copy.cap_tip),
      rateTooltip: str(copy.rate_tooltip),
      provisionalNote: str(copy.provisional_note) || null,
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function fetchKmRules(date?: string): Promise<KmRules> {
  const response = await api.get<{ success?: boolean; message?: string; data?: unknown }>(
    apiRoutes.kmTracker.rules,
    date ? { params: { date } } : undefined,
  );
  if (response.data?.success === false || !response.data?.data) {
    throw new Error(response.data?.message || "Couldn't load the KM rules.");
  }
  return mapKmRules(response.data.data);
}

/**
 * The month a date falls in ("2026-07"), as the rules' cache key. Statutory
 * income years start on the 1st of a month (AU July, NZ April) and the
 * business's own financial year can differ from them, so a month always sits
 * inside one statutory year without needing to know where that year starts.
 */
export function kmRulesMonthKey(date: string | undefined, now = new Date()): string {
  return date && /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : format(now, "yyyy-MM");
}

/** The tier-1 rate for a vehicle type, or null when the rules have none for it. */
export function kmTierRates(rules: KmRules, vehicleType: string): KmTierRates | null {
  if (!vehicleType) return null;
  return rules.rates.byVehicleType?.[vehicleType] ?? null;
}

/** The rules' name for a vehicle type, or the key itself. */
export function kmVehicleTypeLabel(rules: KmRules, vehicleType: string): string {
  if (!vehicleType) return "";
  return rules.vehicleTypes?.find((type) => type.key === vehicleType)?.label ?? vehicleType;
}

export const KM_BUSINESS_USE_BASES: Record<KmBusinessUseBasis, string> = {
  records: "From the trips I log",
  logbook: "From a logbook period",
  estimate: "An estimate, without a logbook",
};

/** How the logbook minimum reads: "12 continuous weeks" or "90 consecutive days". */
export function kmLogbookMinimumText(rules: KmRules): string {
  const days = rules.logbook.minDays;
  return days > 0 && days % 7 === 0
    ? `${days / 7} continuous weeks`
    : `${days} consecutive ${days === 1 ? "day" : "days"}`;
}

/**
 * Whether a logbook period is long enough, and the sentence that says so — in
 * weeks where the minimum is whole weeks (Australia's 12), in days otherwise
 * (New Zealand's 90). Null until the range is complete and in order.
 */
export function kmLogbookPeriodCheck(
  rules: KmRules,
  startDate: string,
  endDate: string,
): { meets: boolean; message: string } | null {
  const minimum = rules.logbook.minDays;
  // "the ATO's", but "Inland Revenue's".
  const owner = !rules.authority
    ? "the"
    : /^[A-Z]{2,}$/.test(rules.authority)
      ? `the ${rules.authority}'s`
      : `${rules.authority}'s`;
  if (minimum > 0 && minimum % 7 === 0) {
    const weeks = kmRangeWeeks(startDate, endDate);
    if (weeks === null) return null;
    const minWeeks = minimum / 7;
    return weeks >= minWeeks
      ? { meets: true, message: `${weeks} weeks — meets ${owner} minimum of ${minWeeks} continuous weeks.` }
      : {
          meets: false,
          message: `${weeks} ${weeks === 1 ? "week" : "weeks"} — below ${owner} minimum. A valid logbook covers at least ${minWeeks} continuous weeks.`,
        };
  }
  const days = kmRangeDays(startDate, endDate);
  if (days === null) return null;
  return days >= minimum
    ? { meets: true, message: `${days} days — meets ${owner} minimum of ${minimum} consecutive days.` }
    : {
        meets: false,
        message: `${days} ${days === 1 ? "day" : "days"} — below ${owner} minimum. A valid logbook covers at least ${minimum} consecutive days.`,
      };
}

export type KmReasonOption = { value: string; label: string };

/** The purposes offered for a business (or split) trip — sole-webapp's
 *  `BUSINESS_REASON_OPTIONS`. Anything else typed is stored as-is. */
export const KM_BUSINESS_REASONS: KmReasonOption[] = [
  { value: "client_meeting", label: "Client meeting" },
  { value: "administration", label: "Administration" },
  { value: "supplier_visit", label: "Supplier visit" },
  { value: "training", label: "Training" },
  { value: "site_visit", label: "Site visit" },
  { value: "other", label: "Other" },
];

/** The purposes offered for a personal trip — `PERSONAL_REASON_OPTIONS`. */
export const KM_PERSONAL_REASONS: KmReasonOption[] = [
  { value: "commute", label: "Commute" },
  { value: "medical", label: "Medical" },
  { value: "charity", label: "Charity" },
  { value: "moving", label: "Moving" },
  { value: "other", label: "Other" },
];

/**
 * Every purpose a trip can be saved with, for the list's filter. sole-webapp's
 * filter offered a separate list (with "Delivery" and "Business errand") that
 * the trip form never wrote, so filtering by those always came back empty —
 * this is the set the form actually saves.
 */
export const KM_REASON_FILTERS: KmReasonOption[] = [
  ...KM_BUSINESS_REASONS,
  ...KM_PERSONAL_REASONS.filter((reason) => reason.value !== "other"),
];

export function reasonOptionsFor(tripType: KmTripType): KmReasonOption[] {
  return tripType === "personal" ? KM_PERSONAL_REASONS : KM_BUSINESS_REASONS;
}

/** The label for a stored reason, or the custom text itself. */
export function kmReasonLabel(reason: string): string {
  if (!reason) return "—";
  return (
    KM_REASON_FILTERS.find((option) => option.value === reason)?.label ??
    KM_PERSONAL_REASONS.find((option) => option.value === reason)?.label ??
    reason
  );
}

export const KM_TRIP_TYPES: { value: KmTripType; label: string }[] = [
  { value: "business", label: "Business" },
  { value: "personal", label: "Personal" },
  { value: "split", label: "Split" },
];

export function kmTripTypeLabel(value: KmTripType | null): string {
  return KM_TRIP_TYPES.find((type) => type.value === value)?.label ?? "—";
}

/** The Australian rate and cap, used until the account's own settings land. */
const DEFAULT_KM_RATE = FALLBACK_KM_RULES.rates.perKm ?? 0;
const DEFAULT_KM_LIMIT = FALLBACK_KM_RULES.rates.maxKm ?? 0;
/** How close to the annual cap a new trip gets before it warns. */
export const KM_CAP_WARNING_KM = 200;

/* ------------------------------------------------------------------ *
 * Small parsers
 * ------------------------------------------------------------------ */

function num(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function optionalId(value: unknown): string | null {
  return value === null || value === undefined || value === ""
    ? null
    : String(value);
}

/** The backend's TINYINTs, booleans and "true"/"1" strings, all as one boolean. */
export function toFlag(value: unknown, fallback = false): boolean {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalised = String(value).trim().toLowerCase();
  if (["1", "true", "yes"].includes(normalised)) return true;
  if (["0", "false", "no"].includes(normalised)) return false;
  return fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounds without trailing zeros — "12.5", not "12.50" — for input values. */
export function trimNumber(value: number, digits = 2): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(digits))) : "";
}

/**
 * Drops the keys an encrypted body can't express as "absent". See the file
 * doc: `encryptPayload` turns `undefined` into `""`, which the trip columns
 * that matter read as a bad value rather than as "leave it alone".
 */
export function compactPayload(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  );
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

/** Kilometres to two places, written 1,234.50 in every country (the decimal comma isn't used anywhere yet). */
export function formatKm(value: number): string {
  return num(value).toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatKmPercent(value: number): string {
  return `${num(value).toLocaleString("en-AU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

/** Money in the business's own currency; "$" as before without a country. */
export function formatKmMoney(value: number, country?: CountryContext): string {
  return country ? formatCountryMoney(country, num(value)) : invoiceMoney(num(value));
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

export function formatKmDate(value: string): string {
  const date = parseDate(value);
  return date ? format(date, "d MMM yyyy") : "—";
}

export function formatKmTime(value: string): string {
  const date = parseDate(value);
  return date ? format(date, "h:mm a") : "—";
}

export function formatKmDateTime(value: string): string {
  const date = parseDate(value);
  return date ? format(date, "d MMM yyyy, h:mm a") : "—";
}

/** "1h 32m", from the server's minutes or, failing that, the two times. */
export function formatKmDuration(
  minutes: number | null,
  startTime = "",
  endTime = "",
): string {
  let total = minutes;
  if (total === null) {
    const start = parseDate(startTime);
    const end = parseDate(endTime);
    if (!start || !end) return "—";
    total = (end.getTime() - start.getTime()) / 60000;
  }
  const rounded = Math.max(0, Math.round(total));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/* ------------------------------------------------------------------ *
 * Date-time inputs
 *
 * The form edits `datetime-local` strings (local wall-clock, no zone);
 * the server stores and returns ISO instants.
 * ------------------------------------------------------------------ */

export function toDateTimeLocal(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function fromDateTimeLocal(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addSecondsToDateTimeLocal(value: string, seconds: number): string {
  const base = fromDateTimeLocal(value);
  if (!base || !Number.isFinite(seconds) || seconds <= 0) return value;
  return toDateTimeLocal(new Date(base.getTime() + seconds * 1000));
}

/* ------------------------------------------------------------------ *
 * Vehicles and settings
 * ------------------------------------------------------------------ */

/** A balance-date odometer reading — New Zealand's 31 March one. */
export type KmOdometerReading = { date: string; reading: string };

export type KmVehicle = {
  nickname: string;
  registrationNumber: string;
  make: string;
  model: string;
  year: string;
  fuelType: string;
  engineCapacity: string;
  logbookStartOdometer: string;
  logbookEndOdometer: string;
  /** Kept by the server from the latest saved logbook trip — read-only here. */
  currentOdometer: string;
  notes: string;
  /** One of `KmRules.vehicleTypes`; "" where the country needs none. */
  vehicleType: string;
  /** Readings at each income year's end, oldest first. */
  odometerReadings: KmOdometerReading[];
};

/** The vehicle fields that are a single line of text. */
export type KmVehicleTextKey = Exclude<keyof KmVehicle, "odometerReadings">;

export function emptyKmVehicle(): KmVehicle {
  return {
    nickname: "",
    registrationNumber: "",
    make: "",
    model: "",
    year: "",
    fuelType: "",
    engineCapacity: "",
    logbookStartOdometer: "",
    logbookEndOdometer: "",
    currentOdometer: "",
    notes: "",
    vehicleType: "",
    odometerReadings: [],
  };
}

/**
 * The name a trip stores in its `vehicle` column. Trips reference a vehicle by
 * this label rather than an id — the same first-non-empty-of nickname,
 * "make model", registration rule sole-ocr's `getVehicleLabel` uses, so the
 * two can't disagree about which vehicle a trip belongs to.
 */
export function kmVehicleLabel(vehicle: KmVehicle): string {
  return (
    [
      vehicle.nickname,
      [vehicle.make, vehicle.model].filter(Boolean).join(" "),
      vehicle.registrationNumber,
    ]
      .map((value) => value.trim())
      .find(Boolean) ?? ""
  );
}

export function findKmVehicle(
  vehicles: KmVehicle[],
  label: string,
): KmVehicle | null {
  const wanted = label.trim();
  if (!wanted) return null;
  return vehicles.find((vehicle) => kmVehicleLabel(vehicle) === wanted) ?? null;
}

/** Where the next logbook trip's odometer starts for this vehicle. */
export function kmVehicleOdometer(vehicle: KmVehicle | null): number | null {
  if (!vehicle) return null;
  const current = optionalNum(vehicle.currentOdometer);
  if (current !== null && current >= 0) return current;
  const start = optionalNum(vehicle.logbookStartOdometer);
  return start !== null && start >= 0 ? start : null;
}

function hasAnyValue(vehicle: KmVehicle): boolean {
  return (
    vehicle.odometerReadings.length > 0 ||
    Object.values(vehicle).some((value) => typeof value === "string" && value.trim() !== "")
  );
}

type ApiVehicle = {
  nickname?: string | null;
  make?: string | null;
  model?: string | null;
  year?: string | number | null;
  registration_number?: string | null;
  fuel_type?: string | null;
  engine_capacity?: string | null;
  logbook_start_odometer?: string | number | null;
  logbook_end_odometer?: string | number | null;
  current_odometer_reading?: string | number | null;
  notes?: string | null;
  vehicle_type?: string | null;
  odometer_readings?: { date?: string | null; reading?: string | number | null }[] | null;
};

export function mapKmVehicle(raw: ApiVehicle): KmVehicle {
  return {
    nickname: str(raw.nickname),
    registrationNumber: str(raw.registration_number),
    make: str(raw.make),
    model: str(raw.model),
    year: str(raw.year),
    fuelType: str(raw.fuel_type),
    engineCapacity: str(raw.engine_capacity),
    logbookStartOdometer: str(raw.logbook_start_odometer),
    logbookEndOdometer: str(raw.logbook_end_odometer),
    currentOdometer: str(raw.current_odometer_reading),
    notes: str(raw.notes),
    vehicleType: str(raw.vehicle_type),
    odometerReadings: (Array.isArray(raw.odometer_readings) ? raw.odometer_readings : [])
      .map((entry) => ({ date: str(entry?.date).slice(0, 10), reading: str(entry?.reading) }))
      .filter((entry) => entry.date || entry.reading),
  };
}

function vehicleToApi(vehicle: KmVehicle): ApiVehicle {
  return {
    nickname: vehicle.nickname.trim(),
    make: vehicle.make.trim(),
    model: vehicle.model.trim(),
    year: vehicle.year.trim(),
    registration_number: vehicle.registrationNumber.trim(),
    fuel_type: vehicle.fuelType.trim(),
    engine_capacity: vehicle.engineCapacity.trim(),
    logbook_start_odometer: vehicle.logbookStartOdometer.trim(),
    logbook_end_odometer: vehicle.logbookEndOdometer.trim(),
    current_odometer_reading: vehicle.currentOdometer.trim(),
    notes: vehicle.notes.trim(),
    // Inside the vehicle list a null survives encryption, so "no type" is sent as one.
    vehicle_type: vehicle.vehicleType.trim() || null,
    odometer_readings: vehicle.odometerReadings
      .filter((entry) => entry.date.trim() && entry.reading.trim())
      .map((entry) => ({ date: entry.date.trim(), reading: num(entry.reading) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export type KmSettings = {
  calculationMethod: KmCalculationMethod;
  /** The rate in effect: the country's today when following it, else the pinned one. */
  ratePerKm: number;
  billableRatePerKm: number;
  /** The per-vehicle business-km cap; null where the country has none. */
  centsPerKmLimit: number | null;
  businessUsePercentage: number;
  /** Use the country's rate by trip date rather than a pinned one (only Australia may pin). */
  followCountryRate: boolean;
  /** New Zealand: where the business-use % comes from. Null means "records". */
  businessUseBasis: KmBusinessUseBasis | null;
  /** Not edited on the settings screen (sole-webapp hides that tab too), but
   *  carried through every save so one isn't cleared by accident. */
  logbookPeriodStart: string;
  logbookPeriodEnd: string;
  vehicles: KmVehicle[];
  notes: string;
  /** At least one vehicle saved — the server refuses trips until then. */
  isSetupComplete: boolean;
};

export const DEFAULT_KM_SETTINGS: KmSettings = {
  calculationMethod: "logbook",
  ratePerKm: DEFAULT_KM_RATE,
  billableRatePerKm: 0,
  centsPerKmLimit: DEFAULT_KM_LIMIT,
  businessUsePercentage: 100,
  followCountryRate: true,
  businessUseBasis: null,
  logbookPeriodStart: "",
  logbookPeriodEnd: "",
  vehicles: [],
  notes: "",
  isSetupComplete: false,
};

type ApiKmSettings = {
  calculation_method?: string;
  rate_per_km?: string | number | null;
  billable_rate_per_km?: string | number | null;
  cents_per_km_limit?: string | number | null;
  business_use_percentage?: string | number | null;
  follow_country_rate?: boolean | string | number | null;
  business_use_basis?: string | null;
  logbook_period_start?: string | null;
  logbook_period_end?: string | null;
  vehicle_details?: ApiVehicle[] | null;
  notes?: string | null;
  is_setup_complete?: boolean;
  has_vehicle_details?: boolean;
};

export function mapKmSettings(raw: ApiKmSettings | null | undefined): KmSettings {
  if (!raw) return DEFAULT_KM_SETTINGS;
  const vehicles = (Array.isArray(raw.vehicle_details) ? raw.vehicle_details : [])
    .map(mapKmVehicle)
    .filter(hasAnyValue);
  return {
    calculationMethod: toKmMethod(raw.calculation_method),
    ratePerKm: num(raw.rate_per_km, DEFAULT_KM_RATE),
    billableRatePerKm: num(raw.billable_rate_per_km, 0),
    // An explicit null is a country without a cap; absent is an older server.
    centsPerKmLimit:
      raw.cents_per_km_limit === null
        ? null
        : num(raw.cents_per_km_limit, DEFAULT_KM_LIMIT),
    businessUsePercentage: num(raw.business_use_percentage, 100),
    followCountryRate: toFlag(raw.follow_country_rate, true),
    businessUseBasis: toBusinessUseBasis(raw.business_use_basis),
    logbookPeriodStart: str(raw.logbook_period_start),
    logbookPeriodEnd: str(raw.logbook_period_end),
    vehicles,
    notes: str(raw.notes),
    isSetupComplete: raw.is_setup_complete ?? vehicles.length > 0,
  };
}

function toBusinessUseBasis(value: unknown): KmBusinessUseBasis | null {
  return value === "records" || value === "logbook" || value === "estimate" ? value : null;
}

export async function fetchKmSettings(): Promise<KmSettings> {
  const response = await api.get<{ success?: boolean; data?: ApiKmSettings }>(
    apiRoutes.kmTracker.settings,
  );
  return mapKmSettings(response.data?.data);
}

/**
 * The whole settings record, the shape sole-webapp's `handleSave` posts.
 * Vehicles with nothing typed in them are dropped, as there.
 */
export function kmSettingsPayload(settings: KmSettings): Record<string, unknown> {
  return {
    calculation_method: settings.calculationMethod,
    rate_per_km: settings.ratePerKm,
    billable_rate_per_km: settings.billableRatePerKm,
    cents_per_km_limit: settings.centsPerKmLimit,
    business_use_percentage: settings.businessUsePercentage,
    follow_country_rate: settings.followCountryRate,
    business_use_basis: settings.businessUseBasis,
    // Absent rather than "" — the service only touches a field that's sent.
    logbook_period_start: settings.logbookPeriodStart || undefined,
    logbook_period_end: settings.logbookPeriodEnd || undefined,
    vehicle_details: settings.vehicles.filter(hasAnyValue).map(vehicleToApi),
    notes: settings.notes,
  };
}

export async function saveKmSettingsApi(settings: KmSettings): Promise<KmSettings> {
  const response = await api.post<{
    success?: boolean;
    message?: string;
    data?: ApiKmSettings;
  }>(
    apiRoutes.kmTracker.settings,
    buildEncryptedRequestBody(compactPayload(kmSettingsPayload(settings))),
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't save KM tracker settings.");
  }
  return mapKmSettings(response.data?.data);
}

export type KmExpenseRules = {
  allowTolls: boolean;
  allowParking: boolean;
  allowFuel: boolean;
  allowOther: boolean;
  notes: string[];
};

/**
 * What each method lets a trip claim on top of the distance — the country's
 * `expense_rules` for it, so the settings screen can show the rules for a
 * method that's been picked but not yet saved. A method the rules leave out
 * falls back on its kind: a statutory rate covers fuel and running costs,
 * actual costs cover everything.
 */
export function kmExpenseRules(rules: KmRules, method: KmCalculationMethod): KmExpenseRules {
  const sent = rules.expenseRules[method];
  if (sent) return sent;
  return isStatutoryKmMethod(method)
    ? { allowTolls: true, allowParking: true, allowFuel: false, allowOther: false, notes: [] }
    : { allowTolls: true, allowParking: true, allowFuel: true, allowOther: true, notes: [] };
}

export type KmIssue = { key: string; message: string };

export const KM_VEHICLE_REQUIRED: { key: KmVehicleTextKey; label: string }[] = [
  { key: "nickname", label: "Name" },
  { key: "registrationNumber", label: "Registration number" },
  { key: "make", label: "Make" },
  { key: "model", label: "Model" },
  { key: "year", label: "Year" },
  { key: "fuelType", label: "Fuel type" },
  { key: "engineCapacity", label: "Engine capacity" },
  { key: "logbookStartOdometer", label: "Logbook start odometer" },
];

/** Whether the country's rules ask each vehicle for a type (New Zealand). */
export function kmNeedsVehicleType(rules: KmRules): boolean {
  return rules.vehicleTypes !== null;
}

/** Whether the vehicle form keeps year-end odometer readings (New Zealand's kilometre rate). */
export function kmTracksYearEndOdometer(rules: KmRules): boolean {
  return rules.logbook.odometerAtYearEnd && rules.engine === "nz_tiered_km";
}

/**
 * sole-webapp's `validateSingleVehicle`, plus a duplicate-name check: trips
 * find their vehicle by name, so two with the same one can't be told apart.
 * Where the country types its vehicles, the type replaces the free-text fuel
 * type as the required field, and any year-end readings must be complete.
 */
export function kmVehicleIssues(
  vehicle: KmVehicle,
  otherLabels: string[],
  rules: KmRules,
): KmIssue[] {
  const issues: KmIssue[] = [];
  const typed = kmNeedsVehicleType(rules);
  KM_VEHICLE_REQUIRED.forEach(({ key, label }) => {
    if (typed && key === "fuelType") return;
    if (!vehicle[key].trim()) {
      issues.push({ key, message: `${label} is required` });
    }
  });
  if (typed) {
    const type = vehicle.vehicleType.trim();
    if (!type) {
      issues.push({ key: "vehicleType", message: "Vehicle type is required" });
    } else if (!rules.vehicleTypes?.some((option) => option.key === type)) {
      issues.push({ key: "vehicleType", message: "Choose one of the listed vehicle types" });
    }
  }
  const year = vehicle.year.trim();
  if (year && !/^\d{4}$/.test(year)) {
    issues.push({ key: "year", message: "Year must be a 4-digit number" });
  }
  const odometer = vehicle.logbookStartOdometer.trim();
  if (odometer && (!Number.isFinite(Number(odometer)) || Number(odometer) < 0)) {
    issues.push({
      key: "logbookStartOdometer",
      message: "Logbook start odometer must be 0 or more",
    });
  }
  if (kmTracksYearEndOdometer(rules)) {
    const bad = vehicle.odometerReadings.some((entry) => {
      const reading = Number(entry.reading);
      return (
        !/^\d{4}-\d{2}-\d{2}$/.test(entry.date.trim()) ||
        !entry.reading.trim() ||
        !Number.isFinite(reading) ||
        reading < 0
      );
    });
    if (bad) {
      issues.push({
        key: "odometerReadings",
        message: "Each odometer reading needs a date and a reading of 0 or more",
      });
    }
  }
  const label = kmVehicleLabel(vehicle).toLowerCase();
  if (label && otherLabels.some((other) => other.toLowerCase() === label)) {
    issues.push({
      key: "nickname",
      message: "Another vehicle already has this name",
    });
  }
  return issues;
}

/** A rate field: a number, zero or more, at most two decimals typed. */
function rateIssue(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required`;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return `${label} must be 0 or more`;
  if (!/^\d*(\.\d{0,2})?$/.test(trimmed)) {
    return `${label} can have at most 2 decimal places`;
  }
  return null;
}

export type KmSettingsDraft = {
  calculationMethod: KmCalculationMethod;
  ratePerKm: string;
  billableRatePerKm: string;
  vehicles: KmVehicle[];
  /** New Zealand's business-use basis, and the % it uses for "estimate". */
  businessUseBasis: KmBusinessUseBasis;
  businessUsePercentage: string;
};

/** The settings as the screen edits them, the method mapped to one this country offers. */
export function kmSettingsDraft(settings: KmSettings, rules: KmRules): KmSettingsDraft {
  return {
    calculationMethod: kmMethodFor(rules, settings.calculationMethod),
    ratePerKm: trimNumber(settings.ratePerKm),
    billableRatePerKm: trimNumber(settings.billableRatePerKm),
    vehicles: settings.vehicles,
    businessUseBasis: settings.businessUseBasis ?? "records",
    businessUsePercentage: trimNumber(settings.businessUsePercentage),
  };
}

export function kmSettingsIssues(draft: KmSettingsDraft, rules: KmRules): KmIssue[] {
  const issues: KmIssue[] = [];
  // The rate is only typed where the business may set its own.
  if (rules.rates.allowCustomRate) {
    const rate = rateIssue(draft.ratePerKm, "Rate per KM");
    if (rate) issues.push({ key: "ratePerKm", message: rate });
  }
  const billable = rateIssue(draft.billableRatePerKm, "Billable rate per KM");
  if (billable) issues.push({ key: "billableRatePerKm", message: billable });
  if (rules.businessUse.bases && draft.businessUseBasis === "estimate") {
    const max = rules.businessUse.noLogbookMaxPct ?? 100;
    const percentage = Number(draft.businessUsePercentage);
    if (
      !draft.businessUsePercentage.trim() ||
      !Number.isFinite(percentage) ||
      percentage <= 0 ||
      percentage > max
    ) {
      issues.push({
        key: "businessUsePercentage",
        message: `Business use must be more than 0% and at most ${max}% without a logbook`,
      });
    }
  }
  if (draft.vehicles.length === 0) {
    issues.push({ key: "vehicles", message: "Add at least one vehicle" });
  }
  draft.vehicles.forEach((vehicle, index) => {
    if (kmVehicleIssues(vehicle, [], rules).length > 0) {
      issues.push({
        key: `vehicle-${index}`,
        message: `${kmVehicleLabel(vehicle) || `Vehicle ${index + 1}`} is missing required details`,
      });
    }
  });
  return issues;
}

/**
 * The saved record with the draft's edits applied — what Save posts.
 *
 * Following the country's rate is decided by what was done to the rate: left
 * alone, it stays as saved; typed in, it follows exactly when what was typed
 * is the country's own rate, and is pinned otherwise. A country with no
 * custom rate always follows.
 */
export function applyKmSettingsDraft(
  settings: KmSettings,
  draft: KmSettingsDraft,
  rules: KmRules,
): KmSettings {
  const ratePerKm = num(draft.ratePerKm, settings.ratePerKm);
  const rateEdited = draft.ratePerKm.trim() !== trimNumber(settings.ratePerKm);
  const countryRate = rules.rates.perKm;
  const followCountryRate = !rules.rates.allowCustomRate
    ? true
    : rateEdited
      ? countryRate !== null && Math.abs(ratePerKm - countryRate) < 1e-9
      : settings.followCountryRate;
  const typedBasis = rules.businessUse.bases !== null;
  return {
    ...settings,
    calculationMethod: draft.calculationMethod,
    ratePerKm: rules.rates.allowCustomRate ? ratePerKm : settings.ratePerKm,
    billableRatePerKm: num(draft.billableRatePerKm, 0),
    vehicles: draft.vehicles,
    followCountryRate,
    businessUseBasis: typedBasis ? draft.businessUseBasis : settings.businessUseBasis,
    businessUsePercentage:
      typedBasis && draft.businessUseBasis === "estimate"
        ? num(draft.businessUsePercentage, settings.businessUsePercentage)
        : settings.businessUsePercentage,
  };
}

/* ------------------------------------------------------------------ *
 * Trips
 * ------------------------------------------------------------------ */

export type KmTrip = {
  id: string;
  startTime: string;
  endTime: string;
  startLocation: string;
  endLocation: string;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  tripType: KmTripType;
  reason: string;
  calculationMethod: KmCalculationMethod | null;
  distanceKm: number;
  businessPercentage: number;
  personalPercentage: number;
  deductibleKm: number;
  ratePerKm: number;
  /** The income year the rate belongs to ("2025-26"), when the server says. */
  rateYear: string;
  /** Worked out at last year's rates until this year's are published (New Zealand). */
  rateProvisional: boolean;
  rateSource: "country" | "custom" | null;
  totalAmount: number;
  estimatedDeduction: number;
  durationMinutes: number | null;
  tollAmount: number;
  parkingAmount: number;
  fuelCost: number;
  otherExpenses: number;
  splitToll: boolean;
  splitParking: boolean;
  splitFuel: boolean;
  splitOther: boolean;
  odometerStart: number | null;
  odometerEnd: number | null;
  clientId: string | null;
  clientName: string;
  /** The client's primary contact — who an invoice for this trip goes to. */
  contactId: string | null;
  contactName: string;
  projectId: string | null;
  projectName: string;
  jobId: string | null;
  jobName: string;
  isBillable: boolean;
  isInvoiced: boolean;
  invoiceId: string | null;
  invoiceNo: string;
  /** The linked invoice's `mark_as` — "draft" until it's been sent. */
  invoiceStatus: string | null;
  invoiceTemplateId: string | null;
  vehicle: string;
  tags: string[];
  notes: string;
};

type ApiKmTrip = Record<string, unknown> & {
  clientDetail?: {
    id?: string | number;
    name?: string;
    primaryContact?: { id?: string | number; name?: string } | null;
  } | null;
  projectDetail?: { id?: string | number; project_name?: string } | null;
  jobDetail?: { id?: string | number; job_name?: string } | null;
  invoiceDetail?: {
    id?: string | number;
    invoice_no?: string;
    mark_as?: string;
    template_id?: string | number;
  } | null;
};

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(str).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(str).filter(Boolean);
    } catch {
      // A plain comma list rather than JSON.
    }
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

function toTripType(value: unknown): KmTripType {
  return value === "split" || value === "personal" ? value : "business";
}

/**
 * One row of `/km-tracker`, `/km-tracker/:id` or the report — all three come
 * from sole-ocr's `formatTripResponse`, so one mapper reads them. The aliased
 * fields (`business_percentage` vs `business_use_percentage`, `deductible_km`
 * vs `deductible_distance_km`) are read in the same order sole-webapp did.
 */
export function mapKmTrip(raw: ApiKmTrip): KmTrip {
  const distanceKm = num(raw.distance_km);
  const businessPercentage = num(
    raw.business_percentage ?? raw.business_use_percentage,
    100,
  );
  const deductible = optionalNum(raw.deductible_km ?? raw.deductible_distance_km);
  const invoiceId = optionalId(raw.invoice_id);
  const method = raw.calculation_method;

  return {
    id: String(raw.id ?? ""),
    startTime: str(raw.start_time),
    endTime: str(raw.end_time),
    startLocation: str(raw.start_location),
    endLocation: str(raw.end_location),
    startLat: optionalNum(raw.start_latitude),
    startLng: optionalNum(raw.start_longitude),
    endLat: optionalNum(raw.end_latitude),
    endLng: optionalNum(raw.end_longitude),
    tripType: toTripType(raw.trip_type),
    reason: str(raw.reason),
    calculationMethod:
      method === "logbook" || method === "cents_per_kilometre" || method === "kilometre_rate"
        ? method
        : null,
    distanceKm,
    businessPercentage,
    personalPercentage: num(
      raw.personal_percentage ?? raw.personal_use_percentage,
      Math.max(0, 100 - businessPercentage),
    ),
    deductibleKm: deductible ?? (distanceKm * businessPercentage) / 100,
    ratePerKm: num(raw.rate_per_km),
    rateYear: str(raw.rate_year),
    rateProvisional: toFlag(raw.rate_provisional),
    rateSource:
      raw.rate_source === "country" || raw.rate_source === "custom" ? raw.rate_source : null,
    totalAmount: num(raw.total_amount),
    estimatedDeduction: num(raw.estimated_deduction),
    durationMinutes: optionalNum(raw.total_duration_minutes),
    tollAmount: num(raw.toll_amount),
    parkingAmount: num(raw.parking_amount),
    fuelCost: num(raw.fuel_cost),
    otherExpenses: num(raw.other_expenses),
    splitToll: toFlag(raw.split_toll_expense, true),
    splitParking: toFlag(raw.split_parking_expense, true),
    splitFuel: toFlag(raw.split_fuel_expense, true),
    splitOther: toFlag(raw.split_other_expense, true),
    odometerStart: optionalNum(raw.odometer_start),
    odometerEnd: optionalNum(raw.odometer_end),
    clientId: optionalId(raw.client_id ?? raw.clientDetail?.id),
    clientName: str(raw.clientDetail?.name ?? raw.client_name),
    contactId: optionalId(raw.contact_id ?? raw.clientDetail?.primaryContact?.id),
    contactName: str(
      raw.contact_name || raw.clientDetail?.primaryContact?.name || "",
    ),
    projectId: optionalId(raw.project_id ?? raw.projectDetail?.id),
    projectName: str(raw.projectDetail?.project_name ?? raw.project_name),
    jobId: optionalId(raw.job_id ?? raw.jobDetail?.id),
    jobName: str(raw.jobDetail?.job_name ?? raw.job_name),
    isBillable: toFlag(raw.is_billable ?? raw.isBillable),
    // sole-webapp's `isTripInvoiced`: the flag, or simply having an invoice.
    isInvoiced: toFlag(raw.is_invoiced) || invoiceId !== null,
    invoiceId,
    invoiceNo: str(raw.invoice_no ?? raw.invoiceDetail?.invoice_no),
    invoiceStatus: raw.invoiceDetail?.mark_as
      ? String(raw.invoiceDetail.mark_as).toLowerCase()
      : invoiceId
        ? "draft"
        : null,
    invoiceTemplateId: optionalId(raw.invoiceDetail?.template_id),
    vehicle: str(raw.vehicle),
    tags: parseTags(raw.tags),
    notes: str(raw.notes),
  };
}

/**
 * The distance a row shows: the business share for a split trip, the whole
 * trip otherwise — `TripTable`'s `displayedDistanceKm`.
 */
export function kmDisplayedDistance(trip: KmTrip): number {
  return trip.tripType === "split" ? trip.deductibleKm : trip.distanceKm;
}

/** Likewise the amount: the deduction for a split trip, the total otherwise. */
export function kmDisplayedAmount(trip: KmTrip): number {
  return trip.tripType === "split" ? trip.estimatedDeduction : trip.totalAmount;
}

/** Billable and not yet on an invoice — the rows Convert to invoice takes. */
export function isKmTripInvoiceable(trip: KmTrip): boolean {
  return trip.isBillable && !trip.isInvoiced;
}

/* ------------------------------------------------------------------ *
 * List filters
 * ------------------------------------------------------------------ */

export type KmDatePreset =
  | "all"
  | "this_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "custom";

export const KM_DATE_PRESETS: { value: KmDatePreset; label: string }[] = [
  { value: "all", label: "All dates" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "custom", label: "Custom range" },
];

const isoDay = (date: Date) => format(date, "yyyy-MM-dd");

/** sole-webapp's `resolveDateRangeByPreset` — weeks start on Monday. */
export function kmPresetRange(
  preset: KmDatePreset,
  now = new Date(),
): { startDate: string; endDate: string } {
  switch (preset) {
    case "this_week":
      return {
        startDate: isoDay(startOfWeek(now, { weekStartsOn: 1 })),
        endDate: isoDay(endOfWeek(now, { weekStartsOn: 1 })),
      };
    case "this_month":
      return { startDate: isoDay(startOfMonth(now)), endDate: isoDay(endOfMonth(now)) };
    case "last_month": {
      const previous = subMonths(now, 1);
      return {
        startDate: isoDay(startOfMonth(previous)),
        endDate: isoDay(endOfMonth(previous)),
      };
    }
    case "this_quarter":
      return {
        startDate: isoDay(startOfQuarter(now)),
        endDate: isoDay(endOfQuarter(now)),
      };
    default:
      return { startDate: "", endDate: "" };
  }
}

export type KmTripFilters = {
  datePreset: KmDatePreset;
  /** Only read when `datePreset` is "custom"; ISO `YYYY-MM-DD`. */
  customStart: string;
  customEnd: string;
  reason: string;
  tripType: KmTripType | "";
  search: string;
};

export const DEFAULT_KM_FILTERS: KmTripFilters = {
  datePreset: "all",
  customStart: "",
  customEnd: "",
  reason: "",
  tripType: "",
  search: "",
};

/** How many filters are narrowing the list, for the Reset control. */
export function activeKmFilterCount(filters: KmTripFilters): number {
  return [
    filters.datePreset !== "all",
    !!filters.reason,
    !!filters.tripType,
    !!filters.search.trim(),
  ].filter(Boolean).length;
}

/**
 * The query string `/km-tracker` and `/km-tracker/stats` both read
 * (`buildKmTrackerQueryParams`). A custom range only applies once both ends
 * are set and in order, so a half-typed range doesn't refetch on every pick.
 */
export function kmFilterParams(
  filters: KmTripFilters,
  now = new Date(),
): Record<string, string> {
  const params: Record<string, string> = {};
  const range =
    filters.datePreset === "custom"
      ? filters.customStart &&
        filters.customEnd &&
        filters.customStart <= filters.customEnd
        ? { startDate: filters.customStart, endDate: filters.customEnd }
        : { startDate: "", endDate: "" }
      : kmPresetRange(filters.datePreset, now);
  if (range.startDate) params.start_date = range.startDate;
  if (range.endDate) params.end_date = range.endDate;
  if (filters.reason) params.reason = filters.reason;
  if (filters.tripType) params.trip_type = filters.tripType;
  if (filters.search.trim()) params.search = filters.search.trim();
  return params;
}

/* ------------------------------------------------------------------ *
 * Trip API
 * ------------------------------------------------------------------ */

/** Trips per request — fixed, so the list never asks the server for more. */
export const KM_PAGE_SIZE = 25;

export type KmTripPage = { trips: KmTrip[]; total: number };

export async function fetchKmTripsPage(
  filters: KmTripFilters,
  page: number,
  pageSize: number,
): Promise<KmTripPage> {
  const response = await api.get<{
    success?: boolean;
    message?: string;
    data?: ApiKmTrip[];
    pagination?: { totalRecords?: number; total?: number };
  }>(apiRoutes.kmTracker.list, {
    params: { ...kmFilterParams(filters), page, limit: pageSize },
  });
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't load trips.");
  }
  const rows = Array.isArray(response.data?.data) ? response.data.data : [];
  const pagination = response.data?.pagination;
  return {
    trips: rows.map(mapKmTrip),
    total: num(pagination?.totalRecords ?? pagination?.total, rows.length),
  };
}

export async function fetchKmTrip(id: string): Promise<KmTrip> {
  const response = await api.get<{
    success?: boolean;
    message?: string;
    data?: ApiKmTrip;
  }>(`${apiRoutes.kmTracker.detail}/${id}`);
  if (!response.data?.data || response.data.success === false) {
    throw new Error(response.data?.message || "Trip not found.");
  }
  return mapKmTrip(response.data.data);
}

/** Sends `payload` as given — build it with `kmTripPayload`, which has
 *  already dropped the keys an encrypted body can't leave unset. */
export async function createKmTripApi(
  payload: Record<string, unknown>,
): Promise<{ id: string }> {
  const response = await api.post<{
    success?: boolean;
    message?: string;
    data?: { id?: string | number };
  }>(apiRoutes.kmTracker.create, buildEncryptedRequestBody(payload));
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't save this trip.");
  }
  track(EVENTS.KM_TRIP_LOGGED, { distance_km: num(payload.distance_km) });
  const id = response.data?.data?.id;
  return { id: id != null ? String(id) : "" };
}

export async function updateKmTripApi(
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const response = await api.put<{ success?: boolean; message?: string }>(
    `${apiRoutes.kmTracker.update}/${id}`,
    buildEncryptedRequestBody(payload),
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't update this trip.");
  }
}

/**
 * What to say when a trip save fails. The server's own message when it sent
 * one (the cap, a 422 about the method or vehicle type); for the two country
 * rule codes without a message, a sentence that says where to fix it.
 */
export function kmApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { code?: string; message?: string } | undefined;
    if (!data?.message && data?.code === "KM_VEHICLE_TYPE_REQUIRED") {
      return "This vehicle needs a vehicle type for the kilometre rate — set one in KM Tracker settings.";
    }
    if (!data?.message && data?.code === "KM_METHOD_NOT_AVAILABLE_IN_COUNTRY") {
      return "That calculation method isn't available for your business's country — choose another in KM Tracker settings.";
    }
  }
  return apiErrorMessage(error, fallback);
}

export async function deleteKmTripApi(id: string): Promise<void> {
  const response = await api.delete<{ success?: boolean; message?: string }>(
    `${apiRoutes.kmTracker.delete}/${id}`,
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't delete this trip.");
  }
}

/**
 * Ties trips to the invoice raised from them, so they stop offering to be
 * invoiced again — the PUT sole-webapp's `handleInvoiceCreated` makes per trip.
 * `is_invoiced` goes as 1, not `true`: encrypted, a boolean arrives as the
 * string "true", which the TINYINT column would reject.
 */
export async function linkKmTripsToInvoiceApi(
  tripIds: string[],
  invoice: { id: string; number: string },
): Promise<void> {
  await Promise.all(
    tripIds.map((id) =>
      updateKmTripApi(id, {
        invoice_id: invoice.id,
        invoice_no: invoice.number,
        is_invoiced: 1,
      }),
    ),
  );
}

/* ------------------------------------------------------------------ *
 * Stats band
 * ------------------------------------------------------------------ */

export type KmVehicleClaim = {
  vehicle: string;
  claimedBusinessKm: number;
  remainingClaimableKm: number;
};

export type KmLogbookSummary = {
  totalKm: number;
  businessKm: number;
  personalKm: number;
  businessUsePercentage: number;
};

export type KmCentsSummary = {
  incomeYearLabel: string;
  limit: number;
  claimedBusinessKm: number;
  remainingClaimableKm: number;
  claimAmount: number;
  tollAndParking: number;
  totalClaim: number;
  vehicleClaims: KmVehicleClaim[];
};

export type KmWarning = { code: string; message: string };

/** One vehicle's year under New Zealand's kilometre rate. */
export type KmTierVehicleClaim = {
  vehicle: string;
  vehicleType: string;
  /** The vehicle's whole year, business and private. */
  totalKm: number;
  /** "odometer" from the year-end readings, "trips" when it had to add up the log. */
  totalKmSource: "odometer" | "trips";
  businessKm: number;
  businessUsePercentage: number;
  businessUseBasis: KmBusinessUseBasis;
  tier1Km: number;
  tier2Km: number;
  tier1Rate: number;
  tier2Rate: number;
  claimAmount: number;
  /** Total km against the tier-1 boundary, for a progress bar. */
  tier1UsagePercentage: number;
  warnings: KmWarning[];
};

/** The year's kilometre-rate claim — the stats band's and the report's `year_summary`. */
export type KmTierSummary = {
  incomeYearLabel: string;
  incomeYear: KmIncomeYear | null;
  currency: string;
  provisional: boolean;
  rateYear: string;
  tier1MaxKm: number;
  totalKm: number;
  claimedBusinessKm: number;
  claimAmount: number;
  tollAndParking: number;
  totalClaim: number;
  vehicleClaims: KmTierVehicleClaim[];
  warnings: KmWarning[];
};

export type KmStats = {
  logbook: KmLogbookSummary;
  cents: KmCentsSummary;
  /** Present for a New Zealand business. */
  kilometreRate: KmTierSummary | null;
  currency: string | null;
  countryIso2: string | null;
};

type ApiMethodSummary = Record<string, unknown> & {
  type?: string;
  vehicle_claims?: Record<string, unknown>[];
};

function mapWarnings(value: unknown): KmWarning[] {
  return (Array.isArray(value) ? value : [])
    .map((warning) => ({
      code: str((warning as { code?: unknown })?.code),
      message: str((warning as { message?: unknown })?.message),
    }))
    .filter((warning) => warning.message);
}

export function mapKmTierSummary(raw: Record<string, unknown> | null | undefined): KmTierSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const incomeYear = mapIncomeYear(raw.income_year);
  const claims = Array.isArray(raw.vehicle_claims) ? (raw.vehicle_claims as Record<string, unknown>[]) : [];
  return {
    incomeYearLabel: str(raw.income_year_label) || incomeYear?.label || "",
    incomeYear,
    currency: str(raw.currency),
    provisional: toFlag(raw.provisional),
    rateYear: str(raw.rate_year),
    tier1MaxKm: num(raw.tier1_max_km),
    totalKm: num(raw.total_km),
    claimedBusinessKm: num(raw.claimed_business_km),
    claimAmount: num(raw.total_claim_amount),
    tollAndParking: num(raw.toll_and_parking_total),
    totalClaim: num(raw.claim_plus_toll_parking),
    vehicleClaims: claims.map((claim) => ({
      vehicle: str(claim.vehicle) || "Unassigned vehicle",
      vehicleType: str(claim.vehicle_type),
      totalKm: num(claim.total_km),
      totalKmSource: claim.total_km_source === "odometer" ? "odometer" : "trips",
      businessKm: num(claim.business_km),
      businessUsePercentage: num(claim.business_use_percentage),
      businessUseBasis: toBusinessUseBasis(claim.business_use_basis) ?? "records",
      tier1Km: num(claim.tier1_km),
      tier2Km: num(claim.tier2_km),
      tier1Rate: num(claim.tier1_rate),
      tier2Rate: num(claim.tier2_rate),
      claimAmount: num(claim.claim_amount),
      tier1UsagePercentage: clamp(num(claim.tier1_usage_percentage), 0, 100),
      warnings: mapWarnings(claim.warnings),
    })),
    warnings: mapWarnings(raw.warnings),
  };
}

export function mapKmStats(raw: {
  method_summaries?: ApiMethodSummary[];
  currency?: string | null;
  country_iso2?: string | null;
} | null | undefined): KmStats {
  const summaries = Array.isArray(raw?.method_summaries) ? raw.method_summaries : [];
  const logbook = summaries.find((summary) => summary.type === "logbook") ?? {};
  const cents =
    summaries.find((summary) => summary.type === "cents_per_kilometre") ?? {};
  const tiered = summaries.find((summary) => summary.type === "kilometre_rate");

  const totalKm = num(logbook.total_logbook_km);
  const businessKm = num(logbook.total_logbook_business_km);
  const limit = num(cents.cents_per_km_limit, DEFAULT_KM_LIMIT);

  return {
    logbook: {
      totalKm,
      businessKm,
      personalKm: Math.max(0, totalKm - businessKm),
      businessUsePercentage: num(logbook.business_use_percentage),
    },
    cents: {
      incomeYearLabel: str(cents.income_year_label),
      limit,
      claimedBusinessKm: num(cents.claimed_business_km),
      remainingClaimableKm: num(cents.remaining_claimable_km),
      claimAmount: num(cents.capped_claimable_amount),
      tollAndParking: num(cents.toll_and_parking_total),
      totalClaim: num(cents.capped_claim_plus_toll_parking),
      vehicleClaims: (Array.isArray(cents.vehicle_claims) ? cents.vehicle_claims : []).map(
        (claim) => ({
          vehicle: str(claim.vehicle) || "Unassigned vehicle",
          claimedBusinessKm: num(claim.claimed_business_km),
          remainingClaimableKm: num(claim.remaining_claimable_km, limit),
        }),
      ),
    },
    kilometreRate: mapKmTierSummary(tiered),
    currency: str(raw?.currency) || null,
    countryIso2: str(raw?.country_iso2).toUpperCase() || null,
  };
}

export async function fetchKmStats(filters: KmTripFilters): Promise<KmStats> {
  const response = await api.get<{
    success?: boolean;
    message?: string;
    data?: {
      method_summaries?: ApiMethodSummary[];
      currency?: string | null;
      country_iso2?: string | null;
    };
  }>(apiRoutes.kmTracker.stats, {
    params: { ...kmFilterParams(filters), page: 1, limit: 1 },
  });
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't load KM totals.");
  }
  return mapKmStats(response.data?.data);
}

/* ------------------------------------------------------------------ *
 * Trip form
 * ------------------------------------------------------------------ */

export type KmTripDraft = {
  /** `datetime-local` values. */
  startTime: string;
  endTime: string;
  startLocation: string;
  endLocation: string;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  /** Business or personal; a split trip is `isSplit` on top of business. */
  tripType: KmTripType;
  isSplit: boolean;
  reason: string;
  distanceKm: string;
  businessPercentage: string;
  tollAmount: string;
  parkingAmount: string;
  fuelCost: string;
  otherExpenses: string;
  splitToll: boolean;
  splitParking: boolean;
  splitFuel: boolean;
  splitOther: boolean;
  odometerStart: string;
  odometerEnd: string;
  clientId: string | null;
  clientName: string;
  projectId: string | null;
  jobId: string | null;
  isBillable: boolean;
  vehicle: string;
  /** Comma-separated as typed; sent as an array. */
  tags: string;
  notes: string;
};

export function emptyKmTripDraft(settings: KmSettings, now = new Date()): KmTripDraft {
  const start = toDateTimeLocal(now);
  return {
    startTime: start,
    endTime: start,
    startLocation: "",
    endLocation: "",
    startLat: null,
    startLng: null,
    endLat: null,
    endLng: null,
    tripType: "business",
    isSplit: false,
    reason: "",
    distanceKm: "",
    businessPercentage: "100",
    tollAmount: "",
    parkingAmount: "",
    fuelCost: "",
    otherExpenses: "",
    splitToll: true,
    splitParking: true,
    splitFuel: true,
    splitOther: true,
    odometerStart: "",
    odometerEnd: "",
    clientId: null,
    clientName: "",
    projectId: null,
    jobId: null,
    isBillable: false,
    vehicle: settings.vehicles[0] ? kmVehicleLabel(settings.vehicles[0]) : "",
    tags: "",
    notes: "",
  };
}

const moneyInput = (value: number) => (value > 0 ? trimNumber(value) : "");

/** A saved trip as the form edits it — sole-webapp's `mapTripToForm`. */
export function kmTripDraftFromTrip(trip: KmTrip): KmTripDraft {
  const businessPercentage = clamp(trip.businessPercentage, 0, 100);
  return {
    startTime: toDateTimeLocal(trip.startTime),
    endTime: toDateTimeLocal(trip.endTime),
    startLocation: trip.startLocation,
    endLocation: trip.endLocation,
    startLat: trip.startLat,
    startLng: trip.startLng,
    endLat: trip.endLat,
    endLng: trip.endLng,
    tripType: trip.tripType === "personal" ? "personal" : "business",
    isSplit:
      trip.tripType === "split" ||
      (businessPercentage > 0 && businessPercentage < 100),
    reason: trip.reason,
    distanceKm: trip.distanceKm > 0 ? trimNumber(trip.distanceKm) : "",
    businessPercentage: trimNumber(businessPercentage),
    tollAmount: moneyInput(trip.tollAmount),
    parkingAmount: moneyInput(trip.parkingAmount),
    fuelCost: moneyInput(trip.fuelCost),
    otherExpenses: moneyInput(trip.otherExpenses),
    splitToll: trip.splitToll,
    splitParking: trip.splitParking,
    splitFuel: trip.splitFuel,
    splitOther: trip.splitOther,
    odometerStart: trip.odometerStart !== null ? trimNumber(trip.odometerStart, 1) : "",
    odometerEnd: trip.odometerEnd !== null ? trimNumber(trip.odometerEnd, 1) : "",
    clientId: trip.clientId,
    clientName: trip.clientName,
    projectId: trip.projectId,
    jobId: trip.jobId,
    isBillable: trip.isBillable,
    vehicle: trip.vehicle,
    tags: trip.tags.join(", "),
    notes: trip.notes,
  };
}

export function kmTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export type KmTripFigures = {
  distanceKm: number;
  /** 100 unless the trip is split. */
  businessPercentage: number;
  personalPercentage: number;
  deductibleKm: number;
  personalKm: number;
  /** Distance × rate (statutory methods only) plus every expense the method allows. */
  totalAmount: number;
  estimatedDeduction: number;
};

function deductibleExpense(amount: number, split: boolean, businessPercentage: number) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return split ? (amount * businessPercentage) / 100 : amount;
}

/**
 * The figures the summary shows and the payload sends — `NewTrip`'s
 * `deductibleKm`, `totalAmount` and `estimatedDeduction` memos, which sole-ocr's
 * `prepareTripPayload` also recomputes server-side the same way.
 *
 * Under New Zealand's kilometre rate, pass the vehicle type's tier-1 rate
 * (`kmTripRate`): the figures are then a preview — the tier a trip falls in
 * depends on the vehicle's whole year, so the server's figure is the real one.
 */
export function kmTripFigures(
  draft: KmTripDraft,
  method: KmCalculationMethod,
  ratePerKm: number,
): KmTripFigures {
  const cents = isStatutoryKmMethod(method);
  const distanceKm = Math.max(0, num(draft.distanceKm));
  const businessPercentage = draft.isSplit
    ? clamp(num(draft.businessPercentage), 0, 100)
    : 100;
  const deductibleKm = (distanceKm * businessPercentage) / 100;
  const toll = num(draft.tollAmount);
  const parking = num(draft.parkingAmount);
  const fuel = cents ? 0 : num(draft.fuelCost);
  const other = cents ? 0 : num(draft.otherExpenses);
  const distanceAmount = cents && ratePerKm > 0 ? distanceKm * ratePerKm : 0;

  return {
    distanceKm,
    businessPercentage,
    personalPercentage: 100 - businessPercentage,
    deductibleKm,
    personalKm: Math.max(0, distanceKm - deductibleKm),
    totalAmount: distanceAmount + toll + parking + fuel + other,
    estimatedDeduction:
      (distanceAmount * businessPercentage) / 100 +
      deductibleExpense(toll, draft.splitToll, businessPercentage) +
      deductibleExpense(parking, draft.splitParking, businessPercentage) +
      deductibleExpense(fuel, draft.splitFuel, businessPercentage) +
      deductibleExpense(other, draft.splitOther, businessPercentage),
  };
}

/** What a split trip's type actually is once the percentage is applied. */
export function effectiveKmTripType(draft: KmTripDraft): KmTripType {
  if (!draft.isSplit) return draft.tripType;
  const percentage = clamp(num(draft.businessPercentage), 0, 100);
  if (percentage > 0 && percentage < 100) return "split";
  return percentage > 0 ? "business" : "personal";
}

/**
 * The rate a new or edited trip previews at.
 *
 * - Editing a trip that has a rate: its own, which the server worked out.
 * - Australia, following the country: the rules' rate for the trip's date —
 *   but only once the server has answered (`rulesReady`), so an older server
 *   that has no rules keeps pricing at the saved rate, as it always did.
 * - New Zealand: the tier-1 rate for the vehicle's type (0 without one).
 * - Otherwise the account's saved rate.
 */
export function kmTripRate(
  rules: KmRules,
  context: {
    method: KmCalculationMethod;
    settings: KmSettings;
    vehicle: KmVehicle | null;
    savedRate?: number;
    rulesReady: boolean;
  },
): number {
  if (context.savedRate && context.savedRate > 0) return context.savedRate;
  if (context.method === "kilometre_rate") {
    return kmTierRates(rules, context.vehicle?.vehicleType ?? "")?.tier1 ?? 0;
  }
  if (
    context.method === "cents_per_kilometre" &&
    context.rulesReady &&
    context.settings.followCountryRate &&
    rules.rates.perKm !== null
  ) {
    return rules.rates.perKm;
  }
  return context.settings.ratePerKm;
}

/**
 * Everything stopping this trip being saved — sole-webapp's `validate`, rule
 * for rule, including that a trip must cost more than $0 (which under the
 * logbook method means at least one expense, since distance there carries no
 * rate). Vehicle is required here when the account has any, matching the
 * asterisk sole-webapp put on the field.
 *
 * The country decides two things: whether a logbook trip needs its own
 * odometer readings (Australia's logbook does, New Zealand's doesn't), and the
 * currency the "$0" is written in — pass `currencySymbol` from the country.
 */
export function kmTripIssues(
  draft: KmTripDraft,
  context: {
    method: KmCalculationMethod;
    ratePerKm: number;
    hasVehicles: boolean;
    currencySymbol?: string;
  },
  rules: KmRules,
): KmIssue[] {
  const issues: KmIssue[] = [];
  const required = (key: keyof KmTripDraft, label: string) => {
    if (!String(draft[key] ?? "").trim()) {
      issues.push({ key, message: `${label} is required` });
    }
  };
  required("startLocation", "Start location");
  required("endLocation", "End location");
  required("startTime", "Start date & time");
  required("endTime", "End date & time");

  const start = fromDateTimeLocal(draft.startTime);
  const end = fromDateTimeLocal(draft.endTime);
  if (start && end && end.getTime() < start.getTime()) {
    issues.push({ key: "endTime", message: "End can't be before the start" });
  }

  required("reason", "Reason");
  if (context.hasVehicles) required("vehicle", "Vehicle");

  const distance = Number(draft.distanceKm);
  if (!draft.distanceKm.trim() || !Number.isFinite(distance) || distance <= 0) {
    issues.push({ key: "distanceKm", message: "Distance must be greater than 0" });
  }

  if (draft.isSplit) {
    const percentage = Number(draft.businessPercentage);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      issues.push({
        key: "businessPercentage",
        message: "Business share must be between 0 and 100%",
      });
    }
  }

  (
    [
      ["tollAmount", "Toll"],
      ["parkingAmount", "Parking"],
      ["fuelCost", "Fuel cost"],
      ["otherExpenses", "Other expenses"],
    ] as const
  ).forEach(([key, label]) => {
    const value = draft[key].trim();
    if (value && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
      issues.push({ key, message: `${label} must be 0 or more` });
    }
  });

  if (isStatutoryKmMethod(context.method)) {
    const rate = statutoryRateName(rules, context.method);
    if (num(draft.fuelCost) > 0) {
      issues.push({ key: "fuelCost", message: `Fuel is already covered by ${rate}` });
    }
    if (num(draft.otherExpenses) > 0) {
      issues.push({
        key: "otherExpenses",
        message: `Running costs are already covered by ${rate}`,
      });
    }
  }

  if (kmTripNeedsOdometer(rules, context.method)) {
    const odometerStart = Number(draft.odometerStart);
    const odometerEnd = Number(draft.odometerEnd);
    if (!draft.odometerStart.trim() || !Number.isFinite(odometerStart) || odometerStart < 0) {
      issues.push({ key: "odometerStart", message: "Start odometer reading is required" });
    }
    if (!draft.odometerEnd.trim() || !Number.isFinite(odometerEnd) || odometerEnd < 0) {
      issues.push({ key: "odometerEnd", message: "End odometer reading is required" });
    } else if (Number.isFinite(odometerStart) && odometerEnd < odometerStart) {
      issues.push({
        key: "odometerEnd",
        message: "End odometer must be at least the start reading",
      });
    }
  }

  const { totalAmount } = kmTripFigures(draft, context.method, context.ratePerKm);
  if (!issues.some((issue) => issue.key === "distanceKm") && totalAmount <= 0) {
    const logbookLabel = (
      rules.methods.find((method) => method.key === "logbook")?.label ?? "Logbook"
    ).toLowerCase();
    issues.push({
      key: "totalAmount",
      message:
        context.method === "logbook"
          ? `Add at least one expense — under the ${logbookLabel} method a trip's cost is its actual expenses`
          : `Total cost must be greater than ${context.currencySymbol ?? "$"}0`,
    });
  }

  return issues;
}

/** Whether a trip under `method` records its own start and end odometer. */
export function kmTripNeedsOdometer(rules: KmRules, method: KmCalculationMethod): boolean {
  return method === "logbook" && rules.logbook.odometerPerTrip;
}

/**
 * The body a create or update sends — the fields sole-webapp's `handleSubmit`
 * built, both aliases of each percentage and deduction included, since
 * `pickAllowedFields` reads either.
 *
 * Built field by field rather than spread from the trip, unlike sole-webapp's
 * `{...form}`: that carried a duplicated trip's `invoice_id`, `invoice_no`
 * and `is_invoiced` into the copy, so a duplicate came out already linked to
 * the original's invoice.
 *
 * Notes, tags and vehicle are always sent so an edit can clear them (as "",
 * [] and "" — each of which the columns accept). An unset client, project or
 * job is left out instead: those are BIGINT columns, and the encrypted body
 * can only spell "unset" as "", which they'd reject.
 */
export function kmTripPayload(
  draft: KmTripDraft,
  context: { method: KmCalculationMethod; ratePerKm: number },
  rules: KmRules,
): Record<string, unknown> {
  const figures = kmTripFigures(draft, context.method, context.ratePerKm);
  const cents = isStatutoryKmMethod(context.method);
  // Only where the country asks for per-trip readings; elsewhere the
  // auto-filled values would be sent without anyone having seen them.
  const logbook = kmTripNeedsOdometer(rules, context.method);
  const start = fromDateTimeLocal(draft.startTime);
  const end = fromDateTimeLocal(draft.endTime);

  const fields = compactPayload({
    start_time: start?.toISOString(),
    end_time: end?.toISOString(),
    start_location: draft.startLocation.trim(),
    end_location: draft.endLocation.trim(),
    start_latitude: draft.startLat ?? undefined,
    start_longitude: draft.startLng ?? undefined,
    end_latitude: draft.endLat ?? undefined,
    end_longitude: draft.endLng ?? undefined,
    trip_type: effectiveKmTripType(draft),
    reason: draft.reason.trim(),
    calculation_method: context.method,
    distance_km: figures.distanceKm,
    business_percentage: figures.businessPercentage,
    personal_percentage: figures.personalPercentage,
    business_use_percentage: figures.businessPercentage,
    personal_use_percentage: figures.personalPercentage,
    rate_per_km: cents ? context.ratePerKm : 0,
    total_amount: Number(figures.totalAmount.toFixed(2)),
    estimated_deduction: Number(figures.estimatedDeduction.toFixed(2)),
    deductible_km: Number(figures.deductibleKm.toFixed(4)),
    deductible_distance_km: Number(figures.deductibleKm.toFixed(4)),
    toll_amount: num(draft.tollAmount),
    parking_amount: num(draft.parkingAmount),
    fuel_cost: cents ? 0 : num(draft.fuelCost),
    other_expenses: cents ? 0 : num(draft.otherExpenses),
    split_toll_expense: draft.splitToll,
    split_parking_expense: draft.splitParking,
    split_fuel_expense: draft.splitFuel,
    split_other_expense: draft.splitOther,
    odometer_start: logbook ? num(draft.odometerStart) : undefined,
    odometer_end: logbook ? num(draft.odometerEnd) : undefined,
    client_id: draft.clientId ?? undefined,
    project_id: draft.projectId ?? undefined,
    job_id: draft.projectId ? (draft.jobId ?? undefined) : undefined,
    is_billable: draft.isBillable,
  });

  // Added after compacting, which would otherwise drop the "" that clears them.
  return {
    ...fields,
    vehicle: draft.vehicle.trim(),
    tags: kmTags(draft.tags),
    notes: draft.notes.trim(),
  };
}

/* ------------------------------------------------------------------ *
 * Projects and jobs (the trip form's optional pickers)
 * ------------------------------------------------------------------ */

export type KmOption = { value: string; label: string };

function optionRows(data: unknown): Record<string, unknown>[] {
  const root = (data as { data?: unknown })?.data ?? data;
  if (Array.isArray(root)) return root as Record<string, unknown>[];
  const nested = (root as { data?: unknown; rows?: unknown })?.data ??
    (root as { rows?: unknown })?.rows;
  return Array.isArray(nested) ? (nested as Record<string, unknown>[]) : [];
}

/** `normalizeOptions` from km-tracker.services.js: id + first usable label, de-duplicated. */
export function toKmOptions(
  data: unknown,
  labelKeys: string[],
): KmOption[] {
  const seen = new Set<string>();
  const options: KmOption[] = [];
  optionRows(data).forEach((row) => {
    const value = optionalId(row.id ?? row._id);
    const label = labelKeys.map((key) => str(row[key])).find(Boolean);
    if (!value || !label || seen.has(value)) return;
    seen.add(value);
    options.push({ value, label });
  });
  return options;
}

export async function fetchKmProjects(): Promise<KmOption[]> {
  const response = await api.get(apiRoutes.projects.list, {
    params: { page: 1, limit: 100 },
  });
  return toKmOptions(response.data, ["project_name", "name", "title"]);
}

export async function fetchKmProjectJobs(projectId: string): Promise<KmOption[]> {
  const response = await api.get(apiRoutes.projects.jobs, {
    params: { page: 1, limit: 100, project_id: projectId },
  });
  return toKmOptions(response.data, ["job_name", "name", "title"]);
}

/* ------------------------------------------------------------------ *
 * Convert to invoice
 * ------------------------------------------------------------------ */

/** The rate a billable trip is invoiced at — `TripTable`'s `getRatePerKm`. */
export function kmInvoiceRate(trip: KmTrip, billableRatePerKm: number): number {
  if (billableRatePerKm > 0) return billableRatePerKm;
  if (trip.ratePerKm > 0) return trip.ratePerKm;
  return trip.deductibleKm > 0 ? trip.estimatedDeduction / trip.deductibleKm : 0;
}

function invoiceableExpense(amount: number, split: boolean, trip: KmTrip): number {
  return split ? (amount * trip.businessPercentage) / 100 : amount;
}

function kmLine(
  description: string,
  quantity: number,
  price: number,
  qtyType: "km" | "items",
  gst: boolean,
): InvoiceLineItem {
  return {
    ...newLineItem(),
    description,
    // Whole numbers stay whole — 60 km, 1 toll, $5 — not 60.00, 1.00 and
    // 5.00, while a real fraction keeps up to two places: 50.55, 0.88, 7.5.
    quantity: trimNumber(quantity, 2),
    price: trimNumber(price, 2),
    gst,
    qtyType,
  };
}

/**
 * The invoice lines for a set of trips — sole-webapp's `buildInvoiceData`:
 * per trip, the business kilometres at the billable rate (cents-per-km trips
 * only; a logbook trip bills its actual costs), then one line per toll,
 * parking, fuel or other cost, split by the business share where that cost
 * was marked split. GST off on all of them, as there, unless `chargeTax` —
 * the convert dialog's opt-in for a business that charges tax on re-billed
 * travel.
 */
export function kmInvoiceLines(
  trips: KmTrip[],
  billableRatePerKm: number,
  chargeTax = false,
): InvoiceLineItem[] {
  return trips.flatMap((trip) => {
    const label = `${trip.startLocation.trim() || "-"} - ${trip.endLocation.trim() || "-"}`;
    const lines: InvoiceLineItem[] = [];

    if (trip.calculationMethod !== "logbook") {
      const rate = kmInvoiceRate(trip, billableRatePerKm);
      lines.push(kmLine(label, trip.deductibleKm, rate, "km", chargeTax));
    }

    (
      [
        ["Toll", trip.tollAmount, trip.splitToll],
        ["Parking", trip.parkingAmount, trip.splitParking],
        ["Fuel Cost", trip.fuelCost, trip.splitFuel],
        ["Other Cost", trip.otherExpenses, trip.splitOther],
      ] as const
    ).forEach(([name, amount, split]) => {
      const billed = invoiceableExpense(amount, split, trip);
      if (billed > 0) lines.push(kmLine(`${label} - ${name}`, 1, billed, "items", chargeTax));
    });

    return lines;
  });
}

export function kmInvoiceTotal(lines: InvoiceLineItem[]): number {
  return lines.reduce(
    (sum, line) => sum + num(line.quantity) * num(line.price),
    0,
  );
}

/**
 * Whether a trip can join a selection — only trips billed to the same client
 * go on one invoice (`toggleRow`'s "same client only" rule).
 */
export function canSelectKmTrip(trip: KmTrip, selected: KmTrip[]): boolean {
  if (!isKmTripInvoiceable(trip)) return false;
  const client = selected.find((other) => other.clientId)?.clientId ?? null;
  return !client || !trip.clientId || trip.clientId === client;
}

/* ------------------------------------------------------------------ *
 * Reports
 * ------------------------------------------------------------------ */

export type KmReportSummary = {
  tripCount: number;
  totalDistanceKm: number;
  totalBusinessKm: number;
  totalEstimatedDeduction: number;
  totalAmount: number;
};

export type KmReport = {
  method: KmCalculationMethod;
  startDate: string;
  endDate: string;
  summary: KmReportSummary;
  rows: KmTrip[];
  /** The business's currency, when the server says. */
  currency: string | null;
  /** The kilometre-rate year containing the end date (New Zealand). */
  yearSummary: KmTierSummary | null;
};

export async function fetchKmReport(params: {
  method: KmCalculationMethod;
  startDate: string;
  endDate: string;
}): Promise<KmReport> {
  const response = await api.get<{
    success?: boolean;
    message?: string;
    data?: {
      calculation_method?: string;
      filters?: { start_date?: string | null; end_date?: string | null };
      summary?: Record<string, unknown>;
      rows?: ApiKmTrip[];
      currency?: string | null;
      year_summary?: Record<string, unknown> | null;
    };
  }>(apiRoutes.kmTracker.reports, {
    params: {
      calculation_method: params.method,
      start_date: params.startDate,
      end_date: params.endDate,
    },
  });
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't load the report.");
  }
  const data = response.data?.data ?? {};
  const summary = data.summary ?? {};
  return {
    method: toKmMethod(data.calculation_method ?? params.method),
    startDate: str(data.filters?.start_date ?? params.startDate),
    endDate: str(data.filters?.end_date ?? params.endDate),
    summary: {
      tripCount: num(summary.trip_count),
      totalDistanceKm: num(summary.total_distance_km),
      totalBusinessKm: num(summary.total_business_km),
      totalEstimatedDeduction: num(summary.total_estimated_deduction),
      totalAmount: num(summary.total_amount),
    },
    rows: (Array.isArray(data.rows) ? data.rows : []).map(mapKmTrip),
    currency: str(data.currency) || null,
    yearSummary: mapKmTierSummary(data.year_summary),
  };
}

/** Whole weeks (to one decimal) an inclusive date range spans, or null. */
export function kmRangeWeeks(startDate: string, endDate: string): number | null {
  if (!startDate || !endDate) return null;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const diff = end.getTime() - start.getTime();
  if (diff < 0) return null;
  const days = Math.floor(diff / 86_400_000) + 1;
  return Number((days / 7).toFixed(1));
}

/** Calendar days an inclusive date range spans, or null. */
export function kmRangeDays(startDate: string, endDate: string): number | null {
  const weeks = kmRangeWeeks(startDate, endDate);
  if (weeks === null) return null;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

/**
 * The "Trips" sheet — `buildExportRows`, column for column.
 *
 * Given a `currency` (a business outside Australia), the money columns say
 * which one and each row adds the rate's year and whether it was provisional.
 * Without one the sheet is exactly what it has always been.
 */
export function kmReportExportRows(
  rows: KmTrip[],
  options: { currency?: string | null } = {},
): Record<string, string | number>[] {
  const code = options.currency?.trim();
  const money = (label: string) => (code ? `${label} (${code})` : label);
  return rows.map((row) => ({
    "Start Date Time": formatKmDateTime(row.startTime),
    "End Date Time": formatKmDateTime(row.endTime),
    Vehicle: row.vehicle,
    "Trip Type": row.tripType,
    Purpose: kmReasonLabel(row.reason),
    "Start Location": row.startLocation,
    "End Location": row.endLocation,
    Client: row.clientName,
    Project: row.projectName,
    Job: row.jobName,
    "Distance (KM)": row.distanceKm,
    "Business %": row.businessPercentage,
    "Deductible KM": row.deductibleKm,
    [money("Rate per KM")]: row.ratePerKm,
    ...(code
      ? { "Rate Year": row.rateYear, Provisional: row.rateProvisional ? "Yes" : "No" }
      : {}),
    [money("Total Amount")]: row.totalAmount,
    [money("Estimated Deduction")]: row.estimatedDeduction,
    "Start Odometer": row.odometerStart ?? 0,
    "End Odometer": row.odometerEnd ?? 0,
    [money("Tolls")]: row.tollAmount,
    [money("Parking")]: row.parkingAmount,
    [money("Fuel")]: row.fuelCost,
    [money("Other Expenses")]: row.otherExpenses,
    Notes: row.notes,
  }));
}

export function kmReportFilename(report: KmReport): string {
  return `km-tracker-${report.method}-${report.startDate || "start"}-${report.endDate || "end"}.xlsx`;
}
