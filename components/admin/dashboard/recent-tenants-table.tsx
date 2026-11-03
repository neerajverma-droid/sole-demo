"use client";

import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Shimmer } from "@/components/ui/shimmer";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusPill } from "@/components/admin/shared/status-pill";
import type { RecentTenant } from "@/lib/admin/dashboard";
import { formatAdminDate, tenantStatusPill } from "@/lib/admin/format";

/**
 * The ten newest tenants, linking through to each one.
 *
 * `canOpen` is the `tenants` grant. Without it a delegated admin still sees the
 * list — it's part of the dashboard they were given — but as plain rows, since
 * the page behind each link would only redirect them away.
 */
export function RecentTenantsTable({
  tenants,
  loading,
  canOpen,
}: {
  tenants: RecentTenant[];
  loading: boolean;
  canOpen: boolean;
}) {
  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 p-5 pb-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Recent tenants</h2>
          <p className="text-sm text-muted-foreground">The ten newest workspaces.</p>
        </div>
        {canOpen && (
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/tenants">View all</Link>
          </Button>
        )}
      </div>

      {!loading && tenants.length === 0 ? (
        <div className="p-5 pt-0">
          <Empty className="border-dashed py-10 shadow-none">
            <EmptyMedia>
              <Building2 />
            </EmptyMedia>
            <EmptyTitle>No tenants yet</EmptyTitle>
            <EmptyDescription>New tenant workspaces will appear here.</EmptyDescription>
          </Empty>
        </div>
      ) : (
        <Table>
          <TableHeader className="surface-subtle">
            <TableRow>
              <TableHead className="pl-5">Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead className={HUG_COLUMN}>Status</TableHead>
              <TableHead className={HUG_COLUMN}>Created</TableHead>
              {canOpen && (
                <TableHead className={`${HUG_COLUMN} pr-5`}>
                  <span className="sr-only">Open</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 5 }, (_, index) => (
                  <TableRow key={index} aria-hidden>
                    <TableCell className="pl-5">
                      <Shimmer className="h-4 w-40 rounded-md" />
                    </TableCell>
                    <TableCell>
                      <Shimmer className="h-4 w-24 rounded-md" />
                    </TableCell>
                    <TableCell>
                      <Shimmer className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Shimmer className="h-4 w-20 rounded-md" />
                    </TableCell>
                    {canOpen && <TableCell className="pr-5" />}
                  </TableRow>
                ))
              : tenants.map((tenant) => {
                  const status = tenantStatusPill(tenant.status);
                  return (
                    <TableRow key={tenant.id} className="group">
                      <TableCell className="pl-5 font-medium">
                        {canOpen ? (
                          <Link
                            href={`/admin/tenants/${tenant.id}`}
                            className="rounded-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {tenant.name}
                          </Link>
                        ) : (
                          tenant.name
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {tenant.slug || "–"}
                      </TableCell>
                      <TableCell className={HUG_COLUMN}>
                        <StatusPill label={status.label} tone={status.tone} />
                      </TableCell>
                      <TableCell className={`${HUG_COLUMN} text-muted-foreground tabular`}>
                        {formatAdminDate(tenant.createdAt)}
                      </TableCell>
                      {canOpen && (
                        <TableCell className={`${HUG_COLUMN} pr-5`}>
                          <Link
                            href={`/admin/tenants/${tenant.id}`}
                            aria-label={`Manage ${tenant.name}`}
                            className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <ChevronRight className="size-4" aria-hidden />
                          </Link>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
