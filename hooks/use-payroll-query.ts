"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addPayrollSeats,
  connectMicrokeeper,
  disconnectMicrokeeper,
  fetchPayrollOverview,
  fetchPayrollSeats,
  updateMicrokeeperKeys,
  verifyMicrokeeper,
  type MicrokeeperKeys,
  type PayrollOverview,
  type PayrollSeats,
} from "@/lib/payroll";

/**
 * The payroll seat subscription — status, limit, and how many are in use.
 *
 * Read by the Overview, the Employees screen (to gate "New employee"), the
 * Add Seats dialog and the plan picker in Settings, so it's one query key
 * everywhere and anything that changes seats only has to invalidate
 * `["payroll"]`.
 */
export function usePayrollSeatsQuery() {
  return useQuery<PayrollSeats>({
    queryKey: ["payroll", "seats"],
    queryFn: fetchPayrollSeats,
  });
}

/** The Overview's figures, connection and latest run in one call. */
export function usePayrollOverviewQuery() {
  return useQuery<PayrollOverview>({
    queryKey: ["payroll", "overview"],
    queryFn: fetchPayrollOverview,
  });
}

/** Everything payroll shows hangs off seats and the connection. */
function useInvalidatePayroll() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["payroll"] });
}

export function useAddPayrollSeatsMutation() {
  const invalidate = useInvalidatePayroll();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addPayrollSeats,
    onSuccess: async (seats) => {
      // The response is the new summary — show it now rather than waiting on
      // the refetch, so the limit a drawer was blocked on is already lifted.
      queryClient.setQueryData(["payroll", "seats"], seats);
      await invalidate();
      // The plan's own summary in Settings carries the seat count too.
      await queryClient.invalidateQueries({ queryKey: ["subscription"] });
    },
  });
}

export function useConnectMicrokeeperMutation() {
  const invalidate = useInvalidatePayroll();
  return useMutation({
    mutationFn: ({ keys, replace }: { keys: MicrokeeperKeys; replace: boolean }) =>
      replace ? updateMicrokeeperKeys(keys) : connectMicrokeeper(keys),
    onSuccess: invalidate,
  });
}

export function useVerifyMicrokeeperMutation() {
  const invalidate = useInvalidatePayroll();
  // Refetched either way: a failed verify is exactly when the connection's
  // status and last error have changed and need showing.
  return useMutation({ mutationFn: verifyMicrokeeper, onSettled: invalidate });
}

export function useDisconnectMicrokeeperMutation() {
  const invalidate = useInvalidatePayroll();
  return useMutation({
    mutationFn: disconnectMicrokeeper,
    onSuccess: invalidate,
  });
}
