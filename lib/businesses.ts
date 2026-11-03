/**
 * The businesses on the account, and which one you're looking at.
 *
 * A sole trader with one business is the common case, but an accountant's client
 * list and an owner with a second venture are both real — so the product carries
 * a set and a selection rather than a single profile. What's here is the model
 * and the naming; the store keeps the selection, and scoping each page's data to
 * it is still to come.
 */

import { format, parseISO } from "date-fns";

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { contactInitials } from "@/lib/contacts";
import {
  FALLBACK_COUNTRY_CONTEXT,
  hasRequiredBankFields,
  type CountryContext,
} from "@/lib/country-context";
import { type FileFieldUpdate } from "@/lib/file-upload";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { getCountryCallingAndPhoneNumber } from "@/lib/phone";
import { PRICING_PACKAGES, type BillingCycle } from "@/lib/pricing";

/**
 * What a business is paying, once it is.
 *
 * Null until the payment step completes, which is the same fact `paid` carries —
 * kept as one nullable object rather than four optional fields so "active" and
 * "has a subscription" can't disagree.
 */
export type BusinessSubscription = {
  packageId: string;
  /** The server's own name for the plan, when it sent one. */
  planName?: string;
  cycle: BillingCycle;
  /** Per average month, as charged — the discount already applied. */
  price: number;
  /** ISO date it next renews. */
  renews: string;
};

export type BusinessProfile = {
  id: string;
  name: string;
  /** Who to reach, and the number the ATO knows it by. */
  email: string;
  abn: string;
  /**
   * The country's own numbers for the business, from the columns the registry
   * writes: ABN / NZBN / company registration, and the GST or VAT number.
   * `abn` is the legacy Australian column, kept because account settings still
   * write it; the document helpers prefer it for Australia, as the PDF does.
   */
  registrationNumber?: string;
  taxNumber?: string;
  /**
   * Whether its payment step has been completed.
   *
   * This is what locks a business, rather than a plan tier: adding one is a
   * two-step job — details, then payment — and leaving after the first step
   * leaves a real business that isn't active yet. That's a setup to finish, not
   * an upsell, which is why the lock copy says so and offers the way back in.
   */
  paid: boolean;
  /** Which fill its avatar wears — an index into `BUSINESS_TONES`. Unused once `logo` is set. */
  tone: number;
  /** The uploaded logo, shown in place of the initials avatar when present. */
  logo: string | null;
  subscription: BusinessSubscription | null;

  /*
   * The rest of the profile. The list endpoint returns the full record for
   * every business, so all of this is already in hand by the time the app has
   * loaded — no screen needs to fetch a business's detail just to read its
   * industry or its bank account.
   *
   * Everything below is optional because a business created locally (step one
   * of the add flow) has yet to be told most of it.
   */

  /** Decides whether NDIS features are available at all — 9 is Health and Social Care. */
  industryId: number | null;
  /**
   * The business's own IANA timezone (e.g. "Australia/Sydney"), set from its
   * country. History timestamps are shown in this zone so a user sees the
   * time where the business operates, not where the server or browser is.
   * Empty when unknown — formatters then fall back to the browser's zone.
   */
  timezone?: string;
  /** The provider's own NDIS registration number, printed on claims. */
  ndisNumber: string;
  /** "cash" or "accrual" — how the books are kept. */
  accountingType: string;
  /** "individual" or "business". */
  companyType: string;

  /** The account clients pay into. Required before an invoice can be raised. */
  bank: {
    bsb: string;
    accountNumber: string;
    accountHolder: string;
    bankName: string;
  };
  /**
   * Whether this business's invoices print the bank details above — the
   * business's `show_bank_detail_invoice`, which every invoice render on the
   * server (preview, PDF, email) reads. Absent means shown.
   */
  showBankDetailsOnInvoice?: boolean;

  /** Trading address, as the invoice prints it. */
  address: {
    line1: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };

  /**
   * Which country this business trades in — ISO 3166-1 alpha-2, the registry's
   * `country_iso2`.
   *
   * Not the same as `address.country`, and the two are not interchangeable:
   * this one decides the currency, the timezone, the tax label (GST vs VAT),
   * the financial-year shape and which identifier is required. The address
   * country is just a line on an envelope — a business registered in Australia
   * can post invoices from anywhere.
   *
   * Chosen once at onboarding and not editable afterwards; see
   * `lib/business-settings.ts`.
   */
  countryIso2: string;
  /** The phone dialling code, e.g. "+61". Not the country of registration. */
  countryCode: string;
  mobile: string;
  firstName: string;
  middleName: string;
  lastName: string;
  companyName: string;

  /**
   * The uploaded-documents trail. The logo's own document id lives here, which
   * is what removing a logo needs.
   */
  documents: BusinessDocument[];
};

export type BusinessDocument = {
  id: string;
  sourceType?: string;
  filePath?: string;
  fileName?: string;
};

/** The two states a business can be in, and what each is called on screen. */
export type BusinessStatus = "Active" | "Payment required";

export function businessStatus(business: BusinessProfile): BusinessStatus {
  return business.paid ? "Active" : "Payment required";
}

/**
 * "Advanced (Monthly)" — the plan and how it's billed, as one line.
 *
 * Reads the package name from the pricing catalogue rather than storing it, so
 * a tier renamed in one place doesn't leave old businesses quoting the old name.
 */
export function businessPlanLabel(business: BusinessProfile): string {
  if (!business.subscription) return "Free";
  const tier = PRICING_PACKAGES.find(
    (entry) => entry.id === business.subscription?.packageId,
  );
  const cycle = business.subscription.cycle === "annual" ? "Annual" : "Monthly";
  return `${business.subscription.planName || tier?.name || "Plan"} (${cycle})`;
}

/** "Renews 2 Oct 2026". */
export function businessRenewalLabel(business: BusinessProfile): string | null {
  if (!business.subscription?.renews) return null;
  return `Renews ${format(parseISO(business.subscription.renews), "d MMM yyyy")}`;
}

/**
 * The avatar fills.
 *
 * Solid rather than the tinted tiles used for icons, because this is an avatar:
 * it stands for a thing rather than labelling one, and a wall of 10% tints is
 * how three businesses end up looking like the same business. Built from the
 * tokens the product already uses — brand indigo, the nav's teal exception, the
 * warm money accent — so nothing new enters the palette.
 */
export const BUSINESS_TONES: string[] = [
  "bg-primary text-primary-foreground",
  "bg-teal-600 text-white dark:bg-teal-500 dark:text-teal-950",
  "bg-warm-foreground text-warm",
  "bg-foreground text-background",
];

/** The fill for a business, wrapping round if its index outruns the palette. */
export function businessTone(business: BusinessProfile): string {
  return BUSINESS_TONES[business.tone % BUSINESS_TONES.length];
}

/**
 * Up to two initials, from the same helper the contact avatars use — a business
 * name and a person's name are the same problem, and two implementations would
 * disagree on "Harbourline Pty Ltd" eventually.
 */
export function businessInitials(business: BusinessProfile): string {
  return contactInitials(business.name);
}

/** Whether this business can be opened yet. */
export function businessLocked(business: BusinessProfile): boolean {
  return !business.paid;
}

/**
 * The trading address as one line, the way a document prints it.
 *
 * Suburb, state and postcode are joined with spaces rather than commas —
 * "Melbourne VIC 3000" is how an Australian address is written, and
 * comma-separating those three reads as three separate lines of an address.
 * Empty where nothing has been recorded, so a caller can omit the line
 * entirely instead of printing stray punctuation.
 */
export function formatBusinessAddress(
  business: BusinessProfile | null,
): string {
  if (!business) return "";
  const { line1, city, state, postcode, country } = business.address;
  const locality = [city, state, postcode].filter(Boolean).join(" ");
  return [line1, locality, country].filter(Boolean).join(", ");
}

/**
 * Whether an invoice raised on this business has anywhere to say it's from.
 *
 * Any one of the four fields counts, the same reading the invoice form's own
 * check uses — a business trading from a PO box might carry a country and a
 * postcode but no street line, and that's still a real address rather than a
 * blank one.
 */
export function hasBusinessAddress(business: BusinessProfile): boolean {
  const { line1, city, state, country } = business.address;
  return Boolean(line1.trim() || city.trim() || state.trim() || country.trim());
}

/**
 * Whether an invoice raised on this business can actually be paid.
 *
 * Unlike the address, this is every field or none — a BSB with no account
 * number to go with it isn't a bank detail a client can pay into, so a
 * business only counts as payable once every field a transfer needs is on
 * file: the account name, the bank name, and whichever account fields its
 * country asks for. That is a BSB and account number in Australia, a branch
 * code and account number in South Africa, and one account number in New
 * Zealand, whose number carries the bank and branch inside it — requiring a
 * BSB there would leave a business that can never count as payable.
 */
export function hasBankDetails(
  business: BusinessProfile,
  country: CountryContext = FALLBACK_COUNTRY_CONTEXT,
): boolean {
  const { bsb, accountNumber, accountHolder, bankName } = business.bank;
  return (
    Boolean(accountHolder.trim() && bankName.trim()) &&
    hasRequiredBankFields(country, { bsb, accountNumber })
  );
}

/**
 * Why it can't be opened, and the way out.
 *
 * One string for every locked business rather than one naming it: the row it
 * hangs off already says which business, and repeating the name inside the
 * tooltip is the third time it appears in two inches.
 */
export const BUSINESS_LOCK_REASON =
  "Payment plan not yet completed for this business. Finish setup to activate it.";

/** The CTA under the reason, and where it goes. */
export const BUSINESS_LOCK_CTA = "Complete payment";

/**
 * The payment step for one business.
 *
 * The add-business page in its second step, told which business it's finishing —
 * so resuming a half-set-up business and creating a new one land in the same
 * place rather than in two flows that have to agree about payment.
 */
export function businessPaymentHref(business: BusinessProfile): string {
  return `/businesses/new?business=${encodeURIComponent(business.id)}&step=payment`;
}

/** "3 businesses" — the switcher's subtitle. */
export function businessCountLabel(count: number): string {
  return `${count} ${count === 1 ? "business" : "businesses"}`;
}

/* ------------------------------------------------------------------ *
 * API — GET /businesses and the actions the businesses screen takes
 * ------------------------------------------------------------------ */

type ApiBusinessSubscription = {
  status?: string;
  requires_payment?: boolean;
  plan_name?: string | null;
  plan_slug?: string;
  plan_interval?: string | null;
  monthly_price?: number;
  effective_monthly_price?: number;
  discount_percent?: number;
  is_trial?: boolean;
  trial_end?: string;
  current_period_end?: string;
  addons?: unknown[];
};

type ApiBusiness = {
  id: string | number;
  business_name?: string;
  company_name?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  business_email?: string;
  abn?: string;
  business_registration_number?: string | null;
  tax_registration_number?: string | null;
  is_default?: boolean;
  requires_payment?: boolean;
  subscription?: ApiBusinessSubscription;
  logo?: string | null;

  industry_id?: string | number | null;
  timezone?: string | null;
  ndis_no?: string | null;
  accounting_type?: string | null;
  company_type?: string | null;
  country_iso2?: string | null;
  country_code?: string | null;
  mobile_no?: string | null;

  bank_name?: string | null;
  bsb?: string | null;
  account_holder?: string | null;
  account_number?: string | null;
  show_bank_detail_invoice?: number | boolean | null;

  address?: string | null;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;

  documents?: Array<{
    id: string | number;
    source_type?: string;
    file_path?: string;
    file_name?: string;
  }> | null;
};

/** Trims a nullable API string down to a plain one. */
function text(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

/** A short, stable index into `BUSINESS_TONES` — same id, same colour always. */
function toneForId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function profileName(raw: ApiBusiness): string {
  const full = [raw.first_name, raw.last_name].filter(Boolean).join(" ").trim();
  return (
    raw.business_name?.trim() ||
    raw.company_name?.trim() ||
    full ||
    "Untitled business"
  );
}

function mapSubscription(
  sub: ApiBusinessSubscription | undefined,
): BusinessSubscription | null {
  if (!sub?.plan_slug) return null;
  return {
    packageId: sub.plan_slug,
    planName: sub.plan_name || undefined,
    // `price` below is always a per-month figure; this is how it's billed.
    cycle: sub.plan_interval?.toLowerCase() === "annual" ? "annual" : "monthly",
    price: sub.effective_monthly_price ?? sub.monthly_price ?? 0,
    renews: sub.current_period_end ?? "",
  };
}

function mapApiBusiness(raw: ApiBusiness): BusinessProfile {
  const id = String(raw.id);
  const industryId = raw.industry_id != null ? Number(raw.industry_id) : null;

  return {
    id,
    name: profileName(raw),
    email: text(raw.business_email),
    abn: text(raw.abn),
    registrationNumber: text(raw.business_registration_number),
    taxNumber: text(raw.tax_registration_number),
    // A business is usable unless it needs payment and isn't the account's
    // default — the default stays open even mid-payment-setup, same rule as
    // sole-webapp's isBusinessLocked.
    paid: !(Boolean(raw.requires_payment) && !raw.is_default),
    tone: toneForId(id),
    logo: raw.logo ?? null,
    subscription: mapSubscription(raw.subscription),

    industryId: Number.isFinite(industryId) ? industryId : null,
    timezone: text(raw.timezone),
    ndisNumber: text(raw.ndis_no),
    accountingType: text(raw.accounting_type),
    companyType: text(raw.company_type),

    bank: {
      bsb: text(raw.bsb),
      accountNumber: text(raw.account_number),
      accountHolder: text(raw.account_holder),
      bankName: text(raw.bank_name),
    },
    // Only an explicit 0/false hides them — a record from before the column
    // existed keeps printing its bank details.
    showBankDetailsOnInvoice:
      raw.show_bank_detail_invoice === undefined ||
      raw.show_bank_detail_invoice === null ||
      Number(raw.show_bank_detail_invoice) === 1,

    address: {
      // `address` is the older single-line column; `address_line1` supersedes
      // it, so whichever the record actually carries is used.
      line1: text(raw.address_line1) || text(raw.address),
      city: text(raw.city),
      state: text(raw.state),
      postcode: text(raw.postcode),
      country: text(raw.country),
    },

    countryIso2: text(raw.country_iso2).toUpperCase(),
    countryCode: text(raw.country_code),
    mobile: text(raw.mobile_no),
    firstName: text(raw.first_name),
    middleName: text(raw.middle_name),
    lastName: text(raw.last_name),
    companyName: text(raw.company_name),

    documents: (raw.documents ?? []).map((document) => ({
      id: String(document.id),
      sourceType: document.source_type,
      filePath: document.file_path,
      fileName: document.file_name,
    })),
  };
}

/**
 * The account's businesses, usable ones first and the default first among
 * ties — the same client-side ordering sole-webapp's business-profile page
 * applies, since the API doesn't sort them itself.
 */
export async function fetchBusinesses(): Promise<{
  businesses: BusinessProfile[];
  defaultId: string | null;
}> {
  const response = await api.get<{ success: boolean; data?: ApiBusiness[] }>(
    apiRoutes.businesses.list,
  );
  const raw = response.data?.data ?? [];

  const entries = raw.map((item) => ({
    business: mapApiBusiness(item),
    isDefault: Boolean(item.is_default),
  }));

  entries.sort((a, b) => {
    if (a.business.paid !== b.business.paid) return a.business.paid ? -1 : 1;
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return 0;
  });

  return {
    businesses: entries.map((entry) => entry.business),
    defaultId:
      entries.find((entry) => entry.isDefault)?.business.id ??
      entries[0]?.business.id ??
      null,
  };
}

/**
 * Both bodies are empty, but still go through `buildEncryptedRequestBody` —
 * sole-webapp's generic `patch`/`Delete` helpers (hooks/useService.js)
 * encrypt even an empty `{}` params object rather than sending no body at
 * all, and a DELETE carries that the same way axios sends any other body:
 * as the `data` config option, since `axios.delete` has no dedicated
 * body parameter.
 */
export async function setBusinessDefaultApi(id: string): Promise<void> {
  await api.patch(
    apiRoutes.businesses.setDefault(id),
    buildEncryptedRequestBody({}),
  );
}

export async function deleteBusinessApi(id: string): Promise<void> {
  await api.delete(apiRoutes.businesses.delete(id), {
    data: buildEncryptedRequestBody({}),
  });
}

/* ------------------------------------------------------------------ *
 * Detail — the full profile, for the edit screen
 * ------------------------------------------------------------------ */

/**
 * The full business record the edit form reads from — everything the list
 * response carries, plus the fields only the detail endpoint returns.
 */
export type ApiBusinessDetail = ApiBusiness & {
  industry_id?: string | number;
  company_type?: string;
  accounting_type?: string;
  middle_name?: string;
  country_code?: string;
  mobile_no?: string;
  ndis_no?: string;
  bank_name?: string;
  bsb?: string;
  account_holder?: string;
  account_number?: string;
  address?: string;
  address_line1?: string;
  country?: string;
  city?: string;
  state?: string;
  postcode?: string;
  /** The uploaded-documents trail for this business — the logo's own document id lives here. */
  documents?: Array<{
    id: string | number;
    source_type?: string;
    file_path?: string;
    file_name?: string;
  }>;
};

/**
 * The logo's own document entry — matched on `file_path` against `logo`
 * rather than just taking `documents[0]`, since that array is every
 * document attached to the business, not only its logo.
 */
function matchedLogoDocument(business: ApiBusinessDetail) {
  if (!business.logo) return null;
  return (
    business.documents?.find(
      (document) => document.file_path === business.logo,
    ) ?? null
  );
}

/**
 * The logo's own document id, so removing it calls `deleteSourceDocument`
 * with something real.
 */
export function logoDocumentId(business: ApiBusinessDetail): string | null {
  const match = matchedLogoDocument(business);
  return match ? String(match.id) : null;
}

/** The logo's real filename, for the dropzone to show instead of a placeholder. */
export function logoFileName(business: ApiBusinessDetail): string | null {
  return matchedLogoDocument(business)?.file_name ?? null;
}

export async function fetchBusinessDetail(
  id: string,
): Promise<ApiBusinessDetail> {
  const response = await api.get<{
    success: boolean;
    data?: ApiBusinessDetail;
  }>(apiRoutes.businesses.detail(id));
  if (!response.data?.data) {
    throw new Error("Business not found");
  }
  return response.data.data;
}

/**
 * The edit/add form's fields, in the shape both `createBusinessApi` and
 * `updateBusinessApi` send — everything `BusinessProfileForm` collects,
 * addressed by the same names sole-webapp's `BusinessProfileFormSheet` uses.
 */
export type BusinessPayloadDraft = {
  email: string;
  businessName: string;
  abn: string;
  industry: string;
  accountingBasis: string;
  businessType: string;
  companyName: string;
  firstName: string;
  middleName: string;
  lastName: string;
  phone: string;
  ndisNumber: string;
  bankName: string;
  bsb: string;
  accountHolder: string;
  accountNumber: string;
  addressSearch: string;
  addressLine1: string;
  country: string;
  city: string;
  state: string;
  postcode: string;
};

const DEFAULT_CALLING_CODE = "+61";

/**
 * `company_type` is one of three backend values, none of which read as
 * "Partnership" or "Trust" — the two this form offers that sole-webapp's own
 * schema (`individual` | `solo_traders` | `pvt_company`) has no slot for.
 * Both fall back to `pvt_company` as the closer of the two: a partnership or
 * a trust is a registered entity, not an individual trading alone.
 */
const COMPANY_TYPE_BY_BUSINESS_TYPE: Record<string, string> = {
  "Sole trader": "solo_traders",
  Company: "pvt_company",
  Partnership: "pvt_company",
  Trust: "pvt_company",
};

/**
 * The same fields `BusinessProfileFormSheet.buildPayload` sends, same names —
 * but encrypted the way `user.updateUserProfile` sends a profile update
 * (hooks/useService.js's generic `post`/`patch`), not the plain unencrypted
 * FormData sole-webapp's own business/invoice forms actually use. Blank
 * optional fields go through as empty strings rather than being omitted, so
 * clearing one on the form actually clears it on the record rather than
 * leaving the old value in place.
 */
function buildBusinessRequestBody(
  draft: BusinessPayloadDraft,
  industryId: number | null,
  logo?: FileFieldUpdate,
  country?: NewBusinessCountry,
): FormData | { data: string } {
  // Same split `BusinessProfileFormSheet.buildPayload` sends — the phone
  // input's one display value (e.g. "+61 411 111 111") parsed back into the
  // two fields the record stores separately.
  const { countryCallingCode, nationalNumber } =
    getCountryCallingAndPhoneNumber(
      draft.phone,
      country?.dialCode || DEFAULT_CALLING_CODE,
    );

  const fields: Record<string, unknown> = {
    business_email: draft.email,
    business_name: draft.businessName,
    abn: draft.abn,
    // A real number when known, same as buildPayload's `Number(values.industry_id)`
    // — encryptPayload normalises a missing one to "" on its own.
    industry_id: industryId,
    company_type:
      COMPANY_TYPE_BY_BUSINESS_TYPE[draft.businessType] ?? "solo_traders",
    accounting_type: draft.accountingBasis === "Accrual" ? "accrual" : "cash",
    first_name: draft.firstName,
    middle_name: draft.middleName,
    last_name: draft.lastName,
    country_code: countryCallingCode,
    mobile_no: nationalNumber,
    company_name: draft.companyName,
    ndis_no: draft.ndisNumber,
    bank_name: draft.bankName,
    bsb: draft.bsb,
    account_holder: draft.accountHolder,
    account_number: draft.accountNumber,
    address: draft.addressSearch,
    address_line1: draft.addressLine1,
    country: draft.country,
    city: draft.city,
    state: draft.state,
    postcode: draft.postcode,
  };

  if (country) {
    const iso2 = country.iso2.toUpperCase();
    fields.country_iso2 = iso2;
    /*
     * Outside Australia the number is `business_registration_number`, not
     * `abn` — the backend only reads `abn` as the identifier for AU, and an
     * NZBN sent as `abn` would land in the legacy AU column instead.
     */
    if (iso2 !== "AU") {
      fields.business_registration_number = draft.abn.trim();
      fields.abn = "";
    }
  }

  // Only meaningful without a replacement file — the same rule
  // `appendFileField` applies for the unencrypted path.
  if (logo?.remove && !logo.file) {
    fields.remove_profile_pic = "true";
  }

  return buildEncryptedRequestBody(fields, { profile_pic: logo?.file });
}

type ApiBusinessSaveResponse = {
  success: boolean;
  message?: string;
  data?: ApiBusinessDetail;
};

/**
 * The country a new business is created in, chosen on the add-business page.
 * Only ever sent on create: a business's country can't change afterwards, so
 * `updateBusinessApi` takes no such argument.
 */
export type NewBusinessCountry = {
  /** ISO 3166-1 alpha-2, sent as `country_iso2`. */
  iso2: string;
  /** The phone dial code to assume when no number was typed, e.g. "+64". */
  dialCode?: string | null;
};

export async function createBusinessApi(
  draft: BusinessPayloadDraft,
  industryId: number | null,
  logo?: FileFieldUpdate,
  country?: NewBusinessCountry,
): Promise<ApiBusinessDetail> {
  const body = buildBusinessRequestBody(draft, industryId, logo, country);
  // No Content-Type header set deliberately — axios fills in the JSON or
  // multipart header itself depending on which `body` turned out to be.
  const response = await api.post<ApiBusinessSaveResponse>(
    apiRoutes.businesses.create,
    body,
  );
  if (!response.data?.success || !response.data.data) {
    throw new Error(response.data?.message || "Failed to create business");
  }
  /*
   * Multi-business is new in this UI — the old app tracked only a switch, so
   * there is no precedent for how many people run more than one. `abn_present`
   * as a boolean and never the number: an ABN identifies an Australian
   * business outright and does not belong in a third-party analytics tool.
   */
  track(EVENTS.BUSINESS_CREATED, {
    industry_id: industryId,
    abn_present: Boolean(draft.abn),
    has_logo: Boolean(logo),
  });
  return response.data.data;
}

/**
 * Saves whether this business's invoices print their bank details.
 *
 * A partial PATCH — the endpoint only writes the fields a body carries, so
 * nothing else on the business is touched.
 */
export async function updateBusinessShowBankDetailsApi(
  id: string,
  show: boolean,
): Promise<void> {
  const response = await api.patch<ApiBusinessSaveResponse>(
    apiRoutes.businesses.update(id),
    buildEncryptedRequestBody({ show_bank_detail_invoice: show ? 1 : 0 }),
  );
  if (!response.data?.success) {
    throw new Error(
      response.data?.message || "Couldn't update the bank details setting.",
    );
  }
}

export async function updateBusinessApi(
  id: string,
  draft: BusinessPayloadDraft,
  industryId: number | null,
  logo?: FileFieldUpdate,
): Promise<ApiBusinessDetail> {
  const body = buildBusinessRequestBody(draft, industryId, logo);
  const response = await api.patch<ApiBusinessSaveResponse>(
    apiRoutes.businesses.update(id),
    body,
  );
  if (!response.data?.success || !response.data.data) {
    throw new Error(response.data?.message || "Failed to update business");
  }
  return response.data.data;
}
