/**
 * Project overview — the numbers behind a project's Overview tab: the budget
 * and profit picture, tracked time and its billable split, and task progress.
 *
 * Backed by sole-ocr's `/project/stats/:id/*` routes, the same six that
 * sole-webapp's `components/Projects/overview/Projectoverview.js` calls. Each
 * widget there loaded on its own with its own period, so each is its own
 * request here too — changing the time chart's period doesn't refetch the
 * financials.
 *
 * All GETs. Every period-scoped route reads `?period=` through the
 * controller's `normalizePeriod`, which knows the display labels ("This
 * Quarter") but not the service's own keys ("this_quarter" falls through to
 * the week). So the label is what goes on the wire, exactly as the old app
 * sent it.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { num } from "@/lib/projects";

/* ------------------------------------------------------------------ *
 * Period
 * ------------------------------------------------------------------ */

export const PROJECT_STATS_PERIODS = [
  "Today",
  "This Week",
  "This Month",
  "This Quarter",
  "This Year",
] as const;

export type ProjectStatsPeriod = (typeof PROJECT_STATS_PERIODS)[number];

export const DEFAULT_PROJECT_STATS_PERIOD: ProjectStatsPeriod = "This Week";

/* ------------------------------------------------------------------ *
 * Shared plumbing
 * ------------------------------------------------------------------ */

type ApiEnvelope = { success?: boolean; message?: string; data?: unknown };

type ApiRecord = Record<string, unknown>;

function asRecord(value: unknown): ApiRecord {
  return value && typeof value === "object" ? (value as ApiRecord) : {};
}

async function getStats(
  projectId: string,
  path: string,
  failure: string,
  period?: ProjectStatsPeriod,
): Promise<ApiRecord> {
  const response = await api.get<ApiEnvelope>(
    `${apiRoutes.projects.statsProject}/${projectId}/${path}`,
    period ? { params: { period } } : undefined,
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || failure);
  }
  return asRecord(response.data?.data);
}

/* ------------------------------------------------------------------ *
 * Durations
 * ------------------------------------------------------------------ */

/** The service's `toHoursMinutes` — whole hours plus the leftover minutes. */
export type HoursMinutes = { hours: number; minutes: number };

function toHoursMinutes(value: unknown): HoursMinutes {
  const record = asRecord(value);
  return { hours: num(record.hours), minutes: num(record.minutes) };
}

export function formatHoursMinutes({ hours, minutes }: HoursMinutes): string {
  return `${hours}h ${minutes}m`;
}

/** `totalTrackedHours` arrives as decimal hours (12.5); shown like the rest. */
export function decimalHoursToHoursMinutes(decimal: number): HoursMinutes {
  const totalMinutes = Math.round(Math.max(decimal, 0) * 60);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/* ------------------------------------------------------------------ *
 * Summary — time and task counts for the period
 * ------------------------------------------------------------------ */

export type ProjectStatsSummary = {
  totalTracked: HoursMinutes;
  billableHours: HoursMinutes;
  billableAmount: number;
  nonBillableHours: HoursMinutes;
  /** Task counts are the whole project's — the period only scopes the time. */
  totalTasks: number;
  completedTasks: number;
  remainingTasks: number;
  /** Completed / total, already rounded to a whole percent. */
  progress: number;
};

export async function fetchProjectStatsSummary(
  projectId: string,
  period: ProjectStatsPeriod,
): Promise<ProjectStatsSummary> {
  const raw = await getStats(projectId, "summary", "Couldn't load project stats.", period);
  return {
    totalTracked: toHoursMinutes(raw.totalTracked),
    billableHours: toHoursMinutes(raw.billableHours),
    billableAmount: num(raw.billableAmount),
    nonBillableHours: toHoursMinutes(raw.nonBillableHours),
    totalTasks: num(raw.totalTasks),
    completedTasks: num(raw.completedTasks),
    remainingTasks: num(raw.remainingTasks),
    progress: num(raw.progress),
  };
}

/* ------------------------------------------------------------------ *
 * Time chart — tracked hours per day
 * ------------------------------------------------------------------ */

export type ProjectTimePoint = { label: string; billable: number; nonBillable: number };

/**
 * One point per day of the period, labelled "14 Tue". The service rounds each
 * day to whole hours, so a short day can read as 0 — that's the server's call,
 * not a parsing loss here.
 */
export async function fetchProjectTimeChart(
  projectId: string,
  period: ProjectStatsPeriod,
): Promise<ProjectTimePoint[]> {
  const raw = await getStats(projectId, "time-chart", "Couldn't load tracked time.", period);
  const labels = Array.isArray(raw.labels) ? raw.labels : [];
  const billable = Array.isArray(raw.billable) ? raw.billable : [];
  const nonBillable = Array.isArray(raw.nonBillable) ? raw.nonBillable : [];
  return labels.map((label, index) => ({
    label: String(label ?? ""),
    billable: num(billable[index]),
    nonBillable: num(nonBillable[index]),
  }));
}

/* ------------------------------------------------------------------ *
 * Billable breakdown — the split for the gauge
 * ------------------------------------------------------------------ */

export type ProjectBillableBreakdown = {
  /** Billable share of tracked time, a whole percent; 0 when nothing's tracked. */
  percentage: number;
  total: HoursMinutes;
};

export async function fetchProjectBillableBreakdown(
  projectId: string,
  period: ProjectStatsPeriod,
): Promise<ProjectBillableBreakdown> {
  const raw = await getStats(
    projectId,
    "billable-breakdown",
    "Couldn't load the billable split.",
    period,
  );
  return {
    percentage: num(raw.percentage),
    total: { hours: num(raw.totalHours), minutes: num(raw.totalMinutes) },
  };
}

/* ------------------------------------------------------------------ *
 * Task status
 * ------------------------------------------------------------------ */

/** Tasks *created* in the period, by status — unlike the summary's counts. */
export type ProjectTaskStatusCounts = { active: number; inactive: number; completed: number };

export async function fetchProjectTaskStatus(
  projectId: string,
  period: ProjectStatsPeriod,
): Promise<ProjectTaskStatusCounts> {
  const raw = await getStats(projectId, "task-status", "Couldn't load task status.", period);
  return {
    active: num(raw.active),
    inactive: num(raw.inactive),
    completed: num(raw.completed),
  };
}

/* ------------------------------------------------------------------ *
 * Overdue
 * ------------------------------------------------------------------ */

/**
 * Despite the widget's "Overdue Tasks" title, the route reports on the project
 * itself: past its end date and not completed/closed. The old widget turned
 * that into a single "Project deadline exceeded" row, and so does this tab.
 */
export type ProjectOverdue = {
  isOverdue: boolean;
  /** yyyy-MM-dd, or "" when the project has no end date. */
  endDate: string;
  daysOverdue: number;
};

export async function fetchProjectOverdue(
  projectId: string,
  period: ProjectStatsPeriod,
): Promise<ProjectOverdue> {
  const raw = await getStats(projectId, "overdue", "Couldn't load overdue status.", period);
  return {
    isOverdue: raw.isOverdue === true,
    endDate: raw.endDate ? String(raw.endDate) : "",
    daysOverdue: num(raw.daysOverdue),
  };
}

/* ------------------------------------------------------------------ *
 * Financial metrics — whole-of-project, no period
 * ------------------------------------------------------------------ */

export type ProjectFinancialMetrics = {
  totalBudget: number;
  /** Null when the project has no end date; 0 once it's passed. */
  remainingDays: number | null;
  remainingBudget: number;
  remainingBudgetPercent: number;

  actualProfitLoss: number;
  isActualLoss: boolean;
  expectedProfit: number;
  isForecastLoss: boolean;

  // The budget split. `recognisedValue` (completed, not yet invoiced) is left
  // out of the bar, as it was in sole-webapp, so the five don't always fill it.
  paidValue: number;
  invoicedValue: number;
  committedValue: number;
  futureWorkValue: number;
  uncommittedValue: number;

  forecastIncome: number;
  forecastCost: number;
  totalCostIncurred: number;
  remainingCashToCollect: number;
  totalRecognisedRevenue: number;

  labourCost: number;
  expenseCost: number;

  totalExpenses: number;
  invoicedExpenses: number;
  uninvoicedExpenses: number;
  expenseMarginPercent: number;

  totalTaskValue: number;
  totalTasks: number;
  completedTasks: number;
  invoicedTasks: number;
  totalLabourCost: number;
  totalTrackedHours: number;
};

export async function fetchProjectFinancialMetrics(
  projectId: string,
): Promise<ProjectFinancialMetrics> {
  const raw = await getStats(projectId, "financial-metrics", "Couldn't load project financials.");
  const costBreakdown = asRecord(raw.costBreakdown);
  return {
    totalBudget: num(raw.totalBudget),
    remainingDays: raw.remainingDays == null ? null : num(raw.remainingDays),
    remainingBudget: num(raw.remainingBudget),
    remainingBudgetPercent: num(raw.remainingBudgetPercent),

    actualProfitLoss: num(raw.actualProfitLoss),
    isActualLoss: raw.isActualLoss === true,
    expectedProfit: num(raw.expectedProfit),
    isForecastLoss: raw.isForecastLoss === true,

    paidValue: num(raw.paidValue),
    invoicedValue: num(raw.invoicedValue),
    committedValue: num(raw.committedValue),
    futureWorkValue: num(raw.futureWorkValue),
    uncommittedValue: num(raw.uncommittedValue),

    forecastIncome: num(raw.forecastIncome),
    forecastCost: num(raw.forecastCost),
    totalCostIncurred: num(raw.totalCostIncurred),
    remainingCashToCollect: num(raw.remainingCashToCollect),
    totalRecognisedRevenue: num(raw.totalRecognisedRevenue),

    labourCost: num(costBreakdown.labourCost),
    expenseCost: num(costBreakdown.expenseCost),

    totalExpenses: num(raw.totalExpenses),
    invoicedExpenses: num(raw.invoicedExpenses),
    uninvoicedExpenses: num(raw.uninvoicedExpenses),
    expenseMarginPercent: num(raw.expenseMarginPercent),

    totalTaskValue: num(raw.totalTaskValue),
    totalTasks: num(raw.totalTasks),
    completedTasks: num(raw.completedTasks),
    invoicedTasks: num(raw.invoicedTasks),
    totalLabourCost: num(raw.totalLabourCost),
    totalTrackedHours: num(raw.totalTrackedHours),
  };
}
