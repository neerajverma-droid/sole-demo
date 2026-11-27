/**
 * Country configuration for the demo (Australia and New Zealand).
 *
 * Values mirror sole-ocr's country registry (`src/services/country/
 * fallback-countries.json`) so the demo's tax rate, labels, identifiers, bank
 * format, fiscal year and feature switches match the live product. The only
 * invented parts are the sample places and the fictional demo identifiers.
 */

import type { DemoCountry } from "./industries/types";
import { hashString } from "./util";

export interface DemoPlace {
  city: string;
  region: string;
  postcode: string;
  /** A made-up street address in that place. */
  street: string;
}

export interface DemoCountryConfig {
  iso2: DemoCountry;
  name: string;
  currency: string;
  currencySymbol: string;
  locale: string;
  timezone: string;
  phoneDialCode: string;
  callingPrefix: string;
  taxName: string;
  taxRate: number;
  taxAuthority: string;
  taxAuthorityLabel: string;
  returnName: string;
  returnLong: string;
  businessIdLabel: string;
  taxIdLabel: string;
  /** Fictional, format-valid identifiers used for the demo business. */
  businessId: string;
  taxId: string;
  fiscalYearStartMonth: number;
  fiscalYearStartDay: number;
  filingFrequency: string;
  filingFrequencies: string[];
  bankFeed: { key: string; name: string; available: boolean };
  /** Retirement-saving scheme the payroll uses. */
  retirementScheme: string;
  retirementFunds: string[];
  /** Statutory per-km rate for the km tracker (demo value). */
  kmRate: number;
  bankName: string;
  /** A made-up account for invoices: BSB + number (AU) or one account number (NZ). */
  bank: { bsb: string | null; accountNumber: string };
  regionLabel: string;
  places: DemoPlace[];
  /** Shared supplier names every business gets (telco, fuel, insurance, office). */
  shared: { telco: string; fuel: string; insurance: string; office: string };
  /** Registry feature switches (`GET /country-context` → `features`). */
  features: Record<string, boolean>;
  /** Plain `labels` object the documents and reports render from. */
  labels: Record<string, string | null>;
  aiContext: string;
}

const AU: DemoCountryConfig = {
  iso2: "AU",
  name: "Australia",
  currency: "AUD",
  currencySymbol: "$",
  locale: "en-AU",
  timezone: "Australia/Sydney",
  phoneDialCode: "+61",
  callingPrefix: "04",
  taxName: "GST",
  taxRate: 10,
  taxAuthority: "ATO",
  taxAuthorityLabel: "ATO",
  returnName: "BAS",
  returnLong: "Business Activity Statement",
  businessIdLabel: "ABN",
  taxIdLabel: "ABN",
  businessId: "51 824 753 556",
  taxId: "51 824 753 556",
  fiscalYearStartMonth: 7,
  fiscalYearStartDay: 1,
  filingFrequency: "quarterly",
  filingFrequencies: ["monthly", "quarterly", "annual"],
  bankFeed: { key: "fiskil", name: "Fiskil", available: true },
  retirementScheme: "Superannuation",
  retirementFunds: [
    "AustralianSuper",
    "Hostplus",
    "Australian Retirement Trust (ART)",
    "Aware Super",
    "CBUS Super",
    "Rest Super",
  ],
  kmRate: 0.88,
  bankName: "Coastal Community Bank",
  bank: { bsb: "484-799", accountNumber: "10492831" },
  regionLabel: "State",
  places: [
    { city: "Brisbane", region: "QLD", postcode: "4000", street: "22 Albert Street" },
    { city: "Sydney", region: "NSW", postcode: "2000", street: "140 Clarence Street" },
    { city: "Melbourne", region: "VIC", postcode: "3000", street: "75 Collins Street" },
    { city: "Perth", region: "WA", postcode: "6000", street: "30 St Georges Terrace" },
    { city: "Adelaide", region: "SA", postcode: "5000", street: "18 King William Street" },
    { city: "Gold Coast", region: "QLD", postcode: "4217", street: "14 Ferry Road" },
    { city: "Newcastle", region: "NSW", postcode: "2300", street: "9 Hunter Street" },
    { city: "Hobart", region: "TAS", postcode: "7000", street: "41 Elizabeth Street" },
  ],
  shared: { telco: "Telstra", fuel: "Ampol", insurance: "Tradie Insurance Co", office: "Officeworks" },
  features: {
    ndis: true,
    super_contributions: true,
    payto: true,
    income_tax_estimator: true,
    investment_property: true,
    km_statutory_rate: true,
    worldpay: true,
    bank_feeds: true,
  },
  labels: {
    tax: "GST",
    tax_invoice: "Tax Invoice",
    tax_quote: "Tax Quote",
    tax_return: "BAS",
    tax_return_long: "Business Activity Statement",
    tax_authority: "ATO",
    business_id: "ABN",
    tax_id: "ABN",
    bank_branch: "BSB",
    tax_free: "GST free",
    tax_inclusive: "Inc GST",
    tax_exclusive: "Ex GST",
  },
  aiContext:
    "This is an Australian business. Sales tax is GST at 10%, reported on the BAS. Currency is AUD. Use Australian English.",
};

const NZ: DemoCountryConfig = {
  iso2: "NZ",
  name: "New Zealand",
  currency: "NZD",
  currencySymbol: "NZ$",
  locale: "en-NZ",
  timezone: "Pacific/Auckland",
  phoneDialCode: "+64",
  callingPrefix: "021",
  taxName: "GST",
  taxRate: 15,
  taxAuthority: "IRD",
  taxAuthorityLabel: "Inland Revenue",
  returnName: "GST return",
  returnLong: "GST return (GST101A)",
  businessIdLabel: "NZBN",
  taxIdLabel: "GST number",
  businessId: "9429041234567",
  taxId: "123-456-789",
  fiscalYearStartMonth: 4,
  fiscalYearStartDay: 1,
  filingFrequency: "bimonthly",
  filingFrequencies: ["monthly", "bimonthly", "sixmonthly"],
  bankFeed: { key: "akahu", name: "Akahu", available: true },
  retirementScheme: "KiwiSaver",
  retirementFunds: [
    "Milford KiwiSaver",
    "Fisher Funds KiwiSaver",
    "Booster KiwiSaver",
    "Kiwi Wealth KiwiSaver",
    "Generate KiwiSaver",
    "ANZ KiwiSaver",
  ],
  kmRate: 1.17,
  bankName: "Harbour Community Bank",
  bank: { bsb: null, accountNumber: "03-1234-0567890-00" },
  regionLabel: "Region",
  places: [
    { city: "Auckland", region: "Auckland", postcode: "1010", street: "22 Queen Street" },
    { city: "Wellington", region: "Wellington", postcode: "6011", street: "60 Lambton Quay" },
    { city: "Christchurch", region: "Canterbury", postcode: "8011", street: "35 Colombo Street" },
    { city: "Hamilton", region: "Waikato", postcode: "3204", street: "18 Victoria Street" },
    { city: "Tauranga", region: "Bay of Plenty", postcode: "3110", street: "12 Devonport Road" },
    { city: "Dunedin", region: "Otago", postcode: "9016", street: "44 George Street" },
    { city: "Napier", region: "Hawke's Bay", postcode: "4110", street: "7 Emerson Street" },
    { city: "Nelson", region: "Nelson", postcode: "7010", street: "16 Trafalgar Street" },
  ],
  shared: { telco: "Spark", fuel: "Z Energy", insurance: "Trade Cover Insurance", office: "Warehouse Stationery" },
  // Switched off for NZ in the registry — the matching screens must stay hidden.
  features: {
    ndis: false,
    super_contributions: false,
    payto: false,
    income_tax_estimator: false,
    investment_property: false,
    km_statutory_rate: true,
    worldpay: false,
    bank_feeds: false,
  },
  labels: {
    tax: "GST",
    tax_invoice: "Tax Invoice",
    tax_quote: "Tax Quote",
    tax_return: "GST return",
    tax_return_long: "GST return (GST101A)",
    tax_authority: "Inland Revenue",
    business_id: "NZBN",
    tax_id: "GST number",
    bank_branch: null,
    tax_free: "Zero-rated",
    tax_inclusive: "Incl GST",
    tax_exclusive: "Excl GST",
  },
  aiContext:
    "This is a New Zealand business. Sales tax is GST at 15%, administered by Inland Revenue and reported on the GST return (GST101A). Currency is NZD. Use New Zealand English.",
};

export const DEMO_COUNTRIES: Record<DemoCountry, DemoCountryConfig> = { AU, NZ };

export function getCountryConfig(country: DemoCountry): DemoCountryConfig {
  return DEMO_COUNTRIES[country];
}

export function parseDemoCountry(value: string | null | undefined): DemoCountry | null {
  const v = (value ?? "").trim().toUpperCase();
  return v === "AU" || v === "NZ" ? v : null;
}

/** A stable place for a given industry slug, so a demo is the same every visit. */
export function placeFor(country: DemoCountry, key: string): DemoPlace {
  const places = DEMO_COUNTRIES[country].places;
  return places[hashString(key) % places.length];
}

/** Format a made-up mobile number for the country. */
export function demoPhone(country: DemoCountry, n: number): string {
  const digits = String(1000000 + ((n * 7919) % 8999999));
  return country === "AU"
    ? `04${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`
    : `021 ${digits.slice(0, 3)} ${digits.slice(3)}`;
}

/** First day of the fiscal year containing `today`, as YYYY-MM-DD, plus label parts. */
export function fiscalYearFor(cfg: DemoCountryConfig, today: string) {
  const [y, m] = today.split("-").map(Number);
  const startYear = m >= cfg.fiscalYearStartMonth ? y : y - 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${startYear}-${pad(cfg.fiscalYearStartMonth)}-${pad(cfg.fiscalYearStartDay)}`;
  const end = new Date(Date.UTC(startYear + 1, cfg.fiscalYearStartMonth - 1, cfg.fiscalYearStartDay - 1))
    .toISOString()
    .slice(0, 10);
  const startShort = String(startYear).slice(2);
  const endShort = String(startYear + 1).slice(2);
  return {
    label: `FY${endShort}`,
    longLabel: `FY${startShort}/${endShort}`,
    startDate: start,
    endDate: end,
  };
}

/** Filing period (calendar quarter for AU, two-month for NZ) containing `today`. */
export function filingPeriodFor(cfg: DemoCountryConfig, today: string, offset = 0) {
  const [y, m] = today.split("-").map(Number);
  const span = cfg.filingFrequency === "bimonthly" ? 2 : 3;
  const idx = Math.floor((m - 1) / span) + offset;
  const startMonthIdx = idx * span;
  const start = new Date(Date.UTC(y, startMonthIdx, 1));
  const end = new Date(Date.UTC(y, startMonthIdx + span, 0));
  const due = new Date(Date.UTC(y, startMonthIdx + span, cfg.iso2 === "AU" ? 28 : 28));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const monthName = (d: Date) => d.toLocaleString("en-AU", { month: "short", timeZone: "UTC" });
  return {
    code: `${start.getUTCFullYear()}-P${(idx % (12 / span)) + 1}`,
    label: `${monthName(start)} – ${monthName(end)} ${end.getUTCFullYear()}`,
    start_date: fmt(start),
    end_date: fmt(end),
    due_date: fmt(due),
  };
}
