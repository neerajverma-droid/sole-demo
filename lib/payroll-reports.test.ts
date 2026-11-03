import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = { get: vi.fn() };

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// Imported after the mock so the lib's own axios import resolves to it.
const {
  buildAccountingExport,
  buildPayrollBreakdown,
  buildPayrollEmployeeByRun,
  buildPayrollReport,
  buildPayrollSummary,
  buildPayrollSummaryByRun,
  csvCell,
  payrollReportCsv,
  payrollReportFilename,
  payrollReportYears,
  reportCellText,
  reportCsvValue,
  reportPageInfo,
  reportRecordCount,
  fetchPayrollReport,
  financialYearSpan,
  payrollReportUrl,
} = await import("@/lib/payroll-reports");

import type { PayrollFigures, PayrollReportColumn } from "@/lib/payroll-reports";

beforeEach(() => {
  vi.clearAllMocks();
});

const figures = (base: number): PayrollFigures => ({
  costToBusiness: base * 1.12,
  totalExpenses: 10,
  grossTaxable: base,
  deductions: 5,
  taxes: base * 0.2,
  net: base * 0.8 - 5,
  hours: 76,
});

const labels = (columns: PayrollReportColumn[]) => columns.map((column) => column.label);

describe("payrollReportYears", () => {
  it("is the current financial year and the four before it, newest first", () => {
    const years = payrollReportYears(new Date(2026, 9, 12));
    expect(years.map((year) => year.value)).toEqual(["2026", "2025", "2024", "2023", "2022"]);
    expect(years[0]).toEqual({
      value: "2026",
      label: "FY 2026/2027",
      startDate: "2026-07-01",
      endDate: "2027-06-30",
    });
  });

  it("stays in the previous financial year until July", () => {
    expect(payrollReportYears(new Date(2026, 5, 30))[0].label).toBe("FY 2025/2026");
  });

  it("turns a picker value back into its payment-date range", () => {
    expect(financialYearSpan("2025")).toEqual({
      startDate: "2025-07-01",
      endDate: "2026-06-30",
    });
  });
});

describe("buildPayrollSummary", () => {
  it("has the summary columns, a row per employee and a Total row", () => {
    const report = buildPayrollSummary({
      employees: [
        {
          employeeId: "emp_1",
          employeeName: "Olivia Bennett",
          employmentType: "FULL_TIME",
          ...figures(1000),
        },
      ],
      totals: figures(1000),
      pagination: { totalPages: 1, total: 1 },
    });

    const [section] = report.sections;
    expect(labels(section.columns)).toEqual([
      "Employee",
      "Employment type",
      "Cost to business",
      "Total expenses",
      "Gross taxable",
      "Deductions",
      "Taxes",
      "Net",
      "Hours",
    ]);
    expect(section.rows).toHaveLength(2);
    expect(section.rows[0].values).toMatchObject({
      employeeName: "Olivia Bennett",
      employmentType: "Full time",
      grossTaxable: 1000,
    });
    expect(section.rows[1]).toMatchObject({
      id: "totals",
      total: true,
      values: { employeeName: "Total", employmentType: "", grossTaxable: 1000 },
    });
    expect(report.totalPages).toBe(1);
    expect(report.total).toBe(1);
  });

  it("leaves the Total row off when the response has no totals", () => {
    const report = buildPayrollSummary({ employees: [] });
    expect(report.sections[0].rows).toEqual([]);
    expect(report.totalPages).toBe(1);
    expect(report.total).toBeNull();
  });
});

describe("buildPayrollBreakdown", () => {
  it("adds a column for every pay item, expense and deduction any employee has", () => {
    const report = buildPayrollBreakdown({
      employees: [
        {
          employeeName: "Olivia Bennett",
          hours: 76,
          grossTaxable: 3000,
          tax: 600,
          net: 2400,
          payItems: { "Ordinary hours": 2800, "Overtime 1.5x": 200 },
          expenses: { "Mileage allowance": 84.5 },
        },
        {
          employeeName: "Jack O'Brien",
          hours: 30,
          grossTaxable: 1100,
          tax: 150,
          net: 950,
          payItems: { "Ordinary hours": 880, "Casual loading 25%": 220 },
          deductions: { "Union fees": 22.4 },
        },
      ],
    });

    const [section] = report.sections;
    expect(labels(section.columns)).toEqual([
      "Employee",
      "Hours",
      "Gross taxable",
      "Ordinary hours",
      "Overtime 1.5x",
      "Casual loading 25%",
      "Tax",
      "Net",
      "Mileage allowance",
      "Union fees",
    ]);
    // Jack has no overtime or mileage — zero, not a gap.
    expect(section.rows[1].values).toMatchObject({
      "payItems.Overtime 1.5x": 0,
      "payItems.Casual loading 25%": 220,
      "expenses.Mileage allowance": 0,
      "deductions.Union fees": 22.4,
    });
    expect(section.rows[0].id).toBe("employee-0");
  });
});

describe("buildAccountingExport", () => {
  it("leads with the three headline figures", () => {
    const report = buildAccountingExport({
      totalGrossTaxable: 12000,
      totalPaygWithholding: 2400,
      totalNet: 9600,
    });
    expect(report.figures).toEqual([
      { key: "gross", label: "Total gross taxable", value: 12000 },
      { key: "payg", label: "Total PAYG withholding", value: 2400 },
      { key: "net", label: "Total net", value: 9600 },
    ]);
  });

  it("keeps all three sections, with hours only on pay items", () => {
    const report = buildAccountingExport({
      totalGrossTaxable: 0,
      totalPaygWithholding: 0,
      totalNet: 0,
      payItems: {
        lines: [{ title: "Ordinary hours", hours: 76, amount: 2800 }],
        total: { hours: 76, amount: 2800 },
      },
      expenses: { lines: [{ line: 7, title: "Mileage", amount: 84.5 }], total: 84.5 },
      deductions: { lines: [], total: 0 },
    });

    expect(report.sections.map((section) => section.title)).toEqual([
      "Pay items",
      "Expenses",
      "Deductions",
    ]);
    const [pay, expenses, deductions] = report.sections;
    expect(labels(pay.columns)).toEqual(["Line", "Description", "Hours", "Amount"]);
    expect(labels(expenses.columns)).toEqual(["Line", "Description", "Amount"]);

    // A missing line number falls back to the position.
    expect(pay.rows[0].values.line).toBe(1);
    expect(pay.rows[1]).toMatchObject({
      total: true,
      values: { title: "Total", hours: 76, amount: 2800 },
    });
    // A bare-number total is the amount.
    expect(expenses.rows[0].values.line).toBe(7);
    expect(expenses.rows[1].values).toMatchObject({ title: "Total", amount: 84.5 });
    // No lines, no Total row — just the section's own empty message.
    expect(deductions.rows).toEqual([]);
  });
});

describe("run reports", () => {
  it("lists every employee's payslip by run, with no Total row", () => {
    const report = buildPayrollEmployeeByRun({
      runs: [{ run: "14", date: "2026-10-06", employeeName: "Mia Patel", ...figures(2600) }],
      pagination: { totalPages: 3 },
    });
    const [section] = report.sections;
    expect(labels(section.columns).slice(0, 3)).toEqual(["Run", "Date", "Employee"]);
    expect(section.rows).toHaveLength(1);
    expect(report.totalPages).toBe(3);
  });

  it("totals the runs", () => {
    const report = buildPayrollSummaryByRun({
      runs: [
        { run: "13", date: "2026-09-22", ...figures(9000) },
        { run: "14", date: "2026-10-06", ...figures(9000) },
      ],
      totals: figures(18000),
    });
    const [section] = report.sections;
    expect(labels(section.columns).slice(0, 2)).toEqual(["Run", "Date"]);
    expect(section.rows[2]).toMatchObject({
      total: true,
      values: { run: "Total", date: "", grossTaxable: 18000 },
    });
    expect(reportRecordCount(report)).toBe(2);
  });

  it("picks the builder by report id", () => {
    const report = buildPayrollReport("payroll-summary-by-run", { runs: [], totals: null });
    expect(report.sections[0].rows).toEqual([]);
  });
});

describe("cells", () => {
  const money: PayrollReportColumn = { key: "net", label: "Net", format: "money" };
  const hours: PayrollReportColumn = { key: "hours", label: "Hours", format: "hours" };
  const date: PayrollReportColumn = { key: "date", label: "Date", format: "date" };
  const text: PayrollReportColumn = { key: "name", label: "Employee", format: "text" };

  it("formats for the screen, with a dash for missing and a blank for deliberate blanks", () => {
    expect(reportCellText(1234.5, money)).toBe("$1,234.50");
    expect(reportCellText(76, hours)).toBe("76.00");
    expect(reportCellText("2026-10-06", date)).toBe("06/10/2026");
    expect(reportCellText(null, text)).toBe("—");
    expect(reportCellText("", text)).toBe("");
  });

  it("writes plain numbers and ISO dates for the CSV", () => {
    expect(reportCsvValue(1234.5, money)).toBe("1234.50");
    expect(reportCsvValue(76, hours)).toBe("76.00");
    expect(reportCsvValue("2026-10-06T00:00:00.000Z", date)).toBe("2026-10-06");
    expect(reportCsvValue(undefined, money)).toBe("");
  });

  it("quotes only what needs quoting, doubling quotes inside", () => {
    expect(csvCell("Olivia Bennett")).toBe("Olivia Bennett");
    expect(csvCell("Bennett, Olivia")).toBe('"Bennett, Olivia"');
    expect(csvCell('The "boss"')).toBe('"The ""boss"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });
});

describe("payrollReportCsv", () => {
  it("has no stray backslashes, and escapes names with commas and quotes", () => {
    const csv = payrollReportCsv(
      buildPayrollSummary({
        employees: [
          {
            employeeName: 'Smith, Jo "JJ"',
            employmentType: "CASUAL",
            ...figures(1000),
          },
        ],
        totals: figures(1000),
      }),
    );

    expect(csv).not.toContain("\\");
    expect(csv.split("\n")).toEqual([
      "Employee,Employment type,Cost to business,Total expenses,Gross taxable,Deductions,Taxes,Net,Hours",
      '"Smith, Jo ""JJ""",Casual,1120.00,10.00,1000.00,5.00,200.00,795.00,76.00',
      "Total,,1120.00,10.00,1000.00,5.00,200.00,795.00,76.00",
    ]);
  });

  it("puts the headline figures first and titles each section, blank lines between", () => {
    const csv = payrollReportCsv(
      buildAccountingExport({
        totalGrossTaxable: 2800,
        totalPaygWithholding: 560,
        totalNet: 2240,
        payItems: { lines: [{ title: "Ordinary hours", hours: 76, amount: 2800 }] },
        expenses: { lines: [] },
        deductions: { lines: [] },
      }),
    );

    expect(csv).toBe(
      [
        "Total gross taxable,2800.00",
        "Total PAYG withholding,560.00",
        "Total net,2240.00",
        "",
        "Pay items",
        "Line,Description,Hours,Amount",
        "1,Ordinary hours,76.00,2800.00",
        "",
        "Expenses",
        "Line,Description,Amount",
        "",
        "Deductions",
        "Line,Description,Amount",
      ].join("\n"),
    );
  });

  it("names the file after the report and year", () => {
    expect(payrollReportFilename("accounting-export", "2025")).toBe(
      "accounting-export-fy2025-26.csv",
    );
  });
});

describe("reportPageInfo", () => {
  const withRows = (count: number, totalPages: number, total: number | null) => ({
    sections: [
      {
        columns: [],
        rows: Array.from({ length: count }, (_, index) => ({ id: String(index), values: {} })),
      },
    ],
    totalPages,
    total,
  });

  it("uses the server's total when it sends one", () => {
    expect(reportPageInfo({ page: 2, pageSize: 10, report: withRows(10, 3, 24) })).toEqual({
      page: 2,
      pageCount: 3,
      total: 24,
      from: 11,
      to: 20,
    });
  });

  it("pins the total exactly on the last page when the server sends none", () => {
    expect(reportPageInfo({ page: 3, pageSize: 10, report: withRows(4, 3, null) })).toEqual({
      page: 3,
      pageCount: 3,
      total: 24,
      from: 21,
      to: 24,
    });
  });

  it("reads zero across the board for an empty report", () => {
    expect(reportPageInfo({ page: 1, pageSize: 10, report: withRows(0, 1, null) })).toEqual({
      page: 1,
      pageCount: 1,
      total: 0,
      from: 0,
      to: 0,
    });
  });
});

describe("fetchPayrollReport", () => {
  it("asks each report's own route for a financial year by payment date", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, employees: [], runs: [] } });
    const routes = {
      "payroll-summary": apiRoutes.payroll.reportSummary,
      "payroll-breakdown": apiRoutes.payroll.reportBreakdown,
      "accounting-export": apiRoutes.payroll.reportAccountingExport,
      "payroll-employee-by-run": apiRoutes.payroll.reportEmployeeByRun,
      "payroll-summary-by-run": apiRoutes.payroll.reportSummaryByRun,
    } as const;

    for (const [id, url] of Object.entries(routes)) {
      expect(payrollReportUrl(id as keyof typeof routes)).toBe(url);
      await fetchPayrollReport(id as keyof typeof routes, { year: "2025", page: 2, limit: 10 });
      expect(apiMock.get).toHaveBeenLastCalledWith(url, {
        params: { startDate: "2025-07-01", endDate: "2026-06-30", page: 2, limit: 10 },
      });
    }
  });

  it("returns the top-level report, which builds with string numbers and nulls", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        success: true,
        message: "Accounting export report",
        meta: { payrunsFound: 2 },
        pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
        payItems: {
          lines: [{ line: 1, title: "Ordinary hours", hours: "76", amount: "2800.5" }],
          total: { hours: 76, amount: "2800.5" },
        },
        expenses: { lines: [], total: 0 },
        deductions: { lines: [], total: 0 },
        totalGrossTaxable: "2800.5",
        totalPaygWithholding: null,
        totalNet: 2240,
      },
    });
    const response = await fetchPayrollReport("accounting-export", {
      year: "2026",
      page: 1,
      limit: 10,
    });
    const report = buildAccountingExport(response as Parameters<typeof buildAccountingExport>[0]);
    expect(report.figures?.map((figure) => figure.value)).toEqual([2800.5, 0, 2240]);
    expect(report.total).toBe(1);
    const [pay] = report.sections;
    expect(reportCellText(pay.rows[0].values.amount, pay.columns[3])).toBe("$2,800.50");
    expect(reportCsvValue(pay.rows[0].values.hours, pay.columns[2])).toBe("76.00");
  });

  it("throws the server's message when it says no", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { success: false, message: "Business not found" } });
    await expect(
      fetchPayrollReport("payroll-summary", { year: "2026", page: 1, limit: 10 }),
    ).rejects.toThrow("Business not found");
  });

  it("lets an HTTP failure through for apiErrorMessage to read", async () => {
    const error = Object.assign(new Error("Request failed"), {
      response: { data: { success: false, message: "Unauthorised" } },
    });
    apiMock.get.mockRejectedValueOnce(error);
    await expect(
      fetchPayrollReport("payroll-summary", { year: "2026", page: 1, limit: 10 }),
    ).rejects.toBe(error);
  });
});
