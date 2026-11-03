"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CircleAlert,
  Plus,
  Upload,
  UserCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { Shimmer } from "@/components/ui/shimmer";
import { StatCards, type StatCard } from "@/components/ui/stat-cards";
import { AddSeatsDialog } from "@/components/payroll/add-seats-dialog";
import {
  PAYROLL_BILLING_HREF,
  PayrollSeatsNotice,
} from "@/components/payroll/payroll-banners";
import { EmployeeBulkUploadDialog } from "@/components/payroll/employees/employee-bulk-upload-dialog";
import { EmployeeCreateDrawer } from "@/components/payroll/employees/employee-create-drawer";
import { EmployeeProfileDrawer } from "@/components/payroll/employees/employee-profile-drawer";
import { EmployeeRemoveDialog } from "@/components/payroll/employees/employee-remove-dialog";
import { EmployeesTable } from "@/components/payroll/employees/employees-table";
import { usePayrollSeatsQuery } from "@/hooks/use-payroll-query";
import {
  usePayrollEmployeeStatsQuery,
  usePayrollEmployeesQuery,
  useSendCredentialsEmailMutation,
} from "@/hooks/use-payroll-employees-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  NO_PAYROLL_SEATS,
  PAYROLL_EMPTY,
  PAYROLL_ROOT,
  payrollEnabled,
} from "@/lib/payroll";
import {
  employeeErrorMessage,
  filtersForStatCard,
  newEmployeeBlock,
  type EmployeeWriteBlock,
  type EmploymentTypeFilter,
  type PayrollEmployee,
  type SyncStatusFilter,
} from "@/lib/payroll-employees";
import type { PageInfo } from "@/lib/products";

const DEFAULT_PAGE_SIZE = 10;

type StatKey = "all" | "active" | "incomplete" | "failed";

/** Which drawer a seat purchase was standing in front of. */
type AddPath = "create" | "bulk";

/**
 * What to do once seats are bought: open a drawer the limit stopped from
 * opening, or say so over one that's still open with the person's work in it.
 */
type SeatsFollowUp = AddPath | "retry-create" | "retry-save";

export function EmployeesScreen() {
  const router = useRouter();
  const seatsQuery = usePayrollSeatsQuery();
  const seats = seatsQuery.data ?? NO_PAYROLL_SEATS;
  const statsQuery = usePayrollEmployeeStatsQuery();

  const [search, setSearch] = React.useState("");
  // 350ms, as sole-webapp's list — the box itself updates instantly.
  const debouncedSearch = useDebouncedValue(search, 350);
  const [employmentType, setEmploymentType] =
    React.useState<EmploymentTypeFilter>("all");
  const [status, setStatus] = React.useState<SyncStatusFilter>("all");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);

  // Back to page one whenever the search underneath changes — an old page
  // number surviving a narrower search would land past its last page.
  const previousSearch = React.useRef(debouncedSearch);
  React.useEffect(() => {
    if (previousSearch.current === debouncedSearch) return;
    previousSearch.current = debouncedSearch;
    setPage(1);
  }, [debouncedSearch]);

  const listQuery = usePayrollEmployeesQuery({
    page,
    limit: pageSize,
    search: debouncedSearch,
    employmentType,
    status,
  });

  const [createOpen, setCreateOpen] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [seatsOpen, setSeatsOpen] = React.useState(false);
  const [profileId, setProfileId] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<PayrollEmployee | null>(null);
  const pendingPath = React.useRef<SeatsFollowUp | null>(null);
  const sendCredentials = useSendCredentialsEmailMutation();

  // `?edit=<id>` opens that employee's profile — the pay run wizard links
  // here from an incomplete profile, in a new tab so the run isn't lost.
  const searchParams = useSearchParams();
  const editParam = searchParams?.get("edit");
  React.useEffect(() => {
    if (editParam) setProfileId(editParam);
  }, [editParam]);

  const enabled = payrollEnabled(seats);

  /**
   * Every way of adding people goes through here — the header, the empty
   * state and bulk upload. sole-webapp's empty-state button skipped both
   * checks and let you fill in a whole employee only to hit a 402 on save.
   */
  const startAdding = (path: AddPath) => {
    const block = newEmployeeBlock(seats);
    if (block === "not-enabled") {
      toast.error(
        path === "bulk"
          ? "Turn payroll on to upload employees."
          : "Turn payroll on to add employees.",
        {
          action: {
            label: "Enable payroll",
            onClick: () => router.push(PAYROLL_BILLING_HREF),
          },
        },
      );
      return;
    }
    if (block === "seat-limit") {
      pendingPath.current = path;
      setSeatsOpen(true);
      return;
    }
    if (path === "create") setCreateOpen(true);
    else setBulkOpen(true);
  };

  const openAddSeats = () => {
    pendingPath.current = null;
    setSeatsOpen(true);
  };

  const onSeatsAdded = () => {
    setSeatsOpen(false);
    // Carry on to whatever the limit interrupted.
    const path = pendingPath.current;
    pendingPath.current = null;
    if (path === "create") setCreateOpen(true);
    if (path === "bulk") setBulkOpen(true);
    if (path === "retry-create")
      toast.info("Seats added. Select Create employee to finish.");
    if (path === "retry-save")
      toast.info("Seats added. Save the profile again to finish.");
  };

  /**
   * A write the server refused for billing reasons. Out of seats offers the
   * top-up straight away; anything else (payroll off, payment overdue) can
   * only be fixed in the subscription settings, so the toast links there.
   */
  const onBlocked =
    (followUp: SeatsFollowUp) =>
    (block: EmployeeWriteBlock, message: string) => {
      if (block === "seat-limit") {
        pendingPath.current = followUp;
        setSeatsOpen(true);
        return;
      }
      toast.error(message, {
        action: {
          label: "Open billing",
          onClick: () => router.push(PAYROLL_BILLING_HREF),
        },
      });
    };

  const onSendCredentials = async (employee: PayrollEmployee) => {
    try {
      toast.success(await sendCredentials.mutateAsync(employee.id));
    } catch (error) {
      toast.error(
        employeeErrorMessage(error, "Failed to send the credentials email."),
      );
    }
  };

  const selectStat = (key: StatKey) => {
    const next = filtersForStatCard(key);
    setEmploymentType(next.employmentType);
    setStatus(next.status);
    setPage(1);
  };

  const stats = statsQuery.data;
  const figure = (value: number | undefined) =>
    value === undefined ? PAYROLL_EMPTY : value.toLocaleString("en-AU");

  const failedOnly = status === "FAILED" && employmentType === "all";
  const cardList: (StatCard & { key: StatKey })[] = [
    {
      key: "all",
      label: "All employees",
      value: figure(stats?.totalEmployees),
      meta: "Everyone on payroll",
      icon: UsersRound,
    },
    {
      key: "active",
      tone: "success",
      label: "Active",
      value: figure(stats?.activeEmployees),
      meta: "Currently employed",
      icon: UserCheck,
    },
    {
      key: "incomplete",
      tone: "warning",
      label: "Profile incomplete",
      value: figure(stats?.profileIncomplete),
      meta: "Missing tax, bank or pay details",
      icon: UserRound,
    },
    {
      key: "failed",
      tone: "danger",
      label: "Needs attention",
      value: figure(stats?.failedSync),
      meta: "Failed to sync to Microkeeper",
      icon: CircleAlert,
    },
  ];
  const cards: StatCard[] = cardList.map((card) => ({
    ...card,
    onSelect: () => selectStat(card.key),
    active: card.key === "failed" ? failedOnly : undefined,
    selectLabel:
      card.key === "failed"
        ? "Show employees that need attention"
        : `${card.label}: clear filters`,
  }));

  const total = listQuery.data?.total ?? 0;
  const pageCount = Math.max(1, listQuery.data?.totalPages ?? 1);
  const currentPage = Math.min(page, pageCount);
  const pageInfo: PageInfo = {
    page: currentPage,
    pageCount,
    total,
    from: total === 0 ? 0 : (currentPage - 1) * pageSize + 1,
    to: Math.min(currentPage * pageSize, total),
  };

  /*
   * Debounce, then the request for the page it asks for. Not `isFetching`,
   * which is also true of a background refresh of the rows already on screen.
   */
  const isFiltering = search !== debouncedSearch || listQuery.isPlaceholderData;

  /*
   * Nobody on payroll at all — loaded, unnarrowed and empty, not just a
   * search or filter that matched no one, and never a failed fetch. The
   * cards then have nothing to count or filter, so only the header and the
   * table's "No employees yet" remain; the seats notice stays, since it's
   * what stands between the person and adding their first employee.
   */
  const noEmployees =
    listQuery.isSuccess &&
    !isFiltering &&
    search.trim().length === 0 &&
    employmentType === "all" &&
    status === "all" &&
    total === 0;

  const header = (
    <PageHeader
      icon={UsersRound}
      title="Employees"
      description="Manage your team, their pay details and their Microkeeper sync."
    >
      {enabled && seats.employeeLimit > 0 && (
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 items-center rounded-full border border-border bg-card px-3.5 text-sm">
            <span className="text-muted-foreground">Seats:</span>
            <span className="ml-1.5 font-medium tabular">
              {seats.activeEmployees}/{seats.employeeLimit}
            </span>
          </span>
          <Button variant="outline" onClick={openAddSeats}>
            <Plus />
            Add seats
          </Button>
        </div>
      )}
      <Button
        variant="outline"
        onClick={() => startAdding("bulk")}
        disabled={seatsQuery.isPending}
        data-usertour="payroll-employees-bulk-upload"
      >
        <Upload />
        Bulk upload
      </Button>
      <Button
        onClick={() => startAdding("create")}
        disabled={seatsQuery.isPending}
        data-usertour="payroll-employees-new-button"
      >
        <Plus />
        New employee
      </Button>
    </PageHeader>
  );

  if (listQuery.isLoading) {
    return (
      <div className="space-y-[15px]">
        {header}
        <div className="space-y-6" aria-hidden>
          <Shimmer className="h-9 w-64 rounded-md" />
          <Shimmer className="h-24 w-full rounded-lg border border-border" />
          <Shimmer className="h-96 w-full rounded-lg border border-border" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-[15px]">
      {header}

      {seatsQuery.data && (
        <PayrollSeatsNotice seats={seats} onAddSeats={openAddSeats} />
      )}

      {/* The cards are filters as well as figures — "Needs attention"
          narrows to failed syncs, the rest clear the filters, the same as
          sole-webapp. */}
      {!noEmployees && (
        <div data-usertour="payroll-employees-stats">
          <StatCards stats={cards} loading={statsQuery.isPending} />
        </div>
      )}

      <EmployeesTable
        employees={listQuery.data?.employees ?? []}
        loading={isFiltering}
        failed={listQuery.isError}
        onRetry={() => void listQuery.refetch()}
        search={search}
        onSearchChange={setSearch}
        employmentType={employmentType}
        onEmploymentTypeChange={(next) => {
          setEmploymentType(next);
          setPage(1);
        }}
        status={status}
        onStatusChange={(next) => {
          setStatus(next);
          setPage(1);
        }}
        pageInfo={pageInfo}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next);
          setPage(1);
        }}
        onNewEmployee={() => startAdding("create")}
        onOpen={(employee) => setProfileId(employee.id)}
        onSendCredentials={(employee) => void onSendCredentials(employee)}
        onRemove={setRemoving}
      />

      <EmployeeCreateDrawer
        open={createOpen}
        onOpenChange={setCreateOpen}
        onBlocked={onBlocked("retry-create")}
      />
      <EmployeeProfileDrawer
        employeeId={profileId}
        onBlocked={onBlocked("retry-save")}
        onClose={() => {
          setProfileId(null);
          // Drop the deep link, so a refresh doesn't reopen what was closed.
          if (editParam) router.replace(`${PAYROLL_ROOT}/employees`);
        }}
      />
      <EmployeeBulkUploadDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onBlocked={(block, message) => {
          // The upload is the file, not typed work — closing loses nothing,
          // and it reopens once the seats are in.
          if (block === "seat-limit") setBulkOpen(false);
          onBlocked("bulk")(block, message);
        }}
      />
      <EmployeeRemoveDialog
        employee={removing}
        onClose={() => setRemoving(null)}
      />
      <AddSeatsDialog
        open={seatsOpen}
        onOpenChange={setSeatsOpen}
        seats={seats}
        onAdded={onSeatsAdded}
      />
    </div>
  );
}
