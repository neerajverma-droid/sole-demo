"use client";

import Link from "next/link";
import { ExternalLink, MoreHorizontal, PauseCircle, PlayCircle, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MenuAction } from "@/components/ui/menu-action";
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
import { Highlight } from "@/components/contacts/highlight";
import { StatusPill } from "@/components/admin/shared/status-pill";
import type { TenantStatusChange } from "@/components/admin/tenants/tenant-status-dialog";
import { formatAdminDate, formatCount, tenantStatusPill } from "@/lib/admin/format";
import { seatUsage, tenantUrl, type Tenant } from "@/lib/admin/tenants";
import { cn } from "@/lib/utils";

/**
 * The tenants table: one row per workspace, newest first, with its status,
 * seats and a row menu.
 *
 * The name is the link to the tenant's page; the menu holds the rest. Suspend
 * and Reactivate are one slot that changes with the status rather than two
 * entries where one is always disabled.
 */
export function TenantsTable({
  tenants,
  loading,
  search,
  onStatusChange,
}: {
  tenants: Tenant[];
  loading: boolean;
  /** Highlighted in the names, so it's clear why each row matched. */
  search: string;
  onStatusChange: (change: TenantStatusChange) => void;
}) {
  return (
    <Table>
      <TableHeader className="surface-subtle">
        <TableRow>
          <TableHead className="pl-4">Tenant</TableHead>
          <TableHead className={HUG_COLUMN}>Status</TableHead>
          <TableHead className="w-48">Seats</TableHead>
          <TableHead className={HUG_COLUMN}>Created</TableHead>
          <TableHead className={`${HUG_COLUMN} pr-4`}>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading
          ? Array.from({ length: 8 }, (_, index) => <SkeletonRow key={index} />)
          : tenants.map((tenant) => (
              <TenantRow
                key={tenant.id}
                tenant={tenant}
                search={search}
                onStatusChange={onStatusChange}
              />
            ))}
      </TableBody>
    </Table>
  );
}

function TenantRow({
  tenant,
  search,
  onStatusChange,
}: {
  tenant: Tenant;
  search: string;
  onStatusChange: (change: TenantStatusChange) => void;
}) {
  const status = tenantStatusPill(tenant.status);
  const url = tenantUrl(tenant);
  const usage = seatUsage(tenant);
  const full = tenant.maxUsers > 0 && tenant.memberCount >= tenant.maxUsers;
  const href = `/admin/tenants/${tenant.id}`;
  const canSuspend = tenant.status === "active" || tenant.status === "trial";

  return (
    <TableRow>
      <TableCell className="pl-4">
        <div className="min-w-0">
          <Link
            href={href}
            className="block truncate rounded-sm font-medium outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Highlight text={tenant.name} query={search} />
          </Link>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {tenant.customDomain ?? tenant.slug}
          </p>
        </div>
      </TableCell>

      <TableCell className={HUG_COLUMN}>
        <StatusPill label={status.label} tone={status.tone} />
      </TableCell>

      <TableCell>
        <div className="space-y-1.5">
          <p className="text-sm tabular">
            {formatCount(tenant.memberCount)}
            <span className="text-muted-foreground">
              {" "}
              / {tenant.maxUsers ? formatCount(tenant.maxUsers) : "no limit"}
            </span>
          </p>
          {tenant.maxUsers > 0 && (
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={usage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${usage}% of seats used`}
            >
              <div
                className={cn("h-full rounded-full", full ? "bg-warning" : "bg-primary")}
                style={{ width: `${usage}%` }}
              />
            </div>
          )}
        </div>
      </TableCell>

      <TableCell className={`${HUG_COLUMN} text-muted-foreground tabular`}>
        {formatAdminDate(tenant.createdAt)}
      </TableCell>

      <TableCell className={`${HUG_COLUMN} pr-4`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${tenant.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <MenuAction icon={<Settings2 />} label="Manage tenant" href={href} />
            <MenuAction
              icon={<ExternalLink />}
              label="Open workspace"
              onSelect={() => url && window.open(url, "_blank", "noopener,noreferrer")}
              disabledReason={url ? undefined : "This tenant has no slug or custom domain yet."}
            />
            <DropdownMenuSeparator />
            {canSuspend ? (
              <MenuAction
                icon={<PauseCircle />}
                label="Suspend tenant"
                destructive
                onSelect={() => onStatusChange({ tenant, next: "suspended" })}
              />
            ) : (
              <MenuAction
                icon={<PlayCircle />}
                label="Reactivate tenant"
                onSelect={() => onStatusChange({ tenant, next: "active" })}
                disabledReason={
                  tenant.status === "suspended" || tenant.status === "cancelled"
                    ? undefined
                    : "Only suspended or cancelled tenants can be reactivated."
                }
              />
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function SkeletonRow() {
  return (
    <TableRow aria-hidden>
      <TableCell className="pl-4">
        <Shimmer className="h-4 w-44 rounded-md" />
        <Shimmer className="mt-1.5 h-3 w-24 rounded-md" />
      </TableCell>
      <TableCell>
        <Shimmer className="h-5 w-16 rounded-full" />
      </TableCell>
      <TableCell>
        <Shimmer className="h-4 w-14 rounded-md" />
        <Shimmer className="mt-2 h-1.5 w-full rounded-full" />
      </TableCell>
      <TableCell>
        <Shimmer className="h-4 w-20 rounded-md" />
      </TableCell>
      <TableCell className="pr-4">
        <Shimmer className="size-8 rounded-md" />
      </TableCell>
    </TableRow>
  );
}
