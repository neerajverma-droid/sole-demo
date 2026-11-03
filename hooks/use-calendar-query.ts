"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchCalendarContacts,
  fetchCalendarEventDetail,
  fetchCalendarEvents,
  fetchClientProjects,
  fetchLinkedCalendars,
  fetchProjectJobs,
  fetchSelectableStages,
  searchCalendarEvents,
} from "@/lib/calendar-api";
import {
  getCalendarRange,
  type CalendarFilters,
  type CalendarView,
  type RawCalendarEvent,
} from "@/lib/calendar";

/** Picks up changes made elsewhere — a Google event deleted, synced by webhook. */
const POLL_INTERVAL_MS = 30_000;
/** A tab hidden for less than this doesn't refetch on return — quick alt-tabs are noise. */
const MIN_HIDDEN_MS = 60_000;

export function calendarEventsKey(
  date: Date,
  view: CalendarView,
  filters: CalendarFilters,
  search: string,
) {
  const { start_at, end_at } = getCalendarRange(date, view);
  return ["calendar", "events", start_at, end_at, filters, search] as const;
}

/**
 * The events for the visible range. Every range change fetches afresh (and
 * shows the skeleton, as the old calendar did); polls and tab returns
 * refresh in the background without it.
 */
export function useCalendarEventsQuery(
  date: Date,
  view: CalendarView,
  filters: CalendarFilters,
  search: string,
) {
  const query = useQuery({
    queryKey: calendarEventsKey(date, view, filters, search),
    queryFn: () => fetchCalendarEvents(date, view, filters, search),
    staleTime: 0,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  const { refetch } = query;
  React.useEffect(() => {
    let hiddenAt: number | null = null;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (document.visibilityState === "visible") {
        if (hiddenAt !== null && Date.now() - hiddenAt >= MIN_HIDDEN_MS) {
          void refetch();
        }
        hiddenAt = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [refetch]);

  return query;
}

/** Writes to whichever events range is cached — optimistic adds, moves and deletes. */
export function useCalendarEventsCache() {
  const queryClient = useQueryClient();
  return React.useCallback(
    (update: (rows: RawCalendarEvent[]) => RawCalendarEvent[]) => {
      queryClient.setQueriesData<RawCalendarEvent[]>(
        { queryKey: ["calendar", "events"] },
        (rows) => (rows ? update(rows) : rows),
      );
    },
    [queryClient],
  );
}

export function useInvalidateCalendarEvents() {
  const queryClient = useQueryClient();
  return React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["calendar", "events"] }),
    [queryClient],
  );
}

export function useLinkedCalendarsQuery() {
  return useQuery({
    queryKey: ["calendar", "linked"],
    queryFn: fetchLinkedCalendars,
    staleTime: 0,
  });
}

export function useCalendarSearchQuery(
  date: Date,
  view: CalendarView,
  filters: CalendarFilters,
  query: string,
  enabled: boolean,
) {
  const { start_at, end_at } = getCalendarRange(date, view);
  return useQuery({
    queryKey: ["calendar", "search", start_at, end_at, filters, query],
    queryFn: ({ signal }) => searchCalendarEvents(date, view, filters, query, signal),
    enabled: enabled && query.length > 0,
  });
}

export function useCalendarEventDetailQuery(
  id: string | number | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["calendar", "detail", id],
    queryFn: () => fetchCalendarEventDetail(id as string | number),
    enabled: enabled && id !== undefined && id !== null && id !== "",
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

export function usePlannerStagesQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["calendar", "stages"],
    queryFn: fetchSelectableStages,
    enabled,
  });
}

export function useCalendarContactsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["calendar", "contacts"],
    queryFn: fetchCalendarContacts,
    enabled,
  });
}

export function useClientProjectsQuery(clientId: string | number | null | undefined) {
  return useQuery({
    queryKey: ["calendar", "client-projects", clientId],
    queryFn: () => fetchClientProjects(clientId as string | number),
    enabled: Boolean(clientId),
  });
}

export function useProjectJobsQuery(projectId: string) {
  return useQuery({
    queryKey: ["calendar", "project-jobs", projectId],
    queryFn: () => fetchProjectJobs(projectId),
    enabled: Boolean(projectId),
  });
}
