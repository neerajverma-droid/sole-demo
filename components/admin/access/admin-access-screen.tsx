"use client";

import * as React from "react";
import { KeyRound, Plus, Search, SearchX, ShieldCheck, TriangleAlert, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { Shimmer } from "@/components/ui/shimmer";
import { PageHeader } from "@/components/layout/page-header";
import { AdminRow } from "@/components/admin/access/admin-row";
import { CreateAdminDialog } from "@/components/admin/access/create-admin-dialog";
import { RevokeAccessDialog } from "@/components/admin/access/revoke-access-dialog";
import { useAdminUsersQuery } from "@/hooks/use-admin-users-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { apiErrorMessage } from "@/lib/api-error";
import type { AdminUser } from "@/lib/admin/admin-users";
import { tenantsPageInfo } from "@/lib/admin/tenants";

const PAGE_SIZES = [10, 20, 50] as const;

/**
 * Who can use the admin area, and which parts of it.
 *
 * Super-admin only. Lists delegated admins — super admins aren't in the list,
 * because they see everything and there's nothing to grant them.
 */
export function AdminAccessScreen() {
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<number>(20);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [revoking, setRevoking] = React.useState<AdminUser | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  React.useEffect(() => setPage(1), [debouncedSearch, pageSize]);

  const query = useAdminUsersQuery({ page, pageSize, search: debouncedSearch });
  const admins = query.data?.admins ?? [];
  const pageInfo = query.data?.pageInfo ?? tenantsPageInfo(page, pageSize, 0);
  const rowsLoading = query.isLoading || query.isPlaceholderData;
  /*
   * No delegated admins at all — loaded, unsearched and empty, never a failed
   * fetch. There's nothing to search then. The note about super admins stays:
   * it's what explains an empty list when the platform clearly has admins.
   * The box being typed into counts as a search before its debounce lands,
   * so it never vanishes from under the cursor.
   */
  const noAdmins =
    query.isSuccess &&
    !rowsLoading &&
    search.trim() === "" &&
    debouncedSearch.trim() === "" &&
    admins.length === 0;

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={KeyRound}
        title="Admin access"
        description="Create admin accounts and choose which sections each one can open."
      >
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          New admin
        </Button>
      </PageHeader>

      <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm shadow-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p className="text-muted-foreground">
          Super admins see every section, including Sole Cash and this page, so they aren&apos;t
          listed here. Changes take effect the next time the admin loads a page.
        </p>
      </div>

      {!noAdmins && (
        <div className="relative w-full sm:w-80">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email"
            aria-label="Search admins by name or email"
            className="pl-9"
          />
        </div>
      )}

      {query.isError ? (
        <Empty>
          <EmptyMedia>
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle>Couldn&apos;t load admins</EmptyTitle>
          <EmptyDescription>
            {apiErrorMessage(query.error, "The admin list request didn't complete.")}
          </EmptyDescription>
          <EmptyActions>
            <Button onClick={() => query.refetch()} disabled={query.isFetching}>
              {query.isFetching ? "Trying again…" : "Try again"}
            </Button>
          </EmptyActions>
        </Empty>
      ) : !rowsLoading && admins.length === 0 ? (
        debouncedSearch.trim() ? (
          <Empty>
            <EmptyMedia>
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>No admins match</EmptyTitle>
            <EmptyDescription>Nobody matches &quot;{debouncedSearch.trim()}&quot;.</EmptyDescription>
            <EmptyActions>
              <Button variant="outline" onClick={() => setSearch("")}>
                Clear search
              </Button>
            </EmptyActions>
          </Empty>
        ) : (
          <Empty>
            <EmptyMedia>
              <UserPlus />
            </EmptyMedia>
            <EmptyTitle>No admins yet</EmptyTitle>
            <EmptyDescription>
              Create an admin account to let someone help run the platform without full access.
            </EmptyDescription>
            <EmptyActions>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus />
                New admin
              </Button>
            </EmptyActions>
          </Empty>
        )
      ) : (
        <div className="space-y-4">
          <ul className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            {rowsLoading
              ? Array.from({ length: 5 }, (_, index) => (
                  <li
                    key={index}
                    className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
                    aria-hidden
                  >
                    <Shimmer className="size-9 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Shimmer className="h-4 w-40 rounded-md" />
                      <Shimmer className="h-3 w-56 rounded-md" />
                    </div>
                    <Shimmer className="h-5 w-28 rounded-full" />
                  </li>
                ))
              : admins.map((admin) => (
                  <AdminRow
                    key={admin.id}
                    admin={admin}
                    search={debouncedSearch}
                    onRevokeAll={setRevoking}
                  />
                ))}
          </ul>
          <NumberedPagination
            page={pageInfo}
            pageSize={pageSize}
            pageSizes={PAGE_SIZES}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="admin"
            navLabel="Admin pages"
            disabled={query.isFetching}
          />
        </div>
      )}

      <CreateAdminDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RevokeAccessDialog admin={revoking} onClose={() => setRevoking(null)} />
    </div>
  );
}
