"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { stopTimerApi, type ActiveTimer } from "@/lib/project-timer";
import {
  createManualLogApi,
  deleteLogApi,
  deleteTaskApi,
  fetchClientTasks,
  fetchTaskProjectsAndJobs,
  fetchTimeBreakdown,
  fetchTimeStats,
  fetchTimeTasksPage,
  fetchWeeklyRows,
  markLogsInvoicedApi,
  saveWeeklyLogsApi,
  startTimerApi,
  trackTimerEntryLogged,
  updateActiveTimerApi,
  updateLogApi,
  updateTaskApi,
  weekParams,
  type BreakdownGroup,
  type ManualLogDraft,
  type StatsRange,
  type TimerSelection,
  type WeeklyRow,
} from "@/lib/time-tracker";

/** Everything on the Time Tracker screen lives under this key. */
export const TIME_TRACKER_KEY = ["time-tracker"] as const;
const ACTIVE_TIMER_KEY = ["active-timer"] as const;

export function useTimeTasksQuery(page: number, pageSize: number) {
  return useQuery({
    queryKey: [...TIME_TRACKER_KEY, "tasks", page, pageSize],
    queryFn: () => fetchTimeTasksPage(page, pageSize),
    placeholderData: keepPreviousData,
  });
}

export function useTimeStatsQuery(range: StatsRange) {
  return useQuery({
    queryKey: [...TIME_TRACKER_KEY, "stats", range],
    queryFn: () => fetchTimeStats(range),
    placeholderData: keepPreviousData,
  });
}

export function useTimeBreakdownQuery(range: StatsRange, groupBy: BreakdownGroup) {
  return useQuery({
    queryKey: [...TIME_TRACKER_KEY, "breakdown", range, groupBy],
    queryFn: () => fetchTimeBreakdown(range, groupBy),
    placeholderData: keepPreviousData,
  });
}

export function useWeeklyRowsQuery(sunday: Date) {
  const { year, week } = weekParams(sunday);
  return useQuery({
    queryKey: [...TIME_TRACKER_KEY, "weekly", year, week],
    queryFn: () => fetchWeeklyRows(sunday),
    // The grid is seeded from this once per week; a background refetch
    // mustn't wipe what's being typed.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

export function useClientTasksQuery(clientId: string | null | undefined) {
  return useQuery({
    queryKey: [...TIME_TRACKER_KEY, "client-tasks", clientId],
    queryFn: () => fetchClientTasks(clientId as string),
    enabled: !!clientId,
  });
}

export function useTaskProjectsQuery(clientId: string | null | undefined, taskId: string) {
  return useQuery({
    queryKey: [...TIME_TRACKER_KEY, "task-projects", clientId, taskId],
    queryFn: () => fetchTaskProjectsAndJobs(clientId as string, taskId),
    enabled: !!clientId && !!taskId,
  });
}

/**
 * Any change to time moves the list, both summaries and — since tasks and
 * logs are shared with Projects — that module's figures too.
 */
export function useInvalidateTime() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: TIME_TRACKER_KEY }),
      queryClient.invalidateQueries({ queryKey: ["project-tasks"] }),
      queryClient.invalidateQueries({ queryKey: ["project-jobs"] }),
      queryClient.invalidateQueries({ queryKey: ["project-stats"] }),
    ]);
}

export function useStartTimerMutation() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: ({ description, selection }: { description: string; selection: TimerSelection }) =>
      startTimerApi(description, selection),
    onSuccess: async () => {
      // `/start` answers with the bare log; `/active` carries the task and
      // client details the bar prefills from.
      await queryClient.invalidateQueries({ queryKey: ACTIVE_TIMER_KEY });
      return invalidate();
    },
  });
}

/** Writes the description and details onto the running timer, without stopping it. */
export function useUpdateActiveTimerMutation() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: ({ description, selection }: { description: string; selection: TimerSelection }) =>
      updateActiveTimerApi(description, selection),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ACTIVE_TIMER_KEY });
      return invalidate();
    },
  });
}

/**
 * Save-and-stop. The stop route ignores its body, so the details are written
 * with `PUT /active` first — the old top bar's `handleUpdateTimerAndStop`.
 */
export function useSaveAndStopTimerMutation() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: async ({
      timer,
      description,
      selection,
      seconds,
    }: {
      timer: ActiveTimer;
      description: string;
      selection: TimerSelection;
      /** On the clock when saved, for analytics. */
      seconds: number;
    }) => {
      await updateActiveTimerApi(description, selection);
      const stopped = await stopTimerApi({
        ...timer,
        clientId: selection.client?.clientId ?? timer.clientId,
        contactId: selection.client?.contactId ?? timer.contactId,
      });
      trackTimerEntryLogged(seconds);
      return stopped;
    },
    onSuccess: () => {
      queryClient.setQueryData(ACTIVE_TIMER_KEY, null);
      return invalidate();
    },
  });
}

/**
 * Discard: there's no route for it, so the timer is stopped and the session
 * it just wrote is deleted. The auto-created task stays, as it would after
 * deleting any one log.
 */
export function useDiscardTimerMutation() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: async (timer: ActiveTimer) => {
      await stopTimerApi(timer);
      await deleteLogApi(timer.id);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ACTIVE_TIMER_KEY });
      return invalidate();
    },
  });
}

export function useCreateManualLogMutation() {
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: (draft: ManualLogDraft) => createManualLogApi(draft),
    onSuccess: invalidate,
  });
}

export function useUpdateTaskMutation() {
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: ({ taskId, payload }: { taskId: string; payload: Record<string, unknown> }) =>
      updateTaskApi(taskId, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteTaskMutation() {
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: (taskId: string) => deleteTaskApi(taskId),
    onSuccess: invalidate,
  });
}

export function useUpdateLogMutation() {
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      updateLogApi(id, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteLogMutation() {
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: (id: string) => deleteLogApi(id),
    onSuccess: invalidate,
  });
}

export function useMarkLogsInvoicedMutation() {
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: ({ logIds, invoice }: { logIds: string[]; invoice: { id: string; number: string } }) =>
      markLogsInvoicedApi(logIds, invoice),
    // Refetch either way: a partial failure may still have linked some.
    onSettled: invalidate,
  });
}

export function useSaveWeeklyLogsMutation() {
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: ({ rows, sunday }: { rows: WeeklyRow[]; sunday: Date }) => saveWeeklyLogsApi(rows, sunday),
    onSuccess: invalidate,
  });
}
