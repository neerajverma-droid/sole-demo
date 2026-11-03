"use client";

import {
  Mail,
  MoreHorizontal,
  Pencil,
  Search,
  SearchX,
  Trash2,
  TriangleAlert,
  UsersRound,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyActions,
  EmptyCue,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { MenuAction } from "@/components/ui/menu-action";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SkeletonActionCell,
  SkeletonBadgeCell,
  SkeletonIdentityCell,
  SkeletonRows,
  SkeletonTextCell,
} from "@/components/ui/table-skeleton";
import { Highlight } from "@/components/contacts/highlight";
import { PAYROLL_EMPTY, payrollInitials } from "@/lib/payroll";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  SYNC_STATUS_OPTIONS,
  employeeHandle,
  employeeName,
  employeePhone,
  employmentTypeLabel,
  syncStatusLabel,
  syncStatusVariant,
  type EmploymentTypeFilter,
  type PayrollEmployee,
  type SyncStatusFilter,
} from "@/lib/payroll-employees";
import type { PageInfo } from "@/lib/products";

const TABLE_MIN_WIDTH = "min-w-[1040px]";

function HeaderRow() {
  return (
    <TableRow>
      <TableHead>Employee</TableHead>
      <TableHead>Email</TableHead>
      <TableHead>Phone</TableHead>
      <TableHead>Employment</TableHead>
      <TableHead>Payroll ID</TableHead>
      <TableHead className="text-center">Sync status</TableHead>
      <TableHead className="w-[96px] text-right">Actions</TableHead>
    </TableRow>
  );
}

export function EmployeesTable({
  employees,
  loading,
  failed,
  onRetry,
  search,
  onSearchChange,
  employmentType,
  onEmploymentTypeChange,
  status,
  onStatusChange,
  pageInfo,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onNewEmployee,
  onOpen,
  onSendCredentials,
  onRemove,
}: {
  /** This page's rows — search, filters and paging all happen server-side. */
  employees: PayrollEmployee[];
  /** A search, filter or page change is in flight. */
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  search: string;
  onSearchChange: (next: string) => void;
  employmentType: EmploymentTypeFilter;
  onEmploymentTypeChange: (next: EmploymentTypeFilter) => void;
  status: SyncStatusFilter;
  onStatusChange: (next: SyncStatusFilter) => void;
  pageInfo: PageInfo;
  pageSize: number;
  onPageChange: (next: number) => void;
  onPageSizeChange: (next: number) => void;
  /** Gated by the screen — the empty state goes through the same checks. */
  onNewEmployee: () => void;
  onOpen: (employee: PayrollEmployee) => void;
  onSendCredentials: (employee: PayrollEmployee) => void;
  onRemove: (employee: PayrollEmployee) => void;
}) {
  const searching = search.trim().length > 0;
  const filtered = searching || employmentType !== "all" || status !== "all";

  const clearAll = () => {
    onSearchChange("");
    onEmploymentTypeChange("all");
    onStatusChange("all");
  };

  const toolbar = (
    <div
      className="flex flex-wrap items-center gap-2"
      data-usertour="payroll-employees-search-filters"
    >
      <div className="relative w-full sm:w-72">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search name, email, payroll ID"
          aria-label="Search employees"
          className="pl-9"
        />
      </div>
      <Select
        value={employmentType}
        onValueChange={(next) =>
          onEmploymentTypeChange(next as EmploymentTypeFilter)
        }
      >
        <SelectTrigger
          className="w-full sm:w-[210px]"
          aria-label="Employment type"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All employment types</SelectItem>
          {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={status}
        onValueChange={(next) => onStatusChange(next as SyncStatusFilter)}
      >
        <SelectTrigger className="w-full sm:w-[170px]" aria-label="Sync status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All sync statuses</SelectItem>
          {SYNC_STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {toolbar}
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
          <Table className={TABLE_MIN_WIDTH}>
            <TableHeader>
              <HeaderRow />
            </TableHeader>
            <TableBody aria-hidden>
              <SkeletonRows
                count={5}
                render={() => (
                  <>
                    <SkeletonIdentityCell
                      nameWidth="w-28"
                      subtextWidth="w-20"
                    />
                    <SkeletonTextCell width="w-44" />
                    <SkeletonTextCell width="w-28" />
                    <SkeletonTextCell width="w-20" />
                    <SkeletonTextCell width="w-16" />
                    <SkeletonBadgeCell className="[&>*]:mx-auto" width="w-16" />
                    <SkeletonActionCell />
                  </>
                )}
              />
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (pageInfo.total === 0 || failed) {
    // A failed fetch also leaves the total at 0 — a different problem from an
    // honestly empty list, and it says so rather than offering "New employee"
    // over a request that never landed. Only an honestly empty list drops the
    // toolbar: there's nothing yet to search or filter, and the screen hides
    // the stat cards on the same terms.
    return (
      <div className="space-y-4">
        {(failed || filtered) && toolbar}
        <Empty>
          <EmptyMedia>
            {failed ? (
              <TriangleAlert aria-hidden />
            ) : filtered ? (
              <SearchX aria-hidden />
            ) : (
              <UsersRound aria-hidden />
            )}
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>
              {failed
                ? "Couldn't load employees"
                : filtered
                  ? "No employees match"
                  : "No employees yet"}
            </EmptyTitle>
            <EmptyDescription>
              {failed
                ? "Something went wrong reaching the server. Try again."
                : filtered
                  ? "Try a different search or filter, or clear them to see everyone."
                  : "Add the people you pay. Each one syncs to Microkeeper and takes one seat."}
            </EmptyDescription>
          </div>
          {!failed && !filtered && <EmptyCue label="Start here" />}
          <EmptyActions>
            {failed ? (
              <Button variant="outline" size="sm" onClick={onRetry}>
                Try again
              </Button>
            ) : filtered ? (
              <Button variant="outline" size="sm" onClick={clearAll}>
                Clear filters
              </Button>
            ) : (
              <Button size="sm" onClick={onNewEmployee}>
                New employee
              </Button>
            )}
          </EmptyActions>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toolbar}
      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
        <Table className={TABLE_MIN_WIDTH}>
          <TableHeader>
            <HeaderRow />
          </TableHeader>
          <TableBody>
            {employees.map((employee) => (
              <EmployeeRow
                key={employee.id}
                employee={employee}
                query={search}
                onOpen={() => onOpen(employee)}
                onSendCredentials={() => onSendCredentials(employee)}
                onRemove={() => onRemove(employee)}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <NumberedPagination
        page={pageInfo}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        itemLabel="employee"
        navLabel="Employee pages"
      />
    </div>
  );
}

function EmployeeRow({
  employee,
  query,
  onOpen,
  onSendCredentials,
  onRemove,
}: {
  employee: PayrollEmployee;
  query: string;
  onOpen: () => void;
  onSendCredentials: () => void;
  onRemove: () => void;
}) {
  const name = employeeName(employee) || "Unnamed employee";
  const handle = employeeHandle(employee);

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="size-9">
            {employee.profilePhotoUrl && (
              <AvatarImage src={employee.profilePhotoUrl} alt="" />
            )}
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {payrollInitials(name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <button
              type="button"
              onClick={onOpen}
              className="truncate text-left text-sm font-medium outline-none hover:underline focus-visible:underline"
            >
              <Highlight text={name} query={query} />
            </button>
            {handle && (
              <p className="truncate text-xs text-muted-foreground">
                @{handle}
              </p>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="max-w-[240px] truncate text-muted-foreground">
        {employee.email ? (
          <Highlight text={employee.email} query={query} />
        ) : (
          PAYROLL_EMPTY
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground tabular">
        {employeePhone(employee)}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {employmentTypeLabel(employee.employmentType)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground tabular">
        {employee.payrollId ? (
          <Highlight text={employee.payrollId} query={query} />
        ) : (
          PAYROLL_EMPTY
        )}
      </TableCell>
      <TableCell className="text-center">
        <Badge variant={syncStatusVariant(employee.status)}>
          {syncStatusLabel(employee.status)}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onOpen}
            aria-label={`Edit ${name}`}
          >
            <Pencil className="size-4 text-muted-foreground" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`More actions for ${name}`}
              >
                <MoreHorizontal className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <MenuAction
                icon={<Pencil />}
                label="Edit profile"
                onSelect={onOpen}
              />
              <MenuAction
                icon={<Mail />}
                label="Send credentials email"
                onSelect={onSendCredentials}
                disabledReason={
                  employee.email ? undefined : "Add an email address first."
                }
              />
              <DropdownMenuSeparator />
              <MenuAction
                icon={<Trash2 />}
                label="Remove"
                onSelect={onRemove}
                destructive
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}
