"use client";

import * as React from "react";
import axios from "axios";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { useActiveBusiness } from "@/hooks/use-active-business";
import { useCountryContext } from "@/hooks/use-country-context";
import { countryCurrencySymbol } from "@/lib/country-context";
import {
  FALLBACK_KM_RULES,
  createKmTripApi,
  deleteKmTripApi,
  fetchKmRules,
  fetchKmSettings,
  fetchKmStats,
  fetchKmTrip,
  fetchKmTripsPage,
  formatKm,
  formatKmMoney,
  formatKmPercent,
  kmFilterParams,
  kmRulesMonthKey,
  kmMethodLabel,
  linkKmTripsToInvoiceApi,
  saveKmSettingsApi,
  updateKmTripApi,
  type KmCalculationMethod,
  type KmRules,
  type KmSettings,
  type KmTripFilters,
} from "@/lib/km-tracker";

/**
 * What the business's country decides about claiming vehicle use, for the
 * income year `date` (YYYY-MM-DD, default today) falls in.
 *
 * Never null, for the reason `useCountryContext` isn't: it starts from the
 * bundled Australian rules — what every business was before this — and the
 * server's answer replaces them, or doesn't if the request fails. A screen
 * whose first render would seed state from the rules (a form's method, its
 * odometer fields) waits on `loading` instead.
 *
 * Cached per business and per income year: the rate, cap and provisional
 * status hold for the whole year, so two trip dates in one year share an
 * answer, and switching business clears the cache anyway. An hour stale, as
 * with the country context — a rate change is a deliberate, rare act.
 */
export function useKmRules(date?: string): {
  rules: KmRules;
  /** True once the server has answered — not merely once something is readable. */
  ready: boolean;
  loading: boolean;
  isError: boolean;
} {
  const { business, loading: businessLoading } = useActiveBusiness();
  const businessId = business?.id ?? null;
  const month = kmRulesMonthKey(date);

  const query = useQuery({
    queryKey: ["km-rules", businessId, month],
    queryFn: () => fetchKmRules(date),
    enabled: businessId !== null,
    staleTime: 60 * 60_000,
    // A trip's date moving into another year keeps the last answer up while
    // the next loads, rather than flashing the fallback — never another
    // business's, though.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === businessId ? previous : undefined,
    // Once for a blip, never for a 4xx: a server without the endpoint yet
    // should leave Australia's rules in place at once, not after a backoff.
    retry: (failures, error) =>
      failures < 1 &&
      !(axios.isAxiosError(error) && (error.response?.status ?? 500) < 500),
  });

  return {
    rules: query.data ?? FALLBACK_KM_RULES,
    ready: query.isSuccess && !query.isPlaceholderData,
    // Still finding out which business is open counts as loading too.
    loading: query.isLoading || (businessId === null && businessLoading),
    isError: query.isError,
  };
}

/**
 * The KM screens' formatters in the business's own currency and locale —
 * "$" and en-AU for an Australian business, as before — plus method names
 * as this country calls them.
 */
export function useKmFormat() {
  const { country } = useCountryContext();
  const { rules } = useKmRules();
  return React.useMemo(
    () => ({
      country,
      rules,
      money: (value: number) => formatKmMoney(value, country),
      km: (value: number) => formatKm(value),
      percent: (value: number) => formatKmPercent(value),
      method: (value: KmCalculationMethod | null) => kmMethodLabel(value, rules),
      /** The money fields' prefix. */
      symbol: countryCurrencySymbol(country),
    }),
    [country, rules],
  );
}

export type KmFormat = ReturnType<typeof useKmFormat>;

/**
 * One page of trips for the filters on screen. The previous page stays up
 * while the next loads, so changing a filter never drops the table back to a
 * first-load shimmer — same as the equity and liability lists.
 */
export function useKmTripsQuery(
  filters: KmTripFilters,
  page: number,
  pageSize: number,
) {
  return useQuery({
    // Keyed on what's actually sent, not the raw filter state — picking the
    // first date of a custom range changes the state but not the request.
    queryKey: ["km-trips", kmFilterParams(filters), page, pageSize],
    queryFn: () => fetchKmTripsPage(filters, page, pageSize),
    placeholderData: keepPreviousData,
  });
}

/** The method summaries band. Keyed by the filters because the cents-per-km
 *  financial year follows the end of the selected range. */
export function useKmStatsQuery(filters: KmTripFilters) {
  return useQuery({
    queryKey: ["km-stats", kmFilterParams(filters)],
    queryFn: () => fetchKmStats(filters),
    placeholderData: keepPreviousData,
  });
}

export function useKmSettingsQuery() {
  return useQuery({
    queryKey: ["km-settings"],
    queryFn: fetchKmSettings,
  });
}

export function useKmTripQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["km-trip", id],
    queryFn: () => fetchKmTrip(id as string),
    enabled: !!id,
    // Never seed a form from an earlier visit's copy.
    refetchOnMount: "always",
  });
}

/**
 * Every trip write moves more than the row: the totals band, and — for a
 * logbook trip — the vehicle's current odometer, which the server keeps on the
 * settings record and the next trip's odometer starts from.
 */
function useInvalidateKm() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["km-trips"] }),
      queryClient.invalidateQueries({ queryKey: ["km-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["km-trip"] }),
      queryClient.invalidateQueries({ queryKey: ["km-settings"] }),
    ]);
}

export function useCreateKmTripMutation() {
  const invalidate = useInvalidateKm();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => createKmTripApi(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateKmTripMutation() {
  const invalidate = useInvalidateKm();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      updateKmTripApi(id, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteKmTripMutation() {
  const invalidate = useInvalidateKm();
  return useMutation({
    mutationFn: (id: string) => deleteKmTripApi(id),
    onSuccess: invalidate,
  });
}

export function useLinkKmTripsMutation() {
  const invalidate = useInvalidateKm();
  return useMutation({
    mutationFn: ({
      tripIds,
      invoice,
    }: {
      tripIds: string[];
      invoice: { id: string; number: string };
    }) => linkKmTripsToInvoiceApi(tripIds, invoice),
    // Refetch either way: a partial failure still linked some of them.
    onSettled: invalidate,
  });
}

export function useSaveKmSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: KmSettings) => saveKmSettingsApi(settings),
    onSuccess: (saved) => {
      queryClient.setQueryData(["km-settings"], saved);
      // The cents-per-km cap and rate feed the totals band.
      return queryClient.invalidateQueries({ queryKey: ["km-stats"] });
    },
  });
}
