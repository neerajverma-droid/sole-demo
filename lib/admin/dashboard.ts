import apiRoutes from "@/config/api-routes";
import api from "@/utils/axiosInstance";
import type { PillTone } from "@/lib/admin/format";

/* -------------------------------------------------------------------------- *
 * Types
 * -------------------------------------------------------------------------- */

type ApiAnalyticsResponse = {
  success?: boolean;
  data?: {
    tenants?: {
      total?: number;
      active?: number;
      trial?: number;
      suspended?: number;
      new_30d?: number;
    };
    users?: { total?: number };
    recent_tenants?: {
      id: number | string;
      name?: string | null;
      slug?: string | null;
      status?: string | null;
      created_at?: string | null;
    }[];
  };
};

export type RecentTenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string | null;
};

export type AdminAnalytics = {
  tenants: {
    total: number;
    active: number;
    trial: number;
    suspended: number;
    new30d: number;
  };
  users: { total: number };
  recentTenants: RecentTenant[];
};

/* -------------------------------------------------------------------------- *
 * API
 * -------------------------------------------------------------------------- */

const count = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export function mapAnalytics(data: ApiAnalyticsResponse["data"]): AdminAnalytics {
  return {
    tenants: {
      total: count(data?.tenants?.total),
      active: count(data?.tenants?.active),
      trial: count(data?.tenants?.trial),
      suspended: count(data?.tenants?.suspended),
      new30d: count(data?.tenants?.new_30d),
    },
    users: { total: count(data?.users?.total) },
    recentTenants: (data?.recent_tenants ?? []).map((tenant) => ({
      id: String(tenant.id),
      name: tenant.name?.trim() || "Untitled tenant",
      slug: tenant.slug ?? "",
      status: tenant.status ?? "",
      createdAt: tenant.created_at ?? null,
    })),
  };
}

/**
 * `GET /super/analytics` — platform totals and the ten newest tenants.
 *
 * Needs the `dashboard` grant. Throws on failure so React Query can report the
 * error; an empty dashboard of zeroes would read as a platform with no
 * customers rather than as a request that didn't arrive.
 */
export async function fetchAdminAnalytics(): Promise<AdminAnalytics> {
  const response = await api.get<ApiAnalyticsResponse>(apiRoutes.superAdmin.analytics);
  if (response.data?.success === false || !response.data?.data) {
    throw new Error("The analytics response was empty.");
  }
  return mapAnalytics(response.data.data);
}

/* -------------------------------------------------------------------------- *
 * Tenant mix
 * -------------------------------------------------------------------------- */

export type TenantMixSegment = {
  key: "active" | "trial" | "suspended" | "other";
  label: string;
  value: number;
  /** 0–100, for the bar's width. */
  percent: number;
  tone: PillTone;
};

/**
 * The total split into the statuses the backend counts, plus what's left.
 *
 * The total counts every tenant that isn't deleted, and the backend only
 * breaks out three statuses — so cancelled tenants (and any status added
 * later) are the remainder rather than a figure of their own. Showing it keeps
 * the bar summing to the total instead of to a smaller number nobody asked for.
 */
export function tenantMix(tenants: AdminAnalytics["tenants"]): TenantMixSegment[] {
  const other = Math.max(
    0,
    tenants.total - tenants.active - tenants.trial - tenants.suspended,
  );
  const percent = (value: number) => (tenants.total ? (value / tenants.total) * 100 : 0);

  const segments: TenantMixSegment[] = [
    { key: "active", label: "Active", value: tenants.active, percent: percent(tenants.active), tone: "success" },
    { key: "trial", label: "Trial", value: tenants.trial, percent: percent(tenants.trial), tone: "info" },
    { key: "suspended", label: "Suspended", value: tenants.suspended, percent: percent(tenants.suspended), tone: "danger" },
    { key: "other", label: "Cancelled or other", value: other, percent: percent(other), tone: "neutral" },
  ];

  // "Other" only earns a row when there's something in it.
  return segments.filter((segment) => segment.key !== "other" || segment.value > 0);
}
