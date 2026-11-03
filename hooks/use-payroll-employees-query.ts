"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  bulkUploadEmployeesApi,
  createEmployeeApi,
  deleteEmployeeApi,
  deleteEmployeeDocumentApi,
  fetchEmployeeDetail,
  fetchEmployeeDocuments,
  fetchEmployeeStats,
  fetchEmployeesPage,
  sendCredentialsEmailApi,
  updateEmployeeApi,
  uploadEmployeeDocumentsApi,
  type CreateEmployeeValues,
  type EmployeeDetail,
  type EmployeeDocument,
  type EmployeeListParams,
  type EmployeePage,
  type EmployeeProfile,
  type EmployeeStats,
} from "@/lib/payroll-employees";

/**
 * One page of `GET /employees`. The previous page stays on screen while the
 * next is in flight — `isPlaceholderData` is what tells the table a fresh page
 * is still coming.
 */
export function usePayrollEmployeesQuery(
  params: EmployeeListParams,
  options: { enabled?: boolean } = {},
) {
  return useQuery<EmployeePage>({
    queryKey: ["payroll", "employees", "list", params],
    queryFn: () => fetchEmployeesPage(params),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

/** The four figures above the list. */
export function usePayrollEmployeeStatsQuery() {
  return useQuery<EmployeeStats>({
    queryKey: ["payroll", "employees", "stats"],
    queryFn: fetchEmployeeStats,
  });
}

/**
 * Synced employees with a Microkeeper username — the only ones a new employee
 * can clone settings from. Only fetched while the create drawer is open.
 */
export function usePayrollCloneSourcesQuery(enabled: boolean) {
  return usePayrollEmployeesQuery(
    {
      page: 1,
      limit: 100,
      search: "",
      employmentType: "all",
      status: "SYNCED",
    },
    { enabled },
  );
}

function isClientError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  return typeof status === "number" && status >= 400 && status < 500;
}

/** `GET /employees/{id}`, for the profile drawer. */
export function usePayrollEmployeeQuery(id: string | null) {
  return useQuery<EmployeeDetail>({
    queryKey: ["payroll", "employees", "detail", id],
    queryFn: () => fetchEmployeeDetail(id as string),
    enabled: !!id,
    // A stale `?edit=` link is a 404 — retrying it only delays the
    // "Couldn't load" state. Network blips and 5xx still get retried.
    retry: (count, error) => !isClientError(error) && count < 2,
  });
}

/** `GET /employees/{id}/documents`. */
export function usePayrollEmployeeDocumentsQuery(id: string | null) {
  return useQuery<EmployeeDocument[]>({
    queryKey: ["payroll", "employees", "documents", id],
    queryFn: () => fetchEmployeeDocuments(id as string),
    enabled: !!id,
    retry: (count, error) => !isClientError(error) && count < 2,
  });
}

/**
 * Adding, removing or re-employing someone moves the seat count and the
 * Overview's figures as well as this list, so those writes refresh all of
 * payroll rather than just `["payroll", "employees"]`.
 */
function useInvalidatePayroll() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["payroll"] });
}

export function useCreateEmployeeMutation() {
  const invalidate = useInvalidatePayroll();
  return useMutation({
    mutationFn: (values: CreateEmployeeValues) => createEmployeeApi(values),
    onSuccess: invalidate,
  });
}

export function useUpdateEmployeeMutation() {
  const invalidate = useInvalidatePayroll();
  return useMutation({
    mutationFn: ({ id, profile }: { id: string; profile: EmployeeProfile }) =>
      updateEmployeeApi(id, profile),
    onSuccess: invalidate,
  });
}

export function useDeleteEmployeeMutation() {
  const invalidate = useInvalidatePayroll();
  return useMutation({
    mutationFn: (id: string) => deleteEmployeeApi(id),
    onSuccess: invalidate,
  });
}

export function useSendCredentialsEmailMutation() {
  return useMutation({
    mutationFn: (id: string) => sendCredentialsEmailApi(id),
  });
}

export function useBulkUploadEmployeesMutation() {
  const invalidate = useInvalidatePayroll();
  return useMutation({
    mutationFn: (file: File) => bulkUploadEmployeesApi(file),
    onSuccess: invalidate,
  });
}

/** Both document writes answer with (or imply) a new list for one employee. */
function documentsKey(id: string) {
  return ["payroll", "employees", "documents", id];
}

export function useUploadEmployeeDocumentsMutation(id: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (files: File[]) =>
      uploadEmployeeDocumentsApi(id as string, files),
    onSuccess: (documents) => {
      if (id) queryClient.setQueryData(documentsKey(id), documents);
    },
  });
}

export function useDeleteEmployeeDocumentMutation(id: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) =>
      deleteEmployeeDocumentApi(id as string, documentId),
    onSuccess: () =>
      id
        ? queryClient.invalidateQueries({ queryKey: documentsKey(id) })
        : undefined,
  });
}
