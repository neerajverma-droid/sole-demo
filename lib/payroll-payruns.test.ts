import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";

// Hoisted with the mock, so `lib/payroll-payruns.ts`'s own axios import
// resolves to this.
const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

import {
  EMPTY_PAYRUN_FILTERS,
  completePayrun,
  createPayrun,
  deletePayrun,
  duplicatePayrun,
  emailPayslips,
  employeePayslipFileName,
  exportPayrunCsv,
  fetchPayrunCompare,
  fetchPayrunDetail,
  fetchPayrunEmployees,
  fetchPayrunIssues,
  fetchPayrunLastCycle,
  fetchPayrunStatusCounts,
  fetchPayruns,
  fetchPayslipHtml,
  fetchProfileCompleteness,
  isPayrollBillingError,
  payrunCsvFileName,
  payrunErrorMessage,
  payslipsFileName,
  activePayrunFilterCount,
  adjustmentTotal,
  buildCreatePayrunPayload,
  canComparePayruns,
  compareOutcome,
  compareParams,
  completenessSummary,
  defaultPayCycle,
  payPeriodFor,
  defaultPayLine,
  includedUsernames,
  incompleteProfiles,
  issueLabel,
  issuesForPayslip,
  payLineGross,
  payrunActionBlock,
  payrunDateRangeBounds,
  payrunDraftTotals,
  payrunHasPayslips,
  payrunHours,
  payrunHref,
  payrunListParams,
  payrunTotals,
  payrunYearOptions,
  runsInYearFor,
  signedMoney,
  signedNumber,
  validateAdjustments,
  validatePayCycle,
  validatePayList,
  type AdjustmentDraft,
  type PayCycleDraft,
  type PayLineDraft,
  type Payslip,
} from "@/lib/payroll-payruns";

const TODAY = new Date(2026, 9, 12); // 12 Oct 2026, local

beforeEach(() => {
  vi.clearAllMocks();
});

const ok = <T,>(data: T, extra: Record<string, unknown> = {}) => ({
  data: { success: true, message: "ok", data, ...extra },
});

/** An axios failure carrying the server's envelope, as sole-ocr sends it. */
function serverError(status: number, data: unknown): AxiosError {
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  });
}

function decrypted(body: unknown): Record<string, unknown> {
  const envelope = body as { data?: unknown };
  if (typeof envelope?.data !== "string") throw new Error("Body was not an encrypted {data} envelope");
  return decryptPayload(envelope.data);
}

function line(overrides: Partial<PayLineDraft> = {}): PayLineDraft {
  return {
    employeeId: "emp-1",
    eusername: "mthompson",
    included: true,
    note: "Ordinary hours",
    rate: "38.50",
    hours: "76",
    mult: "1",
    class: "",
    ...overrides,
  };
}

function adjustment(overrides: Partial<AdjustmentDraft> = {}): AdjustmentDraft {
  return {
    key: "a",
    eusername: "mthompson",
    note: "Phone allowance",
    rate: "25",
    mult: "1",
    class: "",
    ...overrides,
  };
}

function cycle(overrides: Partial<PayCycleDraft> = {}): PayCycleDraft {
  return {
    startDate: "2026-10-20",
    endDate: "2026-11-02",
    paymentDate: "2026-11-03",
    period: "fortnightly",
    runsInYear: "26",
    runUnworkedPh: false,
    ...overrides,
  };
}

function slip(overrides: Partial<Payslip> = {}): Payslip {
  return {
    id: "ps",
    employeeId: "emp-1",
    employeeName: "Mia Thompson",
    employmentType: "Full time",
    hours: 80,
    normalHours: 76,
    additionalHours: 4,
    gross: 3157,
    tax: 612,
    net: 2558,
    superAmount: 351.12,
    superFund: null,
    superMemberNo: null,
    payItems: [],
    expenses: [],
    deductions: [],
    deductionTotal: 0,
    leaveAccrual: [],
    hasIssue: false,
    diffPercent: null,
    mkSlipId: null,
    ...overrides,
  };
}

describe("list filters", () => {
  it("offers the current year and the five before it", () => {
    expect(payrunYearOptions(TODAY)).toEqual(["2026", "2025", "2024", "2023", "2022", "2021"]);
  });

  it("turns a date range into local start and end dates", () => {
    expect(payrunDateRangeBounds("all", TODAY)).toEqual({});
    expect(payrunDateRangeBounds("last_7_days", TODAY)).toEqual({
      startDate: "2026-10-05",
      endDate: "2026-10-12",
    });
    expect(payrunDateRangeBounds("last_90_days", TODAY)).toEqual({
      startDate: "2026-07-14",
      endDate: "2026-10-12",
    });
    expect(payrunDateRangeBounds("this_year", TODAY)).toEqual({
      startDate: "2026-01-01",
      endDate: "2026-10-12",
    });
  });

  it("leaves defaults out of the list params", () => {
    expect(
      payrunListParams({ page: 1, limit: 10, tab: "all", search: "  ", filters: EMPTY_PAYRUN_FILTERS, today: TODAY }),
    ).toEqual({ page: 1, limit: 10 });
  });

  it("sends every non-default filter", () => {
    expect(
      payrunListParams({
        page: 2,
        limit: 25,
        tab: "COMPLETED",
        search: " 14 ",
        filters: { period: "weekly", dateRange: "last_30_days", year: "2026", sortBy: "oldest_first" },
        today: TODAY,
      }),
    ).toEqual({
      page: 2,
      limit: 25,
      status: "COMPLETED",
      search: "14",
      year: "2026",
      sortBy: "oldest_first",
      period: "weekly",
      startDate: "2026-09-12",
      endDate: "2026-10-12",
    });
  });

  it("counts the popover settings that differ from the default", () => {
    expect(activePayrunFilterCount(EMPTY_PAYRUN_FILTERS)).toBe(0);
    expect(
      activePayrunFilterCount({ ...EMPTY_PAYRUN_FILTERS, period: "monthly", sortBy: "payment_high_low" }),
    ).toBe(2);
  });

  it("links to a run with its year", () => {
    expect(payrunHref({ mkRunId: "14", mkYear: "2026" })).toBe("/payroll/payruns/14?year=2026");
  });
});

describe("what a status allows", () => {
  it("only offers payslips on a finished run", () => {
    expect(payrunHasPayslips("COMPLETED")).toBe(true);
    expect(payrunHasPayslips("PROCESSED")).toBe(true);
    expect(payrunHasPayslips("DRAFT")).toBe(false);
    expect(payrunActionBlock("DRAFT", "download")).toMatch(/completed/);
    expect(payrunActionBlock("COMPLETED", "email")).toBeUndefined();
  });

  it("won't delete or re-complete a completed run", () => {
    expect(payrunActionBlock("COMPLETED", "delete")).toBe("Completed runs can't be deleted");
    expect(payrunActionBlock("COMPLETED", "complete")).toMatch(/already/);
    expect(payrunActionBlock("DRAFT", "delete")).toBeUndefined();
    expect(payrunActionBlock("FAILED", "complete")).toMatch(/failed/i);
    expect(payrunActionBlock("IN_PROGRESS", "complete")).toBeUndefined();
  });
});

describe("compare", () => {
  it("allows two to five runs", () => {
    expect(canComparePayruns(1)).toBe(false);
    expect(canComparePayruns(2)).toBe(true);
    expect(canComparePayruns(5)).toBe(true);
    expect(canComparePayruns(6)).toBe(false);
  });

  it("only sends the year when every run shares it", () => {
    expect(
      compareParams([
        { mkRunId: "13", mkYear: "2026" },
        { mkRunId: "14", mkYear: "2026" },
      ]),
    ).toEqual({ runIds: "13,14", year: "2026" });
    expect(
      compareParams([
        { mkRunId: "26", mkYear: "2025" },
        { mkRunId: "14", mkYear: "2026" },
      ]),
    ).toEqual({ runIds: "26,14" });
  });

  it("names the outcome for an employee", () => {
    const base = { grossDiff: 0, grossPct: 0, netDiff: 0, hoursDiff: 0, isNew: false, isRemoved: false, hasLargeVariance: false };
    expect(compareOutcome({ ...base, isNew: true })).toBe("New employee");
    expect(compareOutcome({ ...base, isRemoved: true })).toBe("Removed");
    expect(compareOutcome({ ...base, hasLargeVariance: true })).toBe("Review variance");
    expect(compareOutcome(base)).toBe("Normal");
  });

  it("signs a change", () => {
    expect(signedMoney(120)).toBe("+$120.00");
    expect(signedMoney(-50.5)).toBe("−$50.50");
    expect(signedMoney(0)).toBe("$0.00");
    expect(signedMoney(null)).toBe("—");
    expect(signedNumber(-2.5, "h")).toBe("−2.5h");
    expect(signedNumber(4)).toBe("+4");
  });
});

describe("detail", () => {
  it("prefers the summary and falls back to summing payslips", () => {
    const payslips = [slip(), slip({ gross: 1000.1, tax: 100, net: 900.1 })];
    expect(
      payrunTotals({ summary: { totalGross: 5000, totalTax: null, totalNet: null, issueCount: 0 }, payslips }),
    ).toEqual({ gross: 5000, tax: 712, net: 3458.1 });
  });

  it("sums normal and additional hours from the payslips", () => {
    expect(
      payrunHours([slip(), slip({ hours: 30, normalHours: null, additionalHours: null })]),
    ).toEqual({ normal: 106, additional: 4, total: 110 });
  });

  it("matches issues by employee id or name", () => {
    const issues = [
      { employeeId: "emp-1", employeeName: "Someone", type: "NO_TFN", message: "a" },
      { employeeId: null, employeeName: "Mia Thompson", type: "TAX_WARNING", message: "b" },
      { employeeId: "emp-2", employeeName: "Liam", type: "X", message: "c" },
    ];
    expect(issuesForPayslip(issues, slip()).map((issue) => issue.message)).toEqual(["a", "b"]);
    expect(issueLabel("MISSING_SUPER")).toBe("Missing superannuation");
    expect(issueLabel("UNKNOWN")).toBeNull();
  });
});

describe("pay cycle", () => {
  it("knows how many runs each period has", () => {
    expect(runsInYearFor("weekly")).toBe(52);
    expect(runsInYearFor("fortnightly")).toBe(26);
    expect(runsInYearFor("semi-monthly")).toBe(24);
    expect(runsInYearFor("monthly")).toBe(12);
    expect(runsInYearFor("daily")).toBeNull();
  });

  it("defaults to a fortnight from today", () => {
    expect(defaultPayCycle("2026-10-12")).toEqual({
      startDate: "2026-10-12",
      endDate: "2026-10-25",
      paymentDate: "2026-10-26",
      period: "fortnightly",
      runsInYear: "26",
      runUnworkedPh: false,
    });
  });

  it("follows the last cycle's suggestion", () => {
    expect(
      defaultPayCycle("2026-10-12", {
        lastCycle: { period: "weekly" },
        suggestedNext: { startDate: "2026-10-13", endDate: "2026-10-19" },
      }),
    ).toMatchObject({
      startDate: "2026-10-13",
      endDate: "2026-10-19",
      paymentDate: "2026-10-20",
      period: "weekly",
      runsInYear: "52",
    });
  });

  it("keeps fortnightly when the last period isn't one it knows", () => {
    expect(
      defaultPayCycle("2026-10-12", {
        lastCycle: { period: "quarterly" },
        suggestedNext: { startDate: "2026-10-13", endDate: "2026-10-26" },
      }),
    ).toMatchObject({ period: "fortnightly", runsInYear: "26", paymentDate: "2026-10-27" });
  });

  it("requires all three dates", () => {
    expect(validatePayCycle(cycle({ startDate: "", endDate: "", paymentDate: "" }))).toEqual({
      startDate: "Start date is required.",
      endDate: "End date is required.",
      paymentDate: "Payment date is required.",
    });
  });

  it("keeps the dates in order", () => {
    expect(validatePayCycle(cycle({ endDate: "2026-10-19" })).endDate).toBe(
      "End date cannot be before the start date.",
    );
    expect(validatePayCycle(cycle({ paymentDate: "2026-11-01" })).paymentDate).toBe(
      "Payment date must be on or after the pay period end date.",
    );
    expect(validatePayCycle(cycle({ paymentDate: "2026-11-02" }))).toEqual({});
  });

  it("holds weekly and fortnightly periods to their length", () => {
    expect(validatePayCycle(cycle({ endDate: "2026-11-03", paymentDate: "2026-11-04" })).endDate).toBe(
      "A fortnightly period is 14 days — it should end on 2 Nov 2026.",
    );
    expect(
      validatePayCycle(cycle({ period: "weekly", endDate: "2026-10-26", paymentDate: "2026-10-27" })),
    ).toEqual({});
  });

  it("keeps weekly and fortnightly periods on the last run's calendar", () => {
    const last = {
      lastCycle: { period: "fortnightly", endDate: "2026-10-12" },
      suggestedNext: { startDate: "2026-10-13", endDate: "2026-10-26" },
    };
    expect(validatePayCycle(cycle(), last).endDate).toBe(
      "Doesn't line up with your Microkeeper pay calendar — your last fortnightly run ended 12 Oct 2026, so try ending on 9 Nov 2026.",
    );
    expect(
      validatePayCycle(
        cycle({ startDate: "2026-10-27", endDate: "2026-11-09", paymentDate: "2026-11-10" }),
        last,
      ),
    ).toEqual({});
    // Another period's history says nothing about this one's calendar.
    expect(validatePayCycle(cycle(), { ...last, lastCycle: { period: "weekly", endDate: "2026-10-12" } })).toEqual({});
  });

  it("ends monthly periods on the month end, as Microkeeper requires", () => {
    const monthly = (startDate: string, endDate: string) =>
      validatePayCycle(cycle({ period: "monthly", runsInYear: "12", startDate, endDate, paymentDate: "2026-12-01" }));
    expect(monthly("2026-10-29", "2026-11-28").endDate).toBe(
      "A monthly period ends on the last day of the month — 30 Nov 2026.",
    );
    expect(monthly("2026-11-02", "2026-11-30").startDate).toBe(
      "A monthly period ending 30 Nov 2026 starts on 1 Nov 2026.",
    );
    expect(monthly("2026-11-01", "2026-11-30")).toEqual({});
  });

  it("ends semi-monthly periods on the 15th or the month end", () => {
    const semi = (startDate: string, endDate: string) =>
      validatePayCycle(cycle({ period: "semi-monthly", runsInYear: "24", startDate, endDate, paymentDate: "2026-12-01" }));
    expect(semi("2026-11-01", "2026-11-15")).toEqual({});
    expect(semi("2026-11-16", "2026-11-30")).toEqual({});
    expect(semi("2026-11-01", "2026-11-14").endDate).toBe(
      "A semi-monthly period ends on the 15th or the last day of the month.",
    );
  });

  it("derives a period from its start", () => {
    expect(payPeriodFor("2026-10-29", "weekly")).toEqual({ startDate: "2026-10-29", endDate: "2026-11-04" });
    expect(payPeriodFor("2026-02-10", "monthly")).toEqual({ startDate: "2026-02-01", endDate: "2026-02-28" });
    expect(payPeriodFor("2026-11-20", "semi-monthly")).toEqual({ startDate: "2026-11-16", endDate: "2026-11-30" });
  });

  it("snaps a monthly suggestion to the month end", () => {
    expect(
      defaultPayCycle("2026-10-12", {
        lastCycle: { period: "monthly" },
        suggestedNext: { startDate: "2026-11-01", endDate: "2026-11-30" },
      }),
    ).toMatchObject({ startDate: "2026-11-01", endDate: "2026-11-30", paymentDate: "2026-12-01" });
    expect(
      defaultPayCycle("2026-10-12", {
        lastCycle: { period: "monthly" },
        suggestedNext: { startDate: "2026-12-01", endDate: "2026-12-30" },
      }),
    ).toMatchObject({ endDate: "2026-12-31" });
  });

  it("bounds runs in year", () => {
    expect(validatePayCycle(cycle({ runsInYear: "367" })).runsInYear).toBeDefined();
    expect(validatePayCycle(cycle({ runsInYear: "2.5" })).runsInYear).toBeDefined();
    expect(validatePayCycle(cycle({ runsInYear: "" })).runsInYear).toBeDefined();
    expect(validatePayCycle(cycle({ runsInYear: "0" })).runsInYear).toBeUndefined();
  });
});

describe("pay list and adjustments", () => {
  it("starts each employee on ordinary hours", () => {
    expect(
      defaultPayLine({ id: "emp-1", eusername: "mthompson", name: "Mia", employmentType: null }),
    ).toEqual({
      employeeId: "emp-1",
      eusername: "mthompson",
      included: true,
      note: "Ordinary hours",
      rate: "",
      hours: "",
      mult: "1",
      class: "",
    });
  });

  it("works out gross per line", () => {
    expect(payLineGross(line())).toBe(2926);
    expect(payLineGross(line({ hours: "4", mult: "1.5" }))).toBe(231);
    expect(payLineGross(line({ mult: "" }))).toBe(2926);
    expect(payLineGross(line({ rate: "" }))).toBe(0);
    expect(adjustmentTotal(adjustment({ rate: "12.5", mult: "2" }))).toBe(25);
  });

  it("totals only the included lines", () => {
    expect(
      payrunDraftTotals(
        [line(), line({ employeeId: "emp-2", eusername: "x", included: false, hours: "10" }), line({ employeeId: "emp-3", rate: "34.2", hours: "45.6" })],
        [adjustment(), adjustment({ rate: "20" })],
        [adjustment({ rate: "12" })],
      ),
    ).toEqual({ included: 2, excluded: 1, hours: 121.6, gross: 4485.52, expenses: 45, deductions: 12 });
  });

  it("needs someone included, each with a complete line", () => {
    expect(validatePayList([line({ included: false })])).toBe("Include at least one employee.");
    expect(validatePayList([line({ hours: "" })])).toMatch(/positive rate, hours and multiplier/);
    expect(validatePayList([line({ note: "  " })])).toMatch(/description/);
    expect(validatePayList([line({ mult: "0" })])).not.toBeNull();
    expect(validatePayList([line(), line({ included: false, rate: "" })])).toBeNull();
  });

  it("validates expenses and deductions", () => {
    const included = includedUsernames([line()]);
    expect(validateAdjustments([], included, "Expense")).toBeNull();
    expect(validateAdjustments([adjustment()], included, "Expense")).toBeNull();
    expect(validateAdjustments([adjustment({ rate: "0" })], included, "Deduction")).toBeNull();
    expect(validateAdjustments([adjustment({ eusername: "someone" })], included, "Expense")).toBe(
      "Expenses can only be added for employees included in the pay list.",
    );
    expect(validateAdjustments([adjustment({ eusername: "" })], included, "Deduction")).toBe(
      "Complete every deduction item before continuing.",
    );
    expect(validateAdjustments([adjustment({ rate: "" })], included, "Expense")).not.toBeNull();
    expect(validateAdjustments([adjustment({ rate: "abc" })], included, "Expense")).not.toBeNull();
    expect(validateAdjustments([adjustment({ rate: "-1" })], included, "Expense")).not.toBeNull();
    expect(validateAdjustments([adjustment({ mult: "0" })], included, "Expense")).not.toBeNull();
  });
});

describe("buildCreatePayrunPayload", () => {
  it("sends the cycle, the included lines and the adjustments", () => {
    const payload = buildCreatePayrunPayload(
      cycle({ runUnworkedPh: true }),
      [
        line({ note: " Ordinary hours ", class: " ORD " }),
        line({ employeeId: "emp-2", eusername: "lnguyen", included: false }),
        line({ employeeId: "emp-3", eusername: "cpatel", rate: "34.20", hours: "45.6", mult: "1" }),
      ],
      [adjustment({ note: " Phone allowance ", class: "ALW" })],
      [adjustment({ eusername: "cpatel", note: "Social club", rate: "5" })],
    );
    expect(payload).toEqual({
      startDate: "2026-10-20",
      endDate: "2026-11-02",
      paymentDate: "2026-11-03",
      period: "fortnightly",
      runsInYear: 26,
      runUnworkedPh: true,
      activeStaff: 2,
      payList: [
        { eusername: "mthompson", note: "Ordinary hours", rate: 38.5, hours: 76, mult: 1, class: "ORD" },
        { eusername: "cpatel", note: "Ordinary hours", rate: 34.2, hours: 45.6, mult: 1 },
      ],
      expList: [{ eusername: "mthompson", note: "Phone allowance", rate: 25, mult: 1, class: "ALW" }],
      dedList: [{ eusername: "cpatel", note: "Social club", rate: 5, mult: 1 }],
    });
  });
});

describe("profile completeness", () => {
  const complete = { employeeId: "emp-1", employeeName: "Mia", isComplete: true, totalMissingFields: 0, missing: {} };
  const incomplete = { employeeId: "emp-2", employeeName: "Jack O'Brien", isComplete: false, totalMissingFields: 3, missing: {} };

  it("only counts included employees", () => {
    const lines = [line(), line({ employeeId: "emp-2", included: false })];
    expect(incompleteProfiles(lines, { "emp-1": complete, "emp-2": incomplete })).toEqual([]);
    expect(
      incompleteProfiles([line(), line({ employeeId: "emp-2" })], { "emp-1": complete, "emp-2": incomplete }),
    ).toEqual([incomplete]);
  });

  it("summarises what's missing", () => {
    expect(completenessSummary(incomplete)).toBe("Jack O'Brien: 3 missing fields");
    expect(completenessSummary({ ...incomplete, totalMissingFields: 1 })).toBe("Jack O'Brien: 1 missing field");
    expect(completenessSummary({ ...incomplete, checkFailed: true })).toMatch(/couldn't check/);
  });
});

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

const RUN = { mkRunId: "14", mkYear: "2026" };

describe("fetchPayruns", () => {
  it("sends the params and maps snake_case rows, string numbers included", async () => {
    apiMock.get.mockResolvedValue(
      ok(
        [
          {
            id: 31,
            mk_run_id: "14",
            mk_year: "2026",
            period: "Fortnightly",
            start_date: "2026-09-22",
            end_date: "2026-10-05",
            payment_date: "2026-10-06T00:00:00.000Z",
            payment_total: "6860.58",
            expense_total: null,
            deduction_total: "267.00",
            employeeCount: 4,
            status: "COMPLETED",
          },
        ],
        { pagination: { total: "13", page: 2, limit: 12, totalPages: 2 } },
      ),
    );
    const params = { page: 2, limit: 12, status: "COMPLETED" as const, year: "2026" };
    const page = await fetchPayruns(params);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.payroll.payruns, { params });
    expect(page.total).toBe(13);
    expect(page.totalPages).toBe(2);
    expect(page.rows[0]).toEqual({
      id: "31",
      mkRunId: "14",
      mkYear: "2026",
      period: "fortnightly",
      startDate: "2026-09-22",
      endDate: "2026-10-05",
      paymentDate: "2026-10-06",
      paymentTotal: 6860.58,
      expenseTotal: 0,
      deductionTotal: 267,
      employeeCount: 4,
      status: "COMPLETED",
    });
  });

  it("throws the server's message", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "Invalid pagination." } });
    await expect(fetchPayruns({ page: 1, limit: 10 })).rejects.toThrow("Invalid pagination.");
  });
});

describe("fetchPayrunStatusCounts", () => {
  it("maps every count", async () => {
    apiMock.get.mockResolvedValue(ok({ all: "5", draft: 1, inProgress: 2, completed: 2 }));
    expect(await fetchPayrunStatusCounts()).toEqual({
      all: 5,
      draft: 1,
      inProgress: 2,
      completed: 2,
      failed: 0,
    });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.payroll.payrunStatusCounts);
  });
});

describe("fetchPayrunDetail", () => {
  it("asks by run id and year, and maps payslips defensively", async () => {
    apiMock.get.mockResolvedValue(
      ok({
        id: 31,
        mkRunId: "14",
        mkYear: "2026",
        status: "IN_PROGRESS",
        period: "fortnightly",
        startDate: "2026-09-22",
        endDate: "2026-10-05",
        paymentDate: "2026-10-06",
        summary: { totalGross: 3157, totalTax: "612.00", totalNet: 2558, issueCount: 1 },
        payslips: [
          {
            id: 7,
            employeeId: 12,
            employeeName: "Mia Thompson",
            employmentType: "FULL_TIME",
            gross: 3157,
            tax: "612.00",
            net: 2558,
            hours: "80.00",
            normalHours: 76,
            additionalHours: 4,
            superAmount: "351.12",
            deduction: "12.00",
            diffPercent: 12,
            hasIssue: true,
            mkSlipId: "991",
            payItems: [{ note: "Ordinary", class: "ORD", rate: "38.50", hours: "76.00", mult: "1.00", value: "2926.00" }],
            expenses: [{ note: "Phone", rate: "25.00", mult: null, value: "25.00" }],
            deductions: [{ note: "Union fee", rate: "12.00", mult: "1", value: "12.00" }],
            leaveAccrual: [{ type: "al", accrual: "5.85", balance: "86.42" }],
            superDetails: { employer_super_fund: "AustralianSuper", employer_member_number: "40211873" },
          },
          { id: 8, employeeId: null, employeeName: null, superDetails: null },
        ],
      }),
    );
    const detail = await fetchPayrunDetail(RUN);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.payroll.payrunDetail("14"), {
      params: { year: "2026" },
    });
    expect(detail.summary).toEqual({ totalGross: 3157, totalTax: 612, totalNet: 2558, issueCount: 1 });
    const [mia, unknown] = detail.payslips;
    expect(mia).toMatchObject({
      id: "7",
      employeeId: "12",
      employmentType: "Full time",
      tax: 612,
      hours: 80,
      superAmount: 351.12,
      superFund: "AustralianSuper",
      superMemberNo: "40211873",
      deductionTotal: 12,
      mkSlipId: "991",
      hasIssue: true,
      diffPercent: 12,
    });
    expect(mia.payItems[0]).toEqual({ note: "Ordinary", class: "ORD", rate: 38.5, hours: 76, mult: 1, value: 2926 });
    expect(mia.expenses[0]).toEqual({ note: "Phone", rate: 25, mult: 1, value: 25 });
    expect(mia.leaveAccrual).toEqual([{ type: "Annual leave", balance: 86.42, accrual: 5.85 }]);
    expect(unknown).toMatchObject({
      employeeId: "",
      employeeName: "Unknown",
      superFund: null,
      superAmount: null,
      payItems: [],
      leaveAccrual: [],
      diffPercent: null,
    });
  });
});

describe("fetchPayrunIssues", () => {
  it("reads the issues out of { total, issues }", async () => {
    apiMock.get.mockResolvedValue(
      ok({
        total: 2,
        issues: [
          { employeeId: 12, employeeName: "Mia", type: "LARGE_VARIANCE", message: "Pay changed by 12%" },
          { employeeId: null, employeeName: "Ghost", type: "UNMATCHED_EMPLOYEE", message: "Not linked" },
        ],
      }),
    );
    const issues = await fetchPayrunIssues(RUN);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.payroll.payrunIssues("14"), {
      params: { year: "2026" },
    });
    expect(issues).toEqual([
      { employeeId: "12", employeeName: "Mia", type: "LARGE_VARIANCE", message: "Pay changed by 12%" },
      { employeeId: null, employeeName: "Ghost", type: "UNMATCHED_EMPLOYEE", message: "Not linked" },
    ]);
  });
});

describe("fetchPayrunCompare", () => {
  it("maps summary.payruns and each employee's diff", async () => {
    apiMock.get.mockResolvedValue(
      ok({
        summary: {
          payruns: [
            { mkRunId: "13", status: "COMPLETED", startDate: "2026-09-08", endDate: "2026-09-21", employeeCount: 3, totals: { gross: "6000", net: 4800, hours: 200 } },
          ],
        },
        employees: [
          { employeeId: 12, employeeName: "Mia", diff: { grossDiff: "231", grossPct: 8, netDiff: null, hoursDiff: 4, isNew: false, isRemoved: false, hasLargeVariance: false } },
        ],
      }),
    );
    const result = await fetchPayrunCompare({ runIds: "13,14", year: "2026" });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.payroll.payrunCompare, {
      params: { runIds: "13,14", year: "2026" },
    });
    expect(result.runs[0]).toEqual({
      mkRunId: "13",
      status: "COMPLETED",
      startDate: "2026-09-08",
      endDate: "2026-09-21",
      totals: { gross: 6000, net: 4800, hours: 200 },
      employeeCount: 3,
    });
    expect(result.employees[0].diff).toEqual({
      grossDiff: 231,
      grossPct: 8,
      netDiff: null,
      hoursDiff: 4,
      isNew: false,
      isRemoved: false,
      hasLargeVariance: false,
    });
  });

  it("throws the server's message", async () => {
    apiMock.get.mockRejectedValue(new Error("Compare between 2 and 5 payruns."));
    await expect(fetchPayrunCompare({ runIds: "1" })).rejects.toThrow("Compare between 2 and 5");
  });
});

describe("wizard data", () => {
  it("loads synced employees, dropping any without a Microkeeper username", async () => {
    apiMock.get.mockResolvedValue(
      ok([
        { id: 12, given_name: "Mia", surname: "Thompson", eusername: "mthompson", employment_type: "FULL_TIME" },
        { id: 13, given_name: "No", surname: "Username", eusername: null },
      ]),
    );
    expect(await fetchPayrunEmployees()).toEqual([
      { id: "12", eusername: "mthompson", name: "Mia Thompson", employmentType: "Full time" },
    ]);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.payroll.employees, {
      params: { page: 1, limit: 100, status: "SYNCED" },
    });
  });

  it("maps a completeness check", async () => {
    apiMock.get.mockResolvedValue(
      ok({ employeeId: 13, employeeName: "Jack O'Brien", isComplete: false, totalMissingFields: "2", missing: { tax: ["TFN"], banking: ["BSB"], super: null } }),
    );
    expect(await fetchProfileCompleteness("13")).toEqual({
      employeeId: "13",
      employeeName: "Jack O'Brien",
      isComplete: false,
      totalMissingFields: 2,
      missing: { tax: ["TFN"], banking: ["BSB"], super: [] },
    });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.payroll.employeeCompleteness("13"));
  });

  it("reads the period off the last run and the suggested next cycle", async () => {
    apiMock.get.mockResolvedValue(
      ok({ lastCycle: { id: 31, period: "Weekly" }, suggestedNext: { startDate: "2026-10-13", endDate: "2026-10-19" } }),
    );
    expect(await fetchPayrunLastCycle()).toEqual({
      lastCycle: { period: "weekly" },
      suggestedNext: { startDate: "2026-10-13", endDate: "2026-10-19" },
    });
  });

  it("copes with no previous run", async () => {
    apiMock.get.mockResolvedValue(ok({ lastCycle: null }));
    expect(await fetchPayrunLastCycle()).toEqual({ lastCycle: null, suggestedNext: null });
  });
});

describe("createPayrun", () => {
  it("encrypts the payload and returns the new run", async () => {
    apiMock.post.mockResolvedValue(ok({ payrunId: 40, mkRunId: "15", mkYear: "2026" }));
    const payload = buildCreatePayrunPayload(
      {
        startDate: "2026-10-20",
        endDate: "2026-11-02",
        paymentDate: "2026-11-03",
        period: "fortnightly",
        runsInYear: "26",
        runUnworkedPh: false,
      },
      [
        {
          employeeId: "12",
          eusername: "mthompson",
          included: true,
          note: "Ordinary hours",
          rate: "38.5",
          hours: "76",
          mult: "1",
          class: "",
        },
      ],
      [],
      [],
    );
    expect(await createPayrun(payload)).toEqual({ mkRunId: "15", mkYear: "2026" });
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.payroll.payruns);
    const sent = decrypted(body);
    expect(sent).toEqual({
      startDate: "2026-10-20",
      endDate: "2026-11-02",
      paymentDate: "2026-11-03",
      period: "fortnightly",
      runsInYear: 26,
      // Top-level booleans travel as strings; Joi.boolean() converts them.
      runUnworkedPh: "false",
      activeStaff: 1,
      payList: [{ eusername: "mthompson", note: "Ordinary hours", rate: 38.5, hours: 76, mult: 1 }],
      expList: [],
      dedList: [],
    });
  });

  it("shows the validation detail, then the guard's message with a billing flag", () => {
    const validation = serverError(400, {
      success: false,
      message: "Payrun validation failed.",
      error: { statusCode: 400, explanation: ['"payList[0].rate" must be a positive number'] },
    });
    expect(payrunErrorMessage(validation, "x")).toBe('"payList[0].rate" must be a positive number');
    expect(isPayrollBillingError(validation)).toBe(false);

    const guard = serverError(403, {
      success: false,
      code: "PAYROLL_BILLING_FROZEN",
      message: "Payroll operations are temporarily paused due to an overdue billing balance.",
    });
    expect(payrunErrorMessage(guard, "x")).toMatch(/temporarily paused/);
    expect(isPayrollBillingError(guard)).toBe(true);
    expect(
      isPayrollBillingError(serverError(403, { success: false, code: "PAYROLL_NOT_ACTIVE", message: "m" })),
    ).toBe(true);
    expect(payrunErrorMessage(new Error("Network down"), "x")).toBe("Network down");
  });
});

describe("run actions", () => {
  it("deletes by run id and year", async () => {
    apiMock.delete.mockResolvedValue(ok({}));
    await deletePayrun(RUN);
    expect(apiMock.delete).toHaveBeenCalledWith(apiRoutes.payroll.payrun("14"), {
      params: { year: "2026" },
    });
  });

  it("refuses with the server's message", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: false, message: "Completed payruns cannot be deleted." } });
    await expect(deletePayrun(RUN)).rejects.toThrow("Completed payruns cannot be deleted.");
  });

  it.each([
    ["complete", completePayrun, apiRoutes.payroll.payrunComplete("14")],
    ["email", emailPayslips, apiRoutes.payroll.payrunEmail("14")],
    ["duplicate", duplicatePayrun, apiRoutes.payroll.payrunDuplicate("14")],
  ] as const)("posts %s with the year and an encrypted empty body", async (_, action, url) => {
    apiMock.post.mockResolvedValue(ok({}));
    await action(RUN);
    const [sentUrl, body, config] = apiMock.post.mock.calls[0];
    expect(sentUrl).toBe(url);
    expect(decrypted(body)).toEqual({});
    expect(config).toEqual({ params: { year: "2026" } });
  });

  it("exports the CSV as a blob", async () => {
    const blob = new Blob(["Employee,Email"], { type: "text/csv" });
    apiMock.get.mockResolvedValue({ data: blob });
    expect(await exportPayrunCsv(RUN)).toBe(blob);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.payroll.payrunExport("14"), {
      params: { year: "2026" },
      responseType: "blob",
    });
    expect(payrunCsvFileName(RUN)).toBe("payrun-14.csv");
  });

  it("reads a failed export's message out of the blob", async () => {
    apiMock.get.mockRejectedValue(
      serverError(404, new Blob([JSON.stringify({ success: false, message: "Payrun not found." })])),
    );
    await expect(exportPayrunCsv(RUN)).rejects.toThrow("Payrun not found.");
  });

  it("downloads payslip HTML, for one employee when asked", async () => {
    apiMock.get.mockResolvedValue({ data: "<html><body><div>Slip</div></body></html>" });
    expect(await fetchPayslipHtml(RUN)).toContain("Slip");
    expect(apiMock.get).toHaveBeenLastCalledWith(apiRoutes.payroll.payrunDownload("14"), {
      params: { year: "2026" },
      responseType: "text",
    });
    await fetchPayslipHtml(RUN, "12");
    expect(apiMock.get).toHaveBeenLastCalledWith(apiRoutes.payroll.payrunDownload("14"), {
      params: { year: "2026", eids: "12" },
      responseType: "text",
    });
  });

  it("reads a failed download's message out of the text body", async () => {
    apiMock.get.mockRejectedValue(
      serverError(404, JSON.stringify({ success: false, message: "Payrun not found." })),
    );
    await expect(fetchPayslipHtml(RUN)).rejects.toThrow("Payrun not found.");
  });

  it("names the files", () => {
    expect(payslipsFileName(RUN)).toBe("Payslip-14-2026.pdf");
    expect(employeePayslipFileName("Jack O'Brien")).toBe("payslip-Jack-O'Brien.pdf");
  });
});

describe("payslip PDF logo swap", () => {
  it("recognises sole-webapp's logo paths", async () => {
    const { isSoleLogoPath } = await import("@/lib/payslip-pdf");
    expect(isSoleLogoPath("/images/logo.svg")).toBe(true);
    expect(isSoleLogoPath("/images/logo-spm.png")).toBe(true);
    expect(isSoleLogoPath("/static/Logo-Sole.svg")).toBe(true);
    expect(isSoleLogoPath("/uploads/firm-logo.png")).toBe(false);
  });
});
