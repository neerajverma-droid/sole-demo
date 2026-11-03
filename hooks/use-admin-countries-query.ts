"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteRateApi,
  deleteThresholdApi,
  discardCountryDraftApi,
  fetchCountries,
  fetchCountryAudit,
  fetchCountryDetail,
  fetchCountryPreview,
  publishCountryApi,
  rollbackCountryApi,
  scheduleRateApi,
  scheduleThresholdApi,
  setCountryStatusApi,
  stageCountryApi,
  type BackdateOverride,
  type CountryStatus,
  type ScheduleRateInput,
  type ScheduleThresholdInput,
} from "@/lib/admin/countries";

/**
 * The Country Configuration Registry, for the admin console.
 *
 * Every write invalidates both the country and its preview: a staged rate
 * changes what publishing will do, and the publish button reads its enabled
 * state and its warnings from that preview. Keeping them in step is what stops
 * the dialog from offering to publish something the server has since refused.
 */

const COUNTRIES_KEY = ["admin", "countries"] as const;

const countryKey = (iso2: string) => [...COUNTRIES_KEY, iso2] as const;
const previewKey = (iso2: string) => [...COUNTRIES_KEY, iso2, "preview"] as const;

/** Every country, with its status, version and business count. */
export function useAdminCountriesQuery() {
  return useQuery({
    queryKey: COUNTRIES_KEY,
    queryFn: fetchCountries,
    staleTime: 60_000,
  });
}

/** One country: config, draft, every rate and threshold, and the version history. */
export function useAdminCountryQuery(iso2: string) {
  return useQuery({
    queryKey: countryKey(iso2),
    queryFn: () => fetchCountryDetail(iso2),
    enabled: Boolean(iso2),
    staleTime: 30_000,
  });
}

/**
 * What publishing would do, and whether it can.
 *
 * `enabled` so the preview is only asked for when something is actually
 * staged — an unchanged country has nothing to preview, and the endpoint would
 * answer "nothing staged" on every page load.
 */
export function useAdminCountryPreviewQuery(iso2: string, enabled = true) {
  return useQuery({
    queryKey: previewKey(iso2),
    queryFn: () => fetchCountryPreview(iso2),
    enabled: Boolean(iso2) && enabled,
    staleTime: 0,
  });
}

export function useAdminCountryAuditQuery(iso2?: string) {
  return useQuery({
    queryKey: [...COUNTRIES_KEY, "audit", iso2 ?? "all"],
    queryFn: () => fetchCountryAudit({ iso2, limit: 100 }),
    staleTime: 30_000,
  });
}

/** After any write: this country, its preview, and the list that shows its version. */
function useInvalidateCountry(iso2: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: countryKey(iso2) }),
      queryClient.invalidateQueries({ queryKey: previewKey(iso2) }),
      queryClient.invalidateQueries({ queryKey: COUNTRIES_KEY, exact: true }),
    ]);
}

export function useStageCountryMutation(iso2: string) {
  const invalidate = useInvalidateCountry(iso2);
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) => stageCountryApi(iso2, patch),
    onSuccess: invalidate,
  });
}

export function useDiscardCountryDraftMutation(iso2: string) {
  const invalidate = useInvalidateCountry(iso2);
  return useMutation({
    mutationFn: () => discardCountryDraftApi(iso2),
    onSuccess: invalidate,
  });
}

export function usePublishCountryMutation(iso2: string) {
  const invalidate = useInvalidateCountry(iso2);
  return useMutation({
    mutationFn: (changeNote: string) => publishCountryApi(iso2, changeNote),
    onSuccess: invalidate,
  });
}

export function useSetCountryStatusMutation(iso2: string) {
  const invalidate = useInvalidateCountry(iso2);
  return useMutation({
    mutationFn: (status: CountryStatus) => setCountryStatusApi(iso2, status),
    onSuccess: invalidate,
  });
}

export function useRollbackCountryMutation(iso2: string) {
  const invalidate = useInvalidateCountry(iso2);
  return useMutation({
    mutationFn: ({ version, changeNote }: { version: number; changeNote: string }) =>
      rollbackCountryApi(iso2, version, changeNote),
    onSuccess: invalidate,
  });
}

export function useScheduleRateMutation(iso2: string) {
  const invalidate = useInvalidateCountry(iso2);
  return useMutation({
    mutationFn: ({ input, override }: { input: ScheduleRateInput; override?: BackdateOverride }) =>
      scheduleRateApi(iso2, input, override),
    onSuccess: invalidate,
  });
}

export function useDeleteRateMutation(iso2: string) {
  const invalidate = useInvalidateCountry(iso2);
  return useMutation({
    mutationFn: (id: number) => deleteRateApi(id),
    onSuccess: invalidate,
  });
}

export function useScheduleThresholdMutation(iso2: string) {
  const invalidate = useInvalidateCountry(iso2);
  return useMutation({
    mutationFn: ({ input, override }: { input: ScheduleThresholdInput; override?: BackdateOverride }) =>
      scheduleThresholdApi(iso2, input, override),
    onSuccess: invalidate,
  });
}

export function useDeleteThresholdMutation(iso2: string) {
  const invalidate = useInvalidateCountry(iso2);
  return useMutation({
    mutationFn: (id: number) => deleteThresholdApi(id),
    onSuccess: invalidate,
  });
}
