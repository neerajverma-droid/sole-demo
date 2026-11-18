/**
 * Input rules for the asset flows — disposal, depreciation and insurance.
 *
 * Pure functions, each returning the message to show under the field or null
 * when the value is fine. Ported from the rules the stable app enforced
 * (AssetDisposalManager, AddDepreciation, AssetInsuranceManager), worded the
 * same wherever it had wording, so the new screens catch what the backend would
 * otherwise reject with a toast.
 *
 * No imports from `lib/assets` on purpose: that module calls into this one, and
 * these rules are about typed strings, not about the asset model.
 */

/* ------------------------------------------------------------------ *
 * Shared parsing
 * ------------------------------------------------------------------ */

/** A typed number: optional sign, digits, optional decimals; commas ignored. */
const NUMBER_PATTERN = /^-?(\d+\.?\d*|\.\d+)$/;

/**
 * A typed figure as a number — null when blank, NaN when it isn't a number.
 * Commas are thousands separators, the same reading `assetValue` gives them.
 */
export function parseTypedNumber(value: string | null | undefined): number | null {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text) return null;
  return NUMBER_PATTERN.test(text) ? Number(text) : Number.NaN;
}

/**
 * A typed figure as the API should receive it: blank stays "", a valid number
 * goes as a plain number string ("1,250.50" → "1250.5"). Anything else is sent
 * comma-stripped so the server's own validation rejects it rather than it
 * being silently blanked.
 */
export function typedNumberForApi(value: string | null | undefined): string {
  const parsed = parseTypedNumber(value);
  if (parsed === null) return "";
  if (Number.isNaN(parsed)) return String(value ?? "").replace(/,/g, "").trim();
  return String(parsed);
}

/** Whole cents, so a cap of 909.0909… accepts 909.09 and rejects 909.10. */
function cents(value: number): number {
  return Math.round(value * 100);
}

/** Today as a local `YYYY-MM-DD` — the same shape the date pickers write. */
export function localIsoToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date written `YYYY-MM-DD` — "2026-02-30" is not one. */
export function isValidIsoDate(value: string | null | undefined): value is string {
  const text = String(value ?? "");
  if (!ISO_DATE.test(text)) return false;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/* ------------------------------------------------------------------ *
 * Disposal
 * ------------------------------------------------------------------ */

/**
 * The disposal date: required, not after today, and not before the purchase
 * date when one is known. Compared as local `YYYY-MM-DD` strings, so "today"
 * is the user's calendar day, not UTC's.
 */
export function disposalDateError(
  date: string,
  today: string = localIsoToday(),
  purchaseDate = "",
): string | null {
  if (!date.trim()) return "Disposed date is required";
  if (!ISO_DATE.test(date)) return "Enter a valid date";
  if (date > today) return "Disposal date can't be in the future";
  if (ISO_DATE.test(purchaseDate) && date < purchaseDate) {
    return "Disposal date can't be before the purchase date";
  }
  return null;
}

/** An optional amount: blank is fine, otherwise a number of 0 or more. */
export function nonNegativeAmountError(
  value: string,
  label: string,
): string | null {
  const amount = parseTypedNumber(value);
  if (amount === null) return null;
  if (Number.isNaN(amount)) return `${label} must be a valid number`;
  if (amount < 0) return "Must be 0 or greater";
  return null;
}

/** The sale value on a disposal — optional (scrapped, given away). */
export function saleValueError(value: string): string | null {
  return nonNegativeAmountError(value, "Sale value");
}

/* ------------------------------------------------------------------ *
 * Depreciation
 * ------------------------------------------------------------------ */

/**
 * Residual value or cost limit: optional, 0 or more, and no more than the
 * asset's value — the ex-GST cost when the price included GST, since that's
 * the base depreciation is worked out on. A null `assetValue` skips the cap
 * (the cost itself is missing and has its own error).
 */
export function depreciationAmountError(
  value: string,
  label: "Residual value" | "Cost limit",
  assetValue: number | null,
): string | null {
  const basic = nonNegativeAmountError(value, label);
  if (basic) return basic;
  const amount = parseTypedNumber(value);
  if (amount === null || assetValue === null || !Number.isFinite(assetValue)) {
    return null;
  }
  return cents(amount) > cents(assetValue)
    ? `${label} cannot be greater than asset value`
    : null;
}

/**
 * Residual against cost limit, when both are given. A zero limit means "no
 * limit" (it's how the preview reads it), so it's left alone.
 */
export function residualVsCostLimitError(
  residualValue: string,
  costLimit: string,
): string | null {
  const residual = parseTypedNumber(residualValue);
  const limit = parseTypedNumber(costLimit);
  if (residual === null || limit === null) return null;
  if (Number.isNaN(residual) || Number.isNaN(limit) || limit <= 0) return null;
  return cents(residual) >= cents(limit)
    ? "Residual value must be less than the cost limit"
    : null;
}

/** Effective life in years — required and above zero, unless written off. */
export function effectiveLifeError(
  value: string,
  fullWriteOff: boolean,
): string | null {
  if (fullWriteOff) return null;
  const years = parseTypedNumber(value);
  if (years === null) return "Effective life is required";
  if (Number.isNaN(years)) return "Effective life must be a number";
  // Same floor as the old app's depreciation form: nothing under six months.
  if (years < 0.5) return "Minimum 6 months";
  return null;
}

/** The override rate, a percentage: optional, 0 to 100 inclusive. */
export function overrideRateError(value: string): string | null {
  const rate = parseTypedNumber(value);
  if (rate === null) return null;
  if (Number.isNaN(rate)) return "Override rate must be a number";
  if (rate < 0 || rate > 100) return "Override rate must be between 0 and 100";
  return null;
}

export type DepreciationField =
  | "effectiveLife"
  | "overrideRate"
  | "residualValue"
  | "costLimit";

export type DepreciationErrors = Partial<Record<DepreciationField, string>>;

/**
 * Every depreciation rule at once, keyed by field.
 *
 * `overrideRateApplies` is false where the rate field is disabled — a value
 * left in a field the user can't edit mustn't block the save.
 */
export function depreciationErrors(
  values: {
    effectiveLife: string;
    overrideRate: string;
    residualValue: string;
    costLimit: string;
  },
  options: {
    assetValue: number | null;
    fullWriteOff: boolean;
    overrideRateApplies: boolean;
  },
): DepreciationErrors {
  const errors: DepreciationErrors = {};
  const life = effectiveLifeError(values.effectiveLife, options.fullWriteOff);
  if (life) errors.effectiveLife = life;
  if (options.overrideRateApplies) {
    const rate = overrideRateError(values.overrideRate);
    if (rate) errors.overrideRate = rate;
  }
  const residual =
    depreciationAmountError(values.residualValue, "Residual value", options.assetValue) ??
    residualVsCostLimitError(values.residualValue, values.costLimit);
  if (residual) errors.residualValue = residual;
  const limit = depreciationAmountError(values.costLimit, "Cost limit", options.assetValue);
  if (limit) errors.costLimit = limit;
  return errors;
}

/* ------------------------------------------------------------------ *
 * Insurance
 * ------------------------------------------------------------------ */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Digits plus the separators people actually type: + ( ) - . and spaces. */
const PHONE_ALLOWED_CHARS = /^[+\d\s().-]+$/;
export const PHONE_MIN_DIGITS = 7;
export const PHONE_MAX_DIGITS = 15;

/** Drops anything a phone number can't contain, as it's typed. */
export function stripNonPhoneChars(value: string): string {
  return value.replace(/[^+\d\s().-]/g, "");
}

export function requiredError(value: string, label: string): string | null {
  return String(value ?? "").trim() ? null : `${label} is required`;
}

/** Optional; when given, it has to look like an email address. */
export function emailError(value: string): string | null {
  const email = value.trim();
  if (!email) return null;
  return EMAIL_PATTERN.test(email) ? null : "Enter a valid email address";
}

/** Optional; when given, 7–15 digits once the separators are stripped. */
export function phoneError(value: string): string | null {
  const phone = value.trim();
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "").length;
  return PHONE_ALLOWED_CHARS.test(phone) &&
    digits >= PHONE_MIN_DIGITS &&
    digits <= PHONE_MAX_DIGITS
    ? null
    : `Enter a valid phone number (${PHONE_MIN_DIGITS}–${PHONE_MAX_DIGITS} digits)`;
}

/** Coverage or premium: a number of 0 or more (the backend's wording). */
export function insuranceAmountError(
  value: string,
  label: "Coverage amount" | "Premium amount",
): string | null {
  const amount = parseTypedNumber(value);
  if (amount === null) return null;
  return Number.isNaN(amount) || amount < 0
    ? `${label} must be a valid non-negative number`
    : null;
}

/** The end date can't come before the start; the same day is a valid term. */
export function insuranceEndDateError(
  startDate: string,
  endDate: string,
): string | null {
  if (!startDate || !endDate) return null;
  return endDate < startDate
    ? "End date must be on or after the start date"
    : null;
}

export type InsuranceField =
  | "insurerName"
  | "policyNumber"
  | "insurerEmail"
  | "brokerPhone"
  | "coverageAmount"
  | "premiumAmount"
  | "startDate"
  | "endDate";

export type InsuranceErrors = Partial<Record<InsuranceField, string>>;

/** The fields the backend refuses to save without, in on-screen order. */
export const REQUIRED_INSURANCE_FIELDS: Record<
  "insurerName" | "policyNumber" | "coverageAmount" | "startDate" | "endDate",
  string
> = {
  insurerName: "Insurer name",
  policyNumber: "Policy number",
  coverageAmount: "Coverage amount",
  startDate: "Start date",
  endDate: "End date",
};

/** Every insurance rule at once, keyed by field — mirrors `validateInsurance`. */
export function insuranceErrors(values: {
  insurerName: string;
  policyNumber: string;
  insurerEmail: string;
  brokerPhone: string;
  coverageAmount: string;
  premiumAmount: string;
  startDate: string;
  endDate: string;
}): InsuranceErrors {
  const errors: InsuranceErrors = {};
  for (const [field, label] of Object.entries(REQUIRED_INSURANCE_FIELDS) as [
    keyof typeof REQUIRED_INSURANCE_FIELDS,
    string,
  ][]) {
    const missing = requiredError(values[field], label);
    if (missing) errors[field] = missing;
  }
  const coverage = insuranceAmountError(values.coverageAmount, "Coverage amount");
  if (coverage) errors.coverageAmount ??= coverage;
  const premium = insuranceAmountError(values.premiumAmount, "Premium amount");
  if (premium) errors.premiumAmount = premium;
  const endDate = insuranceEndDateError(values.startDate, values.endDate);
  if (endDate) errors.endDate ??= endDate;
  const email = emailError(values.insurerEmail);
  if (email) errors.insurerEmail = email;
  const phone = phoneError(values.brokerPhone);
  if (phone) errors.brokerPhone = phone;
  return errors;
}
