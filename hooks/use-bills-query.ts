"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approveBillApi,
  createBillApi,
  deleteBillsApi,
  fetchBillCalendar,
  fetchBillDetail,
  fetchBillSchedule,
  fetchBillSummary,
  fetchBillsPage,
  fetchUpcomingBills,
  skipBillScheduleApi,
  stopBillScheduleApi,
  unapproveBillApi,
  unskipBillScheduleApi,
  updateBillApi,
  updateBillScheduleApi,
  type BillDraft,
  type BillListFilters,
  type BillScheduleDraft,
} from "@/lib/bills";
import { useInvalidateExpenses } from "@/hooks/use-expenses-query";

export function useBillsListQuery(
  page: number,
  pageSize: number,
  filters: BillListFilters,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["bills-page", page, pageSize, filters],
    queryFn: () => fetchBillsPage(page, pageSize, filters),
    enabled: options.enabled ?? true,
  });
}

export function useBillSummaryQuery() {
  return useQuery({
    queryKey: ["bill-summary"],
    queryFn: fetchBillSummary,
  });
}

export function useUpcomingBillsQuery(days: number, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["bills-upcoming", days],
    queryFn: () => fetchUpcomingBills(days),
    enabled: options.enabled ?? true,
  });
}

/** One calendar month's bills; the previous month stays on screen while the next loads. */
export function useBillCalendarQuery(from: string, to: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["bills-calendar", from, to],
    queryFn: () => fetchBillCalendar(from, to),
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

export function useBillQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["bill", id],
    queryFn: () => fetchBillDetail(id as string),
    enabled: !!id,
  });
}

export function useBillScheduleQuery(id: string | null | undefined) {
  return useQuery({
    queryKey: ["bill-schedule", id],
    queryFn: () => fetchBillSchedule(id as string),
    enabled: !!id,
  });
}

/**
 * Every bills read at once — a change to one bill moves the list, the hero, the
 * upcoming and calendar views and any open schedule. Converting and undoing
 * also add or remove an expense, so those refresh the expenses as well.
 */
export function useInvalidateBills() {
  const queryClient = useQueryClient();
  const invalidateExpenses = useInvalidateExpenses();
  return (options: { expenses?: boolean } = {}) => {
    for (const key of ["bills-page", "bill-summary", "bills-upcoming", "bills-calendar", "bill", "bill-schedule"]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
    if (options.expenses) invalidateExpenses();
  };
}

export function useCreateBillMutation() {
  const invalidate = useInvalidateBills();
  return useMutation({
    mutationFn: ({ draft, files }: { draft: BillDraft; files?: File[] }) => createBillApi(draft, files),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateBillMutation() {
  const invalidate = useInvalidateBills();
  return useMutation({
    mutationFn: ({ id, draft, startsRepeat }: { id: string; draft: BillDraft; startsRepeat?: boolean }) =>
      updateBillApi(id, draft, startsRepeat),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteBillsMutation() {
  const invalidate = useInvalidateBills();
  return useMutation({
    mutationFn: ({ ids, stopSchedule }: { ids: string[]; stopSchedule?: boolean }) => deleteBillsApi(ids, { stopSchedule }),
    onSuccess: () => invalidate(),
  });
}

export function useApproveBillMutation() {
  const invalidate = useInvalidateBills();
  return useMutation({
    mutationFn: (id: string) => approveBillApi(id),
    onSuccess: () => invalidate({ expenses: true }),
  });
}

export function useUnapproveBillMutation() {
  const invalidate = useInvalidateBills();
  return useMutation({
    mutationFn: (id: string) => unapproveBillApi(id),
    onSuccess: () => invalidate({ expenses: true }),
  });
}

export function useUpdateBillScheduleMutation() {
  const invalidate = useInvalidateBills();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: BillScheduleDraft }) => updateBillScheduleApi(id, draft),
    onSuccess: () => invalidate(),
  });
}

export function useSkipBillScheduleMutation() {
  const invalidate = useInvalidateBills();
  return useMutation({
    mutationFn: ({ id, billDate }: { id: string; billDate?: string }) => skipBillScheduleApi(id, billDate),
    onSuccess: () => invalidate(),
  });
}

export function useUnskipBillScheduleMutation() {
  const invalidate = useInvalidateBills();
  return useMutation({
    mutationFn: ({ id, billDate }: { id: string; billDate: string }) => unskipBillScheduleApi(id, billDate),
    onSuccess: () => invalidate(),
  });
}

export function useStopBillScheduleMutation() {
  const invalidate = useInvalidateBills();
  return useMutation({
    mutationFn: (id: string) => stopBillScheduleApi(id),
    onSuccess: () => invalidate(),
  });
}
