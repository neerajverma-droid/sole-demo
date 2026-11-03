import apiRoutes from "@/config/api-routes";
import api from "@/utils/axiosInstance";
import { COMMAND_CENTRE_DASHBOARDS } from "@/lib/admin/access";
import { tenantsPageInfo } from "@/lib/admin/tenants";
import type { PageInfo } from "@/lib/products";

/**
 * Delegated admins and the sections each one is granted.
 *
 * Super-admin only, end to end: every route here is behind the backend's
 * `verifySuperAdminMiddleware`, and the screen is behind `superAdminOnly`.
 * Bodies are plain JSON — `/super/*` doesn't decrypt.
 */

/* -------------------------------------------------------------------------- *
 * Grantable sections
 * -------------------------------------------------------------------------- */

export type AdminFeature = { key: string; label: string; description: string };
export type AdminFeatureGroup = {
  id: string;
  label: string;
  description: string;
  features: AdminFeature[];
};

/**
 * One line per section, kept short enough to sit on a single line under its
 * label. Every section has one: a list where some rows explain themselves
 * and others don't reads as unfinished.
 */
const FEATURE_DESCRIPTIONS: Record<string, string> = {
  dashboard: "Platform totals and new tenants",
  tenants: "Workspaces, branding and subscriptions",
  users: "Accounts, export and impersonation",
  country_config: "Tax rates, thresholds and filing rules",
  customerHealth: "Health scores and the action queue",
  trialActivation: "How trials activate and convert",
  productActivation: "Onboarding funnels and return visits",
  growth: "Sign-up to churn, with unit economics",
  customerJourney: "The lifecycle against SaaS benchmarks",
  support: "Ticket flow and customer risk",
  investor: "Investor reporting and the cap table",
  cockpit: "One operating view across teams",
  executiveLeadgen: "Lead sources and partner campaigns",
  organicSocial: "Instagram, Facebook and YouTube",
  roadmap: "Roadmap, usage and market insight",
  mixpanel: "A tab in Trial Activation and Cockpit",
};

/**
 * What a super admin can hand out, grouped the way the sidebar groups them.
 *
 * Cash is left out on purpose. The backend's key list would accept it, but
 * the Cash route itself is hard-gated to super admins, so a grant would show
 * as access the person doesn't actually have.
 */
export const ADMIN_FEATURE_GROUPS: AdminFeatureGroup[] = [
  {
    id: "platform",
    label: "Platform",
    description: "Manage tenants and accounts",
    features: [
      { key: "dashboard", label: "Dashboard" },
      { key: "tenants", label: "Tenants" },
      { key: "users", label: "Users" },
      { key: "country_config", label: "Countries" },
    ].map(withDescription),
  },
  {
    id: "command-centre",
    label: "Command Centre",
    description: "Reporting dashboards",
    features: [
      ...COMMAND_CENTRE_DASHBOARDS.flatMap((dashboard) =>
        dashboard.featureKey ? [{ key: dashboard.featureKey, label: dashboard.label }] : [],
      ),
      { key: "mixpanel", label: "Mixpanel" },
    ].map(withDescription),
  },
];

function withDescription(feature: { key: string; label: string }): AdminFeature {
  return { ...feature, description: FEATURE_DESCRIPTIONS[feature.key] ?? "" };
}

export const GRANTABLE_FEATURE_KEYS = ADMIN_FEATURE_GROUPS.flatMap((group) =>
  group.features.map((feature) => feature.key),
);

/** A grant's label, or the raw key for one this build doesn't know yet. */
export function featureLabel(key: string): string {
  for (const group of ADMIN_FEATURE_GROUPS) {
    const found = group.features.find((feature) => feature.key === key);
    if (found) return found.label;
  }
  return key;
}

/* -------------------------------------------------------------------------- *
 * Types and mapping
 * -------------------------------------------------------------------------- */

type ApiAdminUser = {
  id: number | string;
  email?: string | null;
  account_verified?: number | boolean | null;
  created_at?: string | null;
  userInfo?: { first_name?: string | null; last_name?: string | null } | null;
  features?: unknown;
};

export type AdminUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string | null;
  features: string[];
};

export type AdminUsersPage = { admins: AdminUser[]; pageInfo: PageInfo };

export function mapAdminUser(row: ApiAdminUser): AdminUser {
  return {
    id: String(row.id),
    email: row.email ?? "",
    firstName: row.userInfo?.first_name?.trim() ?? "",
    lastName: row.userInfo?.last_name?.trim() ?? "",
    createdAt: row.created_at ?? null,
    features: Array.isArray(row.features)
      ? row.features.filter((key): key is string => typeof key === "string")
      : [],
  };
}

export function adminDisplayName(admin: Pick<AdminUser, "firstName" | "lastName" | "email">): string {
  return [admin.firstName, admin.lastName].filter(Boolean).join(" ") || admin.email;
}

export function adminInitials(admin: Pick<AdminUser, "firstName" | "lastName" | "email">): string {
  const fromName = [admin.firstName, admin.lastName]
    .filter(Boolean)
    .map((part) => part[0])
    .join("");
  return (fromName || admin.email.slice(0, 2)).toUpperCase().slice(0, 2);
}

/** Only the grants this screen offers count toward "N of M sections". */
export function grantedCount(features: string[]): number {
  return features.filter((key) => GRANTABLE_FEATURE_KEYS.includes(key)).length;
}

/* -------------------------------------------------------------------------- *
 * API
 * -------------------------------------------------------------------------- */

/** `GET /super/admin-users` — delegated admins with their grants, newest first. */
export async function fetchAdminUsersPage({
  page,
  pageSize,
  search,
}: {
  page: number;
  pageSize: number;
  search: string;
}): Promise<AdminUsersPage> {
  const params: Record<string, string | number> = { page, limit: pageSize };
  if (search.trim()) params.q = search.trim();

  const response = await api.get<{ success?: boolean; data?: ApiAdminUser[]; meta?: { total?: number } }>(
    apiRoutes.superAdmin.adminUsers,
    { params },
  );
  if (response.data?.success === false) throw new Error("The admin list request failed.");

  const rows = response.data?.data ?? [];
  return {
    admins: rows.map(mapAdminUser),
    pageInfo: tenantsPageInfo(page, pageSize, response.data?.meta?.total ?? rows.length),
  };
}

export type CreateAdminInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  featureKeys: string[];
};

/** `POST /super/admin-users` — the account and its first grants, in one go. */
export async function createAdminUserApi(input: CreateAdminInput): Promise<{ id: string; email: string }> {
  const response = await api.post<{ success?: boolean; data?: { id: number | string; email?: string } }>(
    apiRoutes.superAdmin.adminUsers,
    {
      email: input.email.trim().toLowerCase(),
      password: input.password,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      featureKeys: [...new Set(input.featureKeys)],
    },
  );
  const data = response.data?.data;
  if (!data) throw new Error("The new admin wasn't returned.");
  return { id: String(data.id), email: data.email ?? input.email };
}

/** `POST /super/feature-access` — one request for any number of sections. */
export async function grantFeaturesApi(userId: string, featureKeys: string[]): Promise<void> {
  await api.post(apiRoutes.superAdmin.featureAccess, { userId, featureKeys });
}

/** `DELETE /super/feature-access` — the keys go in the body, as the route expects. */
export async function revokeFeaturesApi(userId: string, featureKeys: string[]): Promise<void> {
  await api.delete(apiRoutes.superAdmin.featureAccess, { data: { userId, featureKeys } });
}

/**
 * `DELETE /super/admin-users/:id` — removes every grant.
 *
 * Not an account deletion: the person can still sign in, and lands on the
 * "no sections granted" state until someone grants them one again.
 */
export async function revokeAllAccessApi(userId: string): Promise<void> {
  await api.delete(apiRoutes.superAdmin.adminUser(userId));
}

/* -------------------------------------------------------------------------- *
 * Create form
 * -------------------------------------------------------------------------- */

export const MIN_ADMIN_PASSWORD = 8;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CreateAdminIssues = Partial<Record<"email" | "password", string>>;

export function createAdminIssues(input: CreateAdminInput): CreateAdminIssues {
  const issues: CreateAdminIssues = {};
  if (!input.email.trim()) issues.email = "Enter an email address.";
  else if (!EMAIL.test(input.email.trim())) issues.email = "Enter a valid email address.";
  if (input.password.length < MIN_ADMIN_PASSWORD)
    issues.password = `Use at least ${MIN_ADMIN_PASSWORD} characters.`;
  return issues;
}
