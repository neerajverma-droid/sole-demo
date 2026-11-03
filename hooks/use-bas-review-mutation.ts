"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchBasReview,
  fetchSavedReport,
  fetchSavedReports,
  saveBasReviewReport,
  type BasReview,
  type Decisions,
} from "@/lib/bas-review";

/**
 * Runs the BAS review for a period. A mutation rather than a query on purpose:
 * each run costs an AI call, so it happens when the user asks, never on page
 * load, window focus or a refetch.
 */
export function useBasReviewMutation() {
  return useMutation({
    mutationFn: (range: { from: string; to: string }) => fetchBasReview(range),
  });
}

export function useSaveBasReviewReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ review, decisions }: { review: BasReview; decisions: Decisions }) =>
      saveBasReviewReport(review, decisions),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["bas-review-reports"] }),
  });
}

export function useSavedBasReviewReports(enabled: boolean) {
  return useQuery({
    queryKey: ["bas-review-reports"],
    queryFn: fetchSavedReports,
    enabled,
  });
}

export function useSavedBasReviewReport(id: number | null) {
  return useQuery({
    queryKey: ["bas-review-reports", id],
    queryFn: () => fetchSavedReport(id as number),
    enabled: id !== null,
  });
}
