/**
 * Accountant (SPM) referral links — ported from sole-webapp's utils/spmReferral.js.
 *
 * An accountant invites a client from the SPM app. The email's link lands on the
 * sign-up door with the accountant id and the client's email as MANDATORY params
 * and a handful of optional ones the accountant already knew:
 *
 *   /register?spm_accountant_id=<id>&email=<email>          (/signup redirects here)
 *            &name=&business_name=&business_email=&abn=&coupon_code=&switching_from=
 *            &accountant_email=&industry_id=&phone=
 *            &sig=&exp=                                      (signature, checked by the backend)
 *
 * The same fields can instead travel as ONE encrypted value, so personal details
 * are not readable in the URL (browser history, email click tracking, logs):
 *
 *   /accountant-invite?data=<AES-encrypted JSON>
 *
 * When `data` is present it is the only source; one that cannot be decrypted
 * makes the link invalid rather than falling back to whatever else is on the URL.
 *
 * Everything on the URL is a prefill, never a fact: the backend verifies the
 * signature and owns attribution. This module captures the params, keeps them
 * across the sign-up → verify → onboarding hops, and hands them to the sign-up
 * request and the onboarding form. A link missing the accountant id or the email
 * is not a referral at all, so it is ignored and the page is a plain sign-up.
 */

import { apiGet, apiPost } from "@/lib/api/client";
import { ensureDeviceId } from "@/lib/api/device";
import { getAuthTenantSlug, PLATFORM } from "@/lib/api/env";
import { apiRoutes } from "@/lib/api/routes";
import { getAccessToken, setSession } from "@/lib/api/session";
import type { AuthUser } from "@/lib/api/types";
import { decryptUrlParam } from "@/utils/encrypt";

export type SpmReferral = {
  /**
   * The integration partner that sent the invite (e.g. `spm`,
   * `sole_command_centre`). Empty on links from before partners existed; the
   * backend treats that as SPM.
   */
  partner: string;
  accountant_id: string;
  email: string;
  name: string;
  business_name: string;
  business_email: string;
  abn: string;
  /** ISO 3166-1 alpha-2 of the client's business, as the accountant set it. A hint; empty when not given. */
  country_iso2: string;
  coupon_code: string;
  switching_from: string;
  phone: string;
  accountant_email: string;
  industry_id: string;
  sig: string;
  exp: string;
};

/** What goes up with a sign-up: the referral with its empty fields left out. */
export type SpmReferralPayload = Partial<SpmReferral>;

const STORAGE_KEY = "sole.spm-referral";
// Long enough to read the verification email and come back; short enough that a
// stale link never attributes an unrelated sign-up days later.
const TTL_MS = 24 * 60 * 60 * 1000;

export const SPM_REFERRAL_PARAMS = {
  accountantId: "spm_accountant_id",
  email: "email",
  sig: "sig",
  exp: "exp",
} as const;

const MAX_LEN = {
  accountant_id: 64,
  email: 254,
  name: 100,
  business_name: 100,
  business_email: 254,
  coupon_code: 50,
  switching_from: 100,
  accountant_email: 254,
  industry_id: 6,
  phone: 20,
  sig: 256,
  exp: 20,
} as const;

// A literal "+" in a query string is read back as a space, so an address like
// jane+test@example.com arrives as "jane test@example.com". Email addresses
// can't contain spaces, so restoring the plus is always right.
const restorePlus = (value: string) => value.replace(/ /g, "+");

// Digits with an optional leading +, spaces, dashes and brackets.
const PHONE_RE = /^\+?[\d\s()-]{6,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** A partner slug, as sole-ocr validates it. */
const PARTNER_SLUG_RE = /^[a-z][a-z0-9_]{1,31}$/;

const clean = (value: string | null, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/**
 * Unpack the encrypted `data` parameter, or null when it is there but unusable.
 * Undefined when there is none.
 */
function readPacked(params: URLSearchParams): URLSearchParams | null | undefined {
  const packed = params.get("data");
  if (!packed) return undefined;

  const json = decryptUrlParam(packed.replace(/ /g, "+"));
  // decryptUrlParam hands the input back unchanged when it cannot decrypt it.
  if (!json || json === packed) return null;

  try {
    const obj: unknown = JSON.parse(json);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const unpacked = new URLSearchParams();
    Object.entries(obj as Record<string, unknown>).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      // The payload says accountant_id; the plain link says spm_accountant_id.
      unpacked.set(
        key === "accountant_id" ? SPM_REFERRAL_PARAMS.accountantId : key,
        String(value),
      );
    });
    return unpacked;
  } catch {
    return null;
  }
}

/**
 * Turn a URL query into a referral, or null when it is not a usable one. Bad
 * optional values are dropped rather than rejected: a mistyped ABN in an email
 * must not stop someone signing up.
 */
export function parseSpmReferral(search: string): SpmReferral | null {
  const query = new URLSearchParams(search || "");
  const packed = readPacked(query);
  if (packed === null) return null;
  const params = packed || query;

  const accountantId = clean(
    params.get(SPM_REFERRAL_PARAMS.accountantId),
    MAX_LEN.accountant_id,
  );
  const email = restorePlus(
    clean(params.get(SPM_REFERRAL_PARAMS.email), MAX_LEN.email),
  ).toLowerCase();

  if (!accountantId || !EMAIL_RE.test(email)) return null;

  const abn = clean(params.get("abn"), 32).replace(/\s/g, "");
  const countryRaw = clean(params.get("country_iso2"), 8).toUpperCase();
  const countryIso2 = /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : "";
  const businessEmail = restorePlus(
    clean(params.get("business_email"), MAX_LEN.business_email),
  ).toLowerCase();
  const accountantEmail = restorePlus(
    clean(params.get("accountant_email"), MAX_LEN.accountant_email),
  ).toLowerCase();
  const industryId = clean(params.get("industry_id"), MAX_LEN.industry_id);
  const phone = clean(params.get("phone"), MAX_LEN.phone).replace(/^ /, "+");
  // Same slug rule as the backend; anything else is dropped (→ treated as SPM).
  const partner = clean(params.get("partner"), 32).toLowerCase();

  return {
    partner: PARTNER_SLUG_RE.test(partner) ? partner : "",
    accountant_id: accountantId,
    email,
    name: clean(params.get("name"), MAX_LEN.name),
    business_name: clean(params.get("business_name"), MAX_LEN.business_name),
    business_email: EMAIL_RE.test(businessEmail) ? businessEmail : "",
    // An ABN is 11 digits; another country's number has its own length (checked by the backend).
    abn: (countryIso2 && countryIso2 !== "AU" ? /^\d{8,15}$/ : /^\d{11}$/).test(
      abn,
    )
      ? abn
      : "",
    country_iso2: countryIso2,
    coupon_code: clean(params.get("coupon_code"), MAX_LEN.coupon_code),
    switching_from: clean(params.get("switching_from"), MAX_LEN.switching_from),
    phone: PHONE_RE.test(phone) ? phone : "",
    accountant_email: EMAIL_RE.test(accountantEmail) ? accountantEmail : "",
    industry_id: /^\d{1,6}$/.test(industryId) ? industryId : "",
    sig: clean(params.get(SPM_REFERRAL_PARAMS.sig), MAX_LEN.sig),
    exp: clean(params.get(SPM_REFERRAL_PARAMS.exp), MAX_LEN.exp),
  };
}

function readStore(): SpmReferral | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { referral?: SpmReferral; savedAt?: number };
    if (!parsed?.referral || Date.now() - Number(parsed.savedAt) > TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.referral;
  } catch {
    return null;
  }
}

function writeStore(referral: SpmReferral): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ referral, savedAt: Date.now() }),
    );
  } catch {
    // Storage blocked: the current page still works from the returned value.
  }
}

/** The referral currently held for this browser, if any and still fresh. */
export function getSpmReferral(): SpmReferral | null {
  if (typeof window === "undefined") return null;
  return readStore();
}

/**
 * Read the referral off the current URL and keep it. A new valid link replaces
 * an older one (the most recent invite is the one the client acted on); a URL
 * with no referral leaves what is stored untouched, because the verify and
 * onboarding steps are different pages without the params.
 */
export function captureSpmReferral(
  search: string = typeof window === "undefined" ? "" : window.location.search,
): SpmReferral | null {
  if (typeof window === "undefined") return null;
  const fromUrl = parseSpmReferral(search);
  if (!fromUrl) return readStore();
  writeStore(fromUrl);
  return fromUrl;
}

/**
 * Save what the client changed on the invite page. The partner, the accountant
 * id and the signature are never taken from the form — only the invite itself
 * carries them.
 */
export function updateSpmReferral(
  patch: Partial<SpmReferral>,
): SpmReferral | null {
  if (typeof window === "undefined") return null;
  const current = readStore();
  if (!current) return null;
  const next: SpmReferral = {
    ...current,
    ...patch,
    partner: current.partner ?? "",
    accountant_id: current.accountant_id,
    sig: current.sig,
    exp: current.exp,
  };
  writeStore(next);
  return next;
}

export function clearSpmReferral(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to clear
  }
}

/** The object sent with a sign-up request. Empty optional fields are omitted. */
export function buildSpmReferralPayload(
  referral: SpmReferral | null | undefined,
): SpmReferralPayload | undefined {
  if (!referral) return undefined;
  return Object.fromEntries(
    Object.entries(referral).filter(([, value]) => value !== ""),
  ) as SpmReferralPayload;
}

/* ------------------------------------------------------------------ *
 * Backend
 * ------------------------------------------------------------------ */

/**
 * The signed-in client's own invite, as the backend kept it — the copy that
 * covers a verification link opened in a different browser from the invite.
 *
 * Only asked with a session: an anonymous call would be read as an expired one
 * and sign the visitor out of a screen they were never signed in to.
 */
export async function fetchMySpmReferral(): Promise<SpmReferralPayload | null> {
  if (!getAccessToken()) return null;
  const result = await apiGet<SpmReferralPayload | null>(
    apiRoutes.spmReferral.me,
    { auth: "bearer" },
  );
  return result.success && result.data ? result.data : null;
}

export type InviteSignUpParams = {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  coupon_code?: string;
  join_from?: string;
  accountant_email?: string;
  has_accountant_email?: number;
  business_email?: string;
  business_name?: string;
  abn?: string;
  country_iso2?: string;
  industry_id?: string;
  spm_referral: SpmReferralPayload | undefined;
};

/**
 * "ready" — a trusted invite (valid signature, the invited address): activated
 * on the spot, and a session now exists. "verify" — any other invite: the
 * ordinary verification email is on its way. "exists" — the address is already
 * an account, so the way on is signing in.
 */
export type InviteSignUpResult =
  | { ok: true; status: "ready"; user: AuthUser }
  | { ok: true; status: "verify" }
  | { ok: false; reason: "exists" | "other"; message: string };

const ALREADY_REGISTERED = /already in use|already exists|already registered/i;

/**
 * Sign-up for a client arriving from an accountant's invite. Same account
 * creation as /auth/signup, through the dedicated endpoint, which records the
 * referral. The tenant goes up like every other sign-up's.
 */
export async function signUpFromInvite(
  params: InviteSignUpParams,
): Promise<InviteSignUpResult> {
  const device_id = await ensureDeviceId();
  if (!device_id) {
    return {
      ok: false,
      reason: "other",
      message:
        "We couldn't set this browser up for sign-in. Refresh the page and try again.",
    };
  }

  const result = await apiPost<{ user?: AuthUser; pending_verification?: boolean }>(
    apiRoutes.spmReferral.signup,
    {
      ...params,
      email: params.email.trim().toLowerCase(),
      confirm_password: params.password,
      country_code: "+61",
      device_id,
      platform: PLATFORM,
      // The backend's request pipeline resolves a tenant from the body and
      // rejects a sign-up without one, even though the invite itself is always
      // created under the default tenant.
      tenant: getAuthTenantSlug(),
    },
  );

  if (!result.success) {
    const message = result.message || "We couldn't create your account.";
    return {
      ok: false,
      reason: ALREADY_REGISTERED.test(message) ? "exists" : "other",
      message,
    };
  }

  const user = result.data?.user;
  if (user) {
    setSession(user);
    return { ok: true, status: "ready", user };
  }
  return { ok: true, status: "verify" };
}
