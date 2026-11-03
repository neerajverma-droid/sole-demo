import {
  PiggyBank,
  Shield,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * The tax estimator.
 *
 * An estimate, and the module says so in more than the disclaimer: every rate
 * and threshold below is a named constant with the year it came from, because
 * the one thing worse than an approximate tax figure is an approximate tax
 * figure nobody can audit. Anyone checking this against the ATO's tables should
 * be able to find each number in one place and see what it's doing.
 *
 * Not tax advice, and not a lodgement. It answers "roughly how much should I
 * put aside", which is the question a sole trader actually asks in March.
 */

/* ------------------------------------------------------------------ *
 * Rates and thresholds
 * ------------------------------------------------------------------ */

/**
 * Resident individual rates, in force from 1 July 2024.
 *
 * Unchanged across every year this page offers, which is why the year picker
 * doesn't switch bracket sets — a table keyed by year whose rows were all
 * identical would imply a precision this doesn't have.
 */
const BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 18_200, rate: 0 },
  { upTo: 45_000, rate: 0.16 },
  { upTo: 135_000, rate: 0.3 },
  { upTo: 190_000, rate: 0.37 },
  { upTo: Infinity, rate: 0.45 },
];

/** Base rate entity company tax. A company pays this flat and no levy. */
const COMPANY_RATE = 0.25;

/** The individual CGT discount, on gains held over twelve months. */
const CGT_DISCOUNT = 0.5;

/** Concessional contributions cap — the most a personal contribution can claim. */
const CONCESSIONAL_CAP = 30_000;

const MEDICARE_RATE = 0.02;
/** Below this the levy is nil; between the two it shades in at 10c per $1. */
const MEDICARE_NIL_THRESHOLD = 27_222;
const MEDICARE_FULL_THRESHOLD = 34_027;
const MEDICARE_SHADE_RATE = 0.1;

/**
 * Medicare levy surcharge tiers, by whether there's a spouse.
 *
 * Two explicit tables rather than one plus arithmetic: the family thresholds
 * aren't exactly double the single ones at every tier, and a formula that
 * looked like they were would be wrong in a way nobody would spot.
 */
const SURCHARGE_TIERS = {
  single: [
    { upTo: 97_000, rate: 0 },
    { upTo: 113_000, rate: 0.01 },
    { upTo: 151_000, rate: 0.0125 },
    { upTo: Infinity, rate: 0.015 },
  ],
  family: [
    { upTo: 194_000, rate: 0 },
    { upTo: 226_000, rate: 0.01 },
    { upTo: 302_000, rate: 0.0125 },
    { upTo: Infinity, rate: 0.015 },
  ],
} as const;

/** Low income tax offset: $700, withdrawn in two stages. */
const LITO_MAX = 700;
const LITO_FULL_UP_TO = 37_500;
const LITO_FIRST_TAPER = { upTo: 45_000, rate: 0.05 };
const LITO_SECOND_TAPER = { upTo: 66_667, rate: 0.015 };

/* ------------------------------------------------------------------ *
 * The form
 * ------------------------------------------------------------------ */

export const ENTITY_TYPES = [
  "Sole Trader",
  "Company",
  "Partnership",
  "Trust",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

/**
 * Which years the picker offers, newest first.
 *
 * Labelled with an en dash because that's a span of years, not a subtraction.
 * The number beside each is the financial year it ends in, which is what
 * `financialYearOf` in the transactions module returns — so "pull from
 * transactions" can filter the feed without a second convention for naming
 * years.
 */
export const TAX_YEARS = [
  { label: "2026–2027", endsIn: 2027 },
  { label: "2025–2026", endsIn: 2026 },
  { label: "2024–2025", endsIn: 2025 },
] as const;

export type TaxYearLabel = (typeof TAX_YEARS)[number]["label"];

export const TAX_STEPS = [
  {
    id: "income",
    nav: "Income",
    title: "Income",
    subtitle:
      "Enter your details for this financial year to calculate your taxable income.",
    icon: Wallet as LucideIcon,
  },
  {
    id: "gains",
    nav: "Capital Gains",
    title: "Capital gains",
    subtitle: "Did you have any capital gains or losses this year?",
    icon: TrendingUp as LucideIcon,
  },
  {
    id: "super",
    nav: "Superannuation",
    title: "Superannuation",
    subtitle:
      "Did you make any after-tax personal super contributions this financial year?",
    icon: PiggyBank as LucideIcon,
  },
  {
    id: "medicare",
    nav: "Medicare Levy",
    title: "Medicare levy",
    subtitle: "Did you have a spouse this financial year?",
    icon: Shield as LucideIcon,
  },
] as const;

export type TaxStepId = (typeof TAX_STEPS)[number]["id"];

/**
 * The form's values, as typed text.
 *
 * Strings rather than numbers, for the platform's rule about money fields: a
 * field holds what was typed and shows an error beside it, rather than
 * swallowing keystrokes that don't parse. `amount` below is the one place text
 * becomes a figure, so every part of the estimate reads the same interpretation
 * of "3,000." and "".
 */
export type TaxDraft = {
  year: TaxYearLabel;
  entityType: EntityType;

  revenue: string;
  expenses: string;
  additionalIncome: string;
  additionalDeductions: string;
  additionalDepreciation: string;
  capitalWorksDeduction: string;
  nonDeductibleAddBacks: string;
  paygInstalments: string;

  hasCapitalGains: boolean;
  capitalGains: string;
  capitalLosses: string;
  cgtDiscount: boolean;

  madeSuperContributions: boolean;
  superContributions: string;
  superTaxableIncome: string;

  hasSpouse: boolean;
  spouseIncome: string;
  medicareExempt: boolean;
  privateHealth: boolean;
};

export const EMPTY_TAX_DRAFT: TaxDraft = {
  year: TAX_YEARS[0].label,
  entityType: "Sole Trader",

  revenue: "",
  expenses: "",
  additionalIncome: "",
  additionalDeductions: "",
  additionalDepreciation: "",
  capitalWorksDeduction: "",
  nonDeductibleAddBacks: "",
  paygInstalments: "",

  hasCapitalGains: false,
  capitalGains: "",
  capitalLosses: "",
  cgtDiscount: false,

  madeSuperContributions: false,
  superContributions: "",
  superTaxableIncome: "",

  hasSpouse: false,
  spouseIncome: "",
  medicareExempt: false,
  privateHealth: false,
};

/**
 * Typed text as a figure.
 *
 * Commas and a leading dollar sign are stripped because people type them.
 * Anything that still doesn't parse is zero rather than NaN, which is what
 * keeps an in-progress "1." from turning the whole panel into "$NaN" while
 * someone is mid-keystroke — the panel updates live, so every intermediate
 * state of every field is a state it has to render.
 *
 * Negatives are floored at zero. Every field on this form is a magnitude, and a
 * negative expense is a way of entering income by accident.
 */
export function amount(text: string): number {
  const parsed = Number.parseFloat(text.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

/** Whether the two required income fields have something in them. */
export function incomeComplete(draft: TaxDraft): boolean {
  return draft.revenue.trim() !== "" && draft.expenses.trim() !== "";
}

/* ------------------------------------------------------------------ *
 * The estimate
 * ------------------------------------------------------------------ */

export type TaxEstimate = {
  /** Income section, as the panel lists it. */
  revenue: number;
  expenses: number;
  additionalIncome: number;
  additionalDeductions: number;
  depreciation: number;
  capitalWorksDeduction: number;
  nonDeductibleAddBacks: number;
  netCapitalGain: number;

  /** Superannuation. */
  superContributions: number;
  taxableContributions: number;
  nonTaxableContributions: number;

  /** Taxable income and the tax on it. */
  taxableIncome: number;
  taxOnTaxableIncome: number;
  marginalRate: number;

  /** Medicare. */
  spouseIncome: number;
  medicareLevy: number;
  medicareSurcharge: number;

  lowIncomeOffset: number;
  paygInstalments: number;

  /**
   * What's left to pay. Signed: PAYG instalments larger than the liability mean
   * a refund, and clamping that to zero would be the estimator quietly keeping
   * the good news to itself.
   */
  estimatedTaxPayable: number;
};

/** Tax on an amount, walked bracket by bracket. */
function taxOn(income: number): number {
  let tax = 0;
  let lower = 0;
  for (const bracket of BRACKETS) {
    if (income <= lower) break;
    tax += (Math.min(income, bracket.upTo) - lower) * bracket.rate;
    lower = bracket.upTo;
  }
  return tax;
}

/** The rate the next dollar would be taxed at. */
function marginalRateOn(income: number): number {
  return BRACKETS.find((bracket) => income <= bracket.upTo)?.rate ?? 0;
}

function medicareLevyOn(income: number): number {
  if (income <= MEDICARE_NIL_THRESHOLD) return 0;
  if (income <= MEDICARE_FULL_THRESHOLD) {
    return (income - MEDICARE_NIL_THRESHOLD) * MEDICARE_SHADE_RATE;
  }
  return income * MEDICARE_RATE;
}

/**
 * The surcharge, which is charged on your own income at a rate set by the
 * household's. That's the part worth being explicit about: a spouse's income
 * moves you up the tiers without itself being surcharged here.
 */
function surchargeOn(income: number, householdIncome: number, family: boolean) {
  const tiers = family ? SURCHARGE_TIERS.family : SURCHARGE_TIERS.single;
  const rate =
    tiers.find((tier) => householdIncome <= tier.upTo)?.rate ??
    tiers[tiers.length - 1].rate;
  return income * rate;
}

function litoOn(income: number): number {
  if (income <= LITO_FULL_UP_TO) return LITO_MAX;
  if (income <= LITO_FIRST_TAPER.upTo) {
    return LITO_MAX - (income - LITO_FULL_UP_TO) * LITO_FIRST_TAPER.rate;
  }
  if (income <= LITO_SECOND_TAPER.upTo) {
    const afterFirst =
      LITO_MAX -
      (LITO_FIRST_TAPER.upTo - LITO_FULL_UP_TO) * LITO_FIRST_TAPER.rate;
    return Math.max(
      0,
      afterFirst - (income - LITO_FIRST_TAPER.upTo) * LITO_SECOND_TAPER.rate,
    );
  }
  return 0;
}

/**
 * The whole estimate, from the form as it currently stands.
 *
 * Pure, and called on every keystroke — the results panel is live, so this runs
 * far more often than a form usually recalculates. It's arithmetic over a dozen
 * numbers, so that's fine, and being pure is what makes "type a digit, watch
 * the figure move" trustworthy rather than eventually consistent.
 */
export function estimateTax(draft: TaxDraft): TaxEstimate {
  const company = draft.entityType === "Company";

  const revenue = amount(draft.revenue);
  const expenses = amount(draft.expenses);
  const additionalIncome = amount(draft.additionalIncome);
  const additionalDeductions = amount(draft.additionalDeductions);
  const depreciation = amount(draft.additionalDepreciation);
  const capitalWorksDeduction = amount(draft.capitalWorksDeduction);
  const nonDeductibleAddBacks = amount(draft.nonDeductibleAddBacks);
  const paygInstalments = amount(draft.paygInstalments);

  /*
   * Capital gains. Losses offset gains and no further: a net capital loss is
   * carried forward against future gains rather than deducted against income,
   * so it can't push the figure below zero here.
   *
   * The discount is an individual concession — a company gets none — which is
   * why the toggle can be on and still do nothing once Company is selected.
   */
  const grossGain = draft.hasCapitalGains
    ? Math.max(0, amount(draft.capitalGains) - amount(draft.capitalLosses))
    : 0;
  const netCapitalGain =
    draft.hasCapitalGains && draft.cgtDiscount && !company
      ? grossGain * (1 - CGT_DISCOUNT)
      : grossGain;

  /*
   * Personal contributions, split at the concessional cap. The part within the
   * cap is what a notice of intent can claim, so it's the taxable part — taxed
   * in the fund rather than here, and deducted from income below. The rest is
   * non-concessional: already taxed, and neither deductible nor counted again.
   */
  const superContributions = draft.madeSuperContributions
    ? amount(draft.superContributions)
    : 0;
  const taxableContributions = Math.min(superContributions, CONCESSIONAL_CAP);
  const nonTaxableContributions = superContributions - taxableContributions;

  const beforeSuper = Math.max(
    0,
    revenue +
      additionalIncome -
      expenses -
      additionalDeductions -
      depreciation -
      capitalWorksDeduction +
      nonDeductibleAddBacks +
      netCapitalGain,
  );

  /*
   * A deduction can't exceed the income it's claimed against. The declared
   * figure from the super step wins when it's been filled in — it's the number
   * the person is telling us to test the claim against — and the derived one
   * stands in when it hasn't.
   */
  const declared = amount(draft.superTaxableIncome);
  const superDeduction = Math.min(
    taxableContributions,
    declared > 0 ? declared : beforeSuper,
  );

  const taxableIncome = Math.max(0, beforeSuper - superDeduction);

  const taxOnTaxableIncome = company
    ? taxableIncome * COMPANY_RATE
    : taxOn(taxableIncome);
  const marginalRate = company ? COMPANY_RATE : marginalRateOn(taxableIncome);

  /*
   * Medicare is a personal levy. A company doesn't pay it, and neither does
   * someone holding an exemption — so both of those zero the levy and the
   * surcharge together rather than one each.
   */
  const spouseIncome = draft.hasSpouse ? amount(draft.spouseIncome) : 0;
  const personal = !company && !draft.medicareExempt;

  const medicareLevy = personal ? medicareLevyOn(taxableIncome) : 0;
  const medicareSurcharge =
    personal && !draft.privateHealth
      ? surchargeOn(
          taxableIncome,
          taxableIncome + spouseIncome,
          draft.hasSpouse,
        )
      : 0;

  const lowIncomeOffset = company ? 0 : litoOn(taxableIncome);

  /*
   * The offset can only wipe out tax, not the levy — it's a rebate against the
   * income tax line, so it stops at zero there rather than eating into
   * Medicare. Getting that order wrong is how an estimator shows a refund
   * nobody is owed.
   */
  const afterOffset = Math.max(0, taxOnTaxableIncome - lowIncomeOffset);

  return {
    revenue,
    expenses,
    additionalIncome,
    additionalDeductions,
    depreciation,
    capitalWorksDeduction,
    nonDeductibleAddBacks,
    netCapitalGain,
    superContributions,
    taxableContributions,
    nonTaxableContributions,
    taxableIncome,
    taxOnTaxableIncome,
    marginalRate,
    spouseIncome,
    medicareLevy,
    medicareSurcharge,
    lowIncomeOffset,
    paygInstalments,
    estimatedTaxPayable:
      afterOffset + medicareLevy + medicareSurcharge - paygInstalments,
  };
}

/** "30%", for the marginal rate subtext. */
export function ratePercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
