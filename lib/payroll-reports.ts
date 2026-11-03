/**
 * Payroll reports — the five reports sole-webapp's `ReportsList.js` offers, the
 * shapes their endpoints return, and the builders that turn each response into
 * the sections the screen draws and the CSV exports.
 *
 * The report endpoints answer in camelCase already, with the report as
 * top-level keys beside `success` rather than under `data`.
 *
 * A built report is plain data — columns, rows, an optional row of headline
 * figures — so the screen and the CSV can't disagree about what a report
 * contains, and both can be tested without rendering anything.
 */

import apiRoutes from "@/config/api-routes";
import { recentFinancialYears } from "@/lib/asset-depreciation-report";
import { PAYROLL_EMPTY, payrollDate, payrollMoney, titleCase } from "@/lib/payroll";
import api from "@/utils/axiosInstance";

/* ------------------------------------------------------------------ *
 * The catalogue
 * ------------------------------------------------------------------ */

export type PayrollReportId =
  | "payroll-summary"
  | "payroll-breakdown"
  | "accounting-export"
  | "payroll-employee-by-run"
  | "payroll-summary-by-run";

export type PayrollReportDefinition = {
  id: PayrollReportId;
  title: string;
  /** One line under the picker, saying what the report is for. */
  description: string;
  /** Singular noun for the pager — "employee", "run". */
  itemLabel: string;
};

export const PAYROLL_REPORTS: PayrollReportDefinition[] = [
  {
    id: "payroll-summary",
    title: "Payroll summary",
    description: "What each employee cost and was paid across the year.",
    itemLabel: "employee",
  },
  {
    id: "payroll-breakdown",
    title: "Payroll breakdown",
    description:
      "Each employee's pay split into its pay items, expenses and deductions.",
    itemLabel: "employee",
  },
  {
    id: "accounting-export",
    title: "Accounting export",
    description: "The year's payroll as ledger lines, ready for your accountant.",
    itemLabel: "line",
  },
  {
    id: "payroll-employee-by-run",
    title: "Payroll employee by run",
    description: "Every employee's pay in every pay run.",
    itemLabel: "payslip",
  },
  {
    id: "payroll-summary-by-run",
    title: "Payroll summary by run",
    description: "The totals of each pay run in the year.",
    itemLabel: "pay run",
  },
];

export function payrollReport(id: PayrollReportId): PayrollReportDefinition {
  return PAYROLL_REPORTS.find((report) => report.id === id) ?? PAYROLL_REPORTS[0];
}

export function payrollReportUrl(id: PayrollReportId): string {
  switch (id) {
    case "payroll-summary":
      return apiRoutes.payroll.reportSummary;
    case "payroll-breakdown":
      return apiRoutes.payroll.reportBreakdown;
    case "accounting-export":
      return apiRoutes.payroll.reportAccountingExport;
    case "payroll-employee-by-run":
      return apiRoutes.payroll.reportEmployeeByRun;
    case "payroll-summary-by-run":
      return apiRoutes.payroll.reportSummaryByRun;
  }
}

/** One choice in the year picker: an Australian financial year. */
export type PayrollReportYear = {
  /** The year the FY starts in — "2026" is 1 Jul 2026 to 30 Jun 2027. */
  value: string;
  label: string;
  startDate: string;
  endDate: string;
};

/**
 * The current financial year and the four before it, newest first.
 *
 * Financial rather than calendar years: payroll is reported to the ATO by
 * financial year, and the reports' own `year` filter is Microkeeper's
 * `mk_year`, which is a financial year too. sole-webapp offered calendar years
 * and sent them as `year`, so "2026" there actually meant FY 2026/27.
 */
export function payrollReportYears(today: Date = new Date()): PayrollReportYear[] {
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return recentFinancialYears(iso).map((fy) => ({
    value: fy.start.slice(0, 4),
    label: fy.label,
    startDate: fy.start,
    endDate: fy.end,
  }));
}

/** 1 July of the FY to 30 June after it, for the year picker's value. */
export function financialYearSpan(year: string): { startDate: string; endDate: string } {
  const start = Number(year);
  return { startDate: `${start}-07-01`, endDate: `${start + 1}-06-30` };
}

/** sole-webapp's fixed page size for every report. */
export const PAYROLL_REPORT_PAGE_SIZE = 10;

/**
 * Export CSV asks for the whole year as one page. A business with more rows
 * than this exports the first this-many — far past any year of fortnightly
 * runs for a small team, and the export says so if it happens.
 */
export const PAYROLL_REPORT_EXPORT_LIMIT = 1000;

/** What every report is asked for. `year` is the FY's starting year. */
export type PayrollReportParams = { year: string; page: number; limit: number };

/* ------------------------------------------------------------------ *
 * What the endpoints return
 * ------------------------------------------------------------------ */

export type PayrollReportPagination = {
  totalPages: number;
  /** Not every report sends it; the pager estimates without it. */
  total?: number;
};

/** The money-and-hours set the summary-style reports share. */
export type PayrollFigures = {
  costToBusiness: number;
  totalExpenses: number;
  grossTaxable: number;
  deductions: number;
  taxes: number;
  net: number;
  hours: number;
};

export type PayrollSummaryResponse = {
  employees: (PayrollFigures & {
    employeeId?: string;
    employeeName: string;
    employmentType: string | null;
  })[];
  totals?: PayrollFigures | null;
  pagination?: PayrollReportPagination;
};

export type PayrollBreakdownResponse = {
  employees: {
    employeeId?: string;
    employeeName: string;
    hours: number;
    grossTaxable: number;
    tax: number;
    net: number;
    /** Keyed by the pay item's own name — "Ordinary hours", "Overtime 1.5x". */
    payItems?: Record<string, number>;
    expenses?: Record<string, number>;
    deductions?: Record<string, number>;
  }[];
  pagination?: PayrollReportPagination;
};

export type AccountingLine = {
  line?: number | string;
  title: string;
  hours?: number | null;
  amount: number;
};

export type AccountingGroup = {
  lines: AccountingLine[];
  /** Sometimes `{ hours, amount }`, sometimes just the amount. */
  total?: { hours?: number | null; amount: number } | number | null;
};

export type AccountingExportResponse = {
  totalGrossTaxable: number;
  totalPaygWithholding: number;
  totalNet: number;
  payItems?: AccountingGroup | null;
  expenses?: AccountingGroup | null;
  deductions?: AccountingGroup | null;
  pagination?: PayrollReportPagination;
};

export type PayrollEmployeeByRunResponse = {
  runs: (PayrollFigures & { run: string | number; date: string; employeeName: string })[];
  pagination?: PayrollReportPagination;
};

export type PayrollSummaryByRunResponse = {
  runs: (PayrollFigures & { run: string | number; date: string })[];
  totals?: PayrollFigures | null;
  pagination?: PayrollReportPagination;
};

export type PayrollReportResponse =
  | PayrollSummaryResponse
  | PayrollBreakdownResponse
  | AccountingExportResponse
  | PayrollEmployeeByRunResponse
  | PayrollSummaryByRunResponse;

/* ------------------------------------------------------------------ *
 * What the screen draws
 * ------------------------------------------------------------------ */

export type ReportCellFormat = "text" | "money" | "hours" | "date";

export type PayrollReportColumn = {
  key: string;
  label: string;
  format: ReportCellFormat;
};

export type ReportCellValue = string | number | null | undefined;

export type PayrollReportRow = {
  id: string;
  /** A Total row — drawn emphasised, and never counted as a record. */
  total?: boolean;
  values: Record<string, ReportCellValue>;
};

export type PayrollReportSection = {
  /** Only the Accounting export's sections are titled. */
  title?: string;
  columns: PayrollReportColumn[];
  rows: PayrollReportRow[];
};

export type PayrollReportFigure = { key: string; label: string; value: number };

export type BuiltPayrollReport = {
  /** The headline tiles — only the Accounting export has any. */
  figures?: PayrollReportFigure[];
  sections: PayrollReportSection[];
  totalPages: number;
  total: number | null;
};

const text = (key: string, label: string): PayrollReportColumn => ({
  key,
  label,
  format: "text",
});
const money = (key: string, label: string): PayrollReportColumn => ({
  key,
  label,
  format: "money",
});
const hours = (key: string, label: string): PayrollReportColumn => ({
  key,
  label,
  format: "hours",
});
const date = (key: string, label: string): PayrollReportColumn => ({
  key,
  label,
  format: "date",
});

/** The six money columns and hours, in the order every summary report uses. */
const FIGURE_COLUMNS: PayrollReportColumn[] = [
  money("costToBusiness", "Cost to business"),
  money("totalExpenses", "Total expenses"),
  money("grossTaxable", "Gross taxable"),
  money("deductions", "Deductions"),
  money("taxes", "Taxes"),
  money("net", "Net"),
  hours("hours", "Hours"),
];

function figureValues(figures: Partial<PayrollFigures>): Record<string, ReportCellValue> {
  return {
    costToBusiness: figures.costToBusiness,
    totalExpenses: figures.totalExpenses,
    grossTaxable: figures.grossTaxable,
    deductions: figures.deductions,
    taxes: figures.taxes,
    net: figures.net,
    hours: figures.hours,
  };
}

function pageMeta(pagination: PayrollReportPagination | undefined) {
  const total = Number(pagination?.total);
  return {
    totalPages: Math.max(1, Number(pagination?.totalPages) || 1),
    total: pagination?.total != null && Number.isFinite(total) ? total : null,
  };
}

/** Every key that appears in any row's map, in first-seen order. */
function collectKeys<T>(
  items: T[],
  read: (item: T) => Record<string, number> | undefined,
): string[] {
  const keys = new Set<string>();
  items.forEach((item) => Object.keys(read(item) ?? {}).forEach((key) => keys.add(key)));
  return Array.from(keys);
}

export function buildPayrollSummary(response: PayrollSummaryResponse): BuiltPayrollReport {
  const employees = response.employees ?? [];
  const columns = [
    text("employeeName", "Employee"),
    text("employmentType", "Employment type"),
    ...FIGURE_COLUMNS,
  ];

  const rows: PayrollReportRow[] = employees.map((employee, index) => ({
    id: employee.employeeId ?? `employee-${index}`,
    values: {
      employeeName: employee.employeeName,
      employmentType: employee.employmentType ? titleCase(employee.employmentType) : null,
      ...figureValues(employee),
    },
  }));

  if (response.totals) {
    rows.push({
      id: "totals",
      total: true,
      values: { employeeName: "Total", employmentType: "", ...figureValues(response.totals) },
    });
  }

  return { sections: [{ columns, rows }], ...pageMeta(response.pagination) };
}

/**
 * One column per pay item, expense and deduction name found on the page —
 * the set differs by business, so the columns come from the data. An employee
 * without one of them shows zero for it rather than a gap.
 */
export function buildPayrollBreakdown(response: PayrollBreakdownResponse): BuiltPayrollReport {
  const employees = response.employees ?? [];
  const payItemKeys = collectKeys(employees, (employee) => employee.payItems);
  const expenseKeys = collectKeys(employees, (employee) => employee.expenses);
  const deductionKeys = collectKeys(employees, (employee) => employee.deductions);

  const columns = [
    text("employeeName", "Employee"),
    hours("hours", "Hours"),
    money("grossTaxable", "Gross taxable"),
    ...payItemKeys.map((key) => money(`payItems.${key}`, key)),
    money("tax", "Tax"),
    money("net", "Net"),
    ...expenseKeys.map((key) => money(`expenses.${key}`, key)),
    ...deductionKeys.map((key) => money(`deductions.${key}`, key)),
  ];

  const rows: PayrollReportRow[] = employees.map((employee, index) => {
    const values: Record<string, ReportCellValue> = {
      employeeName: employee.employeeName,
      hours: employee.hours,
      grossTaxable: employee.grossTaxable,
      tax: employee.tax,
      net: employee.net,
    };
    payItemKeys.forEach((key) => (values[`payItems.${key}`] = employee.payItems?.[key] ?? 0));
    expenseKeys.forEach((key) => (values[`expenses.${key}`] = employee.expenses?.[key] ?? 0));
    deductionKeys.forEach(
      (key) => (values[`deductions.${key}`] = employee.deductions?.[key] ?? 0),
    );
    return { id: employee.employeeId ?? `employee-${index}`, values };
  });

  return { sections: [{ columns, rows }], ...pageMeta(response.pagination) };
}

function accountingSection(
  title: string,
  group: AccountingGroup | null | undefined,
  withHours: boolean,
): PayrollReportSection {
  const columns = [
    text("line", "Line"),
    text("title", "Description"),
    ...(withHours ? [hours("hours", "Hours")] : []),
    money("amount", "Amount"),
  ];

  const lines = group?.lines ?? [];
  const rows: PayrollReportRow[] = lines.map((line, index) => ({
    id: `${title}-${index}`,
    values: {
      line: line.line ?? index + 1,
      title: line.title,
      hours: line.hours,
      amount: line.amount,
    },
  }));

  const total = group?.total;
  if (lines.length > 0 && total != null) {
    const figures = typeof total === "number" ? { amount: total, hours: null } : total;
    rows.push({
      id: `${title}-total`,
      total: true,
      values: { line: "", title: "Total", hours: figures.hours, amount: figures.amount },
    });
  }

  return { title, columns, rows };
}

/**
 * The three headline figures, then pay items, expenses and deductions as
 * ledger lines. All three sections are kept even when one is empty —
 * sole-webapp dropped an empty section, which left a year without expenses
 * looking as if the report had lost a table.
 */
export function buildAccountingExport(response: AccountingExportResponse): BuiltPayrollReport {
  return {
    figures: [
      { key: "gross", label: "Total gross taxable", value: asNumber(response.totalGrossTaxable) },
      { key: "payg", label: "Total PAYG withholding", value: asNumber(response.totalPaygWithholding) },
      { key: "net", label: "Total net", value: asNumber(response.totalNet) },
    ],
    sections: [
      accountingSection("Pay items", response.payItems, true),
      accountingSection("Expenses", response.expenses, false),
      accountingSection("Deductions", response.deductions, false),
    ],
    ...pageMeta(response.pagination),
  };
}

export function buildPayrollEmployeeByRun(
  response: PayrollEmployeeByRunResponse,
): BuiltPayrollReport {
  const runs = response.runs ?? [];
  const columns = [
    text("run", "Run"),
    date("date", "Date"),
    text("employeeName", "Employee"),
    ...FIGURE_COLUMNS,
  ];
  const rows: PayrollReportRow[] = runs.map((run, index) => ({
    id: `run-${index}`,
    values: { run: run.run, date: run.date, employeeName: run.employeeName, ...figureValues(run) },
  }));
  return { sections: [{ columns, rows }], ...pageMeta(response.pagination) };
}

export function buildPayrollSummaryByRun(
  response: PayrollSummaryByRunResponse,
): BuiltPayrollReport {
  const runs = response.runs ?? [];
  const columns = [text("run", "Run"), date("date", "Date"), ...FIGURE_COLUMNS];
  const rows: PayrollReportRow[] = runs.map((run, index) => ({
    id: `run-${index}`,
    values: { run: run.run, date: run.date, ...figureValues(run) },
  }));

  if (response.totals) {
    rows.push({
      id: "totals",
      total: true,
      values: { run: "Total", date: "", ...figureValues(response.totals) },
    });
  }

  return { sections: [{ columns, rows }], ...pageMeta(response.pagination) };
}

/** The builder for a report, applied to that report's own response. */
export function buildPayrollReport(
  id: PayrollReportId,
  response: PayrollReportResponse,
): BuiltPayrollReport {
  switch (id) {
    case "payroll-summary":
      return buildPayrollSummary(response as PayrollSummaryResponse);
    case "payroll-breakdown":
      return buildPayrollBreakdown(response as PayrollBreakdownResponse);
    case "accounting-export":
      return buildAccountingExport(response as AccountingExportResponse);
    case "payroll-employee-by-run":
      return buildPayrollEmployeeByRun(response as PayrollEmployeeByRunResponse);
    case "payroll-summary-by-run":
      return buildPayrollSummaryByRun(response as PayrollSummaryByRunResponse);
  }
}

/** Records on the page, not counting any Total rows. */
export function reportRecordCount(report: BuiltPayrollReport): number {
  return report.sections.reduce(
    (sum, section) => sum + section.rows.filter((row) => !row.total).length,
    0,
  );
}

/**
 * The pager's counters. When the report doesn't send a total, the last page
 * pins it exactly and any earlier page assumes every page before the last is
 * full — close enough for "11–20 of 40".
 */
export function reportPageInfo({
  page,
  pageSize,
  report,
}: {
  page: number;
  pageSize: number;
  report: BuiltPayrollReport;
}) {
  const pageCount = Math.max(1, report.totalPages);
  const current = Math.min(Math.max(1, page), pageCount);
  const onPage = reportRecordCount(report);
  const total =
    report.total ??
    (current === pageCount ? (current - 1) * pageSize + onPage : pageCount * pageSize);
  if (total === 0 || onPage === 0) return { page: current, pageCount, total, from: 0, to: 0 };
  const from = (current - 1) * pageSize + 1;
  return { page: current, pageCount, total, from, to: Math.min(from + onPage - 1, total) };
}

/* ------------------------------------------------------------------ *
 * Cells
 * ------------------------------------------------------------------ */

function asNumber(value: ReportCellValue): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

/**
 * A cell as the screen shows it. An empty string is a deliberate blank (a
 * Total row's employment type); a missing value is a dash.
 */
export function reportCellText(value: ReportCellValue, column: PayrollReportColumn): string {
  if (value === "") return "";
  if (value === null || value === undefined) return PAYROLL_EMPTY;
  switch (column.format) {
    case "money":
      return payrollMoney(asNumber(value));
    case "hours":
      return asNumber(value).toLocaleString("en-AU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    case "date":
      return payrollDate(String(value));
    default:
      return String(value);
  }
}

/**
 * A cell as the CSV holds it — plain numbers with no currency sign or
 * thousands separators, and ISO dates, so a spreadsheet reads them as numbers
 * and dates rather than text.
 */
export function reportCsvValue(value: ReportCellValue, column: PayrollReportColumn): string {
  if (value === null || value === undefined || value === "") return "";
  switch (column.format) {
    case "money":
    case "hours":
      return asNumber(value).toFixed(2);
    case "date":
      return String(value).slice(0, 10);
    default:
      return String(value);
  }
}

/** Quoted only when it has to be, with any quotes inside doubled. */
export function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The report as CSV: the headline figures (if any), then each section — its
 * title, header and rows — with a blank line between blocks.
 *
 * Lines are joined with a plain newline. sole-webapp joined them with `"\\\n"`,
 * which left a stray backslash at the end of every line.
 */
export function payrollReportCsv(report: BuiltPayrollReport): string {
  const blocks: string[][] = [];

  if (report.figures && report.figures.length > 0) {
    blocks.push(
      report.figures.map((figure) =>
        [csvCell(figure.label), figure.value.toFixed(2)].join(","),
      ),
    );
  }

  report.sections.forEach((section) => {
    const lines: string[] = [];
    if (section.title) lines.push(csvCell(section.title));
    lines.push(section.columns.map((column) => csvCell(column.label)).join(","));
    section.rows.forEach((row) =>
      lines.push(
        section.columns
          .map((column) => csvCell(reportCsvValue(row.values[column.key], column)))
          .join(","),
      ),
    );
    blocks.push(lines);
  });

  return blocks.map((lines) => lines.join("\n")).join("\n\n");
}

/** `payroll-summary-fy2026-27.csv` */
export function payrollReportFilename(id: PayrollReportId, year: string): string {
  const next = String(Number(year) + 1).slice(-2);
  return `${id}-fy${year}-${next}.csv`;
}

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

/**
 * One page of a report — `GET /reports/{id}?startDate=&endDate=&page=&limit=`.
 *
 * Asked by payment-date range rather than `year`: the range is an exact
 * financial year whatever convention a run's `mk_year` was saved with (the
 * Microkeeper sync, the create fallback and the autogenerator don't agree).
 * The server has no cap on `limit`, so Export CSV's whole-year page works.
 */
export async function fetchPayrollReport(
  id: PayrollReportId,
  params: PayrollReportParams,
): Promise<PayrollReportResponse> {
  const response = await api.get<
    PayrollReportResponse & { success?: boolean; message?: string }
  >(payrollReportUrl(id), {
    params: { ...financialYearSpan(params.year), page: params.page, limit: params.limit },
  });
  const body = response.data;
  if (!body?.success) {
    throw new Error(body?.message || "Failed to load report.");
  }
  return body;
}
