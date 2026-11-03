/**
 * The Projects Overview tab's data layer, against sole-ocr's six
 * `/project/stats/:id/*` routes. Fixtures mirror what
 * `src/services/project.js` actually returns (getProjectStats,
 * generateTimeChartData, getProjectBillableBreakdown, getProjectTaskStatus,
 * getProjectFinancialMetrics), wrapped in the controller's
 * `{ success, data }` envelope.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

// Imported after the mock so the module's `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  PROJECT_STATS_PERIODS,
  DEFAULT_PROJECT_STATS_PERIOD,
  formatHoursMinutes,
  decimalHoursToHoursMinutes,
  fetchProjectStatsSummary,
  fetchProjectTimeChart,
  fetchProjectBillableBreakdown,
  fetchProjectTaskStatus,
  fetchProjectOverdue,
  fetchProjectFinancialMetrics,
} = await import("@/lib/project-overview");

beforeEach(() => vi.resetAllMocks());

/** Resolves the next GET with the controller's success envelope. */
function respond(data: unknown) {
  apiMock.get.mockResolvedValue({ data: { success: true, data } });
}

/** The URL and axios config of the only GET made. */
function lastGet(): [string, unknown] {
  expect(apiMock.get).toHaveBeenCalledTimes(1);
  return apiMock.get.mock.calls[0] as [string, unknown];
}

/* ------------------------------------------------------------------ *
 * Fixtures — shaped like the service's return values
 * ------------------------------------------------------------------ */

const SUMMARY = {
  totalTracked: { hours: 12, minutes: 30 },
  billableHours: { hours: 9, minutes: 15 },
  billableAmount: 1387.5,
  nonBillableHours: { hours: 3, minutes: 15 },
  totalTasks: 8,
  completedTasks: 3,
  remainingTasks: 5,
  progress: 38,
};

// generateTimeChartData: one entry per day, labelled `DD ddd`, rounded hours.
const TIME_CHART = {
  labels: ["13 Mon", "14 Tue", "15 Wed"],
  billable: [4, 0, 6],
  nonBillable: [1, 2, 0],
};

const FINANCIAL_METRICS = {
  totalBudget: 20000,
  weeklyBudget: 0,
  monthlyBudget: 0,
  paidValue: 5000,
  invoicedValue: 3000,
  committedValue: 2500,
  recognisedValue: 1200,
  futureWorkValue: 4000,
  uncommittedValue: 4300,
  totalExpenses: 900.5,
  invoicedExpenses: 600,
  uninvoicedExpenses: 300.5,
  expenseMargin: 90,
  expenseMarginPercent: 9.99,
  totalTrackedHours: 42.75,
  totalLabourCost: 3420,
  totalCostIncurred: 4320.5,
  costBreakdown: { labourCost: 3420, expenseCost: 900.5 },
  forecastIncome: 20000,
  financialProgress: 47.5,
  remainingBudget: 4300,
  remainingBudgetPercent: 21.5,
  remainingDays: 17,
  remainingCashToCollect: 9800,
  totalRecognisedRevenue: 9200,
  expectedProfit: 15679.5,
  actualProfitLoss: 4879.5,
  isActualLoss: false,
  forecastCost: 4320.5,
  isForecastLoss: false,
  isProjectLoss: false,
  totalTaskValue: 16000,
  totalTasks: 8,
  completedTasks: 3,
  invoicedTasks: 2,
  projectStatus: "active",
  startDate: "2026-09-01",
  endDate: "2026-11-08",
  isFixed: false,
  budgetType: "total",
};

/* ------------------------------------------------------------------ *
 * Periods
 * ------------------------------------------------------------------ */

describe("the period list", () => {
  it("offers the five display labels in order", () => {
    expect(PROJECT_STATS_PERIODS).toEqual([
      "Today",
      "This Week",
      "This Month",
      "This Quarter",
      "This Year",
    ]);
  });

  it("defaults to This Week, which is also the server's own default", () => {
    expect(DEFAULT_PROJECT_STATS_PERIOD).toBe("This Week");
    expect(PROJECT_STATS_PERIODS).toContain(DEFAULT_PROJECT_STATS_PERIOD);
  });

  // Every label must be one the controller's normalizePeriod recognises once
  // lower-cased; anything else silently falls back to the week.
  it("only holds labels the backend's normalizePeriod knows", () => {
    const known = ["today", "this week", "this month", "this quarter", "this year"];
    for (const period of PROJECT_STATS_PERIODS) {
      expect(known).toContain(period.toLowerCase());
    }
  });

  it.each(PROJECT_STATS_PERIODS)("sends %s verbatim as ?period=", async (period) => {
    respond(SUMMARY);
    await fetchProjectStatsSummary("7", period);
    expect(lastGet()[1]).toEqual({ params: { period } });
  });
});

/* ------------------------------------------------------------------ *
 * Duration helpers
 * ------------------------------------------------------------------ */

describe("formatting hours and minutes", () => {
  it("reads as '12h 30m'", () => {
    expect(formatHoursMinutes({ hours: 12, minutes: 30 })).toBe("12h 30m");
  });

  it("keeps zero parts rather than dropping them", () => {
    expect(formatHoursMinutes({ hours: 0, minutes: 0 })).toBe("0h 0m");
    expect(formatHoursMinutes({ hours: 3, minutes: 0 })).toBe("3h 0m");
  });
});

describe("converting decimal hours", () => {
  it("splits 12.5 into 12 hours 30 minutes", () => {
    expect(decimalHoursToHoursMinutes(12.5)).toEqual({ hours: 12, minutes: 30 });
  });

  it("handles the service's two-decimal hours (42.75 → 42h 45m)", () => {
    expect(decimalHoursToHoursMinutes(42.75)).toEqual({ hours: 42, minutes: 45 });
  });

  it("rounds to the nearest minute", () => {
    // 0.33h = 19.8 minutes
    expect(decimalHoursToHoursMinutes(0.33)).toEqual({ hours: 0, minutes: 20 });
  });

  it("carries a minute that rounds up to 60 into the hour", () => {
    // 1.999h = 119.94 minutes → 120 → 2h 0m, never "1h 60m"
    expect(decimalHoursToHoursMinutes(1.999)).toEqual({ hours: 2, minutes: 0 });
  });

  it("treats zero and negative values as nothing tracked", () => {
    expect(decimalHoursToHoursMinutes(0)).toEqual({ hours: 0, minutes: 0 });
    expect(decimalHoursToHoursMinutes(-3.5)).toEqual({ hours: 0, minutes: 0 });
  });

  it("pairs with the formatter for display", () => {
    expect(formatHoursMinutes(decimalHoursToHoursMinutes(7.25))).toBe("7h 15m");
  });
});

/* ------------------------------------------------------------------ *
 * Shared request behaviour
 * ------------------------------------------------------------------ */

describe("failed responses", () => {
  // Each fetcher with its fallback message, so the shared plumbing is
  // exercised through every public entry point.
  const cases: [string, () => Promise<unknown>, string][] = [
    ["summary", () => fetchProjectStatsSummary("7", "This Week"), "Couldn't load project stats."],
    ["time chart", () => fetchProjectTimeChart("7", "This Week"), "Couldn't load tracked time."],
    [
      "billable breakdown",
      () => fetchProjectBillableBreakdown("7", "This Week"),
      "Couldn't load the billable split.",
    ],
    ["task status", () => fetchProjectTaskStatus("7", "This Week"), "Couldn't load task status."],
    ["overdue", () => fetchProjectOverdue("7", "This Week"), "Couldn't load overdue status."],
    [
      "financial metrics",
      () => fetchProjectFinancialMetrics("7"),
      "Couldn't load project financials.",
    ],
  ];

  it.each(cases)("the %s throws the server's message on success:false", async (_, fetch) => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "Project not found" } });
    await expect(fetch()).rejects.toThrow("Project not found");
  });

  it.each(cases)(
    "the %s falls back to its own message when the server gives none",
    async (_, fetch, fallback) => {
      apiMock.get.mockResolvedValue({ data: { success: false } });
      await expect(fetch()).rejects.toThrow(fallback);
    },
  );

  it.each(cases)("the %s lets a network error propagate", async (_, fetch) => {
    apiMock.get.mockRejectedValue(new Error("Network Error"));
    await expect(fetch()).rejects.toThrow("Network Error");
  });
});

/* ------------------------------------------------------------------ *
 * Summary
 * ------------------------------------------------------------------ */

describe("fetching the summary", () => {
  it("hits /:id/summary with the period", async () => {
    respond(SUMMARY);
    await fetchProjectStatsSummary("42", "This Month");
    expect(lastGet()).toEqual([
      `${apiRoutes.projects.statsProjectSummary}/42/summary`,
      { params: { period: "This Month" } },
    ]);
  });

  it("maps the service's stats into typed fields", async () => {
    respond(SUMMARY);
    expect(await fetchProjectStatsSummary("42", "This Week")).toEqual({
      totalTracked: { hours: 12, minutes: 30 },
      billableHours: { hours: 9, minutes: 15 },
      billableAmount: 1387.5,
      nonBillableHours: { hours: 3, minutes: 15 },
      totalTasks: 8,
      completedTasks: 3,
      remainingTasks: 5,
      progress: 38,
    });
  });

  it("parses numeric strings and zeroes missing, null or junk values", async () => {
    respond({
      totalTracked: { hours: "2", minutes: null },
      billableHours: null,
      billableAmount: "99.95",
      // nonBillableHours missing entirely
      totalTasks: "abc",
      completedTasks: undefined,
      remainingTasks: null,
      progress: "50",
    });
    expect(await fetchProjectStatsSummary("42", "This Week")).toEqual({
      totalTracked: { hours: 2, minutes: 0 },
      billableHours: { hours: 0, minutes: 0 },
      billableAmount: 99.95,
      nonBillableHours: { hours: 0, minutes: 0 },
      totalTasks: 0,
      completedTasks: 0,
      remainingTasks: 0,
      progress: 50,
    });
  });

  it("returns all zeroes when the envelope has no data", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });
    const summary = await fetchProjectStatsSummary("42", "This Week");
    expect(summary.totalTracked).toEqual({ hours: 0, minutes: 0 });
    expect(summary.progress).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * Time chart
 * ------------------------------------------------------------------ */

describe("fetching the time chart", () => {
  it("hits /:id/time-chart with the period", async () => {
    respond(TIME_CHART);
    await fetchProjectTimeChart("42", "This Quarter");
    expect(lastGet()).toEqual([
      `${apiRoutes.projects.statsProjectTimeChart}/42/time-chart`,
      { params: { period: "This Quarter" } },
    ]);
  });

  it("zips the parallel label/billable/non-billable arrays into points", async () => {
    respond(TIME_CHART);
    expect(await fetchProjectTimeChart("42", "This Week")).toEqual([
      { label: "13 Mon", billable: 4, nonBillable: 1 },
      { label: "14 Tue", billable: 0, nonBillable: 2 },
      { label: "15 Wed", billable: 6, nonBillable: 0 },
    ]);
  });

  it("zeroes a series value the server left short or unparseable", async () => {
    respond({ labels: ["13 Mon", "14 Tue"], billable: ["3"], nonBillable: [null, "x"] });
    expect(await fetchProjectTimeChart("42", "This Week")).toEqual([
      { label: "13 Mon", billable: 3, nonBillable: 0 },
      { label: "14 Tue", billable: 0, nonBillable: 0 },
    ]);
  });

  it("follows the labels: extra series values without a label are dropped", async () => {
    respond({ labels: ["13 Mon"], billable: [1, 2, 3], nonBillable: [4, 5, 6] });
    expect(await fetchProjectTimeChart("42", "This Week")).toEqual([
      { label: "13 Mon", billable: 1, nonBillable: 4 },
    ]);
  });

  it("stringifies labels and blanks null ones", async () => {
    respond({ labels: [14, null], billable: [1, 1], nonBillable: [0, 0] });
    const points = await fetchProjectTimeChart("42", "This Week");
    expect(points.map((p) => p.label)).toEqual(["14", ""]);
  });

  it("returns no points when labels are missing or not an array", async () => {
    respond({ billable: [1], nonBillable: [1] });
    expect(await fetchProjectTimeChart("42", "This Week")).toEqual([]);
    respond({ labels: "13 Mon", billable: [1], nonBillable: [1] });
    expect(await fetchProjectTimeChart("42", "This Week")).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Billable breakdown
 * ------------------------------------------------------------------ */

describe("fetching the billable breakdown", () => {
  it("hits /:id/billable-breakdown with the period", async () => {
    respond({ percentage: 74, totalHours: 12, totalMinutes: 30 });
    await fetchProjectBillableBreakdown("42", "Today");
    expect(lastGet()).toEqual([
      `${apiRoutes.projects.statsProjectBillableBreakdown}/42/billable-breakdown`,
      { params: { period: "Today" } },
    ]);
  });

  it("folds totalHours/totalMinutes into one duration", async () => {
    respond({ percentage: 74, totalHours: 12, totalMinutes: 30 });
    expect(await fetchProjectBillableBreakdown("42", "This Week")).toEqual({
      percentage: 74,
      total: { hours: 12, minutes: 30 },
    });
  });

  it("zeroes missing, null or string-junk values", async () => {
    respond({ percentage: null, totalHours: "5", totalMinutes: "n/a" });
    expect(await fetchProjectBillableBreakdown("42", "This Week")).toEqual({
      percentage: 0,
      total: { hours: 5, minutes: 0 },
    });
  });
});

/* ------------------------------------------------------------------ *
 * Task status
 * ------------------------------------------------------------------ */

describe("fetching task status", () => {
  it("hits /:id/task-status with the period", async () => {
    respond({ active: 4, inactive: 1, completed: 3 });
    await fetchProjectTaskStatus("42", "This Year");
    expect(lastGet()).toEqual([
      `${apiRoutes.projects.statsProjectTaskStatus}/42/task-status`,
      { params: { period: "This Year" } },
    ]);
  });

  it("maps the three status counts", async () => {
    respond({ active: 4, inactive: 1, completed: 3 });
    expect(await fetchProjectTaskStatus("42", "This Week")).toEqual({
      active: 4,
      inactive: 1,
      completed: 3,
    });
  });

  it("zeroes missing or junk counts", async () => {
    respond({ active: "2", inactive: null });
    expect(await fetchProjectTaskStatus("42", "This Week")).toEqual({
      active: 2,
      inactive: 0,
      completed: 0,
    });
  });
});

/* ------------------------------------------------------------------ *
 * Overdue
 * ------------------------------------------------------------------ */

describe("fetching overdue status", () => {
  it("hits /:id/overdue with the period", async () => {
    respond({ isOverdue: false, endDate: null, daysOverdue: 0 });
    await fetchProjectOverdue("42", "This Week");
    expect(lastGet()).toEqual([
      `${apiRoutes.projects.statsProjectOverdue}/42/overdue`,
      { params: { period: "This Week" } },
    ]);
  });

  it("takes daysOverdue from the server for an overdue project", async () => {
    respond({ isOverdue: true, endDate: "2026-10-01", daysOverdue: 21 });
    expect(await fetchProjectOverdue("42", "This Week")).toEqual({
      isOverdue: true,
      endDate: "2026-10-01",
      daysOverdue: 21,
    });
  });

  it("blanks the end date when the project has none", async () => {
    respond({ isOverdue: false, endDate: null, daysOverdue: 0 });
    expect(await fetchProjectOverdue("42", "This Week")).toEqual({
      isOverdue: false,
      endDate: "",
      daysOverdue: 0,
    });
  });

  it("only counts a literal true as overdue", async () => {
    respond({ isOverdue: "true", endDate: "2026-10-01", daysOverdue: "3" });
    const overdue = await fetchProjectOverdue("42", "This Week");
    expect(overdue.isOverdue).toBe(false);
    expect(overdue.daysOverdue).toBe(3);
  });

  it("zeroes a missing daysOverdue", async () => {
    respond({ isOverdue: true, endDate: "2026-10-01" });
    expect((await fetchProjectOverdue("42", "This Week")).daysOverdue).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * Financial metrics
 * ------------------------------------------------------------------ */

describe("fetching financial metrics", () => {
  it("hits /:id/financial-metrics with no period", async () => {
    respond(FINANCIAL_METRICS);
    await fetchProjectFinancialMetrics("42");
    expect(lastGet()).toEqual([
      `${apiRoutes.projects.statsProjectFinancialMetrics}/42/financial-metrics`,
      undefined,
    ]);
  });

  it("maps every budget, forecast, cost, expense and task field", async () => {
    respond(FINANCIAL_METRICS);
    expect(await fetchProjectFinancialMetrics("42")).toEqual({
      totalBudget: 20000,
      remainingDays: 17,
      remainingBudget: 4300,
      remainingBudgetPercent: 21.5,

      actualProfitLoss: 4879.5,
      isActualLoss: false,
      expectedProfit: 15679.5,
      isForecastLoss: false,

      paidValue: 5000,
      invoicedValue: 3000,
      committedValue: 2500,
      futureWorkValue: 4000,
      uncommittedValue: 4300,

      forecastIncome: 20000,
      forecastCost: 4320.5,
      totalCostIncurred: 4320.5,
      remainingCashToCollect: 9800,
      totalRecognisedRevenue: 9200,

      // flattened from costBreakdown
      labourCost: 3420,
      expenseCost: 900.5,

      totalExpenses: 900.5,
      invoicedExpenses: 600,
      uninvoicedExpenses: 300.5,
      expenseMarginPercent: 9.99,

      totalTaskValue: 16000,
      totalTasks: 8,
      completedTasks: 3,
      invoicedTasks: 2,
      totalLabourCost: 3420,
      totalTrackedHours: 42.75,
    });
  });

  it("leaves out fields the tab doesn't use (recognisedValue, weeklyBudget, project info)", async () => {
    respond(FINANCIAL_METRICS);
    const metrics = await fetchProjectFinancialMetrics("42");
    for (const key of ["recognisedValue", "weeklyBudget", "projectStatus", "costBreakdown"]) {
      expect(metrics).not.toHaveProperty(key);
    }
  });

  it("keeps remainingDays null when the project has no end date", async () => {
    respond({ ...FINANCIAL_METRICS, remainingDays: null, endDate: null });
    expect((await fetchProjectFinancialMetrics("42")).remainingDays).toBeNull();
  });

  it("treats a missing remainingDays as no end date too", async () => {
    const { remainingDays: _omit, ...rest } = FINANCIAL_METRICS;
    void _omit;
    respond(rest);
    expect((await fetchProjectFinancialMetrics("42")).remainingDays).toBeNull();
  });

  it("keeps a remainingDays of 0 (end date passed) as 0, not null", async () => {
    respond({ ...FINANCIAL_METRICS, remainingDays: 0 });
    expect((await fetchProjectFinancialMetrics("42")).remainingDays).toBe(0);
  });

  it("parses a string remainingDays", async () => {
    respond({ ...FINANCIAL_METRICS, remainingDays: "5" });
    expect((await fetchProjectFinancialMetrics("42")).remainingDays).toBe(5);
  });

  it("carries the loss flags through when the server reports a loss", async () => {
    respond({
      ...FINANCIAL_METRICS,
      actualProfitLoss: -1250.25,
      isActualLoss: true,
      expectedProfit: -300,
      isForecastLoss: true,
    });
    const metrics = await fetchProjectFinancialMetrics("42");
    expect(metrics).toMatchObject({
      actualProfitLoss: -1250.25,
      isActualLoss: true,
      expectedProfit: -300,
      isForecastLoss: true,
    });
  });

  it("only counts a literal true as a loss", async () => {
    respond({ ...FINANCIAL_METRICS, isActualLoss: "true", isForecastLoss: 1 });
    const metrics = await fetchProjectFinancialMetrics("42");
    expect(metrics.isActualLoss).toBe(false);
    expect(metrics.isForecastLoss).toBe(false);
  });

  it("zeroes the cost split when costBreakdown is missing or null", async () => {
    respond({ ...FINANCIAL_METRICS, costBreakdown: null });
    expect(await fetchProjectFinancialMetrics("42")).toMatchObject({
      labourCost: 0,
      expenseCost: 0,
    });
  });

  it("defaults every number to 0 and remainingDays to null on an empty payload", async () => {
    respond({});
    const metrics = await fetchProjectFinancialMetrics("42");
    const { remainingDays, isActualLoss, isForecastLoss, ...numbers } = metrics;
    expect(remainingDays).toBeNull();
    expect(isActualLoss).toBe(false);
    expect(isForecastLoss).toBe(false);
    for (const value of Object.values(numbers)) expect(value).toBe(0);
  });

  it("parses numeric strings (e.g. DECIMAL columns) and zeroes junk", async () => {
    respond({ ...FINANCIAL_METRICS, totalBudget: "20000.00", paidValue: "n/a" });
    expect(await fetchProjectFinancialMetrics("42")).toMatchObject({
      totalBudget: 20000,
      paidValue: 0,
    });
  });
});
