/**
 * Who the demo visitor is: the user, the business, the country context and the
 * feature switches, all derived from the active Story.
 *
 * For the default story (Coastal Spark Electrical, AU) these produce exactly
 * the objects the mock served before industries existed.
 */

import { fiscalYearFor, filingPeriodFor, getCountryConfig } from "./country";
import type { DemoModule } from "./industries/types";
import { businessLogo } from "./logo";
import type { Story } from "./story";

/** Always on, whatever the industry. */
const CORE_FEATURES = [
  "dashboard",
  "sales",
  "expenses",
  "assets",
  "contacts",
  "resources",
  "referral",
  "community",
  "perks",
  "settings",
  "support",
  "education",
  "reporting",
  "migrations",
  "transactions",
  "liabilities",
  "equity",
  "reputation",
];

/** Module → the product features it switches on. */
const MODULE_FEATURES: Record<DemoModule, string[]> = {
  projects: ["projects", "time-tracking"],
  calendar: ["booking"],
  km: ["km-tracker"],
  payroll: ["payroll"],
  hr: ["time-tracking"],
  proposals: ["proposals"],
  assets: ["assets-advanced"],
  budget: [],
  inventory: ["inventory"],
};

/** Module → subscription add-on slugs (as the plan catalogue names them). */
const MODULE_ADDONS: Record<DemoModule, string[]> = {
  projects: ["project"],
  calendar: ["booking"],
  km: ["km"],
  payroll: ["payroll"],
  hr: ["time"],
  proposals: ["proposals"],
  assets: ["assets-advanced"],
  budget: [],
  inventory: ["inventory"],
};

/** Features switched off for the country in the registry never show, whatever the industry. */
export function allowedFeaturesFor(story: Story): string[] {
  const cfg = getCountryConfig(story.country);
  const out = new Set<string>(CORE_FEATURES);
  for (const mod of story.modules) for (const f of MODULE_FEATURES[mod]) out.add(f);
  if (cfg.features.income_tax_estimator) out.add("tax-estimator");
  if (cfg.features.investment_property) out.add("investment");
  return [...out];
}

export function addonsFor(story: Story): string[] {
  const cfg = getCountryConfig(story.country);
  const out = new Set<string>();
  for (const mod of story.modules) for (const a of MODULE_ADDONS[mod]) out.add(a);
  out.add("reputation");
  if (cfg.features.income_tax_estimator) out.add("tax-estimator");
  if (cfg.features.investment_property) out.add("investment");
  return [...out];
}

/** "accounts.coastalspark@example.com" → "coastalspark", for tokens and ids. */
export function businessKey(story: Story): string {
  return story.business.email.split("@")[0].replace(/^accounts\./, "");
}

export function ownerFullName(story: Story): string {
  return `${story.business.owner.first_name} ${story.business.owner.last_name}`;
}

export function compactPhone(story: Story): string {
  return story.business.phone.replace(/\s+/g, "");
}

export function buildDemoUser(story: Story, expiresAt?: string) {
  const cfg = getCountryConfig(story.country);
  const biz = story.business;
  const key = businessKey(story);
  return {
    user_id: 1,
    id: 1,
    email: biz.email,
    user_email: biz.email,
    first_name: biz.owner.first_name,
    last_name: biz.owner.last_name,
    full_name: ownerFullName(story),
    business_name: biz.name,
    role: "Owner",
    is_demo: true,
    account_verified: 1,
    plan: "pro",
    has_password: true,
    trial_active: false,
    is_first_login: false,
    is_onboarding_skipped: 1,
    is_transaction_present: 1,
    token: `demo_${key}_session_token`,
    refresh_token: `demo_${key}_refresh_token`,
    demo_expires_at: expiresAt ?? new Date(Date.now() + 86400000).toISOString(),
    demo_industry: story.slug,
    demo_country: story.country,
    // The industry is already known, and the one-time onboarding survey ("Please select your
    // industry…") is marked seen, so a prospect is never asked what the demo already knows.
    industry_id: biz.industry_id,
    join_from: "demo",
    business_config: { "1": { popups: { onboarding_survey: true } } },
    business_id: 1,
    businesses: [
      {
        id: 1,
        business_name: biz.name,
        email: biz.email,
        abn: biz.abn,
        country_iso2: cfg.iso2,
        currency: cfg.currency,
        currency_symbol: cfg.currencySymbol,
        timezone: biz.timezone,
        tax_registered: 1,
        accounting_type: "cash",
      },
    ],
  };
}

export function buildApiBusiness(story: Story) {
  const cfg = getCountryConfig(story.country);
  const biz = story.business;
  const a = biz.address;
  return {
    id: 1,
    business_name: biz.name,
    company_name: biz.name,
    first_name: biz.owner.first_name,
    last_name: biz.owner.last_name,
    business_email: biz.email,
    email: biz.email,
    abn: biz.abn,
    business_registration_number: biz.abn,
    tax_registration_number: biz.tax_id,
    is_default: true,
    requires_payment: false,
    is_locked: false,
    payment_status: "paid",
    subscription_status: "active",
    is_payroll_enabled: story.modules.includes("payroll") || story.modules.includes("hr") ? 1 : 0,
    payroll_enabled: story.modules.includes("payroll") || story.modules.includes("hr") ? 1 : 0,
    logo: businessLogo(story),
    subscription: {
      status: "active",
      plan_slug: "pro",
      plan_name: "Sole Pro Plan",
      plan_interval: "monthly",
      monthly_price: 29,
      effective_monthly_price: 29,
      discount_percent: 0,
      is_trial: false,
      trial_end: "",
      current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
      addons: addonsFor(story),
    },
    industry_id: biz.industry_id,
    industry: biz.industry,
    timezone: biz.timezone,
    // An NDIS provider's 9-digit registration number, so its invoices can print it (sample value).
    ndis_no: biz.industry_id === 9 && cfg.features.ndis ? "430012345" : "",
    accounting_type: "cash",
    company_type: "Sole Trader",
    country_iso2: cfg.iso2,
    country_code: cfg.phoneDialCode,
    mobile_no: biz.phone,
    phone: biz.phone,
    bank_name: biz.bank_name,
    bsb: biz.bsb,
    account_holder: biz.account_holder,
    account_number: biz.account_number,
    show_bank_detail_invoice: 1,
    address: `${a.line1}, ${a.city} ${a.state} ${a.postcode}, ${a.country}`,
    address_line1: a.line1,
    city: a.city,
    state: a.state,
    postcode: a.postcode,
    country: a.country,
    website: biz.website,
    documents: [],
  };
}

/* -------------------------------------------------------------------------- *
 * GET /country-context — what the open business's country decides.
 * Shaped like sole-ocr's response; mapped by lib/country-context.ts.
 * -------------------------------------------------------------------------- */

const NZ_REGIONS = [
  "Auckland", "Bay of Plenty", "Canterbury", "Gisborne", "Hawke's Bay", "Manawatū-Whanganui",
  "Marlborough", "Nelson", "Northland", "Otago", "Southland", "Taranaki", "Tasman", "Waikato",
  "Wellington", "West Coast",
];

export function buildCountryContextRaw(story: Story, today: string = new Date().toISOString().slice(0, 10)) {
  const cfg = getCountryConfig(story.country);
  const isAU = cfg.iso2 === "AU";

  const identifier_schema = isAU
    ? [{ key: "business_registration_number", label: "ABN", required: true, pattern: "^\\d{11}$", validator: "abn_mod89", mask: "99 999 999 999" }]
    : [
        { key: "business_registration_number", label: "NZBN", required: false, pattern: "^\\d{13}$", validator: "nzbn_gs1", placeholder: "9429041234567" },
        { key: "tax_registration_number", label: "GST number", required_if: "tax_registered", pattern: "^\\d{8,9}$", validator: "nz_ird_mod11", mask: "999-999-999" },
      ];

  const bank_account_schema = isAU
    ? [
        { key: "bsb", label: "BSB", required: true, pattern: "^\\d{3}-?\\d{3}$", mask: "999-999" },
        { key: "account_number", label: "Account number", required: true, pattern: "^\\d{6,10}$" },
      ]
    : [{ key: "account_number", label: "Account number", required: true, pattern: "^\\d{2}-?\\d{4}-?\\d{7}-?\\d{2,3}$", mask: "99-9999-9999999-999", validator: "nz_bank_account" }];

  // AU relies on the app's bundled fallback forms; NZ sends its own region list and NZBN field.
  const forms = isAU
    ? {}
    : {
        contact: {
          fields: [
            { key: "ABN", ref: "business_registration_number", type: "identifier", label: "NZBN", pattern: "^\\d{13}$", validator: "nzbn_gs1", input_mode: "numeric" },
            { key: "currency", type: "currency", label: "Currency", required: true, default: cfg.currency, options_source: "exchange_rates" },
          ],
        },
        address: {
          fields: [
            { key: "country", type: "country", label: "Country", locked: true, value: cfg.name, iso2: cfg.iso2, place_restrictions: ["nz"] },
            { key: "state", type: "region", label: "Region", options: NZ_REGIONS },
            { key: "postcode", type: "postcode", label: "Postcode", pattern: "^\\d{4}$" },
          ],
        },
      };

  const fy = fiscalYearFor(cfg, today);
  return {
    country_iso2: cfg.iso2,
    country_name: cfg.name,
    currency: cfg.currency,
    currency_symbol: cfg.currencySymbol,
    locale: cfg.locale,
    timezone: story.business.timezone,
    phone_dial_code: cfg.phoneDialCode,
    tax: {
      type: cfg.taxName,
      authority: cfg.taxAuthorityLabel,
      registered: true,
      standard_rate: cfg.taxRate,
      standard_code: cfg.taxName,
      rates: [
        {
          tax_code: cfg.taxName,
          name: cfg.taxName,
          category: "standard",
          rate: cfg.taxRate,
          effective_from: isAU ? "2000-07-01" : "2010-10-01",
          effective_to: null,
          is_default: true,
        },
      ],
      effective: { registered: true, enabled: true, rate: cfg.taxRate, name: cfg.taxName, source: "country", country_rate: cfg.taxRate },
    },
    fiscal_year: {
      start_month: cfg.fiscalYearStartMonth,
      start_day: cfg.fiscalYearStartDay,
      current: { label: fy.label, long_label: fy.longLabel, start_date: fy.startDate, end_date: fy.endDate },
    },
    filing: {
      frequency: cfg.filingFrequency,
      frequencies: cfg.filingFrequencies,
      return_name: cfg.returnName,
      current_period: filingPeriodFor(cfg, today, 0),
      previous_period: filingPeriodFor(cfg, today, -1),
    },
    labels: cfg.labels,
    features: cfg.features,
    identifier_schema,
    bank_account_schema,
    bank_feed: cfg.bankFeed,
    forms,
    has_identifier_lookup: false,
    registry_version: 1,
  };
}
