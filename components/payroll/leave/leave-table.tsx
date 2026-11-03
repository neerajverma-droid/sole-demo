"use client";

import {
  Ban,
  CalendarDays,
  Check,
  MoreHorizontal,
  Pencil,
  Search,
  SearchX,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

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
import { Shimmer } from "@/components/ui/shimmer";
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
  SkeletonRows,
  SkeletonTextCell,
} from "@/components/ui/table-skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Highlight } from "@/components/contacts/highlight";
import { payrollDate } from "@/lib/payroll";
import {
  LEAVE_STATUS_TABS,
  LEAVE_TYPES,
  isFullDayTimes,
  leaveActionBlocker,
  leaveDateFromApi,
  leaveDurationLabel,
  leaveRowDuration,
  leaveStatusLabel,
  leaveStatusVariant,
  leaveTypeLabel,
  type LeaveCounts,
  type LeaveRequest,
  type LeaveStatusFilter,
  type LeaveTypeFilter,
} from "@/lib/payroll-leave";
import type { PageInfo } from "@/lib/products";

export function LeaveTable({
  requests,
  counts,
  countsFailed,
  loading,
  failed,
  onRetry,
  filtered,
  empty,
  status,
  onStatusChange,
  leaveType,
  onLeaveTypeChange,
  query,
  onQueryChange,
  onClearFilters,
  pageInfo,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onNew,
  onEdit,
  onApprove,
  onDecline,
  onCancel,
  onDelete,
}: {
  /** Already this page's rows — filtering and paging both happen server-side. */
  requests: LeaveRequest[];
  counts: LeaveCounts | undefined;
  countsFailed: boolean;
  /** A filter or page change is in flight against the server. */
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  /** Any of status, type or search is narrowing the list. */
  filtered: boolean;
  /**
   * Nothing on file at all, unnarrowed — the tabs, type and search have
   * nothing to work on, so only the empty state shows.
   */
  empty: boolean;
  status: LeaveStatusFilter;
  onStatusChange: (next: LeaveStatusFilter) => void;
  leaveType: LeaveTypeFilter;
  onLeaveTypeChange: (next: LeaveTypeFilter) => void;
  query: string;
  onQueryChange: (next: string) => void;
  onClearFilters: () => void;
  pageInfo: PageInfo;
  pageSize: number;
  onPageChange: (next: number) => void;
  onPageSizeChange: (next: number) => void;
  onNew: () => void;
  onEdit: (request: LeaveRequest) => void;
  onApprove: (request: LeaveRequest) => void;
  onDecline: (request: LeaveRequest) => void;
  onCancel: (request: LeaveRequest) => void;
  onDelete: (request: LeaveRequest) => void;
}) {
  return (
    <div className="space-y-4">
      {!empty && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Five tabs with counts are wider than a phone — they scroll inside
              the row rather than pushing past the screen edge. */}
          <Tabs
            className="max-w-full overflow-x-auto"
            value={status}
            onValueChange={(next) => onStatusChange(next as LeaveStatusFilter)}
          >
            <TabsList aria-label="Leave status" data-usertour="payroll-leave-status-tabs">
              {LEAVE_STATUS_TABS.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="gap-1.5 font-normal"
                >
                  {tab.label}
                  {counts ? (
                    <span className="text-xs text-muted-foreground tabular">
                      {counts[tab.count]}
                    </span>
                  ) : countsFailed ? null : (
                    <Shimmer className="h-3.5 w-4" aria-hidden />
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div
            className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
            data-usertour="payroll-leave-search-filters"
          >
            <Select
              value={leaveType}
              onValueChange={(next) => onLeaveTypeChange(next as LeaveTypeFilter)}
            >
              <SelectTrigger className="w-full sm:w-48" aria-label="Leave type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All leave types</SelectItem>
                {LEAVE_TYPES.map((option) => (
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
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search employee name or notes"
                aria-label="Search employee name or notes"
                className="pl-9"
              />
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <TableFrame>
          <TableBody aria-hidden>
            <SkeletonRows
              count={5}
              render={() => (
                <>
                  <TableCell>
                    <Shimmer className="h-4 w-32" />
                    <Shimmer className="mt-1.5 h-3 w-44" />
                  </TableCell>
                  <SkeletonTextCell width="w-24" />
                  <SkeletonTextCell width="w-20" />
                  <SkeletonTextCell width="w-20" />
                  <SkeletonTextCell width="w-24" />
                  <SkeletonBadgeCell width="w-20" />
                  <SkeletonActionCell />
                </>
              )}
            />
          </TableBody>
        </TableFrame>
      ) : failed ? (
        // Never let a request that didn't land read as an empty list.
        <Empty>
          <EmptyMedia>
            <TriangleAlert aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>Couldn&apos;t load leave requests</EmptyTitle>
            <EmptyDescription>
              Something went wrong reaching the server. Try again.
            </EmptyDescription>
          </div>
          <EmptyActions>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </EmptyActions>
        </Empty>
      ) : requests.length === 0 ? (
        <Empty className="gap-2.5 py-9">
          <EmptyMedia>
            {filtered ? <SearchX aria-hidden /> : <CalendarDays aria-hidden />}
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>
              {filtered
                ? "No leave requests match these filters"
                : "No leave requests yet"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Try a different status, leave type or search, or clear them to see everything."
                : "Record leave for your team, then approve it before the pay run it falls in."}
            </EmptyDescription>
          </div>
          {/* The nudge belongs to the true empty state only — a filter that
              matched nothing wants clearing, not encouraging. */}
          {!filtered && <EmptyCue label="Start here" />}
          <EmptyActions>
            {filtered ? (
              <Button variant="outline" size="sm" onClick={onClearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button size="sm" onClick={onNew}>
                New leave request
              </Button>
            )}
          </EmptyActions>
        </Empty>
      ) : (
        <>
          <TableFrame>
            <TableBody>
              {requests.map((request) => (
                <LeaveRow
                  key={request.id}
                  request={request}
                  query={query}
                  onEdit={() => onEdit(request)}
                  onApprove={() => onApprove(request)}
                  onDecline={() => onDecline(request)}
                  onCancel={() => onCancel(request)}
                  onDelete={() => onDelete(request)}
                />
              ))}
            </TableBody>
          </TableFrame>

          <NumberedPagination
            page={pageInfo}
            pageSize={pageSize}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            itemLabel="leave request"
            navLabel="Leave request pages"
          />
        </>
      )}
    </div>
  );
}

/**
 * The table and its real header, shared by the rows and their skeleton so the
 * columns can't shift as a page lands. No checkbox column: sole-webapp's rows
 * were selectable but nothing acted on the selection.
 */
function TableFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
      <Table className="min-w-[900px]">
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Leave type</TableHead>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[60px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        {children}
      </Table>
    </div>
  );
}

function LeaveRow({
  request,
  query,
  onEdit,
  onApprove,
  onDecline,
  onCancel,
  onDelete,
}: {
  request: LeaveRequest;
  query: string;
  onEdit: () => void;
  onApprove: () => void;
  onDecline: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const partDay = !isFullDayTimes(request.startTime, request.endTime);
  const blocker = (action: Parameters<typeof leaveActionBlocker>[0]) =>
    leaveActionBlocker(action, request.status) ?? undefined;

  return (
    <TableRow>
      <TableCell className="max-w-[280px]">
        <p className="font-medium">
          <Highlight text={request.employeeName} query={query} />
        </p>
        {request.comments && (
          <p
            className="truncate text-xs text-muted-foreground"
            title={request.comments}
          >
            <Highlight text={request.comments} query={query} />
          </p>
        )}
        {request.status === "DECLINED" && request.reviewNote && (
          <p
            className="truncate text-xs text-muted-foreground"
            title={request.reviewNote}
          >
            Reason: {request.reviewNote}
          </p>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {leaveTypeLabel(request.leaveType)}
      </TableCell>
      <TableCell className="whitespace-nowrap tabular">
        {payrollDate(leaveDateFromApi(request.startDate))}
        {partDay && request.startTime && (
          <span className="block text-xs text-muted-foreground">
            from {request.startTime}
          </span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap tabular">
        {payrollDate(leaveDateFromApi(request.endDate))}
        {partDay && request.endTime && (
          <span className="block text-xs text-muted-foreground">
            until {request.endTime}
          </span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground tabular">
        {leaveDurationLabel(leaveRowDuration(request))}
      </TableCell>
      <TableCell>
        <Badge variant={leaveStatusVariant(request.status)}>
          {leaveStatusLabel(request.status)}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Actions for ${request.employeeName}'s ${leaveTypeLabel(request.leaveType).toLowerCase()}`}
              >
                <MoreHorizontal className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <MenuAction
                icon={<Pencil />}
                label="Edit request"
                onSelect={onEdit}
                disabledReason={blocker("edit")}
              />
              <MenuAction
                icon={<Check />}
                label="Approve"
                onSelect={onApprove}
                disabledReason={blocker("approve")}
              />
              <MenuAction
                icon={<X />}
                label="Decline"
                onSelect={onDecline}
                disabledReason={blocker("decline")}
              />
              <MenuAction
                icon={<Ban />}
                label="Cancel leave"
                onSelect={onCancel}
                disabledReason={blocker("cancel")}
              />
              <DropdownMenuSeparator />
              <MenuAction
                icon={<Trash2 />}
                label="Delete"
                onSelect={onDelete}
                disabledReason={blocker("delete")}
                destructive
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}
