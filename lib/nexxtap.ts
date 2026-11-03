/**
 * NextTap onboarding: what Nexxtap needs before it will board you as a
 * merchant.
 *
 * Eight steps over six groups of answers — the business, the person
 * authorised to sign for it, whoever ultimately owns it, how it trades, what
 * facilities it wants, where the money settles, and the paperwork behind all
 * of it.
 *
 * Ported from sole-webapp's real Nexxtap flow (`pages/nexxtap-onboarding.js`
 * and `components/NexxtapOnboarding/*`), which is the reference for every
 * field name, validation rule and request on this page. Three things about
 * that backend are worth knowing before touching this file:
 *
 * 1. NextTap lives in the `payments` repo, but the browser never calls it:
 *    every request goes to sole-ocr's `/nexxtap/*` routes on the ordinary
 *    `api` client, and sole-ocr forwards it with the signed-in user's id from
 *    the verified session. Nothing here sends a user id.
 * 2. The draft is stored section by section. `POST /onboarding/save-step`
 *    takes `{ step, data }` where `step` is a number the service maps to a
 *    section name (`payloadMapper.js`'s `stepSectionMap`), and each call
 *    deep-merges into `draft_payload`. Unlike Worldpay's, a partial save here
 *    is safe — which is why each step page saves only its own section.
 * 3. Submitting is two calls, not one: `create-or-update` writes the whole
 *    assembled payload, then `submit` (first time) or `update` (after an
 *    application id exists) pushes it to Nexxtap. Nexxtap's own field errors
 *    come back from that second call keyed `"section.field"`.
 *
 * The answers below keep Nexxtap's own snake_case field names rather than
 * being mapped to camelCase the way `lib/solepay.ts` does. That's deliberate:
 * the service round-trips exactly these keys through `draft_payload`, so a
 * translation layer would be two more places for a field name to drift with
 * nothing gained — the hydrate and the save would both have to know both
 * spellings.
 */

import {
  Building2,
  CreditCard,
  FileText,
  Landmark,
  LayoutGrid,
  User,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import type { OnboardingIssues } from "@/components/payments/shared/onboarding-fields";
import type { BusinessProfile } from "@/lib/businesses";
import type { SessionUser } from "@/stores/session";

/* ------------------------------------------------------------------ *
 * The steps
 * ------------------------------------------------------------------ */

export const NEXXTAP_ONBOARDING_HREF = "/payments/nexttap/onboarding";

/**
 * The eight steps, in the order Nexxtap's own application asks for them.
 *
 * `href` is the addition over a plain step list — these are pages rather than
 * a wizard's slides, so each step has somewhere to be. Overview is a step in
 * the tracker but not a form: it's the summary of the other seven, which is
 * why `stepsDone` always counts it.
 */
export const NEXXTAP_STEPS = [
  {
    id: "overview",
    label: "Overview",
    href: NEXXTAP_ONBOARDING_HREF,
    icon: LayoutGrid as LucideIcon,
  },
  {
    id: "business",
    label: "Business",
    href: `${NEXXTAP_ONBOARDING_HREF}/business`,
    icon: Building2 as LucideIcon,
  },
  {
    id: "applicant",
    label: "Applicant",
    href: `${NEXXTAP_ONBOARDING_HREF}/applicant`,
    icon: User as LucideIcon,
  },
  {
    id: "owners",
    label: "Owners",
    href: `${NEXXTAP_ONBOARDING_HREF}/owners`,
    icon: Users as LucideIcon,
  },
  {
    id: "activity",
    label: "Activity",
    href: `${NEXXTAP_ONBOARDING_HREF}/activity`,
    icon: CreditCard as LucideIcon,
  },
  {
    id: "facilities",
    label: "Facilities",
    href: `${NEXXTAP_ONBOARDING_HREF}/facilities`,
    icon: WalletCards as LucideIcon,
  },
  {
    id: "bank",
    label: "Bank",
    href: `${NEXXTAP_ONBOARDING_HREF}/bank`,
    icon: Landmark as LucideIcon,
  },
  {
    id: "documents",
    label: "Documents",
    href: `${NEXXTAP_ONBOARDING_HREF}/documents`,
    icon: FileText as LucideIcon,
  },
] as const;

export type NexxtapStepId = (typeof NEXXTAP_STEPS)[number]["id"];

/**
 * Which numbered step `save-step` files each section under.
 *
 * Verbatim from the service's `stepSectionMap`. The numbers are the contract,
 * not the order of the pages — Overview and Documents have no entry because
 * neither writes to `draft_payload`.
 */
export const NEXXTAP_SAVE_STEP: Record<string, number> = {
  business: 1,
  applicant: 2,
  owners: 3,
  activity: 4,
  facilities: 5,
  bank: 6,
};

/* ------------------------------------------------------------------ *
 * The option lists — Nexxtap's own accepted values, not display labels
 * ------------------------------------------------------------------ */

/**
 * Australian states, spelled the way Nexxtap's form accepts them.
 *
 * Note "the Australian Capital Territory", lower-case article and all: that
 * is the literal accepted value, so it's the id even though the label drops
 * the article. Sending "ACT" or "Australian Capital Territory" is rejected.
 */
export const NEXXTAP_STATES = [
  { id: "New South Wales", name: "New South Wales" },
  { id: "Queensland", name: "Queensland" },
  { id: "Northern Territory", name: "Northern Territory" },
  { id: "Western Australia", name: "Western Australia" },
  { id: "South Australia", name: "South Australia" },
  { id: "Victoria", name: "Victoria" },
  {
    id: "the Australian Capital Territory",
    name: "Australian Capital Territory",
  },
  { id: "Tasmania", name: "Tasmania" },
] as const;

const NEXXTAP_STATE_IDS = NEXXTAP_STATES.map((state) => state.id) as readonly string[];

/** Business records store the state abbreviated; the form only accepts the spelled-out value. */
const STATE_BY_ABBREVIATION: Record<string, string> = {
  NSW: "New South Wales",
  QLD: "Queensland",
  NT: "Northern Territory",
  WA: "Western Australia",
  SA: "South Australia",
  VIC: "Victoria",
  ACT: "the Australian Capital Territory",
  TAS: "Tasmania",
};

export const NEXXTAP_BUSINESS_STATUS = [
  { value: "new", label: "New business" },
  { value: "existing", label: "Existing business" },
] as const;

export const YES_NO = [
  { value: "1", label: "Yes" },
  { value: "0", label: "No" },
] as const;

export const NEXXTAP_NOTIFICATION_OPTIONS = [
  { value: "0", label: "Send notifications" },
  { value: "1", label: "Do not send" },
] as const;

export const NEXXTAP_DEVICES = [
  { value: "android", label: "Android" },
  { value: "ios", label: "iOS" },
] as const;

export const NEXXTAP_SUBSCRIPTION_TERMS = [
  { id: "one_month", name: "One month" },
  { id: "three_months", name: "Three months" },
  { id: "six_months", name: "Six months" },
  { id: "nine_months", name: "Nine months" },
  { id: "twelve_months", name: "Twelve months" },
  { id: "twelve_plus_months", name: "More than twelve months" },
] as const;

export const NEXXTAP_SUBSCRIPTION_FREQUENCIES = [
  { id: "weekly", name: "Weekly" },
  { id: "monthly", name: "Monthly" },
  { id: "bi_annually", name: "Bi-annually" },
  { id: "annually", name: "Annually" },
  { id: "other", name: "Other" },
] as const;

/** Nexxtap caps the application at this turnover; above it the merchant is boarded by hand. */
export const MAX_ANNUAL_TURNOVER = 5_025_000;

/** At most four ultimate beneficial owners, which is Nexxtap's own limit. */
export const MAX_OWNERS = 4;

/* ------------------------------------------------------------------ *
 * The answers
 * ------------------------------------------------------------------ */

export type NexxtapBusiness = {
  business_name: string;
  doing_business_as: string;
  abn: string;
  contact_support_number: string;
  new_or_existing_business: string;
  industry_type: string;
  product_or_service: string;
  business_description: string;
  website: string;
  facebook_profile: string;
  instagram_profile: string;
  business_address: string;
  city: string;
  state: string;
  post_code: string;
};

export const EMPTY_NEXXTAP_BUSINESS: NexxtapBusiness = {
  business_name: "",
  doing_business_as: "",
  abn: "",
  contact_support_number: "",
  new_or_existing_business: "existing",
  industry_type: "",
  product_or_service: "",
  business_description: "",
  website: "",
  facebook_profile: "",
  instagram_profile: "",
  business_address: "",
  city: "",
  state: "",
  post_code: "",
};

export type NexxtapApplicant = {
  first_name: string;
  middle_name: string;
  last_name: string;
  date_of_birth: string;
  position: string;
  contact_number: string;
  email: string;
  /** Optional: sets the merchant's own Nexxtap portal password up front. */
  password: string;
  address: string;
  city: string;
  state: string;
  post_code: string;
  dont_send_notifications_to_merchant: string;
};

export const EMPTY_NEXXTAP_APPLICANT: NexxtapApplicant = {
  first_name: "",
  middle_name: "",
  last_name: "",
  date_of_birth: "",
  position: "",
  contact_number: "",
  email: "",
  password: "",
  address: "",
  city: "",
  state: "",
  post_code: "",
  dont_send_notifications_to_merchant: "0",
};

export type NexxtapOwner = {
  first_name: string;
  middle_name: string;
  last_name: string;
  date_of_birth: string;
  position: string;
  contact_number: string;
  email: string;
  residential_address: string;
  city: string;
  state: string;
  post_code: string;
};

export const EMPTY_NEXXTAP_OWNER: NexxtapOwner = {
  first_name: "",
  middle_name: "",
  last_name: "",
  date_of_birth: "",
  position: "Owner",
  contact_number: "",
  email: "",
  residential_address: "",
  city: "",
  state: "",
  post_code: "",
};

export type NexxtapActivity = {
  company_have_a_trust: string;
  trust_name: string;
  had_a_merchant_facility_terminated: string;
  currently_have_any_merchant_facilities: string;
  estimated_annual_turnover: string;
  average_number_of_credit_card_sales_per_month: string;
  face_to_face_usage_percentage: string;
  ecommerce_usage_percentage: string;
};

export const EMPTY_NEXXTAP_ACTIVITY: NexxtapActivity = {
  company_have_a_trust: "0",
  trust_name: "",
  had_a_merchant_facility_terminated: "0",
  currently_have_any_merchant_facilities: "0",
  estimated_annual_turnover: "",
  average_number_of_credit_card_sales_per_month: "",
  // Nexxtap's own defaults for a tap-to-pay merchant: mostly in person.
  face_to_face_usage_percentage: "80",
  ecommerce_usage_percentage: "20",
};

export type NexxtapFacilities = {
  selected_devices: string[];
  do_you_process_subscriptions_or_memberships: string;
  term_of_your_subscription: string;
  frequency_of_subscriptions: string;
  transaction_information_notes: string;
  require_online_ecomm_facility: string;
  require_online_nexxpos_facility: string;
  require_online_amex_facility: string;
  customer_pays_surcharge: string;
};

export const EMPTY_NEXXTAP_FACILITIES: NexxtapFacilities = {
  selected_devices: ["android"],
  do_you_process_subscriptions_or_memberships: "0",
  term_of_your_subscription: "",
  frequency_of_subscriptions: "",
  transaction_information_notes: "",
  require_online_ecomm_facility: "1",
  require_online_nexxpos_facility: "0",
  require_online_amex_facility: "0",
  customer_pays_surcharge: "1",
};

export type NexxtapBank = {
  account_name: string;
  bsb: string;
  account_number: string;
  bank_name: string;
};

export const EMPTY_NEXXTAP_BANK: NexxtapBank = {
  account_name: "",
  bsb: "",
  account_number: "",
  bank_name: "",
};

export type NexxtapOnboarding = {
  business: NexxtapBusiness;
  applicant: NexxtapApplicant;
  owners: NexxtapOwner[];
  activity: NexxtapActivity;
  facilities: NexxtapFacilities;
  bank: NexxtapBank;
};

export const EMPTY_NEXXTAP_ONBOARDING: NexxtapOnboarding = {
  business: EMPTY_NEXXTAP_BUSINESS,
  applicant: EMPTY_NEXXTAP_APPLICANT,
  owners: [],
  activity: EMPTY_NEXXTAP_ACTIVITY,
  facilities: EMPTY_NEXXTAP_FACILITIES,
  bank: EMPTY_NEXXTAP_BANK,
};

/* ------------------------------------------------------------------ *
 * Documents
 * ------------------------------------------------------------------ */

/**
 * The upload slots, keyed by the `file_type` slug Nexxtap's own file endpoint
 * takes. These strings are the multipart field names too, so they can't be
 * renamed for display.
 */
export const NEXXTAP_DOCUMENT_SLOTS = [
  {
    id: "bank_statements",
    label: "Bank statement",
    hint: "Must show the account name, BSB and account number. The account name has to match the authorised applicant.",
    required: "always",
  },
  {
    id: "trust_deeds",
    label: "Trust deeds",
    hint: "Required because the business is held in a trust.",
    required: "trust",
  },
  {
    id: "merchant_statements",
    label: "Merchant statements",
    hint: "Statements from your current payment processor.",
    required: "never",
  },
  {
    id: "bas_statements",
    label: "BAS statements",
    hint: "Recent Business Activity Statements.",
    required: "never",
  },
  {
    id: "tax_returns",
    label: "Tax returns",
    hint: "Your most recent business tax return.",
    required: "never",
  },
] as const;

export type NexxtapDocumentSlotId =
  (typeof NEXXTAP_DOCUMENT_SLOTS)[number]["id"];

/**
 * What Nexxtap's file endpoint and the service's own filter both accept.
 * No WebP — Nexxtap refuses it, and it used to get through here only to fail
 * at submit.
 */
export const NEXXTAP_ACCEPTED_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const NEXXTAP_ACCEPT_ATTR =
  ".jpg,.jpeg,.png,.pdf,.doc,.docx,.xls,.xlsx";

export const NEXXTAP_MAX_FILE_BYTES = 20 * 1024 * 1024;

/** The bytes each accepted type has to start with (a PDF's within its first KB). */
const FILE_SIGNATURES: Record<string, number[][]> = {
  pdf: [[0x25, 0x50, 0x44, 0x46, 0x2d]], // "%PDF-"
  png: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  jpeg: [[0xff, 0xd8, 0xff]],
  office: [
    [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], // .doc / .xls
    [0x50, 0x4b, 0x03, 0x04], // .docx / .xlsx
  ],
};

const KIND_BY_MIME: Record<string, keyof typeof FILE_SIGNATURES> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "application/msword": "office",
  "application/vnd.ms-excel": "office",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "office",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "office",
};

const startsWith = (bytes: Uint8Array, signature: number[], at = 0) =>
  signature.every((byte, index) => bytes[at + index] === byte);

/**
 * Why a picked file can't go to Nexxtap, or null when it can.
 *
 * Nexxtap judges a file by its content, not its name — a "PDF" that is really
 * something else (the broken Balance Sheet export was JSON text) was accepted
 * here and only failed at submit. So the first bytes are read and checked
 * against the type the file claims, the same check the service repeats.
 */
export async function nexxtapFileIssue(file: File): Promise<string | null> {
  const kind = KIND_BY_MIME[file.type];
  if (!kind) return "Only JPG, PNG, PDF, DOC, DOCX, XLS or XLSX files are accepted.";
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > NEXXTAP_MAX_FILE_BYTES) return "That file is over the 20 MB limit.";

  let head: Uint8Array;
  try {
    head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  } catch {
    return `${file.name} couldn't be read. Try choosing it again.`;
  }

  const matches = FILE_SIGNATURES[kind].some((signature) =>
    kind === "pdf"
      ? head.some((_, offset) => startsWith(head, signature, offset))
      : startsWith(head, signature),
  );
  return matches
    ? null
    : `${file.name} looks damaged or isn't really the type its name says. Open it to check, then export or download it again.`;
}

/** A document the service already holds, as `GET /onboarding/documents` returns it. */
export type NexxtapUploadedDocument = {
  id: string;
  document_type: string;
  original_filename: string;
  uploaded_at?: string;
};

/**
 * Which slots have to be filled before Documents counts as done.
 *
 * A bank statement always; trust deeds as well when the Activity step says
 * the business is held in a trust. The other three speed up approval but
 * Nexxtap doesn't insist on them, so they never block the step.
 */
export function requiredDocumentSlots(hasTrust: boolean): NexxtapDocumentSlotId[] {
  return NEXXTAP_DOCUMENT_SLOTS.filter(
    (slot) => slot.required === "always" || (slot.required === "trust" && hasTrust),
  ).map((slot) => slot.id);
}

/** Whether the Activity answers mean trust paperwork is needed. */
export function hasTrust(activity: NexxtapActivity): boolean {
  return String(activity.company_have_a_trust) === "1";
}

/* ------------------------------------------------------------------ *
 * What the service says about the application
 * ------------------------------------------------------------------ */

/** The ladder an application climbs, as the service's `status` column spells it. */
export type NexxtapStatus =
  | "not_started"
  | "draft"
  | "in_progress"
  | "pending_submission"
  | "submitted"
  | "under_review"
  | "needs_update"
  | "approved"
  | "declined"
  | "rejected"
  | "cancelled"
  /** Nexxtap created the application but refused the final submit. */
  | "failed";

export type NexxtapMeta = {
  /**
   * Set as soon as Nexxtap has created the application — which is not the same
   * as it having been submitted: a submit whose document upload fails keeps
   * the id but never reaches Nexxtap's own submit. `submitted` says which.
   */
  applicationId: string | null;
  /** True once Nexxtap has accepted a submit, not merely issued an id. */
  submitted: boolean;
  status: NexxtapStatus;
  /** 0–100, as the service calculates it from `step_progress`. */
  completion: number;
};

export const EMPTY_NEXXTAP_META: NexxtapMeta = {
  applicationId: null,
  submitted: false,
  status: "not_started",
  completion: 0,
};

/** True once the application is with Nexxtap and the forms should stop offering Submit. */
export function isWithNexxtap(meta: NexxtapMeta): boolean {
  return (
    Boolean(meta.applicationId) &&
    ["submitted", "under_review", "approved"].includes(meta.status)
  );
}

/** What the header chip says about an application that has been sent. */
export function statusLabel(status: NexxtapStatus): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "under_review":
      return "Under review";
    case "needs_update":
      return "Update required";
    case "declined":
    case "rejected":
      return "Declined";
    case "cancelled":
      return "Cancelled";
    case "failed":
      return "Submission failed";
    case "submitted":
      return "Submitted";
    case "pending_submission":
      return "Ready to submit";
    default:
      return "In progress";
  }
}

/* ------------------------------------------------------------------ *
 * Small shared helpers
 * ------------------------------------------------------------------ */

const digitsOnly = (value: unknown) => String(value ?? "").replace(/\D/g, "");

const filled = (value: unknown) => String(value ?? "").trim().length > 0;

const str = (value: unknown) => (value == null ? "" : String(value));

/** Today as `YYYY-MM-DD`, for the date-of-birth ceiling. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeState(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const byAbbreviation = STATE_BY_ABBREVIATION[raw.toUpperCase()];
  if (byAbbreviation) return byAbbreviation;
  const match = NEXXTAP_STATE_IDS.find(
    (name) => name.toLowerCase() === raw.toLowerCase(),
  );
  // "Australian Capital Territory" without the article is the one near-miss
  // worth catching, since that's how the rest of the platform writes it.
  if (!match && raw.toLowerCase() === "australian capital territory") {
    return "the Australian Capital Territory";
  }
  return match ?? "";
}

function normalizePostCode(value: unknown): string {
  return digitsOnly(value).slice(0, 4);
}

/* ------------------------------------------------------------------ *
 * Prefill
 * ------------------------------------------------------------------ */

/**
 * Fills the blanks from what the platform already knows.
 *
 * Read from the businesses store and the session rather than re-fetched:
 * the list endpoint returns every business in full, so the trading address,
 * the ABN and the settlement account are already in hand by the time this
 * screen mounts.
 *
 * Anything the saved Nexxtap draft holds wins — this only fills what the
 * draft left empty, the same precedence sole-webapp's `hydrateFromDraft`
 * applies.
 *
 * The business record comes first and the signed-in user's profile fills
 * whatever it lacks — the old page's `business_mobile_no || mobile_no` and
 * `business_email || email` order, applied to every field. The profile also
 * covers a business list that failed to load, so the applicant still starts
 * from their own name, email and number rather than a blank form.
 */
export function prefillFromBusiness(
  business: BusinessProfile | null,
  user: SessionUser | null,
): NexxtapOnboarding {
  const profile = (user ?? {}) as Record<string, unknown>;
  const profileAddress = (profile.address ?? {}) as Record<string, unknown>;
  const profileBank = (profile.bank ?? {}) as Record<string, unknown>;

  const firstName = business?.firstName || str(profile.first_name);
  const middleName = business?.middleName || str(profile.middle_name);
  const lastName = business?.lastName || str(profile.last_name);
  const companyName = business?.companyName || str(profile.company_name);
  const businessName =
    business?.name || str(profile.business_name) || companyName;

  // The address only comes from one place or the other — a street from the
  // business with a city from the user's home would be nobody's address.
  const address =
    business?.address && (business.address.line1 || business.address.city)
      ? business.address
      : {
          line1:
            str(profileAddress.address_line1) || str(profileAddress.address),
          city: str(profileAddress.city),
          state: str(profileAddress.state),
          postcode: str(profileAddress.postcode),
        };

  // Same for the bank: a BSB from one account and a number from another
  // would settle into an account that doesn't exist.
  const bank =
    business?.bank && (business.bank.bsb || business.bank.accountNumber)
      ? business.bank
      : {
          accountHolder: str(profileBank.account_holder),
          bsb: str(profileBank.bsb),
          accountNumber: str(profileBank.account_number),
          bankName: str(profileBank.bank_name),
        };

  const phone = digitsOnly(business?.mobile || profile.mobile_number);
  const email = business?.email || str(profile.email);
  const state = normalizeState(address.state);
  const postCode = normalizePostCode(address.postcode);

  return {
    business: {
      ...EMPTY_NEXXTAP_BUSINESS,
      business_name: businessName,
      // "Doing business as" is the trading name — only worth prefilling when
      // the company name actually differs from the registered business name.
      doing_business_as:
        companyName && companyName !== businessName ? companyName : "",
      abn: digitsOnly(business?.abn || profile.abn),
      contact_support_number: phone,
      business_address: address.line1 || "",
      city: address.city || "",
      state,
      post_code: postCode,
    },
    applicant: {
      ...EMPTY_NEXXTAP_APPLICANT,
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      // Date of birth is on neither the business nor the user record, so
      // there is nothing to prefill it from — the applicant enters it here.
      contact_number: phone,
      email,
      address: address.line1 || "",
      city: address.city || "",
      state,
      post_code: postCode,
    },
    owners: [],
    activity: EMPTY_NEXXTAP_ACTIVITY,
    facilities: EMPTY_NEXXTAP_FACILITIES,
    bank: {
      ...EMPTY_NEXXTAP_BANK,
      account_name:
        bank.accountHolder || [firstName, lastName].filter(Boolean).join(" "),
      bsb: digitsOnly(bank.bsb),
      account_number: digitsOnly(bank.accountNumber),
      bank_name: bank.bankName || "",
    },
  };
}

/**
 * Lays the saved draft over the prefill.
 *
 * Field by field rather than section by section: a draft that has a business
 * name but no city should still take the city from the business profile,
 * which a shallow section-level merge would drop.
 */
export function hydrateFromDraft(
  draft: Record<string, unknown> | undefined,
  prefill: NexxtapOnboarding,
): NexxtapOnboarding {
  const d = draft ?? {};

  const overlay = <T extends Record<string, string>>(
    base: T,
    saved: unknown,
  ): T => {
    const source = (saved ?? {}) as Record<string, unknown>;
    const next = { ...base };
    for (const key of Object.keys(base) as (keyof T)[]) {
      const value = source[key as string];
      if (value !== undefined && value !== null && value !== "") {
        next[key] = String(value) as T[keyof T];
      }
    }
    return next;
  };

  const activityRaw = (d.business_activity ?? {}) as Record<string, unknown>;
  const processing = (activityRaw.processing_payments ?? {}) as Record<
    string,
    unknown
  >;
  const activity = overlay(prefill.activity, {
    ...activityRaw,
    face_to_face_usage_percentage:
      activityRaw.face_to_face_usage_percentage ??
      processing.face_to_face_usage_percentage,
    ecommerce_usage_percentage:
      activityRaw.ecommerce_usage_percentage ??
      processing.ecommerce_usage_percentage,
  });

  const facilitiesRaw = (d.facilities_required ?? {}) as Record<string, unknown>;
  const devices = (facilitiesRaw.payment_devices ?? {}) as Record<string, unknown>;
  const savedDevices = Array.isArray(facilitiesRaw.selected_devices)
    ? (facilitiesRaw.selected_devices as string[])
    : // The wire shape is a pair of flags, not a list, so a draft written by
      // the API rather than by this form has to be read back out of them.
      [
        Number(devices.android) === 1 ? "android" : null,
        Number(devices.ios) === 1 ? "ios" : null,
      ].filter((device): device is string => device !== null);

  const facilities: NexxtapFacilities = {
    ...overlay(
      { ...prefill.facilities, selected_devices: "" } as unknown as Record<
        string,
        string
      >,
      facilitiesRaw,
    ),
    selected_devices: savedDevices.length
      ? savedDevices
      : prefill.facilities.selected_devices,
  } as NexxtapFacilities;

  const savedOwners = Array.isArray(d.ultimate_beneficial_owners)
    ? (d.ultimate_beneficial_owners as Record<string, unknown>[])
    : [];

  return {
    business: overlay(prefill.business, d.business_information),
    applicant: overlay(prefill.applicant, d.authorised_applicant_details),
    owners: savedOwners.map((owner) => overlay(EMPTY_NEXXTAP_OWNER, owner)),
    activity,
    facilities,
    bank: overlay(prefill.bank, d.settlement_bank_account),
  };
}

/* ------------------------------------------------------------------ *
 * Validation — the same rules sole-webapp's modals enforce with zod
 * ------------------------------------------------------------------ */

const REQUIRED = "This field is required.";
const PHONE_MESSAGE = "Must be 8–17 digits.";
const POSTCODE_MESSAGE = "Post code must be 4 digits.";
const STATE_MESSAGE = "Select a valid Australian state.";
const DOB_MESSAGE = "Use YYYY-MM-DD format.";
const NUMBER_MESSAGE = "Enter a number, without commas or a $ sign.";

/*
 * Numbers people type with spaces or dashes ("0412 345 678", "062-000",
 * "51 824 753 556") are checked on their digits and sent as digits — see
 * `digitFields` below — so formatting is never what fails a field.
 */
const isPhone = (value: string) => /^\d{8,17}$/.test(digitsOnly(value));
const isPostCode = (value: string) => /^\d{4}$/.test(digitsOnly(value));
const isEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
/** Empty is fine, but a URL that is given has to be a full http(s):// one. */
const isUrlOrEmpty = (value: string) =>
  value.trim() === "" || /^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(value.trim());
/** Typed formatting aside, is this a plain number? */
const isNumeric = (value: string) => /^\d+(\.\d+)?$/.test(value.trim());

/** The ATO check digit: subtract 1 from the first digit, weight, divide by 89. */
const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
export function isValidAbn(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length !== 11) return false;
  const total = digits
    .split("")
    .reduce(
      (sum, digit, index) =>
        sum + (Number(digit) - (index === 0 ? 1 : 0)) * ABN_WEIGHTS[index],
      0,
    );
  return total % 89 === 0;
}

function dateOfBirthIssue(value: string): string | undefined {
  if (!filled(value)) return REQUIRED;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return DOB_MESSAGE;
  // "2023-02-31" matches the pattern but isn't a day; Date rolls it over.
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    return "That date doesn't exist.";
  if (value > todayIso()) return "Date of birth must be today or earlier.";
  if (value < "1900-01-01") return "Enter a date of birth after 1900.";
  return undefined;
}

export function businessIssues(business: NexxtapBusiness): OnboardingIssues {
  const issues: OnboardingIssues = {};

  if (!filled(business.business_name)) issues.business_name = REQUIRED;
  if (digitsOnly(business.abn).length !== 11)
    issues.abn = "ABN must be exactly 11 digits.";
  else if (!isValidAbn(business.abn))
    issues.abn = "That ABN is not valid — check the digits.";
  if (!isPhone(business.contact_support_number))
    issues.contact_support_number = PHONE_MESSAGE;
  if (!filled(business.industry_type)) issues.industry_type = REQUIRED;
  if (!filled(business.product_or_service)) issues.product_or_service = REQUIRED;
  if (business.business_description.trim().length < 10)
    issues.business_description =
      "Add a short description of the business — at least 10 characters.";

  /*
   * Nexxtap needs somewhere it can see the business trading. Any one of the
   * three satisfies it, so the message goes on all three rather than singling
   * one out as the required one.
   */
  const anyPresence =
    filled(business.website) ||
    filled(business.facebook_profile) ||
    filled(business.instagram_profile);
  const presenceMessage =
    "Give at least one of website, Facebook or Instagram.";
  if (!anyPresence) {
    issues.website = presenceMessage;
    issues.facebook_profile = presenceMessage;
    issues.instagram_profile = presenceMessage;
  } else {
    const urlMessage = "Must be a full URL, like https://example.com";
    if (!isUrlOrEmpty(business.website)) issues.website = urlMessage;
    if (!isUrlOrEmpty(business.facebook_profile))
      issues.facebook_profile = urlMessage;
    if (!isUrlOrEmpty(business.instagram_profile))
      issues.instagram_profile = urlMessage;
  }

  if (!filled(business.business_address)) issues.business_address = REQUIRED;
  if (!filled(business.city)) issues.city = REQUIRED;
  if (!NEXXTAP_STATE_IDS.includes(business.state)) issues.state = STATE_MESSAGE;
  if (!isPostCode(business.post_code)) issues.post_code = POSTCODE_MESSAGE;

  return issues;
}

export function applicantIssues(applicant: NexxtapApplicant): OnboardingIssues {
  const issues: OnboardingIssues = {};

  if (!filled(applicant.first_name)) issues.first_name = REQUIRED;
  if (!filled(applicant.last_name)) issues.last_name = REQUIRED;
  const dob = dateOfBirthIssue(applicant.date_of_birth);
  if (dob) issues.date_of_birth = dob;
  if (!filled(applicant.position)) issues.position = REQUIRED;
  if (!isPhone(applicant.contact_number)) issues.contact_number = PHONE_MESSAGE;
  if (!isEmail(applicant.email)) issues.email = "Enter a valid email address.";
  if (!filled(applicant.address)) issues.address = REQUIRED;
  if (!filled(applicant.city)) issues.city = REQUIRED;
  if (!NEXXTAP_STATE_IDS.includes(applicant.state)) issues.state = STATE_MESSAGE;
  if (!isPostCode(applicant.post_code)) issues.post_code = POSTCODE_MESSAGE;

  return issues;
}

/**
 * Owners, keyed `"<index>.<field>"` so one flat object can describe a list —
 * which is what lets the shared scroll-to-first-error helper work here too.
 */
export function ownersIssues(owners: NexxtapOwner[]): OnboardingIssues {
  const issues: OnboardingIssues = {};

  if (!Array.isArray(owners) || owners.length === 0) {
    issues.owners = "Add at least one beneficial owner.";
    return issues;
  }
  if (owners.length > MAX_OWNERS) {
    issues.owners = `Nexxtap accepts at most ${MAX_OWNERS} beneficial owners.`;
  }

  owners.forEach((owner, index) => {
    const at = (field: string) => `${index}.${field}`;
    if (!filled(owner.first_name)) issues[at("first_name")] = REQUIRED;
    if (!filled(owner.last_name)) issues[at("last_name")] = REQUIRED;
    const dob = dateOfBirthIssue(owner.date_of_birth);
    if (dob) issues[at("date_of_birth")] = dob;
    if (!filled(owner.position)) issues[at("position")] = REQUIRED;
    if (!isPhone(owner.contact_number)) issues[at("contact_number")] = PHONE_MESSAGE;
    if (!isEmail(owner.email))
      issues[at("email")] = "Enter a valid email address.";
    if (!filled(owner.residential_address))
      issues[at("residential_address")] = REQUIRED;
    if (!filled(owner.city)) issues[at("city")] = REQUIRED;
    if (!NEXXTAP_STATE_IDS.includes(owner.state))
      issues[at("state")] = STATE_MESSAGE;
    if (!isPostCode(owner.post_code)) issues[at("post_code")] = POSTCODE_MESSAGE;
  });

  return issues;
}

export function activityIssues(activity: NexxtapActivity): OnboardingIssues {
  const issues: OnboardingIssues = {};

  if (hasTrust(activity) && !filled(activity.trust_name)) {
    issues.trust_name = "Trust name is required when the business has a trust.";
  }

  const turnover = Number(activity.estimated_annual_turnover);
  if (!filled(activity.estimated_annual_turnover)) {
    issues.estimated_annual_turnover = "Estimated annual turnover is required.";
  } else if (!isNumeric(activity.estimated_annual_turnover)) {
    issues.estimated_annual_turnover = NUMBER_MESSAGE;
  } else if (!(turnover > 0)) {
    issues.estimated_annual_turnover = "Turnover has to be more than $0.";
  } else if (turnover > MAX_ANNUAL_TURNOVER) {
    issues.estimated_annual_turnover = `Nexxtap's maximum annual turnover is $${MAX_ANNUAL_TURNOVER.toLocaleString()}.`;
  }

  const salesInput = activity.average_number_of_credit_card_sales_per_month;
  if (!filled(salesInput)) {
    issues.average_number_of_credit_card_sales_per_month =
      "Average monthly card sales is required.";
  } else if (!/^\d+$/.test(salesInput.trim())) {
    issues.average_number_of_credit_card_sales_per_month =
      "Enter a whole number of sales.";
  } else if (!(Number(salesInput) > 0)) {
    issues.average_number_of_credit_card_sales_per_month =
      "Has to be at least 1 sale a month.";
  }

  const faceToFace = Number(activity.face_to_face_usage_percentage);
  const ecommerce = Number(activity.ecommerce_usage_percentage);
  const inRange = (value: number) =>
    Number.isFinite(value) && value >= 0 && value <= 100;

  if (!filled(activity.face_to_face_usage_percentage) || !inRange(faceToFace)) {
    issues.face_to_face_usage_percentage = "Enter a percentage between 0 and 100.";
  }
  if (!filled(activity.ecommerce_usage_percentage) || !inRange(ecommerce)) {
    issues.ecommerce_usage_percentage = "Enter a percentage between 0 and 100.";
  }
  if (
    !issues.face_to_face_usage_percentage &&
    !issues.ecommerce_usage_percentage &&
    faceToFace + ecommerce !== 100
  ) {
    const message = "Face-to-face % and ecommerce % have to add up to 100.";
    issues.face_to_face_usage_percentage = message;
    issues.ecommerce_usage_percentage = message;
  }

  return issues;
}

export function facilitiesIssues(
  facilities: NexxtapFacilities,
): OnboardingIssues {
  const issues: OnboardingIssues = {};

  if (!facilities.selected_devices?.length) {
    issues.selected_devices = "Pick at least one device to take payments on.";
  }

  // Term and frequency only mean anything once subscriptions are switched on,
  // and the payload drops them otherwise — so they're only required then.
  if (String(facilities.do_you_process_subscriptions_or_memberships) === "1") {
    if (!filled(facilities.term_of_your_subscription))
      issues.term_of_your_subscription = REQUIRED;
    if (!filled(facilities.frequency_of_subscriptions))
      issues.frequency_of_subscriptions = REQUIRED;
  }

  return issues;
}

export function bankIssues(bank: NexxtapBank): OnboardingIssues {
  const issues: OnboardingIssues = {};

  if (!filled(bank.account_name)) issues.account_name = REQUIRED;
  if (!/^\d{6}$/.test(digitsOnly(bank.bsb)))
    issues.bsb = "BSB must be exactly 6 digits.";
  // Nexxtap rejects anything longer than nine characters; the service won't
  // take fewer than six.
  if (!/^\d{6,9}$/.test(digitsOnly(bank.account_number)))
    issues.account_number = "Account number must be 6–9 digits.";

  return issues;
}

/* ------------------------------------------------------------------ *
 * Completion
 * ------------------------------------------------------------------ */

const noIssues = (issues: OnboardingIssues) => Object.keys(issues).length === 0;

export function businessDone(state: NexxtapOnboarding): boolean {
  return noIssues(businessIssues(state.business));
}
export function applicantDone(state: NexxtapOnboarding): boolean {
  return noIssues(applicantIssues(state.applicant));
}
export function ownersDone(state: NexxtapOnboarding): boolean {
  return noIssues(ownersIssues(state.owners));
}
export function activityDone(state: NexxtapOnboarding): boolean {
  return noIssues(activityIssues(state.activity));
}
export function facilitiesDone(state: NexxtapOnboarding): boolean {
  return noIssues(facilitiesIssues(state.facilities));
}
export function bankDone(state: NexxtapOnboarding): boolean {
  return noIssues(bankIssues(state.bank));
}

/**
 * Documents are done once every slot Nexxtap insists on has a file.
 *
 * Which is a stricter test than "something has been uploaded": a merchant who
 * uploaded only a tax return has uploaded nothing Nexxtap will board them on.
 */
export function documentsDone(
  state: NexxtapOnboarding,
  documents: NexxtapUploadedDocument[],
): boolean {
  if (!bankDone(state)) return false;
  const held = new Set(documents.map((document) => document.document_type));
  return requiredDocumentSlots(hasTrust(state.activity)).every((slot) =>
    held.has(slot),
  );
}

/** The step ids that count as complete, for the tracker and the progress bar. */
export function stepsDone(
  state: NexxtapOnboarding,
  documents: NexxtapUploadedDocument[],
): NexxtapStepId[] {
  const done: NexxtapStepId[] = ["overview"];
  if (businessDone(state)) done.push("business");
  if (applicantDone(state)) done.push("applicant");
  if (ownersDone(state)) done.push("owners");
  if (activityDone(state)) done.push("activity");
  if (facilitiesDone(state)) done.push("facilities");
  if (bankDone(state)) done.push("bank");
  if (documentsDone(state, documents)) done.push("documents");
  return done;
}

/** How many form steps still need attention — Overview isn't one of them. */
export function actionsRequired(
  state: NexxtapOnboarding,
  documents: NexxtapUploadedDocument[],
): number {
  return NEXXTAP_STEPS.length - 1 - (stepsDone(state, documents).length - 1);
}

/* ------------------------------------------------------------------ *
 * Building what goes on the wire
 * ------------------------------------------------------------------ */

/**
 * Strips every empty value, at any depth.
 *
 * Mirrors the service's own `payloadMapper.removeUndefined` so both sides
 * agree on what counts as "not answered" — Nexxtap validates a key that is
 * present and blank differently from one that is absent.
 */
function cleanPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    const cleaned = value
      .map(cleanPayload)
      .filter((item) => item !== undefined && item !== null && item !== "");
    return cleaned.length === 0 ? undefined : cleaned;
  }
  if (value !== null && typeof value === "object") {
    const cleaned = Object.entries(value as Record<string, unknown>).reduce<
      Record<string, unknown>
    >((accumulator, [key, item]) => {
      const next = cleanPayload(item);
      if (next !== undefined && next !== null && next !== "") {
        accumulator[key] = next;
      }
      return accumulator;
    }, {});
    return Object.keys(cleaned).length === 0 ? undefined : cleaned;
  }
  if (value === undefined || value === null || value === "") return undefined;
  return value;
}

/** The Activity section as the wire wants it — the payment mix nests under `processing_payments`. */
function activityPayload(activity: NexxtapActivity) {
  return {
    company_have_a_trust: activity.company_have_a_trust,
    // Only sent when there actually is a trust; an empty name on a non-trust
    // application is a validation error rather than a blank.
    ...(hasTrust(activity) && activity.trust_name
      ? { trust_name: activity.trust_name }
      : {}),
    had_a_merchant_facility_terminated:
      activity.had_a_merchant_facility_terminated,
    currently_have_any_merchant_facilities:
      activity.currently_have_any_merchant_facilities,
    estimated_annual_turnover: activity.estimated_annual_turnover,
    average_number_of_credit_card_sales_per_month:
      activity.average_number_of_credit_card_sales_per_month,
    processing_payments: {
      face_to_face: 1,
      ecommerce: 1,
      face_to_face_usage_percentage: activity.face_to_face_usage_percentage,
      ecommerce_usage_percentage: activity.ecommerce_usage_percentage,
    },
  };
}

/** The Facilities section as the wire wants it — devices are a pair of flags, not a list. */
function facilitiesPayload(facilities: NexxtapFacilities) {
  const subscriptions =
    String(facilities.do_you_process_subscriptions_or_memberships) === "1";

  return {
    payment_devices: {
      android: facilities.selected_devices?.includes("android") ? 1 : 0,
      ios: facilities.selected_devices?.includes("ios") ? 1 : 0,
    },
    do_you_process_subscriptions_or_memberships:
      facilities.do_you_process_subscriptions_or_memberships,
    ...(subscriptions
      ? {
          term_of_your_subscription: facilities.term_of_your_subscription,
          frequency_of_subscriptions: facilities.frequency_of_subscriptions,
          transaction_information_notes:
            facilities.transaction_information_notes,
        }
      : {}),
    require_online_ecomm_facility: facilities.require_online_ecomm_facility,
    require_online_nexxpos_facility: facilities.require_online_nexxpos_facility,
    require_online_amex_facility: facilities.require_online_amex_facility,
    customer_pays_surcharge: facilities.customer_pays_surcharge,
  };
}

/** Digits only, for the number fields people type with spaces or dashes. */
function digitFields<T extends Record<string, unknown>>(
  value: T,
  keys: (keyof T)[],
): T {
  const next = { ...value };
  for (const key of keys) {
    if (typeof next[key] === "string") {
      next[key] = digitsOnly(next[key]) as T[keyof T];
    }
  }
  return next;
}

const businessPayload = (business: NexxtapBusiness) =>
  digitFields(business, ["abn", "contact_support_number", "post_code"]);
const applicantPayload = (applicant: NexxtapApplicant) =>
  digitFields(applicant, ["contact_number", "post_code"]);
const ownersPayload = (owners: NexxtapOwner[]) =>
  owners.map((owner) => digitFields(owner, ["contact_number", "post_code"]));
const bankPayload = (bank: NexxtapBank) =>
  digitFields(bank, ["bsb", "account_number"]);

/** One section, in the shape `save-step` expects for it. */
export function sectionPayload(
  step: NexxtapStepId,
  state: NexxtapOnboarding,
): unknown {
  switch (step) {
    case "business":
      return cleanPayload(businessPayload(state.business));
    case "applicant":
      return cleanPayload(applicantPayload(state.applicant));
    case "owners":
      return cleanPayload(ownersPayload(state.owners));
    case "activity":
      return cleanPayload(activityPayload(state.activity));
    case "facilities":
      return cleanPayload(facilitiesPayload(state.facilities));
    case "bank":
      return cleanPayload(bankPayload(state.bank));
    default:
      return undefined;
  }
}

/** The complete application, for the `create-or-update` call that precedes a submit. */
export function buildFullPayload(state: NexxtapOnboarding): unknown {
  return cleanPayload({
    business_information: businessPayload(state.business),
    authorised_applicant_details: applicantPayload(state.applicant),
    ultimate_beneficial_owners: ownersPayload(state.owners),
    business_activity: activityPayload(state.activity),
    facilities_required: facilitiesPayload(state.facilities),
    settlement_bank_account: bankPayload(state.bank),
  });
}

/* ------------------------------------------------------------------ *
 * The API
 *
 * Plain JSON against sole-ocr's `/nexxtap/*` proxy, on the shared `api`
 * client — so the session's Bearer token is what identifies the merchant.
 * ------------------------------------------------------------------ */

type Envelope<T> = { success: boolean; message?: string; data?: T };

type OnboardingRecord = {
  status?: string;
  nexxtap_application_id?: string | number | null;
  completion_percentage?: number | string | null;
  draft_payload?: Record<string, unknown> | null;
  submitted_at?: string | null;
};

export type NexxtapDraftResult = {
  state: NexxtapOnboarding;
  meta: NexxtapMeta;
  documents: NexxtapUploadedDocument[];
};

const KNOWN_STATUSES: NexxtapStatus[] = [
  "not_started",
  "draft",
  "in_progress",
  "pending_submission",
  "submitted",
  "under_review",
  "needs_update",
  "approved",
  "declined",
  "rejected",
  "cancelled",
  "failed",
];

function toStatus(value: unknown): NexxtapStatus {
  const raw = String(value ?? "").toLowerCase();
  return (KNOWN_STATUSES as string[]).includes(raw)
    ? (raw as NexxtapStatus)
    : "not_started";
}

/** Statuses only an application Nexxtap has actually received can be in. */
const SUBMITTED_STATUSES: NexxtapStatus[] = [
  "submitted",
  "under_review",
  "approved",
  "declined",
  "rejected",
];

function toMeta(onboarding: OnboardingRecord | undefined): NexxtapMeta {
  const applicationId = onboarding?.nexxtap_application_id;
  const status = toStatus(onboarding?.status);
  return {
    applicationId:
      applicationId == null || applicationId === "" ? null : String(applicationId),
    // `submitted_at` is only written once Nexxtap's submit succeeds, so it
    // survives a later `needs_update`; the status list covers older rows.
    submitted: Boolean(onboarding?.submitted_at) || SUBMITTED_STATUSES.includes(status),
    status,
    completion: Number(onboarding?.completion_percentage ?? 0) || 0,
  };
}

function toDocuments(list: unknown): NexxtapUploadedDocument[] {
  if (!Array.isArray(list)) return [];
  return list.map((raw) => {
    const document = raw as Record<string, unknown>;
    return {
      id: String(document.id ?? ""),
      document_type: String(document.document_type ?? ""),
      original_filename: String(document.original_filename ?? "Document"),
      uploaded_at:
        document.uploaded_at == null ? undefined : String(document.uploaded_at),
    };
  });
}

/**
 * The saved draft, the application's status and whatever documents are on
 * file — one call, because `GET /nexxtap/onboarding` returns all three and
 * the shell needs all three on every step.
 *
 * `prefill` is folded in here rather than in the screens so the precedence
 * (draft wins, profile fills the gaps) lives in one place.
 */
export async function fetchNexxtapOnboarding(
  business: BusinessProfile | null,
  user: SessionUser | null,
): Promise<NexxtapDraftResult> {
  const response = await api.get<
    Envelope<{
      onboarding?: OnboardingRecord;
      documents?: unknown;
    }>
  >(apiRoutes.nexxtap.onboarding);

  if (!response.data?.success) {
    throw new Error(
      response.data?.message || "Couldn't load your NextTap application.",
    );
  }

  const data = response.data.data ?? {};
  const prefill = prefillFromBusiness(business, user);

  return {
    state: hydrateFromDraft(data.onboarding?.draft_payload ?? undefined, prefill),
    meta: toMeta(data.onboarding),
    documents: toDocuments(data.documents),
  };
}

/** The industry list, which the Business step's first select is built from. */
export type NexxtapOption = { value: string; label: string };

async function fetchOptions(url: string): Promise<NexxtapOption[]> {
  const response = await api.get<Envelope<{ options?: NexxtapOption[] }>>(url);
  return response.data?.data?.options ?? [];
}

export function fetchIndustryTypes(): Promise<NexxtapOption[]> {
  return fetchOptions(apiRoutes.nexxtap.industryTypes);
}

/** The products and services under one industry. Empty until an industry is picked. */
export function fetchIndustryCategories(
  industryType: string,
): Promise<NexxtapOption[]> {
  if (!industryType) return Promise.resolve([]);
  return fetchOptions(
    `${apiRoutes.nexxtap.industryCategories}/${encodeURIComponent(industryType)}`,
  );
}

/**
 * Saves one section of the draft.
 *
 * Only that section: the service deep-merges what it's given into
 * `draft_payload`, so unlike Worldpay's save this can't null out the steps
 * that weren't on screen.
 */
export async function saveNexxtapStep(
  step: NexxtapStepId,
  state: NexxtapOnboarding,
): Promise<void> {
  const stepNumber = NEXXTAP_SAVE_STEP[step];
  if (!stepNumber) return;

  const response = await api.post<Envelope<unknown>>(apiRoutes.nexxtap.saveStep, {
    step: stepNumber,
    data: sectionPayload(step, state),
  });

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Couldn't save this section.");
  }
}

/** Whatever documents the service holds for this application. */
export async function fetchNexxtapDocuments(): Promise<NexxtapUploadedDocument[]> {
  const response = await api.get<Envelope<{ documents?: unknown }>>(
    apiRoutes.nexxtap.documents,
  );
  return toDocuments(response.data?.data?.documents);
}

/**
 * Uploads the picked files in one multipart request.
 *
 * Each file goes under its slot id as the field name — that field name is how
 * the service decides which Nexxtap `file_type` to forward it as, so it can't
 * be a generic `files[]`. `has_trust` travels along because the service uses
 * it to decide whether a missing trust deed is an error.
 */
export async function uploadNexxtapDocuments(
  files: Partial<Record<NexxtapDocumentSlotId, File>>,
  trust: boolean,
): Promise<NexxtapUploadedDocument[]> {
  const form = new FormData();
  for (const [slot, file] of Object.entries(files)) {
    if (file) form.append(slot, file, file.name);
  }
  form.append("has_trust", trust ? "true" : "false");

  const response = await api.post<Envelope<{ documents?: unknown }>>(
    apiRoutes.nexxtap.documents,
    form,
    { headers: { "Content-Type": "multipart/form-data" } },
  );

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Couldn't upload your documents.");
  }

  return toDocuments(response.data.data?.documents);
}

export async function deleteNexxtapDocument(documentId: string): Promise<void> {
  const response = await api.delete<Envelope<unknown>>(
    `${apiRoutes.nexxtap.documents}/${encodeURIComponent(documentId)}`,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Couldn't remove that document.");
  }
}

/**
 * Sends the application to Nexxtap.
 *
 * Two calls in sequence, which is what the service expects: write the whole
 * assembled payload, then push it. Which push depends on whether Nexxtap has
 * accepted a submit before — `update` only amends the details, so an
 * application that has an id but was never submitted (its documents failed
 * last time) still goes through `submit`, which reuses the id, uploads the
 * pending documents and then submits.
 */
export async function submitNexxtapApplication(
  state: NexxtapOnboarding,
  meta: NexxtapMeta,
): Promise<{ applicationId: string | null; isUpdate: boolean }> {
  const isUpdate = meta.submitted;

  await api.post<Envelope<unknown>>(
    apiRoutes.nexxtap.createOrUpdate,
    buildFullPayload(state),
  );

  const response = await api.post<
    Envelope<{
      onboarding?: OnboardingRecord;
      nexxtap?: { data?: { id?: string | number } };
    }>
  >(isUpdate ? apiRoutes.nexxtap.update : apiRoutes.nexxtap.submit, {});

  const data = response.data?.data;
  const applicationId =
    data?.onboarding?.nexxtap_application_id ?? data?.nexxtap?.data?.id ?? null;

  return {
    applicationId: applicationId == null ? meta.applicationId : String(applicationId),
    isUpdate,
  };
}

/* ------------------------------------------------------------------ *
 * Nexxtap's own field errors
 * ------------------------------------------------------------------ */

/** Human names for the payload sections Nexxtap keys its errors by. */
const SECTION_LABELS: Record<string, string> = {
  business_information: "Business",
  authorised_applicant_details: "Applicant",
  ultimate_beneficial_owners: "Owners",
  business_activity: "Activity",
  facilities_required: "Facilities",
  settlement_bank_account: "Bank account",
};

export type NexxtapFieldError = {
  /** The raw `"section.field"` key, so a caller can route it back to a step. */
  key: string;
  section: string;
  field: string;
  messages: string[];
};

/**
 * Pulls the field-level errors out of a failed submit.
 *
 * Nexxtap answers a rejected application with
 * `{ data: { errors: { "business_information.website": ["…"] } } }` rather
 * than a single message, so the useful thing to show is one line per field —
 * a lone "submission failed" toast would hide which of thirty answers it
 * actually objected to.
 */
export function parseNexxtapErrors(error: unknown): {
  fieldErrors: NexxtapFieldError[];
  message: string | null;
} {
  const response = (error as { response?: { data?: Record<string, unknown> } })
    ?.response?.data;
  const body = (response?.data ?? response) as Record<string, unknown> | undefined;
  const raw = (body?.errors ?? {}) as Record<string, unknown>;

  const titleCase = (value: string) =>
    value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());

  const fieldErrors = Object.entries(raw).map(([key, value]) => {
    const [sectionKey, ...rest] = key.split(".");
    return {
      key,
      section: SECTION_LABELS[sectionKey] ?? titleCase(sectionKey),
      field: titleCase(rest.join(" ")),
      messages: Array.isArray(value) ? value.map(String) : [String(value)],
    };
  });

  const message =
    typeof body?.error === "string"
      ? body.error
      : typeof body?.message === "string"
        ? body.message
        : error instanceof Error
          ? error.message
          : null;

  return { fieldErrors, message };
}

/** Which step a `"section.field"` error belongs to, so the toast can point somewhere. */
export function stepForErrorKey(key: string): NexxtapStepId | null {
  const section = key.split(".")[0];
  switch (section) {
    case "business_information":
      return "business";
    case "authorised_applicant_details":
      return "applicant";
    case "ultimate_beneficial_owners":
      return "owners";
    case "business_activity":
      return "activity";
    case "facilities_required":
      return "facilities";
    case "settlement_bank_account":
      return "bank";
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ *
 * The Payments card
 * ------------------------------------------------------------------ */

/**
 * Just the status, for the gateway card on the Payments screen.
 *
 * `GET /nexxtap/onboarding/status` rather than the full `/nexxtap/onboarding`
 * the shell uses — the card only needs where the application stands and how
 * far through it is, and fetching the whole draft plus every document to
 * render a badge would be most of a page's payload for one line of text.
 */
export async function fetchNexxtapStatus(): Promise<NexxtapMeta> {
  const response = await api.get<Envelope<OnboardingRecord>>(
    apiRoutes.nexxtap.status,
  );
  if (!response.data?.success) return EMPTY_NEXXTAP_META;
  return toMeta(response.data.data);
}

/** How the card should read, given what the service says. */
export type NexxtapCardState = {
  /** Maps onto the gateway card's own status vocabulary. */
  status: "not-started" | "onboarding" | "pending" | "connected";
  action: string;
  /** 0–100. Only worth showing while the application is still being filled in. */
  completion: number;
};

export function nexxtapCardState(meta: NexxtapMeta): NexxtapCardState {
  if (meta.status === "approved") {
    return { status: "connected", action: "Manage application", completion: 100 };
  }
  // The service also sets `needs_update` when a first submit fails on its
  // documents, before Nexxtap ever had it — that one is still "Continue".
  if (meta.status === "needs_update" && meta.submitted) {
    return { status: "onboarding", action: "Update application", completion: meta.completion };
  }
  if (
    meta.status === "submitted" ||
    meta.status === "under_review" ||
    meta.status === "declined" ||
    meta.status === "rejected"
  ) {
    return { status: "pending", action: "View application", completion: 100 };
  }
  // A draft that's been started at all — a saved section, or an id already
  // issued — is "onboarding"; only an untouched application offers to start.
  if (
    meta.status === "in_progress" ||
    meta.status === "draft" ||
    meta.status === "failed" ||
    meta.status === "pending_submission" ||
    meta.completion > 0 ||
    meta.applicationId
  ) {
    return { status: "onboarding", action: "Continue onboarding", completion: meta.completion };
  }
  return { status: "not-started", action: "Start onboarding", completion: 0 };
}
