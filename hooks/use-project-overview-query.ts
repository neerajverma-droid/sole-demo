"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  fetchProjectBillableBreakdown,
  fetchProjectFinancialMetrics,
  fetchProjectOverdue,
  fetchProjectStatsSummary,
  fetchProjectTaskStatus,
  fetchProjectTimeChart,
  type ProjectStatsPeriod,
} from "@/lib/project-overview";

/*
 * Every key starts ["project-stats", projectId] so the timer and task writes
 * that invalidate the ["project-stats"] prefix refresh the whole tab. The
 * period-scoped ones keep the previous period on screen while the next loads,
 * so flipping a widget's period doesn't drop it back to a shimmer.
 */

export function useProjectStatsSummaryQuery(projectId: string, period: ProjectStatsPeriod) {
  return useQuery({
    queryKey: ["project-stats", projectId, "summary", period],
    queryFn: () => fetchProjectStatsSummary(projectId, period),
    placeholderData: keepPreviousData,
  });
}

export function useProjectTimeChartQuery(projectId: string, period: ProjectStatsPeriod) {
  return useQuery({
    queryKey: ["project-stats", projectId, "time-chart", period],
    queryFn: () => fetchProjectTimeChart(projectId, period),
    placeholderData: keepPreviousData,
  });
}

export function useProjectBillableBreakdownQuery(projectId: string, period: ProjectStatsPeriod) {
  return useQuery({
    queryKey: ["project-stats", projectId, "billable-breakdown", period],
    queryFn: () => fetchProjectBillableBreakdown(projectId, period),
    placeholderData: keepPreviousData,
  });
}

export function useProjectTaskStatusQuery(projectId: string, period: ProjectStatsPeriod) {
  return useQuery({
    queryKey: ["project-stats", projectId, "task-status", period],
    queryFn: () => fetchProjectTaskStatus(projectId, period),
    placeholderData: keepPreviousData,
  });
}

export function useProjectOverdueQuery(projectId: string, period: ProjectStatsPeriod) {
  return useQuery({
    queryKey: ["project-stats", projectId, "overdue", period],
    queryFn: () => fetchProjectOverdue(projectId, period),
    placeholderData: keepPreviousData,
  });
}

export function useProjectFinancialMetricsQuery(projectId: string) {
  return useQuery({
    queryKey: ["project-stats", projectId, "financial-metrics"],
    queryFn: () => fetchProjectFinancialMetrics(projectId),
  });
}
