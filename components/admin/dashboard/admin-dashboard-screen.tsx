"use client";

import Link from "next/link";
import {
  Building2,
  CalendarPlus,
  LayoutDashboard,
  PauseCircle,
  TriangleAlert,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { StatCards, type StatCard } from "@/components/ui/stat-cards";
import { PageHeader } from "@/components/layout/page-header";
import { RecentTenantsTable } from "@/components/admin/dashboard/recent-tenants-table";
import { TenantMixCard } from "@/components/admin/dashboard/tenant-mix-card";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { useAdminAnalyticsQuery } from "@/hooks/use-admin-dashboard-query";
import type { AdminAnalytics } from "@/lib/admin/dashboard";
import { formatCount, formatShare } from "@/lib/admin/format";
import { apiErrorMessage } from "@/lib/api-error";

/**
 * The admin landing page: platform totals, how tenants split by status, and
 * the newest tenants.
 *
 * Every figure here is a platform-wide count from `/super/analytics`. The old
 * dashboard's tenant and user list pages also showed "Active" tiles counted
 * from whatever page of results was on screen; nothing here does that, so a
 * number on this page always means the whole platform.
 */
export function AdminDashboardScreen() {
  const query = useAdminAnalyticsQuery();
  const { canSee } = useAdminAccess();
  const canOpenTenants = canSee({ feature: "tenants" });

  const data = query.data;

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description="Tenants, users and recent sign-ups across the platform."
      >
        {canOpenTenants && (
          <Button asChild>
            <Link href="/admin/tenants">
              <Building2 />
              Manage tenants
            </Link>
          </Button>
        )}
      </PageHeader>

      {query.isError ? (
        <Empty>
          <EmptyMedia>
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle>Couldn&apos;t load the dashboard</EmptyTitle>
          <EmptyDescription>
            {apiErrorMessage(query.error, "The analytics request didn't complete.")}
          </EmptyDescription>
          <EmptyActions>
            <Button onClick={() => query.refetch()} disabled={query.isFetching}>
              {query.isFetching ? "Trying again…" : "Try again"}
            </Button>
          </EmptyActions>
        </Empty>
      ) : (
        <>
          <StatCards stats={buildStats(data)} loading={query.isLoading} />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <TenantMixCard tenants={data?.tenants} loading={query.isLoading} />
            <RecentTenantsTable
              tenants={data?.recentTenants ?? []}
              loading={query.isLoading}
              canOpen={canOpenTenants}
            />
          </div>
        </>
      )}
    </div>
  );
}

/** The four headline figures. Values are placeholders while loading. */
function buildStats(data: AdminAnalytics | undefined): StatCard[] {
  const tenants = data?.tenants;
  return [
    {
      key: "tenants",
      label: "Total tenants",
      tip: "Every tenant workspace that hasn't been deleted, whatever its status.",
      value: tenants ? formatCount(tenants.total) : "–",
      breakdown: tenants
        ? [
            { label: `${formatShare(tenants.active, tenants.total)} active`, tone: "success" },
            { label: `${formatCount(tenants.trial)} on trial` },
          ]
        : undefined,
      icon: Building2,
    },
    {
      key: "new",
      label: "New in 30 days",
      value: tenants ? formatCount(tenants.new30d) : "–",
      meta: "Tenants created in the last 30 days",
      icon: CalendarPlus,
      tone: "accent",
    },
    {
      key: "users",
      label: "Total users",
      tip: "Account owners across the platform. Admin accounts and team members invited under another account aren't counted.",
      value: data ? formatCount(data.users.total) : "–",
      meta: "Account owners, excluding admins",
      icon: Users,
      tone: "success",
    },
    {
      key: "suspended",
      label: "Suspended",
      value: tenants ? formatCount(tenants.suspended) : "–",
      meta: "Members of these tenants can't sign in",
      icon: PauseCircle,
      tone: tenants && tenants.suspended > 0 ? "danger" : "primary",
    },
  ];
}
