import apiRoutes from "@/config/api-routes";
import api from "@/utils/axiosInstance";
import type { PillTone } from "@/lib/admin/format";
import { tenantsPageInfo } from "@/lib/admin/tenants";
import type { PageInfo } from "@/lib/products";

/**
 * Every customer account on the platform, for the admin Users screen.
 *
 * `/super/users` leaves out super admins, delegated admins and team members
 * invited under another account (`parent_id`), so this is account owners only.
 * Plain JSON throughout — `/super/*` doesn't decrypt.
 */

/* -------------------------------------------------------------------------- *
 * Filters
 * -------------------------------------------------------------------------- */

export const PLATFORM_OPTIONS = [
  { value: "all", label: "All platforms" },
  { value: "WEBP", label: "Web" },
  { value: "IPHN", label: "iOS" },
  { value: "ANDR", label: "Android" },
] as const;
export type PlatformFilter = (typeof PLATFORM_OPTIONS)[number]["value"];

/** The backend's `deleted` param: unset is active only, `only`, or `all`. */
export const ACCOUNT_FILTERS = ["Active", "Deleted", "All"] as const;
export type AccountFilter = (typeof ACCOUNT_FILTERS)[number];

export type UsersFilters = {
  search: string;
  platform: PlatformFilter;
  accounts: AccountFilter;
};

export function usersParams(filters: UsersFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.search.trim()) params.q = filters.search.trim();
  if (filters.platform !== "all") params.platform = filters.platform;
  if (filters.accounts === "Deleted") params.deleted = "only";
  if (filters.accounts === "All") params.deleted = "all";
  return params;
}

/* -------------------------------------------------------------------------- *
 * Labels
 * -------------------------------------------------------------------------- */

const PLATFORM_LABELS: Record<string, string> = { WEBP: "Web", IPHN: "iOS", ANDR: "Android" };

export function platformLabel(platform: string | null): string {
  return platform ? (PLATFORM_LABELS[platform] ?? platform) : "Unknown";
}

/** `users.signup_source` as the sign-in method it records. */
export const SIGNUP_SOURCE_LABELS: Record<number, string> = {
  1: "Email",
  2: "Facebook",
  3: "Google",
  4: "LinkedIn",
  5: "Apple",
  6: "SAML",
};

export function signupSourceLabel(source: number | null): string {
  return source ? (SIGNUP_SOURCE_LABELS[source] ?? `Source ${source}`) : "Unknown";
}

export function verificationPill(verified: boolean): { label: string; tone: PillTone } {
  return verified ? { label: "Verified", tone: "success" } : { label: "Pending", tone: "warning" };
}

/* -------------------------------------------------------------------------- *
 * Types and mapping
 * -------------------------------------------------------------------------- */

type ApiPlatformUser = {
  id: number | string;
  email?: string | null;
  role?: string | null;
  tenant_id?: number | string | null;
  platform?: string | null;
  signup_source?: number | string | null;
  signup_date?: string | null;
  account_verified?: number | boolean | null;
  deleted_at?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
};

export type PlatformUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  tenantId: string | null;
  platform: string | null;
  signupSource: number | null;
  signupDate: string | null;
  verified: boolean;
  deletedAt: string | null;
};

export type PlatformUsersPage = { users: PlatformUser[]; pageInfo: PageInfo };

export function mapPlatformUser(row: ApiPlatformUser): PlatformUser {
  const source = Number(row.signup_source);
  return {
    id: String(row.id),
    email: row.email ?? "",
    firstName: row.first_name?.trim() ?? "",
    lastName: row.last_name?.trim() ?? "",
    company: row.company_name?.trim() ?? "",
    tenantId: row.tenant_id ? String(row.tenant_id) : null,
    platform: row.platform || null,
    signupSource: Number.isFinite(source) && source > 0 ? source : null,
    signupDate: row.signup_date ?? null,
    verified: row.account_verified === true || Number(row.account_verified) === 1,
    deletedAt: row.deleted_at || null,
  };
}

export function userDisplayName(user: Pick<PlatformUser, "firstName" | "lastName" | "email">): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

export function userInitials(user: Pick<PlatformUser, "firstName" | "lastName" | "email">): string {
  const fromName = [user.firstName, user.lastName]
    .filter(Boolean)
    .map((part) => part[0])
    .join("");
  return (fromName || user.email.slice(0, 2) || "?").toUpperCase().slice(0, 2);
}

/**
 * Why a user can't be impersonated, or null when they can.
 *
 * Impersonation is minted per tenant (`/tenants/:id/impersonate/:userId`), so
 * it sits behind the backend's `tenants` grant — an admin with only `users`
 * gets a 403 — and an account outside every tenant has no route to it. The
 * backend also refuses deleted accounts outright.
 */
export function impersonateBlockedReason(
  user: Pick<PlatformUser, "tenantId" | "deletedAt">,
  hasTenantsGrant: boolean,
): string | null {
  if (!hasTenantsGrant) return "Signing in as a user needs access to Tenants. Ask a super admin for it.";
  if (user.deletedAt) return "Deleted accounts can't be impersonated.";
  if (!user.tenantId) return "This account isn't in a tenant, and impersonation is issued per tenant.";
  return null;
}

/* -------------------------------------------------------------------------- *
 * API
 * -------------------------------------------------------------------------- */

/** `GET /super/users` — one page, newest sign-up first. */
export async function fetchPlatformUsersPage({
  page,
  pageSize,
  filters,
}: {
  page: number;
  pageSize: number;
  filters: UsersFilters;
}): Promise<PlatformUsersPage> {
  const response = await api.get<{ success?: boolean; data?: ApiPlatformUser[]; meta?: { total?: number } }>(
    apiRoutes.superAdmin.users,
    { params: { ...usersParams(filters), page, limit: pageSize } },
  );
  if (response.data?.success === false) throw new Error("The users request failed.");

  const rows = response.data?.data ?? [];
  return {
    users: rows.map(mapPlatformUser),
    pageInfo: tenantsPageInfo(page, pageSize, response.data?.meta?.total ?? rows.length),
  };
}

/** The most rows one export returns; the backend stops there. */
export const MAX_EXPORT_ROWS = 20_000;

/**
 * `GET /super/users?format=csv` — the same filters, every page, as a file.
 *
 * Returned as a Blob for the caller to save, rather than opened as a link: the
 * request needs the bearer token, which a plain `<a href>` can't send.
 */
export async function exportUsersCsv(filters: UsersFilters): Promise<Blob> {
  const response = await api.get<Blob>(apiRoutes.superAdmin.users, {
    params: { ...usersParams(filters), format: "csv" },
    responseType: "blob",
  });
  return response.data;
}

export function exportFileName(today = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `users-export-${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}.csv`;
}

/**
 * `POST /super/tenants/:tenantId/impersonate/:userId` — a sign-in link valid
 * for 15 minutes.
 */
export async function impersonateUserApi(
  tenantId: string,
  userId: string,
): Promise<{ url: string; expiresAt: string | null }> {
  const response = await api.post<{
    success?: boolean;
    data?: { impersonate_url?: string; expires_at?: string };
  }>(apiRoutes.superAdmin.impersonate(tenantId, userId));
  const url = response.data?.data?.impersonate_url;
  if (!url) throw new Error("No sign-in link came back.");
  return { url, expiresAt: response.data?.data?.expires_at ?? null };
}

/**
 * `POST /super/users/:id/delete` — a soft delete.
 *
 * The account is marked deleted and an audit row records who did it and why;
 * invoices, quotes and payments stay. There's no restore endpoint yet.
 */
export async function deleteUserApi(
  userId: string,
  confirmEmail: string,
  reason: string,
): Promise<{ alreadyDeleted: boolean }> {
  const response = await api.post<{ success?: boolean; data?: { alreadyDeleted?: boolean } }>(
    apiRoutes.superAdmin.deleteUser(userId),
    { confirmEmail: confirmEmail.trim(), reason: reason.trim() },
  );
  return { alreadyDeleted: response.data?.data?.alreadyDeleted === true };
}

/* -------------------------------------------------------------------------- *
 * Delete form
 * -------------------------------------------------------------------------- */

/** Matches `MIN_REASON_LENGTH` in sole-ocr's `services/accountDeletion.js`. */
export const MIN_DELETE_REASON = 10;

/** Case-insensitive, as the backend compares it. */
export function emailConfirmed(typed: string, email: string): boolean {
  return typed.trim().toLowerCase() === email.trim().toLowerCase() && email.trim() !== "";
}

export function reasonShortfall(reason: string): number {
  return Math.max(0, MIN_DELETE_REASON - reason.trim().length);
}
