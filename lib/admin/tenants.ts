import apiRoutes from "@/config/api-routes";
import api from "@/utils/axiosInstance";
import { BASE_DOMAIN } from "@/lib/api/env";
import type { PageInfo } from "@/lib/products";
import type { TenantStatus } from "@/lib/admin/format";

/**
 * Tenants, for the admin list and its dialogs.
 *
 * Every `/super/*` route reads `req.body` directly — none of them decrypt — so
 * writes here go as plain JSON, not through `buildEncryptedRequestBody`.
 */

/* -------------------------------------------------------------------------- *
 * Types
 * -------------------------------------------------------------------------- */

type ApiTenant = {
  id: number | string;
  name?: string | null;
  slug?: string | null;
  status?: string | null;
  custom_domain?: string | null;
  max_users?: number | null;
  member_count?: number | null;
  created_at?: string | null;
};

type ApiTenantListResponse = {
  success?: boolean;
  data?: ApiTenant[];
  meta?: { total?: number; page?: number; limit?: number };
};

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
  customDomain: string | null;
  maxUsers: number;
  memberCount: number;
  createdAt: string | null;
};

export type TenantsPage = { tenants: Tenant[]; pageInfo: PageInfo };

/** The status filter, as the pills show it; "All" sends no status at all. */
export const TENANT_STATUS_FILTERS = ["All", "Active", "Trial", "Suspended", "Cancelled"] as const;
export type TenantStatusFilter = (typeof TENANT_STATUS_FILTERS)[number];

/* -------------------------------------------------------------------------- *
 * Mapping
 * -------------------------------------------------------------------------- */

export function mapTenant(row: ApiTenant): Tenant {
  return {
    id: String(row.id),
    name: row.name?.trim() || "Untitled tenant",
    slug: row.slug ?? "",
    status: row.status ?? "",
    customDomain: row.custom_domain || null,
    maxUsers: typeof row.max_users === "number" ? row.max_users : 0,
    memberCount: typeof row.member_count === "number" ? row.member_count : 0,
    createdAt: row.created_at ?? null,
  };
}

/** The counters for `NumberedPagination`, from the server's total. */
export function tenantsPageInfo(page: number, pageSize: number, total: number): PageInfo {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(Math.max(1, page), pageCount);
  const from = total === 0 ? 0 : (clamped - 1) * pageSize + 1;
  const to = total === 0 ? 0 : Math.min(clamped * pageSize, total);
  return { page: clamped, pageCount, total, from, to };
}

/** Where a tenant's workspace lives: its custom domain, else its subdomain. */
export function tenantUrl(tenant: Pick<Tenant, "slug" | "customDomain">): string | null {
  if (tenant.customDomain) return `https://${tenant.customDomain}`;
  return tenant.slug ? `https://${tenant.slug}.${BASE_DOMAIN}` : null;
}

/** Seats used out of the limit, as a 0–100 share; 0 with no limit set. */
export function seatUsage(tenant: Pick<Tenant, "memberCount" | "maxUsers">): number {
  if (!tenant.maxUsers) return 0;
  return Math.min(100, Math.round((tenant.memberCount / tenant.maxUsers) * 100));
}

/* -------------------------------------------------------------------------- *
 * API
 * -------------------------------------------------------------------------- */

/**
 * `GET /super/tenants` — one page, newest first.
 *
 * `q` matches part of the name only (the backend's `LIKE` is on `name`), which
 * the search box says in its placeholder rather than leaving people to find out.
 */
export async function fetchTenantsPage({
  page,
  pageSize,
  search,
  status,
}: {
  page: number;
  pageSize: number;
  search: string;
  status: TenantStatusFilter;
}): Promise<TenantsPage> {
  const params: Record<string, string | number> = { page, limit: pageSize };
  if (search.trim()) params.q = search.trim();
  if (status !== "All") params.status = status.toLowerCase();

  const response = await api.get<ApiTenantListResponse>(apiRoutes.superAdmin.tenants, { params });
  if (response.data?.success === false) throw new Error("The tenants request failed.");

  const rows = response.data?.data ?? [];
  const total = response.data?.meta?.total ?? rows.length;
  return { tenants: rows.map(mapTenant), pageInfo: tenantsPageInfo(page, pageSize, total) };
}

export type CreateTenantInput = {
  name: string;
  slug: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  maxUsers: number;
};

/** `POST /super/tenants`. Optional admin fields are left out when empty. */
export async function createTenantApi(input: CreateTenantInput): Promise<Tenant> {
  const body: Record<string, string | number> = {
    name: input.name.trim(),
    slug: input.slug.trim(),
    max_users: input.maxUsers,
  };
  if (input.adminEmail.trim()) body.admin_email = input.adminEmail.trim();
  if (input.adminFirstName.trim()) body.admin_first_name = input.adminFirstName.trim();
  if (input.adminLastName.trim()) body.admin_last_name = input.adminLastName.trim();

  const response = await api.post<{ success?: boolean; data?: { tenant?: ApiTenant } }>(
    apiRoutes.superAdmin.tenants,
    body,
  );
  const tenant = response.data?.data?.tenant;
  if (!tenant) throw new Error("The new tenant wasn't returned.");
  return mapTenant(tenant);
}

/**
 * `PATCH /super/tenants/:id/status`.
 *
 * The backend accepts active, suspended and cancelled — not trial — and
 * suspending or cancelling logs out every user in the tenant on the spot.
 */
export async function setTenantStatusApi(
  id: string,
  status: Extract<TenantStatus, "active" | "suspended" | "cancelled">,
): Promise<void> {
  await api.patch(apiRoutes.superAdmin.tenantStatus(id), { status });
}

/* -------------------------------------------------------------------------- *
 * Create form
 * -------------------------------------------------------------------------- */

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SLUG_LENGTH = 63;

/**
 * A subdomain-safe slug from a business name: `Acme & Co.` → `acme-co`.
 *
 * Capped at 63, a DNS label's limit, since the slug becomes
 * `<slug>.soleapp.com.au`.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CreateTenantIssues = Partial<Record<keyof CreateTenantInput, string>>;

/** Everything the backend would reject, caught before the request. */
export function createTenantIssues(input: CreateTenantInput): CreateTenantIssues {
  const issues: CreateTenantIssues = {};
  if (!input.name.trim()) issues.name = "Enter the business name.";

  const slug = input.slug.trim();
  if (!slug) issues.slug = "Enter a slug for the workspace address.";
  else if (slug.length > MAX_SLUG_LENGTH) issues.slug = `Keep the slug to ${MAX_SLUG_LENGTH} characters or fewer.`;
  else if (!SLUG_PATTERN.test(slug))
    issues.slug = "Use lowercase letters, numbers and single hyphens, with no hyphen at either end.";

  if (input.adminEmail.trim() && !EMAIL.test(input.adminEmail.trim()))
    issues.adminEmail = "Enter a valid email address, or leave it empty.";

  if (!Number.isInteger(input.maxUsers) || input.maxUsers < 1)
    issues.maxUsers = "Allow at least 1 user.";

  return issues;
}
