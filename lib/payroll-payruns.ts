/**
 * Pay runs — the list, the payslips behind a run, comparing runs, and the
 * five-step create wizard.
 *
 * A pay run is created in Microkeeper and synced back; nothing here calculates
 * PAYG or super. The wizard only adds up what was typed (rate × hours × mult)
 * so the person can see the shape of the run before it's sent. Types are
 * camelCase; the real API is snake_case for list rows, so phase 2 adds mappers
 * in front of these rather than changing them.
 */

import axios from "axios";

import apiRoutes from "@/config/api-routes";
import { apiErrorMessage } from "@/lib/api-error";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { addDays, parseIsoDate, toIsoDate } from "@/lib/invoices";
import {
  PAYROLL_EMPTY,
  PAYROLL_NOT_ACTIVE_CODE,
  PAYROLL_OVERDUE_CODE,
  PAYROLL_ROOT,
  payrollErrorCode,
  payrollMoney,
  titleCase,
  type PayPeriod,
  type PayrunStatus,
} from "@/lib/payroll";
import api from "@/utils/axiosInstance";

/** Where the pay run screens live. */
export const PAYRUNS_ROOT = `${PAYROLL_ROOT}/payruns`;

/* ------------------------------------------------------------------ *
 * List
 * ------------------------------------------------------------------ */

/** One row of `GET /payruns`. */
export type PayrunRow = {
  id: string;
  mkRunId: string;
  mkYear: string;
  period: PayPeriod | string;
  startDate: string;
  endDate: string;
  paymentDate: string;
  paymentTotal: number;
  expenseTotal: number;
  deductionTotal: number;
  employeeCount: number;
  status: PayrunStatus;
};

/** `GET /payruns/status-counts`. */
export type PayrunStatusCounts = {
  all: number;
  draft: number;
  inProgress: number;
  completed: number;
  failed: number;
};

export const EMPTY_PAYRUN_COUNTS: PayrunStatusCounts = {
  all: 0,
  draft: 0,
  inProgress: 0,
  completed: 0,
  failed: 0,
};

export type PayrunTab = "all" | "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export const PAYRUN_TABS: {
  value: PayrunTab;
  label: string;
  countKey: keyof PayrunStatusCounts;
}[] = [
  { value: "all", label: "All", countKey: "all" },
  { value: "DRAFT", label: "Draft", countKey: "draft" },
  { value: "IN_PROGRESS", label: "In progress", countKey: "inProgress" },
  { value: "COMPLETED", label: "Completed", countKey: "completed" },
  { value: "FAILED", label: "Failed", countKey: "failed" },
];

export type PayrunPeriodFilter = "all" | PayPeriod;

/**
 * sole-webapp's run list offered weekly / fortnightly / monthly only, while
 * its Payroll page and the wizard both know semi-monthly — a run the wizard
 * can create should be one the list can find, so all four are here.
 */
export const PAYRUN_PERIOD_FILTERS: { value: PayrunPeriodFilter; label: string }[] = [
  { value: "all", label: "All periods" },
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "semi-monthly", label: "Semi-monthly" },
  { value: "monthly", label: "Monthly" },
];

export type PayrunDateRange =
  | "all"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "this_year";

export const PAYRUN_DATE_RANGES: { value: PayrunDateRange; label: string }[] = [
  { value: "all", label: "Any time" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "this_year", label: "This year" },
];

export type PayrunSort =
  | "newest_first"
  | "oldest_first"
  | "payment_high_low"
  | "payment_low_high"
  | "run_high_low"
  | "employees_high_low"
  | "employees_low_high";

export const DEFAULT_PAYRUN_SORT: PayrunSort = "newest_first";

export const PAYRUN_SORTS: { value: PayrunSort; label: string }[] = [
  { value: "newest_first", label: "Newest first" },
  { value: "oldest_first", label: "Oldest first" },
  { value: "payment_high_low", label: "Payment: high to low" },
  { value: "payment_low_high", label: "Payment: low to high" },
  { value: "run_high_low", label: "Run ID: high to low" },
  { value: "employees_high_low", label: "Staff: most first" },
  { value: "employees_low_high", label: "Staff: fewest first" },
];

/** The filters that live in the popover, as chosen. */
export type PayrunFilters = {
  period: PayrunPeriodFilter;
  dateRange: PayrunDateRange;
  year: string; // "all" or a four-digit year
  sortBy: PayrunSort;
};

export const EMPTY_PAYRUN_FILTERS: PayrunFilters = {
  period: "all",
  dateRange: "all",
  year: "all",
  sortBy: DEFAULT_PAYRUN_SORT,
};

/** How many popover settings differ from the default, for the trigger badge. */
export function activePayrunFilterCount(filters: PayrunFilters): number {
  let count = 0;
  if (filters.period !== "all") count += 1;
  if (filters.dateRange !== "all") count += 1;
  if (filters.year !== "all") count += 1;
  if (filters.sortBy !== DEFAULT_PAYRUN_SORT) count += 1;
  return count;
}

/** The current year and the five before it — the same window sole-webapp offers. */
export function payrunYearOptions(today: Date = new Date()): string[] {
  const year = today.getFullYear();
  return Array.from({ length: 6 }, (_, index) => String(year - index));
}

/**
 * A date-range choice as the API's `startDate`/`endDate`.
 *
 * sole-webapp sent only `startDate`, worked out in UTC via `toISOString` — so
 * an Australian morning landed on yesterday. Both ends are local dates here,
 * and the range ends today.
 */
export function payrunDateRangeBounds(
  range: PayrunDateRange,
  today: Date = new Date(),
): { startDate?: string; endDate?: string } {
  if (range === "all") return {};
  const endDate = toIsoDate(today);
  if (range === "this_year") {
    return { startDate: `${today.getFullYear()}-01-01`, endDate };
  }
  const days = range === "last_7_days" ? 7 : range === "last_30_days" ? 30 : 90;
  return { startDate: addDays(endDate, -days), endDate };
}

/** `GET /payruns` query params, with the defaults left out as sole-webapp did. */
export type PayrunListParams = {
  page: number;
  limit: number;
  status?: Exclude<PayrunTab, "all">;
  search?: string;
  year?: string;
  sortBy?: PayrunSort;
  period?: PayPeriod;
  startDate?: string;
  endDate?: string;
};

export function payrunListParams({
  page,
  limit,
  tab,
  search,
  filters,
  today = new Date(),
}: {
  page: number;
  limit: number;
  tab: PayrunTab;
  search: string;
  filters: PayrunFilters;
  today?: Date;
}): PayrunListParams {
  const term = search.trim();
  return {
    page,
    limit,
    ...(tab !== "all" ? { status: tab } : {}),
    ...(term ? { search: term } : {}),
    ...(filters.year !== "all" ? { year: filters.year } : {}),
    ...(filters.sortBy !== DEFAULT_PAYRUN_SORT ? { sortBy: filters.sortBy } : {}),
    ...(filters.period !== "all" ? { period: filters.period } : {}),
    ...payrunDateRangeBounds(filters.dateRange, today),
  };
}

export type PayrunPage = {
  rows: PayrunRow[];
  total: number;
  totalPages: number;
};

/** Where a run's full detail lives. The run ID is only unique within its year. */
export function payrunHref(run: { mkRunId: string; mkYear: string }): string {
  return `${PAYRUNS_ROOT}/${encodeURIComponent(run.mkRunId)}?year=${encodeURIComponent(run.mkYear)}`;
}

/** "Run 2026/14" — the run's name everywhere it's shown. */
export function payrunName(run: { mkRunId: string; mkYear: string }): string {
  return `Run ${run.mkYear}/${run.mkRunId}`;
}

/* ------------------------------------------------------------------ *
 * What a run's status allows
 * ------------------------------------------------------------------ */

const FINISHED: readonly string[] = ["COMPLETED", "PROCESSED", "LOCKED"];

/** Payslips exist once Microkeeper has finished the run. */
export function payrunHasPayslips(status: string): boolean {
  return FINISHED.includes(status);
}

export type PayrunAction = "payslips" | "download" | "email" | "complete" | "delete";

/**
 * Why an action doesn't apply to a run, or undefined when it does — the
 * platform rule is to disable with a reason rather than hide. Used by the row
 * menu and to decide which selected rows a bulk action touches.
 */
export function payrunActionBlock(
  status: string,
  action: PayrunAction,
): string | undefined {
  const finished = FINISHED.includes(status);
  switch (action) {
    case "payslips":
    case "download":
    case "email":
      return finished ? undefined : "Payslips are ready once the run is completed";
    case "complete":
      if (finished) return "This run is already completed";
      if (status === "FAILED") return "A failed run can't be completed — duplicate it and try again";
      return undefined;
    case "delete":
      return finished ? "Completed runs can't be deleted" : undefined;
  }
}

/** Between two and five runs, as `GET /payruns/compare` allows. */
export function canComparePayruns(count: number): boolean {
  return count >= 2 && count <= 5;
}

/** `year` is only sent when every selected run shares one. */
export function compareParams(runs: { mkRunId: string; mkYear: string }[]): {
  runIds: string;
  year?: string;
} {
  const years = [...new Set(runs.map((run) => run.mkYear))];
  return {
    runIds: runs.map((run) => run.mkRunId).join(","),
    ...(years.length === 1 ? { year: years[0] } : {}),
  };
}

/* ------------------------------------------------------------------ *
 * Detail, payslips and issues
 * ------------------------------------------------------------------ */

export type PayslipItem = {
  note: string;
  class: string;
  rate: number;
  hours: number;
  mult: number;
  value: number;
};

export type PayslipAdjustment = {
  note: string;
  rate: number;
  mult: number;
  value: number;
};

export type LeaveAccrual = { type: string; balance: number; accrual: number };

export type Payslip = {
  id: string;
  employeeId: string;
  employeeName: string;
  employmentType: string | null;
  hours: number;
  normalHours: number | null;
  additionalHours: number | null;
  gross: number;
  tax: number;
  net: number;
  /** `super` / `superAmount` in the API — one figure either way. */
  superAmount: number | null;
  /** `superDetails.fund` or `super_fund`. */
  superFund: string | null;
  /** `superDetails.memberNo` or `super_no`. */
  superMemberNo: string | null;
  payItems: PayslipItem[];
  expenses: PayslipAdjustment[];
  deductions: PayslipAdjustment[];
  deductionTotal: number | null;
  leaveAccrual: LeaveAccrual[];
  hasIssue: boolean;
  /** Gross change against the previous run, as a percentage. */
  diffPercent: number | null;
  /** Microkeeper's own slip id — how a payslip with no linked employee is downloaded. */
  mkSlipId: string | null;
};

/** `GET /payruns/{id}/detail?year=`. */
export type PayrunDetail = {
  status: PayrunStatus;
  period: PayPeriod | string;
  startDate: string;
  endDate: string;
  paymentDate: string;
  mkYear: string;
  mkRunId: string;
  summary: {
    totalGross: number | null;
    totalTax: number | null;
    totalNet: number | null;
    issueCount: number | null;
  };
  payslips: Payslip[];
};

export type PayrunIssue = {
  employeeId: string | null;
  employeeName: string;
  type: string;
  message: string;
};

export const ISSUE_TYPE_LABELS: Record<string, string> = {
  MISSING_SUPER: "Missing superannuation",
  HIGH_PAY_ALERT: "High pay alert",
  INCOMPLETE_PROFILE: "Incomplete profile",
  TAX_WARNING: "Tax warning",
  STUB_EMAIL: "Placeholder email",
  PROFILE_WARNING: "Profile warning",
  NO_TFN: "No TFN — taxed at top marginal rate",
  MISSING_TFN: "No TFN — taxed at top marginal rate",
  LARGE_VARIANCE: "Large variance",
  UNMATCHED_EMPLOYEE: "Unmatched employee",
};

export function issueLabel(type: string): string | null {
  return ISSUE_TYPE_LABELS[type] ?? null;
}

/** An issue belongs to a payslip by employee id, or by name where the id is missing. */
export function issuesForPayslip(
  issues: PayrunIssue[],
  slip: Pick<Payslip, "employeeId" | "employeeName">,
): PayrunIssue[] {
  return issues.filter(
    (issue) =>
      (issue.employeeId != null && String(issue.employeeId) === String(slip.employeeId)) ||
      issue.employeeName === slip.employeeName,
  );
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The run's headline figures. The summary is the source; where it's missing a
 * figure, the payslips are summed instead, as sole-webapp's drawer did.
 */
export function payrunTotals(detail: Pick<PayrunDetail, "summary" | "payslips">): {
  gross: number;
  tax: number;
  net: number;
} {
  const sum = (pick: (slip: Payslip) => number) =>
    round2(detail.payslips.reduce((total, slip) => total + (pick(slip) || 0), 0));
  return {
    gross: detail.summary.totalGross ?? sum((slip) => slip.gross),
    tax: detail.summary.totalTax ?? sum((slip) => slip.tax),
    net: detail.summary.totalNet ?? sum((slip) => slip.net),
  };
}

/** Normal and additional hours across a run, from the payslips' own fields. */
export function payrunHours(payslips: Payslip[]): {
  normal: number;
  additional: number;
  total: number;
} {
  let normal = 0;
  let additional = 0;
  let total = 0;
  for (const slip of payslips) {
    normal += slip.normalHours ?? slip.hours ?? 0;
    additional += slip.additionalHours ?? 0;
    total += slip.hours ?? 0;
  }
  return { normal: round2(normal), additional: round2(additional), total: round2(total) };
}

export function sumValues(rows: { value: number }[]): number {
  return round2(rows.reduce((total, row) => total + (row.value || 0), 0));
}

/** "38.50" style hours, without trailing noise. */
export function formatHours(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return PAYROLL_EMPTY;
  return value.toLocaleString("en-AU", { maximumFractionDigits: 2 });
}

/* ------------------------------------------------------------------ *
 * Compare
 * ------------------------------------------------------------------ */

export type PayrunCompareRun = {
  mkRunId: string;
  status: PayrunStatus;
  startDate: string;
  endDate: string;
  totals: { gross: number; net: number; hours: number };
  employeeCount: number;
};

export type PayrunCompareDiff = {
  grossDiff: number | null;
  grossPct: number | null;
  netDiff: number | null;
  hoursDiff: number | null;
  isNew: boolean;
  isRemoved: boolean;
  hasLargeVariance: boolean;
};

export type PayrunCompare = {
  runs: PayrunCompareRun[];
  employees: { employeeId: string; employeeName: string; diff: PayrunCompareDiff }[];
};

export type CompareOutcome = "New employee" | "Removed" | "Review variance" | "Normal";

export function compareOutcome(diff: PayrunCompareDiff): CompareOutcome {
  if (diff.isNew) return "New employee";
  if (diff.isRemoved) return "Removed";
  if (diff.hasLargeVariance) return "Review variance";
  return "Normal";
}

/** "+$120.00" / "−$50.00" / "$0.00". */
export function signedMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return PAYROLL_EMPTY;
  if (value === 0) return payrollMoney(0);
  return `${value > 0 ? "+" : "−"}${payrollMoney(Math.abs(value))}`;
}

/** "+4" / "−2.5" hours. */
export function signedNumber(value: number | null | undefined, suffix = ""): string {
  if (value == null || !Number.isFinite(value)) return PAYROLL_EMPTY;
  if (value === 0) return `0${suffix}`;
  const abs = Math.abs(value).toLocaleString("en-AU", { maximumFractionDigits: 2 });
  return `${value > 0 ? "+" : "−"}${abs}${suffix}`;
}

/* ------------------------------------------------------------------ *
 * Create wizard
 * ------------------------------------------------------------------ */

export const PAYRUN_WIZARD_STEPS = [
  "Pay cycle",
  "Pay list",
  "Expenses",
  "Deductions",
  "Review",
] as const;

export const PAY_PERIOD_OPTIONS: { value: PayPeriod; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "semi-monthly", label: "Semi-monthly" },
  { value: "monthly", label: "Monthly" },
];

export const PERIOD_RUNS: Record<PayPeriod, number> = {
  weekly: 52,
  fortnightly: 26,
  "semi-monthly": 24,
  monthly: 12,
};

export function isPayPeriod(value: unknown): value is PayPeriod {
  return typeof value === "string" && value in PERIOD_RUNS;
}

export function runsInYearFor(period: string): number | null {
  return isPayPeriod(period) ? PERIOD_RUNS[period] : null;
}

/** A synced employee the wizard can pay — `GET /employees?status=SYNCED`. */
export type PayrunEmployee = {
  id: string;
  /** Microkeeper's username; an employee without one can't be paid yet. */
  eusername: string;
  name: string;
  employmentType: string | null;
};

/** `GET /employees/{id}/completeness`. */
export type ProfileCompleteness = {
  employeeId: string;
  employeeName: string;
  isComplete: boolean;
  totalMissingFields: number;
  missing: Record<string, string[]>;
  /** The check itself failed — treated as incomplete, as sole-webapp did. */
  checkFailed?: boolean;
};

/** `GET /payruns/last-cycle`. */
export type PayrunLastCycle = {
  lastCycle: { period: string; endDate?: string } | null;
  suggestedNext: { startDate: string; endDate: string } | null;
};

export type PayCycleDraft = {
  startDate: string;
  endDate: string;
  paymentDate: string;
  period: PayPeriod;
  /** Typed text until it's sent. */
  runsInYear: string;
  runUnworkedPh: boolean;
};

/* Microkeeper's pay calendar ------------------------------------------ *
 *
 * `add_payroll` picks the pay run by its end date and refuses one that
 * isn't a period end — "A period could not be found, check your end_date".
 * Its rules: a monthly period ends on the month's last day, a semi-monthly
 * one on the 15th or the last day, and a weekly or fortnightly one every 7 or
 * 14 days from wherever the business's calendar started. The API can't read
 * that calendar, so the last run's end date stands in for it when there is
 * one. https://microkeeper.com.au/guides.php?guide=api-payroll-add-get-process
 */

const PERIOD_DAYS: Partial<Record<PayPeriod, number>> = { weekly: 7, fortnightly: 14 };

function monthEnd(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${iso.slice(0, 8)}${String(last).padStart(2, "0")}`;
}

function daysBetween(from: string, to: string): number {
  const utc = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/** "28 Nov 2026" — for the messages below. */
function shortIso(iso: string): string {
  const date = parseIsoDate(iso);
  return date
    ? date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
    : iso;
}

/**
 * The period containing `start`, in Microkeeper's shape: a monthly or
 * semi-monthly start snaps to the period's first day, and the end follows.
 */
export function payPeriodFor(
  start: string,
  period: PayPeriod,
): { startDate: string; endDate: string } {
  const days = PERIOD_DAYS[period];
  if (days) return { startDate: start, endDate: addDays(start, days - 1) };
  if (period === "monthly") return { startDate: `${start.slice(0, 8)}01`, endDate: monthEnd(start) };
  return Number(start.slice(8, 10)) <= 15
    ? { startDate: `${start.slice(0, 8)}01`, endDate: `${start.slice(0, 8)}15` }
    : { startDate: `${start.slice(0, 8)}16`, endDate: monthEnd(start) };
}

/**
 * The cycle the wizard opens on: today for a fortnight, paid the day after —
 * or, where Microkeeper suggests the next cycle, that cycle in the last run's
 * period, paid the day after it ends. The suggestion's end is re-derived from
 * its start: the server adds a flat 30 days for a monthly run, which drifts
 * off the month end Microkeeper needs.
 */
export function defaultPayCycle(
  todayIso: string,
  lastCycle?: PayrunLastCycle | null,
): PayCycleDraft {
  const base: PayCycleDraft = {
    startDate: todayIso,
    endDate: addDays(todayIso, 13),
    paymentDate: addDays(todayIso, 14),
    period: "fortnightly",
    runsInYear: String(PERIOD_RUNS.fortnightly),
    runUnworkedPh: false,
  };
  const suggestion = lastCycle?.suggestedNext;
  if (!suggestion?.startDate || !suggestion.endDate) return base;

  const previous = lastCycle?.lastCycle?.period;
  const period = isPayPeriod(previous) ? previous : base.period;
  const span = isPayPeriod(previous)
    ? payPeriodFor(suggestion.startDate, period)
    : { startDate: suggestion.startDate, endDate: suggestion.endDate };
  return {
    ...base,
    ...span,
    paymentDate: addDays(span.endDate, 1),
    period,
    runsInYear: String(PERIOD_RUNS[period]),
  };
}

export type PayCycleErrors = Partial<
  Record<"startDate" | "endDate" | "paymentDate" | "runsInYear", string>
>;

/**
 * Whether the dates are a period Microkeeper's calendar has — caught here
 * rather than as `add_payroll`'s refusal after the whole run is filled in.
 */
function payPeriodErrors(
  draft: PayCycleDraft,
  lastCycle?: PayrunLastCycle | null,
): PayCycleErrors {
  const { startDate: start, endDate: end, period } = draft;
  const expected = payPeriodFor(start, period);
  const days = PERIOD_DAYS[period];

  if (days) {
    if (daysBetween(start, end) !== days - 1) {
      return {
        endDate: `A ${period} period is ${days} days — it should end on ${shortIso(expected.endDate)}.`,
      };
    }
    const lastEnd = lastCycle?.lastCycle?.period === period ? lastCycle.lastCycle.endDate : undefined;
    if (lastEnd) {
      const offset = ((daysBetween(lastEnd, end) % days) + days) % days;
      if (offset !== 0) {
        // Halfway rounds forward: the earlier period is likely already paid.
        const nearest = addDays(end, offset < days / 2 ? -offset : days - offset);
        return {
          endDate: `Doesn't line up with your Microkeeper pay calendar — your last ${period} run ended ${shortIso(lastEnd)}, so try ending on ${shortIso(nearest)}.`,
        };
      }
    }
    return {};
  }

  const errors: PayCycleErrors = {};
  const endsOn = payPeriodFor(end, period);
  if (end !== endsOn.endDate) {
    errors.endDate =
      period === "monthly"
        ? `A monthly period ends on the last day of the month — ${shortIso(monthEnd(end))}.`
        : "A semi-monthly period ends on the 15th or the last day of the month.";
  } else if (start !== endsOn.startDate) {
    errors.startDate = `A ${period} period ending ${shortIso(end)} starts on ${shortIso(endsOn.startDate)}.`;
  }
  return errors;
}

/** Step one's rules, with sole-webapp's own messages. ISO dates compare as strings. */
export function validatePayCycle(
  draft: PayCycleDraft,
  lastCycle?: PayrunLastCycle | null,
): PayCycleErrors {
  const errors: PayCycleErrors = {};
  if (!draft.startDate) errors.startDate = "Start date is required.";
  if (!draft.endDate) errors.endDate = "End date is required.";
  if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
    errors.endDate = "End date cannot be before the start date.";
  } else if (draft.startDate && draft.endDate) {
    Object.assign(errors, payPeriodErrors(draft, lastCycle));
  }
  if (!draft.paymentDate) {
    errors.paymentDate = "Payment date is required.";
  } else if (
    (draft.startDate && draft.paymentDate < draft.startDate) ||
    (draft.endDate && draft.paymentDate < draft.endDate)
  ) {
    errors.paymentDate = "Payment date must be on or after the pay period end date.";
  }
  // The field's own 0–366 bounds, enforced rather than only hinted at.
  const runs = Number(draft.runsInYear);
  if (
    draft.runsInYear.trim() === "" ||
    !Number.isInteger(runs) ||
    runs < 0 ||
    runs > 366
  ) {
    errors.runsInYear = "Runs in year must be a whole number from 0 to 366.";
  }
  return errors;
}

/** One employee's line on the pay list — all text, as typed. */
export type PayLineDraft = {
  employeeId: string;
  eusername: string;
  included: boolean;
  note: string;
  rate: string;
  hours: string;
  mult: string;
  class: string;
};

export function defaultPayLine(employee: PayrunEmployee): PayLineDraft {
  return {
    employeeId: employee.id,
    eusername: employee.eusername,
    included: true,
    note: "Ordinary hours",
    rate: "",
    hours: "",
    mult: "1",
    class: "",
  };
}

/** An expense or deduction row — `rate` is the amount, `mult` the quantity. */
export type AdjustmentDraft = {
  key: string;
  eusername: string;
  note: string;
  rate: string;
  mult: string;
  class: string;
};

export type AdjustmentPreset = { label: string; amount: string };

export const EXPENSE_PRESETS: AdjustmentPreset[] = [
  { label: "Phone allowance", amount: "25" },
  { label: "Travel reimbursement", amount: "" },
  { label: "Meal allowance", amount: "35" },
  { label: "Tools & equipment", amount: "" },
  { label: "WFH allowance", amount: "20" },
];

export const DEDUCTION_PRESETS: AdjustmentPreset[] = [
  { label: "Union fee", amount: "12" },
  { label: "Novated lease", amount: "250" },
  { label: "Garnishee order", amount: "" },
  { label: "Social club", amount: "5" },
];

export function adjustmentFromPreset(key: string, preset?: AdjustmentPreset): AdjustmentDraft {
  return {
    key,
    eusername: "",
    note: preset?.label ?? "",
    rate: preset?.amount ?? "",
    mult: "1",
    class: "",
  };
}

/** A typed number, or NaN for anything that isn't one (blank included). */
function parse(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}

/** Text to a figure for totals — blank or junk counts as nothing. */
function amount(value: string): number {
  const parsed = parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** A blank multiplier counts as 1, as sole-webapp's totals treated it. */
function multiplier(value: string): number {
  const parsed = parse(value);
  return Number.isFinite(parsed) ? parsed : 1;
}

/** rate × hours × multiplier. */
export function payLineGross(line: Pick<PayLineDraft, "rate" | "hours" | "mult">): number {
  return round2(amount(line.rate) * amount(line.hours) * multiplier(line.mult));
}

/** amount × quantity. */
export function adjustmentTotal(row: Pick<AdjustmentDraft, "rate" | "mult">): number {
  return round2(amount(row.rate) * multiplier(row.mult));
}

export type PayrunDraftTotals = {
  included: number;
  excluded: number;
  hours: number;
  gross: number;
  expenses: number;
  deductions: number;
};

/** What the Run summary sidebar shows. */
export function payrunDraftTotals(
  lines: PayLineDraft[],
  expenses: AdjustmentDraft[],
  deductions: AdjustmentDraft[],
): PayrunDraftTotals {
  const included = lines.filter((line) => line.included);
  return {
    included: included.length,
    excluded: lines.length - included.length,
    hours: round2(included.reduce((sum, line) => sum + amount(line.hours), 0)),
    gross: round2(included.reduce((sum, line) => sum + payLineGross(line), 0)),
    expenses: round2(expenses.reduce((sum, row) => sum + adjustmentTotal(row), 0)),
    deductions: round2(deductions.reduce((sum, row) => sum + adjustmentTotal(row), 0)),
  };
}

/** Whether one included pay line is ready to send. */
export function payLineValid(line: PayLineDraft): boolean {
  return (
    !!line.note.trim() &&
    parse(line.rate) > 0 &&
    parse(line.hours) > 0 &&
    parse(line.mult) > 0
  );
}

/** Microkeeper's `note` limits — longer descriptions are refused by `add_payroll`. */
export const PAY_NOTE_MAX = 50;
export const ADJUSTMENT_NOTE_MAX = 30;

/** Step two: at least one included employee, each with a complete line. */
export function validatePayList(lines: PayLineDraft[]): string | null {
  const included = lines.filter((line) => line.included);
  if (included.length === 0) return "Include at least one employee.";
  if (included.some((line) => !payLineValid(line))) {
    return "Enter a description, positive rate, hours and multiplier for every included employee.";
  }
  if (included.some((line) => line.note.trim().length > PAY_NOTE_MAX)) {
    return `Keep each pay line's description to ${PAY_NOTE_MAX} characters — Microkeeper's limit.`;
  }
  return null;
}

/**
 * Whether one expense or deduction row is ready to send. sole-webapp let a
 * non-numeric amount through (`NaN < 0` is false); a finite figure is
 * required here.
 */
export function adjustmentValid(row: AdjustmentDraft, included: Set<string>): boolean {
  const rate = parse(row.rate);
  return (
    !!row.eusername &&
    included.has(row.eusername) &&
    !!row.note.trim() &&
    Number.isFinite(rate) &&
    rate >= 0 &&
    parse(row.mult) > 0
  );
}

/** Steps three and four. `label` is "Expense" or "Deduction". */
export function validateAdjustments(
  rows: AdjustmentDraft[],
  included: Set<string>,
  label: "Expense" | "Deduction",
): string | null {
  if (rows.every((row) => adjustmentValid(row, included))) {
    return rows.some((row) => row.note.trim().length > ADJUSTMENT_NOTE_MAX)
      ? `Keep each ${label.toLowerCase()} description to ${ADJUSTMENT_NOTE_MAX} characters — Microkeeper's limit.`
      : null;
  }
  const forExcluded = rows.some((row) => row.eusername && !included.has(row.eusername));
  return forExcluded
    ? `${label}s can only be added for employees included in the pay list.`
    : `Complete every ${label.toLowerCase()} item before continuing.`;
}

/** The usernames of everyone on the pay list. */
export function includedUsernames(lines: PayLineDraft[]): Set<string> {
  return new Set(lines.filter((line) => line.included).map((line) => line.eusername));
}

type PayListLine = {
  eusername: string;
  note: string;
  rate: number;
  hours: number;
  mult: number;
  class?: string;
};

type AdjustmentLine = {
  eusername: string;
  note: string;
  rate: number;
  mult: number;
  class?: string;
};

/** `POST /payruns`. */
export type CreatePayrunPayload = {
  startDate: string;
  endDate: string;
  paymentDate: string;
  period: PayPeriod;
  runsInYear: number;
  runUnworkedPh: boolean;
  activeStaff: number;
  payList: PayListLine[];
  expList: AdjustmentLine[];
  dedList: AdjustmentLine[];
};

function cleanAdjustment(row: AdjustmentDraft): AdjustmentLine {
  const cls = row.class.trim();
  return {
    eusername: row.eusername,
    note: row.note.trim(),
    rate: Number(row.rate),
    mult: Number(row.mult),
    ...(cls ? { class: cls } : {}),
  };
}

/** The create request, from the wizard's state. Excluded employees aren't sent. */
export function buildCreatePayrunPayload(
  cycle: PayCycleDraft,
  lines: PayLineDraft[],
  expenses: AdjustmentDraft[],
  deductions: AdjustmentDraft[],
): CreatePayrunPayload {
  const included = lines.filter((line) => line.included);
  return {
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    paymentDate: cycle.paymentDate,
    period: cycle.period,
    runsInYear: Number(cycle.runsInYear),
    runUnworkedPh: cycle.runUnworkedPh,
    activeStaff: included.length,
    payList: included.map((line) => {
      const cls = line.class.trim();
      return {
        eusername: line.eusername,
        note: line.note.trim(),
        rate: Number(line.rate),
        hours: Number(line.hours),
        mult: Number(line.mult),
        ...(cls ? { class: cls } : {}),
      };
    }),
    expList: expenses.map(cleanAdjustment),
    dedList: deductions.map(cleanAdjustment),
  };
}

/** Included employees whose profile check came back incomplete (or failed). */
export function incompleteProfiles(
  lines: PayLineDraft[],
  readiness: Record<string, ProfileCompleteness>,
): ProfileCompleteness[] {
  return lines
    .filter((line) => line.included)
    .map((line) => readiness[line.employeeId])
    .filter((entry): entry is ProfileCompleteness => !!entry && !entry.isComplete);
}

/** "Mia Thompson: 3 missing fields", or why the check couldn't say. */
export function completenessSummary(entry: ProfileCompleteness): string {
  if (entry.checkFailed) return `${entry.employeeName}: couldn't check the profile`;
  const count = entry.totalMissingFields;
  return `${entry.employeeName}: ${count} missing field${count === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------------------ *
 * API
 *
 * `sole-ocr` proxies Microkeeper. A run is addressed the way sole-webapp
 * addressed it — by `mk_run_id` plus `?year=` (mk_year) — because with a year
 * the server looks the run up by those two and nothing else
 * (services/payrun.js `findPayrun`).
 * ------------------------------------------------------------------ */

type ApiEnvelope<T> = {
  success: boolean;
  message?: string;
  data?: T;
  pagination?: { total?: number | string; totalPages?: number | string };
};

function unwrap<T>(response: { data?: ApiEnvelope<T> }, fallback: string): T {
  if (!response.data?.success || response.data.data === undefined) {
    throw new Error(response.data?.message || fallback);
  }
  return response.data.data;
}

/** Writes answer `{ success }` with nothing worth reading in `data`. */
function assertSuccess(response: { data?: ApiEnvelope<unknown> }, fallback: string): void {
  if (!response.data?.success) {
    throw new Error(response.data?.message || fallback);
  }
}

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const numOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const str = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);

const strOrNull = (value: unknown): string | null =>
  value === null || value === undefined || value === "" ? null : String(value);

/** DATEONLY columns arrive as "YYYY-MM-DD"; timestamps are trimmed to the day. */
const day = (value: unknown): string => str(value).slice(0, 10);

type Raw = Record<string, unknown>;
const obj = (value: unknown): Raw =>
  value && typeof value === "object" ? (value as Raw) : {};
const list = (value: unknown): Raw[] =>
  Array.isArray(value) ? value.map(obj) : [];

/** A run, by what the server looks it up with. */
export type PayrunRef = { mkRunId: string; mkYear: string };

/* ----- list ----- */

export function mapPayrunRow(raw: Raw): PayrunRow {
  return {
    id: str(raw.id),
    mkRunId: str(raw.mk_run_id),
    mkYear: str(raw.mk_year),
    period: str(raw.period).toLowerCase(),
    startDate: day(raw.start_date),
    endDate: day(raw.end_date),
    paymentDate: day(raw.payment_date),
    paymentTotal: num(raw.payment_total),
    expenseTotal: num(raw.expense_total),
    deductionTotal: num(raw.deduction_total),
    employeeCount: num(raw.employeeCount),
    status: (str(raw.status).toUpperCase() || "DRAFT") as PayrunStatus,
  };
}

/** `GET /payruns`. */
export async function fetchPayruns(params: PayrunListParams): Promise<PayrunPage> {
  const response = await api.get<ApiEnvelope<Raw[]>>(apiRoutes.payroll.payruns, { params });
  const rows = unwrap(response, "Unable to load payruns.");
  const pagination = response.data?.pagination ?? {};
  const total = num(pagination.total);
  return {
    rows: list(rows).map(mapPayrunRow),
    total,
    totalPages: Math.max(1, num(pagination.totalPages) || Math.ceil(total / params.limit)),
  };
}

/** `GET /payruns/status-counts`. */
export async function fetchPayrunStatusCounts(): Promise<PayrunStatusCounts> {
  const response = await api.get<ApiEnvelope<Raw>>(apiRoutes.payroll.payrunStatusCounts);
  const raw = obj(unwrap(response, "Unable to load payrun counts."));
  return {
    all: num(raw.all),
    draft: num(raw.draft),
    inProgress: num(raw.inProgress),
    completed: num(raw.completed),
    failed: num(raw.failed),
  };
}

/* ----- detail ----- */

/** Microkeeper's leave codes, as the payslip names them. */
const LEAVE_TYPE_LABELS: Record<string, string> = {
  al: "Annual leave",
  sick: "Personal/carer's leave",
  lsl: "Long service leave",
  rdo: "Rostered day off",
};

export function leaveTypeLabel(type: string): string {
  return LEAVE_TYPE_LABELS[type.toLowerCase()] ?? titleCase(type);
}

function mapItem(raw: Raw): PayslipItem {
  return {
    note: str(raw.note),
    class: str(raw.class),
    rate: num(raw.rate),
    hours: num(raw.hours),
    mult: num(raw.mult) || 1,
    value: num(raw.value),
  };
}

function mapAdjustment(raw: Raw): PayslipAdjustment {
  return {
    note: str(raw.note),
    rate: num(raw.rate ?? raw.amount),
    mult: num(raw.mult) || 1,
    value: num(raw.value),
  };
}

export function mapPayslip(raw: Raw): Payslip {
  const superDetails = obj(raw.superDetails);
  return {
    id: str(raw.id),
    employeeId: str(raw.employeeId),
    employeeName: str(raw.employeeName) || "Unknown",
    employmentType: raw.employmentType ? titleCase(str(raw.employmentType)) : null,
    hours: num(raw.hours),
    normalHours: numOrNull(raw.normalHours),
    additionalHours: numOrNull(raw.additionalHours),
    gross: num(raw.gross),
    tax: num(raw.tax),
    net: num(raw.net),
    // The same places sole-webapp looked, in its order.
    superAmount: numOrNull(raw.superAmount ?? raw.super),
    superFund: strOrNull(superDetails.employer_super_fund ?? superDetails.fund ?? raw.super_fund),
    superMemberNo: strOrNull(
      superDetails.employer_member_number ?? superDetails.memberNo ?? raw.super_no,
    ),
    payItems: list(raw.payItems).map(mapItem),
    expenses: list(raw.expenses).map(mapAdjustment),
    deductions: list(raw.deductions).map(mapAdjustment),
    deductionTotal: numOrNull(raw.deduction),
    leaveAccrual: list(raw.leaveAccrual).map((entry) => ({
      type: leaveTypeLabel(str(entry.type)),
      balance: num(entry.balance),
      accrual: num(entry.accrual),
    })),
    hasIssue: Boolean(raw.hasIssue),
    diffPercent: numOrNull(raw.diffPercent),
    mkSlipId: strOrNull(raw.mkSlipId),
  };
}

export function mapPayrunDetail(raw: Raw): PayrunDetail {
  const summary = obj(raw.summary);
  return {
    status: (str(raw.status).toUpperCase() || "DRAFT") as PayrunStatus,
    period: str(raw.period).toLowerCase(),
    startDate: day(raw.startDate),
    endDate: day(raw.endDate),
    paymentDate: day(raw.paymentDate),
    mkYear: str(raw.mkYear),
    mkRunId: str(raw.mkRunId),
    summary: {
      totalGross: numOrNull(summary.totalGross),
      totalTax: numOrNull(summary.totalTax),
      totalNet: numOrNull(summary.totalNet),
      issueCount: numOrNull(summary.issueCount),
    },
    payslips: list(raw.payslips).map(mapPayslip),
  };
}

/** `GET /payruns/{mkRunId}/detail?year=`. */
export async function fetchPayrunDetail(run: PayrunRef): Promise<PayrunDetail> {
  const response = await api.get<ApiEnvelope<Raw>>(apiRoutes.payroll.payrunDetail(run.mkRunId), {
    params: { year: run.mkYear },
  });
  return mapPayrunDetail(obj(unwrap(response, "Failed to load payrun details.")));
}

/** `GET /payruns/{mkRunId}/issues?year=` — `{ total, issues[] }`. */
export async function fetchPayrunIssues(run: PayrunRef): Promise<PayrunIssue[]> {
  const response = await api.get<ApiEnvelope<Raw>>(apiRoutes.payroll.payrunIssues(run.mkRunId), {
    params: { year: run.mkYear },
  });
  return list(obj(unwrap(response, "Failed to load payrun issues.")).issues).map((issue) => ({
    employeeId: strOrNull(issue.employeeId),
    employeeName: str(issue.employeeName),
    type: str(issue.type),
    message: str(issue.message),
  }));
}

/* ----- compare ----- */

export function mapPayrunCompare(raw: Raw): PayrunCompare {
  return {
    runs: list(obj(raw.summary).payruns).map((run) => {
      const totals = obj(run.totals);
      return {
        mkRunId: str(run.mkRunId),
        status: (str(run.status).toUpperCase() || "DRAFT") as PayrunStatus,
        startDate: day(run.startDate),
        endDate: day(run.endDate),
        totals: { gross: num(totals.gross), net: num(totals.net), hours: num(totals.hours) },
        employeeCount: num(run.employeeCount),
      };
    }),
    employees: list(raw.employees).map((employee) => {
      const diff = obj(employee.diff);
      return {
        employeeId: str(employee.employeeId),
        employeeName: str(employee.employeeName) || "Unknown",
        diff: {
          grossDiff: numOrNull(diff.grossDiff),
          grossPct: numOrNull(diff.grossPct),
          netDiff: numOrNull(diff.netDiff),
          hoursDiff: numOrNull(diff.hoursDiff),
          isNew: Boolean(diff.isNew),
          isRemoved: Boolean(diff.isRemoved),
          hasLargeVariance: Boolean(diff.hasLargeVariance),
        },
      };
    }),
  };
}

/** `GET /payruns/compare?runIds=a,b[&year=]`. */
export async function fetchPayrunCompare(params: {
  runIds: string;
  year?: string;
}): Promise<PayrunCompare> {
  const response = await api.get<ApiEnvelope<Raw>>(apiRoutes.payroll.payrunCompare, { params });
  return mapPayrunCompare(obj(unwrap(response, "Unable to compare payruns.")));
}

/* ----- create wizard ----- */

/** `GET /employees?page=1&limit=100&status=SYNCED`, kept to those Microkeeper knows. */
export async function fetchPayrunEmployees(): Promise<PayrunEmployee[]> {
  const response = await api.get<ApiEnvelope<Raw[]>>(apiRoutes.payroll.employees, {
    params: { page: 1, limit: 100, status: "SYNCED" },
  });
  return list(unwrap(response, "Unable to prepare a new payrun."))
    .filter((employee) => str(employee.eusername).trim())
    .map((employee) => ({
      id: str(employee.id),
      eusername: str(employee.eusername).trim(),
      name:
        `${str(employee.given_name)} ${str(employee.surname)}`.trim() ||
        str(employee.eusername),
      employmentType: employee.employment_type ? titleCase(str(employee.employment_type)) : null,
    }));
}

/** `GET /employees/{id}/completeness`. */
export async function fetchProfileCompleteness(employeeId: string): Promise<ProfileCompleteness> {
  const response = await api.get<ApiEnvelope<Raw>>(
    apiRoutes.payroll.employeeCompleteness(employeeId),
  );
  const raw = obj(unwrap(response, "Unable to check the employee profile."));
  const missing: Record<string, string[]> = {};
  Object.entries(obj(raw.missing)).forEach(([section, fields]) => {
    missing[section] = Array.isArray(fields) ? fields.map(str) : [];
  });
  return {
    employeeId: str(raw.employeeId) || employeeId,
    employeeName: str(raw.employeeName),
    isComplete: Boolean(raw.isComplete),
    totalMissingFields: num(raw.totalMissingFields),
    missing,
  };
}

/** `GET /payruns/last-cycle` — `{ lastCycle: <payrun> | null, suggestedNext? }`. */
export async function fetchPayrunLastCycle(): Promise<PayrunLastCycle> {
  const response = await api.get<ApiEnvelope<Raw>>(apiRoutes.payroll.payrunLastCycle);
  const raw = obj(unwrap(response, "Unable to load the last pay cycle."));
  const last = raw.lastCycle ? obj(raw.lastCycle) : null;
  const next = raw.suggestedNext ? obj(raw.suggestedNext) : null;
  return {
    lastCycle: last
      ? {
          period: str(last.period).toLowerCase(),
          ...(last.end_date ? { endDate: day(last.end_date) } : {}),
        }
      : null,
    suggestedNext:
      next && next.startDate && next.endDate
        ? { startDate: day(next.startDate), endDate: day(next.endDate) }
        : null,
  };
}

/**
 * `POST /payruns`. The body is encrypted; top-level `runUnworkedPh` arrives
 * as "true"/"false" and `Joi.boolean()` converts it, and the lines travel
 * nested so their numbers stay numbers.
 */
export async function createPayrun(payload: CreatePayrunPayload): Promise<{
  mkRunId: string;
  mkYear: string;
}> {
  const response = await api.post<ApiEnvelope<Raw>>(
    apiRoutes.payroll.payruns,
    buildEncryptedRequestBody(payload),
  );
  const raw = obj(unwrap(response, "Unable to create payrun."));
  return { mkRunId: str(raw.mkRunId), mkYear: str(raw.mkYear) };
}

/* ----- run actions ----- */

/** `DELETE /payruns/{mkRunId}?year=`. The server refuses completed runs. */
export async function deletePayrun(run: PayrunRef): Promise<void> {
  const response = await api.delete<ApiEnvelope<unknown>>(apiRoutes.payroll.payrun(run.mkRunId), {
    params: { year: run.mkYear },
  });
  assertSuccess(response, "Unable to delete the payrun.");
}

/** The three `POST /payruns/{mkRunId}/…?year=` actions. They read nothing from the body. */
async function postRunAction(
  url: string,
  run: PayrunRef,
  fallback: string,
): Promise<void> {
  const response = await api.post<ApiEnvelope<unknown>>(url, buildEncryptedRequestBody({}), {
    params: { year: run.mkYear },
  });
  assertSuccess(response, fallback);
}

export function completePayrun(run: PayrunRef): Promise<void> {
  return postRunAction(apiRoutes.payroll.payrunComplete(run.mkRunId), run, "Unable to complete the payrun.");
}

export function emailPayslips(run: PayrunRef): Promise<void> {
  return postRunAction(apiRoutes.payroll.payrunEmail(run.mkRunId), run, "Unable to email payslips.");
}

export function duplicatePayrun(run: PayrunRef): Promise<void> {
  return postRunAction(apiRoutes.payroll.payrunDuplicate(run.mkRunId), run, "Unable to duplicate the payrun.");
}

/**
 * A blob or text request's failure carries the JSON envelope as a Blob or a
 * string, where `apiErrorMessage` can't see it — read it out so the server's
 * message still reaches the toast.
 */
async function bodyError(error: unknown, fallback: string): Promise<Error> {
  if (axios.isAxiosError(error)) {
    const body: unknown = error.response?.data;
    try {
      const text =
        typeof Blob !== "undefined" && body instanceof Blob
          ? await body.text()
          : typeof body === "string"
            ? body
            : null;
      if (text) {
        const parsed = JSON.parse(text) as { message?: unknown };
        if (typeof parsed.message === "string" && parsed.message) {
          return new Error(parsed.message);
        }
      }
    } catch {
      // Not JSON — fall through to the generic reason.
    }
    return new Error(apiErrorMessage(error, fallback));
  }
  return error instanceof Error ? error : new Error(fallback);
}

/** `GET /payruns/{mkRunId}/export?year=` — the CSV, as a blob. */
export async function exportPayrunCsv(run: PayrunRef): Promise<Blob> {
  try {
    const response = await api.get<Blob>(apiRoutes.payroll.payrunExport(run.mkRunId), {
      params: { year: run.mkYear },
      responseType: "blob",
    });
    return response.data;
  } catch (error) {
    throw await bodyError(error, "Unable to export the payrun.");
  }
}

export function payrunCsvFileName(run: PayrunRef): string {
  return `payrun-${run.mkRunId}.csv`;
}

/**
 * `GET /payruns/{mkRunId}/download?year=[&eids=]` — one HTML payslip per
 * top-level `<div>`, turned into a PDF in the browser (`lib/payslip-pdf.ts`).
 */
export async function fetchPayslipHtml(run: PayrunRef, employeeId?: string | null): Promise<string> {
  try {
    const response = await api.get<string>(apiRoutes.payroll.payrunDownload(run.mkRunId), {
      params: { year: run.mkYear, ...(employeeId ? { eids: employeeId } : {}) },
      responseType: "text",
    });
    return typeof response.data === "string" ? response.data : String(response.data ?? "");
  } catch (error) {
    throw await bodyError(error, "Unable to download payslips.");
  }
}

export function payslipsFileName(run: PayrunRef): string {
  return `Payslip-${run.mkRunId}-${run.mkYear}.pdf`;
}

export function employeePayslipFileName(employeeName: string): string {
  const safe = employeeName.trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-");
  return `payslip-${safe || "employee"}.pdf`;
}

/* ----- errors ----- */

export const PAYROLL_FROZEN_CODE = "PAYROLL_BILLING_FROZEN";

/** The 403s `requireActivePayroll` sends — the fix is in billing, not here. */
export function isPayrollBillingError(error: unknown): boolean {
  const code = payrollErrorCode(error);
  return (
    code === PAYROLL_NOT_ACTIVE_CODE ||
    code === PAYROLL_FROZEN_CODE ||
    code === PAYROLL_OVERDUE_CODE
  );
}

/**
 * The reason a payrun write failed. A validation failure's useful detail is
 * in `error.explanation` (Joi's messages, or Microkeeper's), which
 * sole-webapp showed first; anything else is the server's own message.
 */
export function payrunErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { error?: { explanation?: unknown } }
      | undefined;
    const explanation = data?.error?.explanation;
    if (Array.isArray(explanation) && typeof explanation[0] === "string" && explanation[0]) {
      return explanation[0];
    }
  }
  if (error instanceof Error && !axios.isAxiosError(error) && error.message) {
    return error.message;
  }
  return apiErrorMessage(error, fallback);
}
