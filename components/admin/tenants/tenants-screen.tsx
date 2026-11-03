"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, Search, SearchX, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FilterPills } from "@/components/ui/filter-pills";
import { Input } from "@/components/ui/input";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { PageHeader } from "@/components/layout/page-header";
import { CreateTenantDialog } from "@/components/admin/tenants/create-tenant-dialog";
import {
  TenantStatusDialog,
  type TenantStatusChange,
} from "@/components/admin/tenants/tenant-status-dialog";
import { TenantsTable } from "@/components/admin/tenants/tenants-table";
import { useAdminTenantsQuery } from "@/hooks/use-admin-tenants-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { apiErrorMessage } from "@/lib/api-error";
import {
  TENANT_STATUS_FILTERS,
  tenantsPageInfo,
  type TenantStatusFilter,
} from "@/lib/admin/tenants";
import { PAGE_SIZES } from "@/lib/products";

/**
 * Every tenant workspace, searchable by name and filterable by status.
 *
 * Paged on the server. The old list re-fetched on every keystroke and counted
 * its "Active" and "Suspended" tiles from whichever twenty rows were on screen;
 * this waits for typing to pause, and the only count it shows is the server's
 * total for the current filter.
 */
export function TenantsScreen() {
  const router = useRouter();

  const [status, setStatus] = React.useState<TenantStatusFilter>("All");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<number>(PAGE_SIZES[1]);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [statusChange, setStatusChange] = React.useState<TenantStatusChange | null>(null);

  const debouncedSearch = useDebouncedValue(search, 350);

  // Back to page one whenever the filter or the search changes what's listed.
  React.useEffect(() => setPage(1), [status, debouncedSearch, pageSize]);

  const query = useAdminTenantsQuery({ page, pageSize, search: debouncedSearch, status });
  const tenants = query.data?.tenants ?? [];
  const pageInfo = query.data?.pageInfo ?? tenantsPageInfo(page, pageSize, 0);
  // A stale page under a new filter would show rows that don't match it.
  const rowsLoading = query.isLoading || query.isPlaceholderData;
  const filtered = status !== "All" || debouncedSearch.trim() !== "";
  /*
   * No tenants at all — loaded, unnarrowed and empty, never a failed fetch.
   * The box being typed into counts as narrowing before its debounce lands,
   * so the search never vanishes from under the cursor.
   */
  const noTenants =
    query.isSuccess &&
    !rowsLoading &&
    !filtered &&
    search.trim() === "" &&
    tenants.length === 0;

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={Building2}
        title="Tenants"
        description="Every tenant workspace, its status and how many of its seats are in use."
      >
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          New tenant
        </Button>
      </PageHeader>

      {!noTenants && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <FilterPills
            options={TENANT_STATUS_FILTERS}
            value={status}
            onChange={setStatus}
            label="Filter tenants by status"
          />
          <div className="relative w-full lg:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by tenant name"
              aria-label="Search tenants by name"
              className="pl-9"
            />
          </div>
        </div>
      )}

      {query.isError ? (
        <Empty>
          <EmptyMedia>
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle>Couldn&apos;t load tenants</EmptyTitle>
          <EmptyDescription>
            {apiErrorMessage(query.error, "The tenants request didn't complete.")}
          </EmptyDescription>
          <EmptyActions>
            <Button onClick={() => query.refetch()} disabled={query.isFetching}>
              {query.isFetching ? "Trying again…" : "Try again"}
            </Button>
          </EmptyActions>
        </Empty>
      ) : !rowsLoading && tenants.length === 0 ? (
        filtered ? (
          <Empty>
            <EmptyMedia>
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>No tenants match</EmptyTitle>
            <EmptyDescription>
              Nothing matches
              {debouncedSearch.trim() ? ` "${debouncedSearch.trim()}"` : ""}
              {status !== "All" ? ` with the status ${status.toLowerCase()}` : ""}.
            </EmptyDescription>
            <EmptyActions>
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setStatus("All");
                }}
              >
                Clear filters
              </Button>
            </EmptyActions>
          </Empty>
        ) : (
          <Empty>
            <EmptyMedia>
              <Building2 />
            </EmptyMedia>
            <EmptyTitle>No tenants yet</EmptyTitle>
            <EmptyDescription>
              Create the first tenant workspace to give a business its own address and branding.
            </EmptyDescription>
            <EmptyActions>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus />
                New tenant
              </Button>
            </EmptyActions>
          </Empty>
        )
      ) : (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <TenantsTable
              tenants={tenants}
              loading={rowsLoading}
              search={debouncedSearch}
              onStatusChange={setStatusChange}
            />
          </div>
          <NumberedPagination
            page={pageInfo}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="tenant"
            navLabel="Tenants pages"
            disabled={query.isFetching}
          />
        </div>
      )}

      <CreateTenantDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => router.push(`/admin/tenants/${id}`)}
      />
      <TenantStatusDialog change={statusChange} onClose={() => setStatusChange(null)} />
    </div>
  );
}
