"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  approveLeaveRequest,
  cancelLeaveRequest,
  createLeaveRequest,
  declineLeaveRequest,
  deleteLeaveRequest,
  fetchLeaveCounts,
  fetchLeaveEmployees,
  fetchLeaveRequest,
  fetchLeaveRequests,
  updateLeaveRequest,
  type LeaveCounts,
  type LeaveEmployeeOption,
  type LeaveListParams,
  type LeaveRequest,
  type LeaveRequestFormValues,
  type LeaveRequestsPage,
} from "@/lib/payroll-leave";

const LEAVE_KEY = ["payroll", "leave"] as const;

/**
 * One page of leave requests — `GET /leave-requests`.
 *
 * Keeps the previous page on screen while the next loads, so a filter change
 * shimmers the rows rather than collapsing the table back to the page loader.
 */
export function usePayrollLeaveRequestsQuery(params: LeaveListParams) {
  return useQuery<LeaveRequestsPage>({
    queryKey: [...LEAVE_KEY, "requests", params],
    queryFn: () => fetchLeaveRequests(params),
    placeholderData: keepPreviousData,
  });
}

/** The tab and card counts — `GET /leave-requests/counts`. */
export function usePayrollLeaveCountsQuery() {
  return useQuery<LeaveCounts>({
    queryKey: [...LEAVE_KEY, "counts"],
    queryFn: fetchLeaveCounts,
  });
}

/** One request, for the edit drawer — `GET /leave-requests/{id}`. */
export function usePayrollLeaveRequestQuery(id: string | null) {
  return useQuery<LeaveRequest>({
    queryKey: [...LEAVE_KEY, "request", id],
    queryFn: () => fetchLeaveRequest(id ?? ""),
    enabled: !!id,
    // A request that isn't there won't be there on a second try either.
    retry: false,
  });
}

/**
 * Who a request can be for — `GET /employees?limit=100`, as sole-webapp's
 * drawer asks. Only fetched while the drawer is open.
 */
export function usePayrollLeaveEmployeesQuery(enabled: boolean) {
  return useQuery<LeaveEmployeeOption[]>({
    queryKey: [...LEAVE_KEY, "employee-options"],
    queryFn: fetchLeaveEmployees,
    enabled,
  });
}

/**
 * Every write refreshes the whole leave area: a status change moves a row
 * between tabs and changes two counts at once, so there's no narrower key that
 * would be right.
 */
function useLeaveMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LEAVE_KEY }),
  });
}

export function useCreateLeaveRequestMutation() {
  return useLeaveMutation((values: LeaveRequestFormValues) =>
    createLeaveRequest(values),
  );
}

export function useUpdateLeaveRequestMutation() {
  return useLeaveMutation(
    ({ id, values }: { id: string; values: LeaveRequestFormValues }) =>
      updateLeaveRequest(id, values),
  );
}

export function useApproveLeaveRequestMutation() {
  return useLeaveMutation((id: string) => approveLeaveRequest(id));
}

export function useDeclineLeaveRequestMutation() {
  return useLeaveMutation(({ id, reason }: { id: string; reason: string }) =>
    declineLeaveRequest(id, reason),
  );
}

export function useCancelLeaveRequestMutation() {
  return useLeaveMutation((id: string) => cancelLeaveRequest(id));
}

export function useDeleteLeaveRequestMutation() {
  return useLeaveMutation((id: string) => deleteLeaveRequest(id));
}
