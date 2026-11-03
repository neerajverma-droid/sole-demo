"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchSelectableStages } from "@/lib/calendar-api";
import {
  createJobApi,
  createTaskApi,
  deleteJobApi,
  deleteTaskApi,
  deleteTimeEntryApi,
  fetchJobTimeEntries,
  fetchNpsSurveys,
  fetchProjectJobs,
  fetchProjectTasks,
  markEntriesInvoicedApi,
  updateJobApi,
  updateTaskApi,
  updateTimeEntryApi,
} from "@/lib/project-jobs";

export function useProjectJobsQuery(projectId: string) {
  return useQuery({
    queryKey: ["project-jobs", projectId],
    queryFn: () => fetchProjectJobs(projectId),
  });
}

export function useProjectTasksQuery(projectId: string) {
  return useQuery({
    queryKey: ["project-tasks", projectId],
    queryFn: () => fetchProjectTasks(projectId),
  });
}

/**
 * A job's time logs, loaded per job card as sole-webapp did. Keyed under the
 * project's jobs so the timer's start / stop invalidation (`["project-jobs"]`)
 * reloads them — the old card refetched whenever the running task changed.
 */
export function useJobTimeEntriesQuery(projectId: string, jobId: string) {
  return useQuery({
    queryKey: ["project-jobs", projectId, "time-entries", jobId],
    queryFn: () => fetchJobTimeEntries(projectId, jobId),
  });
}

/** Planner stages a task can sit in — the task form's Status picker. */
export function useTaskStagesQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["planner-stages", "selectable"],
    queryFn: fetchSelectableStages,
    enabled,
  });
}

export function useNpsSurveysQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["nps-surveys"],
    queryFn: fetchNpsSurveys,
    enabled,
    // The picker falls back to the default survey; a failure isn't worth retrying.
    retry: false,
  });
}

/**
 * Job and task writes move more than the tab: the project's used budget and
 * header, the job names on the list row, and the overview's figures.
 */
function useInvalidateProjectWork(projectId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["project-jobs", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["project"] }),
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({ queryKey: ["project-stats"] }),
    ]);
}

export function useSaveJobMutation(projectId: string) {
  const invalidate = useInvalidateProjectWork(projectId);
  return useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: Record<string, unknown> }) =>
      id ? updateJobApi(id, payload) : createJobApi(payload),
    onSuccess: invalidate,
  });
}

export function useDeleteJobMutation(projectId: string) {
  const invalidate = useInvalidateProjectWork(projectId);
  return useMutation({
    mutationFn: (id: string) => deleteJobApi(id),
    onSuccess: invalidate,
  });
}

export function useSaveTaskMutation(projectId: string) {
  const invalidate = useInvalidateProjectWork(projectId);
  return useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: Record<string, unknown> }) =>
      id ? updateTaskApi(id, payload) : createTaskApi(payload),
    onSuccess: invalidate,
  });
}

export function useDeleteTaskMutation(projectId: string) {
  const invalidate = useInvalidateProjectWork(projectId);
  return useMutation({
    mutationFn: (id: string) => deleteTaskApi(id),
    onSuccess: invalidate,
  });
}

export function useUpdateTimeEntryMutation(projectId: string) {
  const invalidate = useInvalidateProjectWork(projectId);
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      updateTimeEntryApi(id, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteTimeEntryMutation(projectId: string) {
  const invalidate = useInvalidateProjectWork(projectId);
  return useMutation({
    mutationFn: (id: string) => deleteTimeEntryApi(id),
    onSuccess: invalidate,
  });
}

export function useMarkEntriesInvoicedMutation(projectId: string) {
  const invalidate = useInvalidateProjectWork(projectId);
  return useMutation({
    mutationFn: ({ entryIds, invoice }: { entryIds: string[]; invoice: { id: string; number: string } }) =>
      markEntriesInvoicedApi(entryIds, invoice),
    onSuccess: invalidate,
  });
}
