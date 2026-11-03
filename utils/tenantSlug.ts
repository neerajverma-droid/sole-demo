const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || "soleapp.com.au";
const RESERVED_SUBDOMAINS = new Set(["www", "admin"]);

// The tenant a user joins when the host carries no subdomain — localhost, the
// apex domain, preview deployments. Override per environment with
// NEXT_PUBLIC_DEFAULT_TENANT_SLUG.
const DEFAULT_TENANT_SLUG =
  process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG || "sole";

/**
 * Multi-tenant: derive the current tenant slug from the host so the backend
 * knows which tenant a signup / OAuth flow / branding lookup belongs to.
 * Returns "" for the apex domain, the super-admin subdomain, localhost, or
 * unknown hosts.
 */
export function getTenantSlug(): string {
  if (typeof window === "undefined") return "";
  const host = window.location.hostname.toLowerCase();
  if (host.endsWith(`.${BASE_DOMAIN}`)) {
    const sub = host.slice(0, -(BASE_DOMAIN.length + 1)).split(".")[0];
    if (sub && !RESERVED_SUBDOMAINS.has(sub)) return sub;
  }
  return "";
}

/**
 * The slug to send with signup / OAuth calls. Unlike getTenantSlug() this never
 * returns "", because an account created without a tenant is unusable.
 *
 * Off a tenant subdomain — localhost, apex domain — the host carries no slug,
 * so the default tenant is named explicitly rather than left to the backend.
 */
export function getAuthTenantSlug(): string {
  return getTenantSlug() || DEFAULT_TENANT_SLUG;
}
