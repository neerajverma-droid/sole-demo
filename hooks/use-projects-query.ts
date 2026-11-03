"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createProjectApi,
  deleteProjectApi,
  fetchProject,
  fetchProjectSettings,
  fetchProjectsPage,
  saveProjectSettingsApi,
  updateProjectApi,
  type ProjectListFilters,
  type ProjectSettings,
} from "@/lib/projects";

/**
 * One page of projects for the tab and search on screen. The previous page
 * stays up while the next loads, so switching tabs never drops the table back
 * to a first-load shimmer — same as the KM trips and property lists.
 */
export function useProjectsQuery(filters: ProjectListFilters, page: number, pageSize: number) {
  return useQuery({
    queryKey: ["projects", filters.status, filters.search.trim(), page, pageSize],
    queryFn: () => fetchProjectsPage(filters, page, pageSize),
    placeholderData: keepPreviousData,
  });
}

export function useProjectQuery(id: string | null | undefined) {
  return useQuery({
    queryKey: ["project", id],
    queryFn: () => fetchProject(id as string),
    enabled: !!id,
  });
}

export function useProjectSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: ["project-settings"],
    queryFn: fetchProjectSettings,
    enabled,
  });
}

/**
 * A project write moves the list, its tab counts and the open detail page —
 * and the project pickers other modules (calendar, KM tracker) fill from it.
 */
export function useInvalidateProjects() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({ queryKey: ["project"] }),
      queryClient.invalidateQueries({ queryKey: ["project-stats"] }),
    ]);
}

export function useCreateProjectMutation() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => createProjectApi(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateProjectMutation() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      updateProjectApi(id, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteProjectMutation() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (id: string) => deleteProjectApi(id),
    onSuccess: invalidate,
  });
}

export function useSaveProjectSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: ProjectSettings) => saveProjectSettingsApi(settings),
    onSuccess: (saved) => queryClient.setQueryData(["project-settings"], saved),
  });
}
