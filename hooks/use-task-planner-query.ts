"use client";

import { useQuery } from "@tanstack/react-query";

import {
  fetchFinalStageId,
  fetchPlannerBoard,
  fetchPlannerClients,
  fetchPlannerList,
} from "@/lib/task-planner-api";
import { normalizeBoard, plannerParams, type PlannerFilters } from "@/lib/task-planner";

/**
 * The board's columns and first page of cards. Fetched fresh on every filter
 * change and every reload, as the old board did — `staleTime: 0` so moving
 * back to an earlier filter doesn't show a stale board.
 */
export function usePlannerBoardQuery(filters: PlannerFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["task-planner", "board", filters],
    queryFn: async () => normalizeBoard(await fetchPlannerBoard(plannerParams(filters))),
    enabled,
    staleTime: 0,
  });
}

export function usePlannerListQuery(
  filters: PlannerFilters,
  page: number,
  limit: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["task-planner", "list", filters, page, limit],
    queryFn: () => fetchPlannerList({ page, limit, ...plannerParams(filters) }),
    enabled,
    staleTime: 0,
  });
}

/** The final stage's id — what bulk move and "Move to done" target, and what locks a row. */
export function useFinalStageIdQuery() {
  return useQuery({
    queryKey: ["task-planner", "final-stage"],
    queryFn: fetchFinalStageId,
  });
}

export function usePlannerClientsQuery() {
  return useQuery({
    queryKey: ["task-planner", "clients"],
    queryFn: fetchPlannerClients,
  });
}
