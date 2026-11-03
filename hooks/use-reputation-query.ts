"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchCompletedNpsReferences,
  fetchReputationFeedbacks,
  fetchReputationOverview,
  fetchReputationSettings,
  fetchReputationSurveys,
  ReputationNotConfiguredError,
} from "@/lib/reputation-api";

const ROOT = "reputation";

const retry = (failureCount: number, error: unknown) =>
  !(error instanceof ReputationNotConfiguredError) && failureCount < 1;

export function useReputationOverviewQuery() {
  return useQuery({ queryKey: [ROOT, "overview"], queryFn: fetchReputationOverview, retry });
}

export function useReputationFeedbacksQuery() {
  return useQuery({ queryKey: [ROOT, "feedbacks"], queryFn: fetchReputationFeedbacks, retry });
}

export function useReputationSurveysQuery(enabled = true) {
  return useQuery({ queryKey: [ROOT, "surveys"], queryFn: fetchReputationSurveys, enabled, retry });
}

export function useReputationSettingsQuery() {
  return useQuery({ queryKey: [ROOT, "settings"], queryFn: fetchReputationSettings, retry });
}

/**
 * Which invoices (and other references) already have an NPS response in — a
 * non-blocking lookup, same as the old screen: when reputation isn't
 * configured, callers just get an empty set back rather than an error to show.
 */
export function useCompletedNpsReferencesQuery(enabled = true) {
  return useQuery({
    queryKey: [ROOT, "completed-references"],
    queryFn: fetchCompletedNpsReferences,
    enabled,
    retry: false,
    throwOnError: false,
  });
}

export type ReputationSlice = "overview" | "feedbacks" | "surveys" | "settings";

export function useInvalidateReputation() {
  const queryClient = useQueryClient();
  return React.useCallback(
    (...slices: ReputationSlice[]) =>
      slices.length
        ? Promise.all(slices.map((slice) => queryClient.invalidateQueries({ queryKey: [ROOT, slice] })))
        : queryClient.invalidateQueries({ queryKey: [ROOT] }),
    [queryClient],
  );
}
