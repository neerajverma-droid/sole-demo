import apiRoutes from "@/config/api-routes";
import api from "@/utils/axiosInstance";
import type { PillTone } from "@/lib/admin/format";

/**
 * Integration partners (SPM and others), for the super-admin Partners pages.
 *
 * Backed by sole-ocr's `/api/super/partners` (src/modules/partner/partners).
 * Like every `/super/*` route it reads plain JSON, so nothing here encrypts.
 *
 * A key's secret comes back exactly once — from issuing or rotating it. It is
 * never stored here, in query cache or anywhere else: the caller shows it in
 * the reveal dialog and lets it go.
 */

/* -------------------------------------------------------------------------- *
 * Types
 * -------------------------------------------------------------------------- */

export type PartnerStatus = "sandbox" | "live" | "suspended";
export type KeyEnv = "sandbox" | "live";

export type PartnerBranding = {
  displayName: string;
  logoUrl: string;
  supportEmail: string;
  website: string;
};

export type Partner = {
  id: string;
  slug: string;
  name: string;
  sourcePartner: string;
  status: PartnerStatus;
  billingEnabled: boolean;
  maxSponsoredSubscriptions: number | null;
  returnUrlAllowlist: string[];
  branding: PartnerBranding;
  createdAt: string | null;
};

export type PartnerKey = {
  id: string;
  clientId: string;
  env: KeyEnv;
  status: "active" | "revoked";
  scopes: string[];
  label: string | null;
  rotationPending: boolean;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string | null;
};

export type PartnerDetail = Partner & { keys: PartnerKey[] };

/** What issuing or rotating returns. Show it once; never keep it. */
export type IssuedSecret = { clientId: string; clientSecret: string; key: PartnerKey };

type ApiPartner = {
  id: number | string;
  slug?: string;
  name?: string;
  source_partner?: string;
  status?: string;
  billing_enabled?: boolean | number;
  max_sponsored_subscriptions?: number | null;
  return_url_allowlist?: string[] | null;
  branding?: Partial<Record<"display_name" | "logo_url" | "support_email" | "website", string>> | null;
  created_at?: string | null;
  keys?: ApiKey[];
};

type ApiKey = {
  id: number | string;
  client_id?: string;
  env?: string;
  status?: string;
  scopes?: string[] | null;
  label?: string | null;
  rotation_pending?: boolean;
  last_used_at?: string | null;
  revoked_at?: string | null;
  created_at?: string | null;
};

type ApiEnvelope<T> = { success?: boolean; message?: string; code?: string; data?: T };

/* -------------------------------------------------------------------------- *
 * Constants
 * -------------------------------------------------------------------------- */

export const PARTNER_STATUS_FILTERS = ["All", "Sandbox", "Live", "Suspended"] as const;
export type PartnerStatusFilter = (typeof PARTNER_STATUS_FILTERS)[number];

export const SOURCE_OPTIONS = [
  { value: "external", label: "External system" },
  { value: "spm", label: "SPM" },
  { value: "sole_cc", label: "Sole Command Centre" },
] as const;

/** Every scope a key can hold, with what it lets the partner do. */
export const PARTNER_SCOPES = [
  { key: "referrals:read", label: "Read referrals", description: "See the clients its accountants referred and their status." },
  { key: "accountants:read", label: "Read accountants", description: "List its accountants and their clients." },
  { key: "accountants:write", label: "Manage accountants", description: "Add and update its accountants." },
  { key: "clients:write", label: "Refer clients", description: "Invite clients on an accountant's behalf." },
  { key: "plans:read", label: "Read plans", description: "See Sole's plans and add-ons with prices (the whole subscription system)." },
  { key: "billing:write", label: "Accountant pays", description: "Start checkouts where the accountant pays." },
  { key: "billing:manage", label: "Manage paid plans", description: "Change or cancel plans its accountants pay for." },
  { key: "impersonate", label: "Open client accounts", description: "Create one-time login links for clients who granted access." },
] as const;

/** Same default as the backend: read access plus client-pays referrals. */
export const DEFAULT_SCOPES = ["referrals:read", "accountants:read", "accountants:write", "clients:write", "plans:read"];

/* -------------------------------------------------------------------------- *
 * Mapping
 * -------------------------------------------------------------------------- */

const STATUSES: PartnerStatus[] = ["sandbox", "live", "suspended"];

export function mapPartner(row: ApiPartner): Partner {
  const branding = row.branding ?? {};
  return {
    id: String(row.id),
    slug: row.slug ?? "",
    name: row.name?.trim() || row.slug || "Unnamed partner",
    sourcePartner: row.source_partner ?? "external",
    status: STATUSES.includes(row.status as PartnerStatus) ? (row.status as PartnerStatus) : "sandbox",
    billingEnabled: Boolean(row.billing_enabled),
    maxSponsoredSubscriptions: typeof row.max_sponsored_subscriptions === "number" ? row.max_sponsored_subscriptions : null,
    returnUrlAllowlist: Array.isArray(row.return_url_allowlist) ? row.return_url_allowlist : [],
    branding: {
      displayName: branding.display_name ?? "",
      logoUrl: branding.logo_url ?? "",
      supportEmail: branding.support_email ?? "",
      website: branding.website ?? "",
    },
    createdAt: row.created_at ?? null,
  };
}

export function mapKey(row: ApiKey): PartnerKey {
  return {
    id: String(row.id),
    clientId: row.client_id ?? "",
    env: row.env === "live" ? "live" : "sandbox",
    status: row.status === "revoked" ? "revoked" : "active",
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    label: row.label ?? null,
    rotationPending: Boolean(row.rotation_pending),
    lastUsedAt: row.last_used_at ?? null,
    revokedAt: row.revoked_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

function mapIssued(data: { client_id?: string; client_secret?: string; key?: ApiKey } | undefined): IssuedSecret {
  if (!data?.client_secret || !data.client_id || !data.key) throw new Error("The new secret wasn't returned. Try again.");
  return { clientId: data.client_id, clientSecret: data.client_secret, key: mapKey(data.key) };
}

/* -------------------------------------------------------------------------- *
 * Errors — the backend's codes as plain sentences
 * -------------------------------------------------------------------------- */

const ERROR_COPY: Record<string, string> = {
  slug_taken: "That slug is already used by another partner.",
  slug_immutable: "A partner's slug can't be changed once it's created.",
  partner_suspended: "Reactivate the partner before issuing keys.",
  partner_not_live: "Live keys need a live partner. Approve go-live first.",
  key_revoked: "That key is revoked.",
  no_rotation: "There's no new secret waiting to be promoted.",
  login_as_not_allowed: "Partners can't be managed while you're logged in as someone else.",
};

/** A readable message from a partner API error: code copy first, then the server's message. */
export function partnerErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: ApiEnvelope<unknown> & { details?: Record<string, string> } } })?.response?.data;
  if (data?.code && ERROR_COPY[data.code]) return ERROR_COPY[data.code];
  if (data?.details && typeof data.details === "object") {
    const first = Object.values(data.details).find((value) => typeof value === "string");
    if (first) return first;
  }
  if (data?.message) return data.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Field errors from a 422, keyed by the form's own field names. */
export function partnerFieldErrors(error: unknown): Partial<Record<keyof PartnerForm, string>> {
  const details = (error as { response?: { data?: { details?: Record<string, string> } } })?.response?.data?.details;
  if (!details) return {};
  const map: Record<string, keyof PartnerForm> = {
    slug: "slug",
    name: "name",
    source_partner: "sourcePartner",
    max_sponsored_subscriptions: "maxSponsored",
    return_url_allowlist: "returnUrls",
    branding: "branding",
  };
  const out: Partial<Record<keyof PartnerForm, string>> = {};
  for (const [field, message] of Object.entries(details)) {
    const key = map[field];
    if (key && typeof message === "string") out[key] = message;
  }
  return out;
}

/* -------------------------------------------------------------------------- *
 * Form — the onboarding steps and the settings card share it
 * -------------------------------------------------------------------------- */

export type PartnerForm = {
  name: string;
  slug: string;
  sourcePartner: string;
  billingEnabled: boolean;
  /** Text, so an empty box means "no cap". */
  maxSponsored: string;
  /** One origin per line. */
  returnUrls: string;
  branding: PartnerBranding;
};

export const EMPTY_PARTNER_FORM: PartnerForm = {
  name: "",
  slug: "",
  sourcePartner: "external",
  billingEnabled: false,
  maxSponsored: "",
  returnUrls: "",
  branding: { displayName: "", logoUrl: "", supportEmail: "", website: "" },
};

export function formFromPartner(partner: Partner): PartnerForm {
  return {
    name: partner.name,
    slug: partner.slug,
    sourcePartner: partner.sourcePartner,
    billingEnabled: partner.billingEnabled,
    maxSponsored: partner.maxSponsoredSubscriptions === null ? "" : String(partner.maxSponsoredSubscriptions),
    returnUrls: partner.returnUrlAllowlist.join("\n"),
    branding: partner.branding,
  };
}

/** Same rule as the backend: 2–32 chars, lowercase letters, digits and underscores, starting with a letter. */
export const PARTNER_SLUG_PATTERN = /^[a-z][a-z0-9_]{1,31}$/;

/** `Acme Practice & Co.` → `acme_practice_co`. */
export function partnerSlugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/g, "")
    .slice(0, 32)
    .replace(/_+$/g, "");
  return slug;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** An https origin, or http://localhost while developing. Null when it isn't one. */
export function toOrigin(value: string, allowLocalhost = process.env.NODE_ENV !== "production"): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  const local = allowLocalhost && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !local) return null;
  return url.origin;
}

export function parseReturnUrls(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export type PartnerFormStep = "details" | "plans" | "links";
export type PartnerFormIssues = Partial<Record<keyof PartnerForm | "logoUrl" | "supportEmail" | "website", string>>;

/** Everything the backend would reject, per step, so each step can stop on its own fields. */
export function partnerFormIssues(form: PartnerForm, step?: PartnerFormStep): PartnerFormIssues {
  const issues: PartnerFormIssues = {};
  const check = (s: PartnerFormStep) => !step || step === s;

  if (check("details")) {
    if (form.name.trim().length < 2) issues.name = "Enter the partner's name.";
    if (!form.slug.trim()) issues.slug = "Enter a slug.";
    else if (!PARTNER_SLUG_PATTERN.test(form.slug.trim()))
      issues.slug = "2–32 lowercase letters, digits or underscores, starting with a letter.";
  }

  if (check("plans")) {
    const cap = form.maxSponsored.trim();
    if (cap && (!/^\d+$/.test(cap) || Number(cap) > 100000)) issues.maxSponsored = "A whole number up to 100000, or leave it empty for no cap.";
  }

  if (check("links")) {
    const urls = parseReturnUrls(form.returnUrls);
    if (urls.length > 20) issues.returnUrls = "Up to 20 addresses.";
    else {
      const bad = urls.find((url) => !toOrigin(url));
      if (bad) issues.returnUrls = `"${bad}" isn't an https address.`;
    }
    if (form.billingEnabled && urls.length === 0)
      issues.returnUrls = "Add at least one return address — accountant-paid checkouts send people back to it.";
    if (form.branding.logoUrl.trim() && !toOrigin(form.branding.logoUrl)) issues.logoUrl = "Use an https image address.";
    if (form.branding.website.trim() && !toOrigin(form.branding.website)) issues.website = "Use an https address.";
    if (form.branding.supportEmail.trim() && !EMAIL.test(form.branding.supportEmail.trim()))
      issues.supportEmail = "Enter a valid email address.";
  }
  return issues;
}

/** The request body from the form. `includeSlug` is false for updates (the slug never changes). */
export function partnerBody(form: PartnerForm, { includeSlug = true } = {}): Record<string, unknown> {
  const branding: Record<string, string> = {};
  if (form.branding.displayName.trim()) branding.display_name = form.branding.displayName.trim();
  if (form.branding.logoUrl.trim()) branding.logo_url = form.branding.logoUrl.trim();
  if (form.branding.supportEmail.trim()) branding.support_email = form.branding.supportEmail.trim();
  if (form.branding.website.trim()) branding.website = form.branding.website.trim();

  const origins = parseReturnUrls(form.returnUrls)
    .map((url) => toOrigin(url))
    .filter((origin): origin is string => Boolean(origin));

  return {
    ...(includeSlug ? { slug: form.slug.trim() } : {}),
    name: form.name.trim(),
    source_partner: form.sourcePartner,
    billing_enabled: form.billingEnabled,
    max_sponsored_subscriptions: form.maxSponsored.trim() === "" ? null : Number(form.maxSponsored.trim()),
    return_url_allowlist: [...new Set(origins)],
    branding,
  };
}

/* -------------------------------------------------------------------------- *
 * API
 * -------------------------------------------------------------------------- */

export async function fetchPartners({ search, status }: { search: string; status: PartnerStatusFilter }): Promise<Partner[]> {
  const params: Record<string, string> = {};
  if (search.trim()) params.q = search.trim();
  if (status !== "All") params.status = status.toLowerCase();
  const response = await api.get<ApiEnvelope<{ partners?: ApiPartner[] }>>(apiRoutes.superAdmin.partners, { params });
  if (response.data?.success === false) throw new Error(response.data.message || "The partners request failed.");
  return (response.data?.data?.partners ?? []).map(mapPartner);
}

export async function fetchPartner(id: string): Promise<PartnerDetail> {
  const response = await api.get<ApiEnvelope<{ partner?: ApiPartner }>>(apiRoutes.superAdmin.partner(id));
  const row = response.data?.data?.partner;
  if (!row) throw new Error("The partner wasn't returned.");
  return { ...mapPartner(row), keys: (row.keys ?? []).map(mapKey) };
}

export async function createPartnerApi(form: PartnerForm): Promise<Partner> {
  const response = await api.post<ApiEnvelope<{ partner?: ApiPartner }>>(apiRoutes.superAdmin.partners, partnerBody(form));
  const row = response.data?.data?.partner;
  if (!row) throw new Error("The new partner wasn't returned.");
  return mapPartner(row);
}

export async function updatePartnerApi(id: string, body: Record<string, unknown>): Promise<Partner> {
  const response = await api.patch<ApiEnvelope<{ partner?: ApiPartner }>>(apiRoutes.superAdmin.partner(id), body);
  const row = response.data?.data?.partner;
  if (!row) throw new Error("The updated partner wasn't returned.");
  return mapPartner(row);
}

export async function issueKeyApi(
  partnerId: string,
  input: { env: KeyEnv; scopes: string[]; label?: string },
): Promise<IssuedSecret> {
  const body: Record<string, unknown> = { env: input.env, scopes: input.scopes };
  if (input.label?.trim()) body.label = input.label.trim();
  const response = await api.post<ApiEnvelope<{ client_id?: string; client_secret?: string; key?: ApiKey }>>(
    apiRoutes.superAdmin.partnerKeys(partnerId),
    body,
  );
  return mapIssued(response.data?.data);
}

export async function rotateKeyApi(partnerId: string, keyId: string): Promise<IssuedSecret> {
  const response = await api.post<ApiEnvelope<{ client_id?: string; client_secret?: string; key?: ApiKey }>>(
    apiRoutes.superAdmin.partnerKeyAction(partnerId, keyId, "rotate"),
  );
  return mapIssued(response.data?.data);
}

export async function promoteKeyApi(partnerId: string, keyId: string): Promise<PartnerKey> {
  const response = await api.post<ApiEnvelope<{ key?: ApiKey }>>(apiRoutes.superAdmin.partnerKeyAction(partnerId, keyId, "promote"));
  if (!response.data?.data?.key) throw new Error("The key wasn't returned.");
  return mapKey(response.data.data.key);
}

export async function revokeKeyApi(partnerId: string, keyId: string): Promise<PartnerKey> {
  const response = await api.post<ApiEnvelope<{ key?: ApiKey }>>(apiRoutes.superAdmin.partnerKeyAction(partnerId, keyId, "revoke"));
  if (!response.data?.data?.key) throw new Error("The key wasn't returned.");
  return mapKey(response.data.data.key);
}

/* -------------------------------------------------------------------------- *
 * Display
 * -------------------------------------------------------------------------- */

export const PARTNER_STATUS_COPY: Record<PartnerStatus, { label: string; tone: PillTone }> = {
  sandbox: { label: "Sandbox", tone: "info" },
  live: { label: "Live", tone: "success" },
  suspended: { label: "Suspended", tone: "danger" },
};

export function scopeLabel(scope: string): string {
  return PARTNER_SCOPES.find((s) => s.key === scope)?.label ?? scope;
}
