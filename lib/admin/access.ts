import type { AuthUser } from "@/lib/api/types";

/**
 * Who can open the admin area, and which parts of it.
 *
 * Ported from sole-webapp's `utils/superAdminAuth.js` and the path rules in
 * `components/SuperAdminGuard.js`, as pure functions so the guard, the sidebar
 * and the Command Centre hub all read one answer — the old app worked it out in
 * three places and fetched `/super/my-access` twice to do it.
 *
 * Two kinds of admin, both enforced by the backend rather than here:
 *
 *   - a super admin (`users.is_super_admin`) passes everything;
 *   - a delegated admin (`role: "admin"`) passes only the sections a super
 *     admin has granted them, as feature keys from `/super/my-access`.
 *
 * Nothing here is a security boundary — every `/super/*` route checks again —
 * it only decides what's worth drawing.
 */

/* -------------------------------------------------------------------------- *
 * Feature keys
 * -------------------------------------------------------------------------- */

/**
 * The top-level sections, one grant each.
 *
 * `country_config` opens the Country Registry — the tax rates, thresholds and
 * filing rules every business's invoices are priced from. It is delegable, like
 * the others, but the registry refuses the dangerous parts of it (back-dating,
 * status changes, adding a country, rollback) to anyone who is not a super
 * admin, whatever grants they hold.
 */
export const PLATFORM_FEATURE_KEYS = ["dashboard", "tenants", "users", "country_config"] as const;

/**
 * The Command Centre dashboards, in the order the hub and the sidebar list
 * them.
 *
 * `featureKey: null` is a dashboard no grant opens — Cash is super-admin only,
 * and the backend refuses to delegate it. Keep the keys in step with
 * `VALID_FEATURE_KEYS` in sole-ocr's `src/controllers/superAdmin.js`.
 */
export const COMMAND_CENTRE_DASHBOARDS = [
  { slug: "customer-health", label: "Customer Health", featureKey: "customerHealth" },
  { slug: "trial-activation", label: "Trial Activation", featureKey: "trialActivation" },
  { slug: "product-activation", label: "Product Activation", featureKey: "productActivation" },
  { slug: "growth", label: "Growth Intelligence", featureKey: "growth" },
  { slug: "customer-journey", label: "Customer Journey", featureKey: "customerJourney" },
  { slug: "support", label: "Support Reporting", featureKey: "support" },
  { slug: "investor", label: "Investor Dashboard", featureKey: "investor" },
  { slug: "cockpit", label: "Operating Cockpit", featureKey: "cockpit" },
  { slug: "leadgen", label: "Leadgen", featureKey: "executiveLeadgen" },
  { slug: "social", label: "Social", featureKey: "organicSocial" },
  { slug: "roadmap", label: "Roadmap", featureKey: "roadmap" },
  { slug: "cash", label: "Sole Cash", featureKey: null },
] as const;

export type CommandCentreDashboard = (typeof COMMAND_CENTRE_DASHBOARDS)[number];

/**
 * Every grant that opens some part of Command Centre.
 *
 * `mixpanel` has no page of its own — it's a tab inside Trial Activation and
 * the Cockpit — but holding it is still a reason to see the hub.
 */
export const COMMAND_CENTRE_FEATURE_KEYS: string[] = [
  ...COMMAND_CENTRE_DASHBOARDS.flatMap((dashboard) =>
    dashboard.featureKey ? [dashboard.featureKey] : [],
  ),
  "mixpanel",
];

export function findCommandCentreDashboard(
  slug: string,
): CommandCentreDashboard | undefined {
  return COMMAND_CENTRE_DASHBOARDS.find((dashboard) => dashboard.slug === slug);
}

/* -------------------------------------------------------------------------- *
 * Who the user is
 * -------------------------------------------------------------------------- */

const SUPER_ADMIN_ROLES = new Set([
  "super_admin",
  "super-admin",
  "superadmin",
  "platform_admin",
  "platform-admin",
]);

/**
 * The profile shapes the backend has used for a super admin over time.
 *
 * Widened past `AuthUser` because the legacy fields (`super_admin`,
 * `user_role`, `roles[]`) still turn up on older sessions, and a super admin
 * locked out by a field rename is worse than a generous check the server will
 * redo anyway.
 */
type AdminUserShape = Omit<AuthUser, "isSuperAdmin"> & {
  isSuperAdmin?: boolean | number;
  super_admin?: boolean;
  user_role?: string;
  roles?: (string | { name?: string; slug?: string })[];
};

export function isSuperAdminUser(user: AdminUserShape | null | undefined): boolean {
  if (!user) return false;
  if (user.isSuperAdmin === true || user.isSuperAdmin === 1) return true;
  if (user.super_admin === true) return true;

  const roles = [
    user.role,
    user.user_role,
    ...(user.roles ?? []).map((role) =>
      typeof role === "string" ? role : (role.slug ?? role.name),
    ),
  ];
  return roles.some(
    (role) => typeof role === "string" && SUPER_ADMIN_ROLES.has(role.toLowerCase()),
  );
}

/**
 * Whether the admin area opens at all.
 *
 * A delegated admin with no grants yet still passes: they land on the
 * no-access state, which tells them who to ask, rather than being bounced back
 * to a product dashboard they may not have an account for.
 */
export function canAccessAdminPanel(user: AdminUserShape | null | undefined): boolean {
  return isSuperAdminUser(user) || user?.role === "admin";
}

/* -------------------------------------------------------------------------- *
 * What the user can open
 * -------------------------------------------------------------------------- */

/** The answer `/super/my-access` gives, normalised. */
export type AdminAccess = {
  isSuperAdmin: boolean;
  features: string[];
};

export const NO_ADMIN_ACCESS: AdminAccess = { isSuperAdmin: false, features: [] };

/** What a section asks of the user before it opens. */
export type AdminGate =
  | { feature: string }
  | { anyOf: string[] }
  | { superAdminOnly: true };

export function canPass(gate: AdminGate, access: AdminAccess): boolean {
  if (access.isSuperAdmin) return true;
  if ("superAdminOnly" in gate) return false;
  if ("feature" in gate) return access.features.includes(gate.feature);
  return gate.anyOf.some((key) => access.features.includes(key));
}

export const ADMIN_BASE = "/admin";
export const ADMIN_LOGIN = `${ADMIN_BASE}/login`;

/** The gate each dashboard route asks for. */
export function dashboardGate(dashboard: CommandCentreDashboard): AdminGate {
  return dashboard.featureKey
    ? { feature: dashboard.featureKey }
    : { superAdminOnly: true };
}

/**
 * Every gated route, by path prefix.
 *
 * Order doesn't matter — the longest matching prefix wins — so a dashboard's
 * own rule beats the hub's "any Command Centre grant" rule above it.
 */
export const ADMIN_ROUTE_RULES: { prefix: string; gate: AdminGate }[] = [
  { prefix: `${ADMIN_BASE}/dashboard`, gate: { feature: "dashboard" } },
  { prefix: `${ADMIN_BASE}/tenants`, gate: { feature: "tenants" } },
  { prefix: `${ADMIN_BASE}/users`, gate: { feature: "users" } },
  { prefix: `${ADMIN_BASE}/countries`, gate: { feature: "country_config" } },
  { prefix: `${ADMIN_BASE}/chart-of-accounts`, gate: { feature: "country_config" } },
  { prefix: `${ADMIN_BASE}/access`, gate: { superAdminOnly: true } },
  {
    prefix: `${ADMIN_BASE}/command-centre`,
    gate: { anyOf: COMMAND_CENTRE_FEATURE_KEYS },
  },
  ...COMMAND_CENTRE_DASHBOARDS.map((dashboard) => ({
    prefix: `${ADMIN_BASE}/command-centre/${dashboard.slug}`,
    gate: dashboardGate(dashboard),
  })),
];

/**
 * Where someone who can't open the page they asked for goes instead, in order.
 * Super-admin-only sections are left out: nobody who fails one passes it.
 */
const LANDING_ORDER = [
  `${ADMIN_BASE}/dashboard`,
  `${ADMIN_BASE}/tenants`,
  `${ADMIN_BASE}/users`,
  `${ADMIN_BASE}/countries`,
  `${ADMIN_BASE}/command-centre`,
];

function matchesPrefix(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function ruleFor(path: string) {
  return ADMIN_ROUTE_RULES.filter((rule) => matchesPrefix(path, rule.prefix)).sort(
    (a, b) => b.prefix.length - a.prefix.length,
  )[0];
}

/** The first section this user can open, or null when there's none. */
export function firstAdminLanding(access: AdminAccess): string | null {
  return (
    LANDING_ORDER.find((href) => {
      const rule = ruleFor(href);
      return !rule || canPass(rule.gate, access);
    }) ?? null
  );
}

export type AdminRouteDecision =
  | { kind: "allow" }
  | { kind: "redirect"; href: string }
  | { kind: "none" };

/**
 * The guard's whole decision for one path.
 *
 * An unmatched path is allowed through — it's either `/admin` itself, which
 * redirects on its own, or a 404 the router will draw.
 */
export function resolveAdminRoute(path: string, access: AdminAccess): AdminRouteDecision {
  const rule = ruleFor(path);
  if (!rule || canPass(rule.gate, access)) return { kind: "allow" };

  const landing = firstAdminLanding(access);
  return landing ? { kind: "redirect", href: landing } : { kind: "none" };
}

/**
 * A `?next=` value that's safe to send an admin to after signing in: inside the
 * admin area and not the sign-in page itself. Anything else lands on the
 * dashboard.
 */
export function safeAdminRedirect(next: string | null | undefined): string {
  const fallback = `${ADMIN_BASE}/dashboard`;
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  if (!matchesPrefix(next.split(/[?#]/)[0], ADMIN_BASE)) return fallback;
  if (matchesPrefix(next.split(/[?#]/)[0], ADMIN_LOGIN)) return fallback;
  return next;
}
