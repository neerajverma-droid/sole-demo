"use client";

import * as React from "react";
import { Download, Loader2, Search, SearchX, TriangleAlert, Users } from "lucide-react";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/layout/page-header";
import { DeleteUserDialog } from "@/components/admin/users/delete-user-dialog";
import { UsersTable } from "@/components/admin/users/users-table";
import { useAdminAccess } from "@/hooks/use-admin-access";
import {
  useImpersonateMutation,
  usePlatformUsersQuery,
} from "@/hooks/use-admin-platform-users-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { apiErrorMessage } from "@/lib/api-error";
import { formatCount } from "@/lib/admin/format";
import { tenantsPageInfo } from "@/lib/admin/tenants";
import {
  ACCOUNT_FILTERS,
  MAX_EXPORT_ROWS,
  PLATFORM_OPTIONS,
  exportFileName,
  exportUsersCsv,
  userDisplayName,
  type AccountFilter,
  type PlatformFilter,
  type PlatformUser,
  type UsersFilters,
} from "@/lib/admin/users";
import { PAGE_SIZES } from "@/lib/products";

/**
 * Every account owner on the platform: search, filter, export, sign in as
 * them, or delete their account.
 *
 * The old screen's tiles counted "Verified" and "Pending" from the thirty rows
 * on screen and labelled them as if they were totals. The one count here is
 * the server's total for the current filters.
 */
export function UsersScreen() {
  const { canSee } = useAdminAccess();
  const canOpenTenants = canSee({ feature: "tenants" });

  const [search, setSearch] = React.useState("");
  const [platform, setPlatform] = React.useState<PlatformFilter>("all");
  const [accounts, setAccounts] = React.useState<AccountFilter>("Active");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<number>(PAGE_SIZES[1]);
  const [deleting, setDeleting] = React.useState<PlatformUser | null>(null);
  const [exporting, setExporting] = React.useState(false);

  const debouncedSearch = useDebouncedValue(search, 350);
  const filters: UsersFilters = React.useMemo(
    () => ({ search: debouncedSearch, platform, accounts }),
    [debouncedSearch, platform, accounts],
  );

  React.useEffect(() => setPage(1), [filters, pageSize]);

  const query = usePlatformUsersQuery({ page, pageSize, filters });
  const impersonate = useImpersonateMutation();

  const users = query.data?.users ?? [];
  const pageInfo = query.data?.pageInfo ?? tenantsPageInfo(page, pageSize, 0);
  const rowsLoading = query.isLoading || query.isPlaceholderData;
  const filtered = debouncedSearch.trim() !== "" || platform !== "all" || accounts !== "Active";
  /*
   * No accounts under the default view — loaded, unnarrowed and empty, never a
   * failed fetch. The search and platform have nothing to work on then, but
   * the account pills stay: "Deleted" may still hold accounts, and they're
   * the only way to them. The box being typed into counts as narrowing before
   * its debounce lands, so it never vanishes from under the cursor.
   */
  const noUsers =
    query.isSuccess &&
    !rowsLoading &&
    !filtered &&
    search.trim() === "" &&
    users.length === 0;

  const clearFilters = () => {
    setSearch("");
    setPlatform("all");
    setAccounts("Active");
  };

  const onExport = async () => {
    setExporting(true);
    try {
      const blob = await exportUsersCsv(filters);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFileName();
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded", {
        description:
          pageInfo.total > MAX_EXPORT_ROWS
            ? `Only the newest ${formatCount(MAX_EXPORT_ROWS)} accounts fit in one export.`
            : undefined,
      });
    } catch (error) {
      toast.error(apiErrorMessage(error, "The export couldn't be downloaded."));
    } finally {
      setExporting(false);
    }
  };

  /**
   * The tab is opened inside the click, before the request: a window opened
   * after an `await` is no longer a user gesture, and browsers block it as a
   * pop-up. It's pointed at the sign-in link once the link exists, or closed
   * if it doesn't.
   */
  const onImpersonate = (user: PlatformUser) => {
    if (!user.tenantId) return;
    const tab = window.open("about:blank", "_blank");
    impersonate.mutate(
      { tenantId: user.tenantId, userId: user.id },
      {
        onSuccess: ({ url }) => {
          if (tab) {
            tab.opener = null;
            tab.location.href = url;
          } else {
            window.location.assign(url);
          }
          toast.success(`Signing in as ${userDisplayName(user)}`, {
            description: "The sign-in link expires after 15 minutes.",
          });
        },
        onError: (error) => {
          tab?.close();
          toast.error(apiErrorMessage(error, "Couldn't sign in as this user."));
        },
      },
    );
  };

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={Users}
        title="Users"
        description="Every account owner on the platform. Admin accounts and invited team members aren't listed."
      >
        <Button variant="outline" onClick={onExport} disabled={exporting || pageInfo.total === 0}>
          {exporting ? <Loader2 className="animate-spin" aria-hidden /> : <Download />}
          {exporting ? "Exporting…" : "Export CSV"}
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterPills
          options={ACCOUNT_FILTERS}
          value={accounts}
          onChange={setAccounts}
          label="Filter by account status"
        />
        {!noUsers && (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Select value={platform} onValueChange={(next) => setPlatform(next as PlatformFilter)}>
              <SelectTrigger className="w-full sm:w-40" aria-label="Filter by platform">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORM_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative w-full sm:w-72">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, email or business"
                aria-label="Search users by name, email or business"
                className="pl-9"
              />
            </div>
          </div>
        )}
      </div>

      {query.isError ? (
        <Empty>
          <EmptyMedia>
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle>Couldn&apos;t load users</EmptyTitle>
          <EmptyDescription>
            {apiErrorMessage(query.error, "The users request didn't complete.")}
          </EmptyDescription>
          <EmptyActions>
            <Button onClick={() => query.refetch()} disabled={query.isFetching}>
              {query.isFetching ? "Trying again…" : "Try again"}
            </Button>
          </EmptyActions>
        </Empty>
      ) : !rowsLoading && users.length === 0 ? (
        <Empty>
          <EmptyMedia>{filtered ? <SearchX /> : <Users />}</EmptyMedia>
          <EmptyTitle>{filtered ? "No users match" : "No users yet"}</EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Nothing matches these filters. Try a different search or platform."
              : "Accounts appear here as people sign up."}
          </EmptyDescription>
          {filtered && (
            <EmptyActions>
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            </EmptyActions>
          )}
        </Empty>
      ) : (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <UsersTable
              users={users}
              loading={rowsLoading}
              search={debouncedSearch}
              canOpenTenants={canOpenTenants}
              onImpersonate={onImpersonate}
              onDelete={setDeleting}
            />
          </div>
          <NumberedPagination
            page={pageInfo}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="user"
            navLabel="Users pages"
            disabled={query.isFetching}
          />
        </div>
      )}

      <DeleteUserDialog user={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}
