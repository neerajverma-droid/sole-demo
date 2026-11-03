"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchActiveTimer,
  startTaskTimerApi,
  stopTimerApi,
  updateAndStopTimerApi,
  type ActiveTimer,
  type TimerDetails,
} from "@/lib/project-timer";

const ACTIVE_TIMER_KEY = ["active-timer"] as const;

/** The user's running timer, or null — shared by the list header and task rows. */
export function useActiveTimerQuery() {
  return useQuery({
    queryKey: ACTIVE_TIMER_KEY,
    queryFn: fetchActiveTimer,
  });
}

/**
 * Stopping or starting the clock moves the task's tracked time and amount,
 * so the jobs, tasks and overview figures are refetched with it.
 */
function useInvalidateTimed() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["project-tasks"] }),
      queryClient.invalidateQueries({ queryKey: ["project-jobs"] }),
      queryClient.invalidateQueries({ queryKey: ["project-stats"] }),
      // The Time Tracker's list and summaries show the same logs.
      queryClient.invalidateQueries({ queryKey: ["time-tracker"] }),
    ]);
}

export function useStartTaskTimerMutation() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTimed();
  return useMutation({
    mutationFn: startTaskTimerApi,
    onSuccess: (timer) => {
      queryClient.setQueryData(ACTIVE_TIMER_KEY, timer);
      return invalidate();
    },
  });
}

export function useStopTimerMutation() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTimed();
  return useMutation({
    mutationFn: (timer: ActiveTimer) => stopTimerApi(timer),
    onSuccess: () => {
      queryClient.setQueryData(ACTIVE_TIMER_KEY, null);
      return invalidate();
    },
  });
}

/** Fill in the timer's client (and project, billable, rate), then stop it. */
export function useUpdateAndStopTimerMutation() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTimed();
  return useMutation({
    mutationFn: ({ timer, details }: { timer: ActiveTimer; details: TimerDetails }) =>
      updateAndStopTimerApi(timer, details),
    onSuccess: () => {
      queryClient.setQueryData(ACTIVE_TIMER_KEY, null);
      return invalidate();
    },
  });
}

/**
 * Seconds on the running clock, ticking once a second from what the server
 * reported. Zero when nothing is running.
 */
export function useTimerSeconds(timer: ActiveTimer | null | undefined): number {
  const [now, setNow] = React.useState(() => Date.now());
  const [anchor, setAnchor] = React.useState(() => Date.now());
  const timerKey = timer ? `${timer.id}:${timer.elapsedSeconds}` : null;

  // Restart the count from the server's figure whenever a new reading lands.
  React.useEffect(() => {
    const at = Date.now();
    setAnchor(at);
    setNow(at);
  }, [timerKey]);

  React.useEffect(() => {
    if (!timer || timer.isPaused) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timer]);

  if (!timer) return 0;
  if (timer.isPaused) return timer.elapsedSeconds;
  return timer.elapsedSeconds + Math.max(0, Math.floor((now - anchor) / 1000));
}
