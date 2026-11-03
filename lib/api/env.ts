/**
 * The handful of environment facts every API call needs.
 *
 * Same names as sole-webapp reads, so one .env serves both apps and nothing has
 * to be re-pointed when a deployment moves between them.
 */

/** Backend base, e.g. https://api.soleapp.com.au/api. */
export const API_BASE = process.env.NEXT_PUBLIC_SOLE_OCR_URL || "";

/**
 * Every backend route requires this header. Without it a call 401s with
 * "Missing Authorization header" regardless of the bearer token, so it goes on
 * every request rather than only the authenticated ones.
 */
export const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";

/** What the backend calls this client. Device rows are keyed by it. */
export const PLATFORM = "WEBP";

export const BASE_DOMAIN =
  process.env.NEXT_PUBLIC_BASE_DOMAIN || "soleapp.com.au";

/**
 * The tenant a person joins when the host carries no subdomain — localhost, the
 * apex domain, preview deployments.
 *
 * "sole" is the tenant seeded by sole-ocr's 0004_backfill_default_tenant
 * migration, and it is the same fallback sole-webapp uses. Getting it wrong is
 * not a soft failure: signup comes back "Organisation not found" and no account
 * is created at all.
 */
const DEFAULT_TENANT_SLUG =
  process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG || "sole";

/** Whether there's a backend to talk to at all. */
export const API_CONFIGURED = Boolean(API_BASE);

/** The tenant this browser is on, or null off any tenant subdomain. */
export function getTenantSlug(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  if (!host.endsWith(`.${BASE_DOMAIN}`)) return null;
  const sub = host.slice(0, host.length - BASE_DOMAIN.length - 1).split(".")[0];
  if (!sub || sub === "www" || sub === "admin") return null;
  return sub;
}

/**
 * The slug to send with signup and OAuth. Unlike `getTenantSlug` this is never
 * empty, because an account created without a tenant is unusable: its tenant_id
 * stays null, no business can be created against it (businesses.tenant_id is NOT
 * NULL), and every business-scoped route then fails.
 */
export function getAuthTenantSlug(): string {
  return getTenantSlug() || DEFAULT_TENANT_SLUG;
}
