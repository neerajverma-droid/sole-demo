"use client";

import * as React from "react";
import axios from "axios";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  completePayrun,
  createPayrun,
  deletePayrun,
  duplicatePayrun,
  emailPayslips,
  fetchPayrunCompare,
  fetchPayrunDetail,
  fetchPayrunEmployees,
  fetchPayrunIssues,
  fetchPayrunLastCycle,
  fetchPayrunStatusCounts,
  fetchPayruns,
  fetchProfileCompleteness,
  type CreatePayrunPayload,
  type PayrunCompare,
  type PayrunDetail,
  type PayrunEmployee,
  type PayrunIssue,
  type PayrunLastCycle,
  type PayrunListParams,
  type PayrunPage,
  type PayrunRef,
  type PayrunStatusCounts,
  type ProfileCompleteness,
} from "@/lib/payroll-payruns";

/** `GET /payruns` — one page, with the filters as the API takes them. */
export function usePayrunsQuery(params: PayrunListParams) {
  return useQuery<PayrunPage>({
    queryKey: ["payroll", "payruns", "list", params],
    queryFn: () => fetchPayruns(params),
    placeholderData: keepPreviousData,
  });
}

/** `GET /payruns/status-counts` — the tab counts, across every run. */
export function usePayrunStatusCountsQuery() {
  return useQuery<PayrunStatusCounts>({
    queryKey: ["payroll", "payruns", "status-counts"],
    queryFn: fetchPayrunStatusCounts,
  });
}

/**
 * A 4xx (a run that doesn't exist, or isn't this business's) won't come right
 * on a retry — only a network or server failure is worth asking again.
 */
function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status && status >= 400 && status < 500) return false;
  return failureCount < 2;
}

/** `GET /payruns/{mkRunId}/detail?year=`. */
export function usePayrunDetailQuery(runId: string | null, year: string | null) {
  return useQuery<PayrunDetail>({
    queryKey: ["payroll", "payruns", "detail", runId, year],
    queryFn: () => fetchPayrunDetail({ mkRunId: runId ?? "", mkYear: year ?? "" }),
    enabled: !!runId && !!year,
    retry: retryUnlessClientError,
  });
}

/**
 * `GET /payruns/{mkRunId}/issues?year=`. A failure reads as "no issues", as
 * it did in sole-webapp — the payslips are still worth showing without them.
 */
export function usePayrunIssuesQuery(runId: string | null, year: string | null) {
  return useQuery<PayrunIssue[]>({
    queryKey: ["payroll", "payruns", "issues", runId, year],
    queryFn: () =>
      fetchPayrunIssues({ mkRunId: runId ?? "", mkYear: year ?? "" }).catch(
        () => [] as PayrunIssue[],
      ),
    enabled: !!runId && !!year,
  });
}

/** `GET /payruns/compare?runIds=&year=`. */
export function usePayrunCompareQuery(
  params: { runIds: string; year?: string },
  enabled: boolean,
) {
  return useQuery<PayrunCompare>({
    queryKey: ["payroll", "payruns", "compare", params],
    queryFn: () => fetchPayrunCompare(params),
    enabled,
    retry: false,
  });
}

/** `GET /employees?page=1&limit=100&status=SYNCED`, kept to those with a Microkeeper username. */
export function usePayrunEmployeesQuery() {
  return useQuery<PayrunEmployee[]>({
    queryKey: ["payroll", "payruns", "employees", { page: 1, limit: 100, status: "SYNCED" }],
    queryFn: fetchPayrunEmployees,
  });
}

/** `GET /payruns/last-cycle` — a suggestion only, so it's never retried. */
export function usePayrunLastCycleQuery() {
  return useQuery<PayrunLastCycle>({
    queryKey: ["payroll", "payruns", "last-cycle"],
    queryFn: fetchPayrunLastCycle,
    retry: false,
  });
}

/**
 * `GET /employees/{id}/completeness`, on demand — the wizard checks again
 * whenever someone is re-included and before the review step, so it always
 * fetches fresh rather than trusting a cached answer.
 */
export function useProfileCompletenessCheck() {
  const queryClient = useQueryClient();
  return React.useCallback(
    async (employeeId: string, employeeName: string): Promise<ProfileCompleteness> => {
      try {
        const result = await queryClient.fetchQuery({
          queryKey: ["payroll", "payruns", "completeness", employeeId],
          queryFn: () => fetchProfileCompleteness(employeeId),
          staleTime: 0,
          retry: false,
        });
        return { ...result, employeeName: result.employeeName || employeeName };
      } catch {
        // A failed check blocks the run like an incomplete profile would —
        // better than letting Microkeeper reject the payslip later.
        return {
          employeeId,
          employeeName,
          isComplete: false,
          totalMissingFields: 0,
          missing: {},
          checkFailed: true,
        };
      }
    },
    [queryClient],
  );
}

/**
 * Creating, completing or deleting a run moves the Overview's figures too,
 * so those invalidate all of payroll rather than just the run lists.
 */
function useInvalidate(scope: "payruns" | "payroll") {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: scope === "payroll" ? ["payroll"] : ["payroll", "payruns"],
    });
}

/** `POST /payruns`. */
export function useCreatePayrunMutation() {
  const invalidate = useInvalidate("payroll");
  return useMutation({
    mutationFn: (payload: CreatePayrunPayload) => createPayrun(payload),
    onSuccess: invalidate,
  });
}

export type PayrunBulkResult = { succeeded: number; failed: number; firstError: unknown };

/**
 * One action across several runs, one request each — there's no bulk
 * endpoint. Every run is attempted whatever happens to the others, and the
 * result says how many went through so the caller can be honest about a
 * partial success (sole-webapp counted failures as nothing at all).
 */
async function eachRun(
  runs: PayrunRef[],
  action: (run: PayrunRef) => Promise<void>,
): Promise<PayrunBulkResult> {
  const results = await Promise.allSettled(runs.map((run) => action(run)));
  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  const failed = results.filter((result) => result.status === "rejected").length;
  return { succeeded: results.length - failed, failed, firstError: rejected?.reason ?? null };
}

/** `POST /payruns/{id}/complete?year=`, for one run or several. */
export function useCompletePayrunsMutation() {
  const invalidate = useInvalidate("payroll");
  return useMutation({
    mutationFn: (runs: PayrunRef[]) => eachRun(runs, completePayrun),
    onSettled: invalidate,
  });
}

/** `POST /payruns/{id}/email?year=`, for one run or several. */
export function useEmailPayslipsMutation() {
  return useMutation({
    mutationFn: (runs: PayrunRef[]) => eachRun(runs, emailPayslips),
  });
}

/** `DELETE /payruns/{id}?year=`, for one run or several. */
export function useDeletePayrunsMutation() {
  const invalidate = useInvalidate("payroll");
  return useMutation({
    mutationFn: (runs: PayrunRef[]) => eachRun(runs, deletePayrun),
    onSettled: invalidate,
  });
}

/** `POST /payruns/{id}/duplicate?year=` — the copy lands as a draft. */
export function useDuplicatePayrunMutation() {
  const invalidate = useInvalidate("payruns");
  return useMutation({
    mutationFn: (run: PayrunRef) => duplicatePayrun(run),
    onSuccess: invalidate,
  });
}
