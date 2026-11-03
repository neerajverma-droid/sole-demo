"use client";

import * as React from "react";
import {
  Ban,
  CalendarDays,
  CircleCheck,
  CircleX,
  Clock,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { Shimmer } from "@/components/ui/shimmer";
import { StatCards, type StatCard } from "@/components/ui/stat-cards";
import { PayrollSeatsNotice } from "@/components/payroll/payroll-banners";
import { DeclineLeaveDialog } from "@/components/payroll/leave/decline-leave-dialog";
import {
  LeaveConfirmDialog,
  type LeaveConfirm,
} from "@/components/payroll/leave/leave-confirm-dialog";
import { LeaveRequestDrawer } from "@/components/payroll/leave/leave-request-drawer";
import { LeaveTable } from "@/components/payroll/leave/leave-table";
import {
  useApproveLeaveRequestMutation,
  usePayrollLeaveCountsQuery,
  usePayrollLeaveRequestsQuery,
} from "@/hooks/use-payroll-leave-query";
import { usePayrollSeatsQuery } from "@/hooks/use-payroll-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { apiErrorMessage } from "@/lib/api-error";
import { PAYROLL_EMPTY } from "@/lib/payroll";
import {
  leaveListParams,
  type LeaveCounts,
  type LeaveRequest,
  type LeaveStatusFilter,
  type LeaveTypeFilter,
} from "@/lib/payroll-leave";
import type { PageInfo } from "@/lib/products";

/** sole-webapp's page size, and one of the shared pager's options. */
const DEFAULT_PAGE_SIZE = 10;

/** sole-webapp waited 350ms after typing — kept, it's a touch snappier than 400. */
const SEARCH_DEBOUNCE_MS = 350;

export function LeaveScreen() {
  const [status, setStatus] = React.useState<LeaveStatusFilter>("all");
  const [leaveType, setLeaveType] = React.useState<LeaveTypeFilter>("all");
  const [query, setQuery] = React.useState("");
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);

  const [drawer, setDrawer] = React.useState<{
    open: boolean;
    editId: string | null;
  }>({ open: false, editId: null });
  const [declining, setDeclining] = React.useState<LeaveRequest | null>(null);
  const [confirming, setConfirming] = React.useState<LeaveConfirm | null>(null);

  // Back to page one whenever the filters change shape — an old page number
  // surviving a narrower filter would risk landing past its last page.
  const filterKey = `${status}|${leaveType}|${debouncedQuery.trim()}`;
  const previousFilterKey = React.useRef(filterKey);
  React.useEffect(() => {
    if (previousFilterKey.current === filterKey) return;
    previousFilterKey.current = filterKey;
    setPage(1);
  }, [filterKey]);

  const requestsQuery = usePayrollLeaveRequestsQuery(
    leaveListParams({
      page,
      limit: pageSize,
      status,
      leaveType,
      search: debouncedQuery,
    }),
  );
  const countsQuery = usePayrollLeaveCountsQuery();
  // Status only — sole-webapp never gated leave on the subscription, and
  // neither does this; the notice just says when payroll is off or paused.
  const seatsQuery = usePayrollSeatsQuery();
  const approve = useApproveLeaveRequestMutation();
  const counts = countsQuery.data;

  const requests = requestsQuery.data?.requests ?? [];
  const total = requestsQuery.data?.total ?? 0;
  const pageCount = Math.max(1, requestsQuery.data?.totalPages ?? 1);
  const currentPage = Math.min(page, pageCount);
  const pageInfo: PageInfo = {
    page: currentPage,
    pageCount,
    total,
    from: total === 0 ? 0 : (currentPage - 1) * pageSize + 1,
    to: Math.min(currentPage * pageSize, total),
  };

  const filtered =
    status !== "all" || leaveType !== "all" || !!debouncedQuery.trim();

  /*
   * Covers both halves of applying a filter: the debounce, then the request
   * for the page it asks for. Not `isFetching`, which is also true of a
   * background refresh of the page already on screen.
   */
  const rowsLoading =
    query !== debouncedQuery || requestsQuery.isPlaceholderData;

  /*
   * Nothing on file at all — loaded, unnarrowed (the "All" tab included) and
   * empty, never a failed fetch. Cards and tabs counting zeros have nothing
   * to say then, so only the header and "No leave requests yet" remain. The
   * header keeps its button: it's how the first request gets made.
   */
  const trulyEmpty =
    requestsQuery.isSuccess && !rowsLoading && !filtered && total === 0;

  const openNew = () => setDrawer({ open: true, editId: null });

  const header = (
    <>
      <PageHeader
        icon={CalendarDays}
        title="Leave"
        description="Review, approve and track your team's leave requests."
      >
        <Button onClick={openNew} data-usertour="payroll-leave-new-button">
          <Plus />
          New leave request
        </Button>
      </PageHeader>
      {seatsQuery.data && <PayrollSeatsNotice seats={seatsQuery.data} />}
    </>
  );

  if (requestsQuery.isLoading) {
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

      {!trulyEmpty && (
        <div data-usertour="payroll-leave-stats">
          <StatCards
            stats={leaveCards(counts, countsQuery.isError)}
            loading={countsQuery.isPending && !countsQuery.isError}
          />
        </div>
      )}

      <LeaveTable
        requests={requests}
        counts={counts}
        countsFailed={countsQuery.isError}
        loading={rowsLoading}
        failed={requestsQuery.isError}
        onRetry={() => void requestsQuery.refetch()}
        filtered={filtered}
        empty={trulyEmpty}
        status={status}
        onStatusChange={setStatus}
        leaveType={leaveType}
        onLeaveTypeChange={setLeaveType}
        query={query}
        onQueryChange={setQuery}
        onClearFilters={() => {
          setStatus("all");
          setLeaveType("all");
          setQuery("");
        }}
        pageInfo={pageInfo}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next);
          // Row 30 is on a different page at 10 a page than at 50, so the
          // honest thing after a resize is the top of the list.
          setPage(1);
        }}
        onNew={openNew}
        onEdit={(request) => setDrawer({ open: true, editId: request.id })}
        onApprove={(request) =>
          // No confirm step, as in sole-webapp: approving is the expected
          // answer to a pending request, and cancelling undoes it.
          approve.mutate(request.id, {
            onSuccess: () => toast.success("Leave request approved."),
            onError: (error) =>
              toast.error(
                apiErrorMessage(error, "Failed to approve leave request."),
              ),
          })
        }
        onDecline={setDeclining}
        onCancel={(request) => setConfirming({ kind: "cancel", request })}
        onDelete={(request) => setConfirming({ kind: "delete", request })}
      />

      <LeaveRequestDrawer
        open={drawer.open}
        editId={drawer.editId}
        onOpenChange={(open) =>
          setDrawer((current) => ({
            open,
            editId: open ? current.editId : null,
          }))
        }
      />
      <DeclineLeaveDialog
        request={declining}
        onOpenChange={(open) => !open && setDeclining(null)}
      />
      <LeaveConfirmDialog
        confirm={confirming}
        onOpenChange={(open) => !open && setConfirming(null)}
      />
    </div>
  );
}

/**
 * The five figures sole-webapp showed as KPI buttons. The status tabs under
 * them do the filtering now, so these only report.
 */
function leaveCards(
  counts: LeaveCounts | undefined,
  failed: boolean,
): StatCard[] {
  // A failed count is unknown, not zero.
  const value = (count: number | undefined) =>
    failed || count === undefined ? PAYROLL_EMPTY : count.toLocaleString("en-AU");

  return [
    {
      key: "all",
      label: "All requests",
      value: value(counts?.all),
      meta: "Every request on file",
      icon: CalendarDays,
    },
    {
      key: "pending",
      tone: "warning",
      label: "Pending",
      value: value(counts?.pending),
      meta: "Waiting for a decision",
      icon: Clock,
    },
    {
      key: "approved",
      tone: "success",
      label: "Approved",
      value: value(counts?.approved),
      meta: "Booked in",
      icon: CircleCheck,
    },
    {
      key: "declined",
      tone: "danger",
      label: "Declined",
      value: value(counts?.declined),
      meta: "Turned down",
      icon: CircleX,
    },
    {
      key: "cancelled",
      tone: "accent",
      label: "Cancelled",
      value: value(counts?.cancelled),
      meta: "Called off",
      icon: Ban,
    },
  ];
}
