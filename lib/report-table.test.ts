import { describe, expect, it, vi, beforeEach } from "vitest";

import apiRoutes from "@/config/api-routes";
import type { CustomerSupplierTab } from "@/lib/report-configs";
import type { ReportColumnSpec } from "@/lib/report-table";

const apiMock = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };

vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const {
  AUDIT_COLUMNS,
  auditTrailSource,
  cellAlignment,
  fetchTabularReport,
  formatReportCell,
  isBlankCell,
  isGroupedRepeat,
  pageCountOf,
  parseReportDate,
  parseReportMoney,
  reportEndpointSource,
  rowFromCells,
} = await import("@/lib/report-table");

const {
  assetListingConfig,
  auditTrailConfig,
  cashFlowConfig,
  chartOfAccountsConfig,
  customerSupplierConfig,
  gstTreatmentTone,
  isHeaderOnlyRow,
  RECORD_TYPE_OF,
} = await import("@/lib/report-configs");

beforeEach(() => {
  vi.clearAllMocks();
});

/** A `{key,value}[]` row exactly as `handleReports`' generic branch sends it. */
function cells(fields: Record<string, string | number | null>) {
  return Object.entries(fields).map(([key, value]) => ({ key, value }));
}

describe("parseReportMoney", () => {
  it("reads the backend's formatted money", () => {
    expect(parseReportMoney("$1,234.56")).toBe(1234.56);
    expect(parseReportMoney("$-20.00")).toBe(-20);
    // The customer/supplier report sends raw numbers, not formatted money.
    expect(parseReportMoney("1234.5")).toBe(1234.5);
    expect(parseReportMoney(42)).toBe(42);
  });

  it("falls back to 0 for anything unreadable", () => {
    expect(parseReportMoney(null)).toBe(0);
    expect(parseReportMoney("---")).toBe(0);
  });
});

describe("parseReportDate", () => {
  it("turns DD/MM/YYYY into ISO", () => {
    expect(parseReportDate("31/03/2026")).toBe("2026-03-31");
    expect(parseReportDate("5/3/2026")).toBe("2026-03-05");
  });

  it("takes the date half of an audit timestamp", () => {
    expect(parseReportDate("29/09/2026 at 03:41 PM")).toBe("2026-09-29");
  });

  it("returns empty for anything else", () => {
    expect(parseReportDate("2026-07-01")).toBe("");
    expect(parseReportDate(null)).toBe("");
  });
});

describe("isBlankCell", () => {
  it("treats the backend's several ways of saying nothing as blank", () => {
    expect(isBlankCell(null)).toBe(true);
    expect(isBlankCell("")).toBe(true);
    // The generic table renders a literal "NULL" string for missing values.
    expect(isBlankCell("NULL")).toBe(true);
    expect(isBlankCell("0")).toBe(false);
  });
});

describe("formatReportCell", () => {
  it("formats by the column's declared type", () => {
    expect(formatReportCell("$1,234.56", { key: "x", format: "money" })).toBe("$1,234.56");
    expect(formatReportCell("31/03/2026", { key: "x", format: "date" })).toBe("31 Mar 2026");
    expect(formatReportCell("Yes", { key: "x", format: "badge" })).toBe("Yes");
    expect(formatReportCell(null, { key: "x", format: "money" })).toBe("—");
  });

  it("leaves an unparseable date as the backend wrote it", () => {
    expect(formatReportCell("29/09/2026 at 03:41 PM", { key: "x" })).toBe(
      "29/09/2026 at 03:41 PM",
    );
  });
});

describe("cellAlignment", () => {
  it("right-aligns figures and left-aligns everything else", () => {
    expect(cellAlignment({ key: "x", format: "money" })).toBe("right");
    expect(cellAlignment({ key: "x", format: "number" })).toBe("right");
    expect(cellAlignment({ key: "x" })).toBe("left");
    expect(cellAlignment({ key: "x", format: "money", align: "center" })).toBe("center");
  });
});

describe("pageCountOf", () => {
  it("derives the page count when the backend under-reports it", () => {
    // sole-ocr's audit log uses Math.floor, so 25 rows at 20 a page claims 1.
    expect(pageCountOf(1, 25, 20)).toBe(2);
    expect(pageCountOf(0, 25, 20)).toBe(2);
  });

  it("keeps the backend's count when it isn't short", () => {
    expect(pageCountOf(3, 25, 20)).toBe(3);
  });

  it("is never less than one page", () => {
    expect(pageCountOf(0, 0, 20)).toBe(1);
  });
});

describe("isGroupedRepeat", () => {
  const SECTION: ReportColumnSpec = { key: "Section", groupRuns: true };
  const CODE: ReportColumnSpec = { key: "Account Code" };

  const row = (section: string, code: string) => ({
    id: code,
    cells: { Section: section, "Account Code": code },
  });

  it("is false for the first row, however the column is configured", () => {
    const rows = [row("Assets", "100"), row("Assets", "110")];
    expect(isGroupedRepeat(rows, 0, SECTION)).toBe(false);
  });

  it("is true only where a `groupRuns` column's value repeats the row above", () => {
    const rows = [row("Assets", "100"), row("Assets", "110"), row("Income", "400")];
    // Same section as the row above: hidden.
    expect(isGroupedRepeat(rows, 1, SECTION)).toBe(true);
    // A new section: shown.
    expect(isGroupedRepeat(rows, 2, SECTION)).toBe(false);
  });

  it("never groups a column that didn't opt in", () => {
    // Every row shares the same Account Code here, on purpose — Section is
    // the only column Chart of Accounts marks `groupRuns`, and a repeated
    // code must still print on every row.
    const rows = [row("Assets", "100"), row("Assets", "100")];
    expect(isGroupedRepeat(rows, 1, CODE)).toBe(false);
  });
});

describe("rowFromCells", () => {
  it("keys the row by the backend's own column names", () => {
    expect(rowFromCells(cells({ "Asset Name": "Laptop", "GST Value": null }))).toEqual({
      "Asset Name": "Laptop",
      "GST Value": null,
    });
  });
});

describe("reportEndpointSource", () => {
  it("posts plain multipart with the report type as a string", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: [], pagination: { total: 0 } },
    });

    const source = reportEndpointSource("3");
    await source({
      span: { from: new Date(2026, 6, 1), to: new Date(2027, 5, 30) },
      page: 2,
      pageSize: 25,
      extra: { recordType: "Invoice" },
    });

    const [url, form] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.reporting.reports);
    expect(form).toBeInstanceOf(FormData);
    // sole-ocr switches on `===` against string constants; a number 400s.
    expect(form.get("report_type_id")).toBe("3");
    expect(form.get("action")).toBe("view");
    expect(form.get("start_date")).toBe("2026-07-01");
    expect(form.get("end_date")).toBe("2027-06-30");
    expect(form.get("page")).toBe("2");
    expect(form.get("page_size")).toBe("25");
    expect(form.get("recordType")).toBe("Invoice");
  });

  it("throws the backend's message on success: false", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Invalid Report Type" },
    });
    await expect(
      reportEndpointSource("99")({
        span: { from: new Date(), to: new Date() },
        page: 1,
        pageSize: 10,
        extra: {},
      }),
    ).rejects.toThrow("Invalid Report Type");
  });
});

describe("asset listing", () => {
  /** Exactly the seven aliases `getAssetsLog` selects, in its own wording. */
  const BACKEND_ROW = {
    "Asset Number": "12",
    "Asset Name": "MacBook Pro",
    "Asset Value (excl. GST)": "$2,000.00",
    "GST Value": "$200.00",
    "Asset Total Value (incl. GST)": "$2,200.00",
    "Date of Purchase": "15/08/2026",
    Matched: "Yes",
  };

  it("every configured column key exists in a real response row", () => {
    const row = rowFromCells(cells(BACKEND_ROW));
    for (const column of assetListingConfig.columns) {
      expect(Object.keys(row)).toContain(column.key);
    }
  });

  it("maps a page of rows", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: [cells(BACKEND_ROW)],
        pagination: { total: 1, total_pages: 1 },
      },
    });

    const report = await fetchTabularReport(
      assetListingConfig,
      "Custom range",
      { from: "2026-07-01", to: "2027-06-30" },
      1,
      25,
    );

    expect(report.total).toBe(1);
    expect(report.rows[0].cells["Asset Name"]).toBe("MacBook Pro");
    expect(report.range).toEqual({ from: "2026-07-01", to: "2027-06-30" });
  });
});

describe("chart of accounts", () => {
  const BACKEND_ROW = {
    Section: "Expenses",
    "Account Code": "310",
    "Account Name": "Cost of Goods Sold",
    Category: "Expenses",
    "Category Id": "1",
    "Subcategory Id": "88",
    Transactions: "14",
    "GST Treatment": "Mixed (71% GST)",
  };

  it("every configured column key exists in a real response row", () => {
    const row = rowFromCells(cells(BACKEND_ROW));
    for (const column of chartOfAccountsConfig.columns) {
      expect(Object.keys(row)).toContain(column.key);
    }
  });

  it("colours each GST treatment the backend can send", () => {
    expect(gstTreatmentTone("GST")).toBe("success");
    expect(gstTreatmentTone("Mixed (71% GST)")).toBe("warning");
    expect(gstTreatmentTone("No transactions")).toBe("secondary");
    expect(gstTreatmentTone("GST Free / Excluded")).toBe("outline");
  });

  it("offers server-side sort on the three columns the backend whitelists", () => {
    const sortable = chartOfAccountsConfig.columns
      .filter((column) => column.sortKey)
      .map((column) => column.sortKey);
    expect(sortable).toEqual(["section", "code", "name"]);
  });

  it("groups repeated sections rather than restating them", () => {
    const sectionColumn = chartOfAccountsConfig.columns.find(
      (column) => column.key === "Section",
    );
    expect(sectionColumn?.groupRuns).toBe(true);
  });

  it("is undated, because the endpoint ignores the dates it accepts", () => {
    expect(chartOfAccountsConfig.dated).toBe(false);
    expect(chartOfAccountsConfig.periods).toEqual([]);
  });

  it("passes the section filter and sort through as server-side params", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: [], pagination: { total: 0 } },
    });

    await fetchTabularReport(chartOfAccountsConfig, "This financial year", null, 1, 25, {
      section: "Income",
      sort_by: "name",
      sort_dir: "desc",
    });

    const [, form] = apiMock.post.mock.calls[0];
    expect(form.get("report_type_id")).toBe("10");
    expect(form.get("section")).toBe("Income");
    expect(form.get("sort_by")).toBe("name");
    expect(form.get("sort_dir")).toBe("desc");
  });
});

describe("customer / supplier", () => {
  const INVOICE_ROW = {
    "Contact Name": "Acme Pty Ltd",
    "Invoice RefID": "INV-0001",
    "Invoice Status": "Paid",
    "Invoice Date": "15/08/2026",
    "Invoice Due Date": "30/08/2026",
    "Invoice Value ($) - Excl. GST": "1000",
    "Invoice Value ($) - Incl. GST": "1100",
    "Invoice Description": "Consulting",
  };

  it("every configured column key exists in a real response row", () => {
    const row = rowFromCells(cells(INVOICE_ROW));
    for (const column of customerSupplierConfig("Invoices").columns) {
      expect(Object.keys(row)).toContain(column.key);
    }
  });

  /**
   * Every key the backend sends for a section is shown. The old report's whole
   * point is the export, so a column quietly dropped here is data someone's
   * accountant doesn't get.
   */
  it("shows every column the backend sends, for every tab", () => {
    const BACKEND_KEYS: Record<CustomerSupplierTab, string[]> = {
      Contacts: [
        "Contact Name",
        "Contact Mail",
        "Contact Mobile",
        "Contact Address",
        "Contact Website",
        "Contact ABN",
        "Contact BusinessName",
        "Contact Type",
      ],
      Invoices: Object.keys(INVOICE_ROW),
      Quotes: [
        "Contact Name",
        "Quote RefID",
        "Quote Status",
        "Quote Date",
        "Quote Value ($) - Excl. GST",
        "Quote Value ($) - Incl. GST",
        "Quote Description",
      ],
      Expenses: [
        "Contact Name",
        "Expense Name",
        "Expense Description",
        "Expense Date",
        "Expense Value ($) - Excl. GST",
        "Expense Value ($) - Incl. GST",
        "Expense Category",
      ],
      Assets: [
        "Contact Name",
        "Asset Name",
        "Asset Date",
        "Asset Value ($) - Excl. GST",
        "Asset Value ($) - Incl. GST",
        "Asset Category",
      ],
    };

    for (const [tab, keys] of Object.entries(BACKEND_KEYS)) {
      const shown = customerSupplierConfig(
        tab as CustomerSupplierTab,
      ).columns.map((column) => column.key);
      expect([...shown].sort()).toEqual([...keys].sort());
    }
  });

  it("maps each tab to the recordType the backend expects", () => {
    expect(RECORD_TYPE_OF).toEqual({
      Contacts: "Client",
      Invoices: "Invoice",
      Quotes: "Quote",
      Expenses: "Expense",
      Assets: "Asset",
    });
  });

  it("recognises the header-only row the backend sends for an empty section", () => {
    expect(isHeaderOnlyRow({ "Contact Name": "", "Invoice RefID": "" })).toBe(true);
    expect(isHeaderOnlyRow({ "Contact Name": "Acme", "Invoice RefID": "" })).toBe(false);
  });

  it("reports an empty section as empty rather than one ghost row", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        // buildHeaderRow: the headers with empty values, not a record.
        data: [cells({ "Contact Name": "", "Invoice RefID": "", "Invoice Status": "" })],
        pagination: { total: 1, total_pages: 1 },
      },
    });

    const report = await fetchTabularReport(
      customerSupplierConfig("Invoices"),
      "This financial year",
      null,
      1,
      25,
      { recordType: "Invoice" },
    );

    expect(report.rows).toHaveLength(0);
    expect(report.total).toBe(0);
  });

  it("keeps real rows", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: [cells(INVOICE_ROW)],
        pagination: { total: 1, total_pages: 1 },
      },
    });

    const report = await fetchTabularReport(
      customerSupplierConfig("Invoices"),
      "This financial year",
      null,
      1,
      25,
      { recordType: "Invoice" },
    );
    expect(report.rows).toHaveLength(1);
    expect(report.total).toBe(1);
  });
});

describe("cash flow", () => {
  const BACKEND_ROW = {
    Date: "15/08/2026",
    "Transaction Type": "invoice",
    "Account Code": "100",
    "Account Name": "Business Cheque Account",
    Debit: "$1,100.00",
    Credit: "$0.00",
    "Cash Flow Type": "Inflow",
    "Net Movement": "$1,100.00",
  };

  it("every configured column key exists in a real response row", () => {
    const row = rowFromCells(cells(BACKEND_ROW));
    for (const column of cashFlowConfig.columns) {
      expect(Object.keys(row)).toContain(column.key);
    }
  });

  it("colours each cash flow direction the backend can send", () => {
    const flowColumn = cashFlowConfig.columns.find((c) => c.key === "Cash Flow Type");
    expect(flowColumn?.tone?.("Inflow")).toBe("success");
    expect(flowColumn?.tone?.("Outflow")).toBe("outline");
    expect(flowColumn?.tone?.("Non-Cash")).toBe("secondary");
  });

  it("reads the backend's {Label,Amount} summary into report.summary", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: [cells(BACKEND_ROW)],
        summary: [
          { Label: "Total Cash Inflows", Amount: "$1,100.00" },
          { Label: "Total Cash Outflows", Amount: "$0.00" },
          { Label: "Net Cash Movement", Amount: "$1,100.00" },
        ],
        pagination: { total: 1, total_pages: 1 },
      },
    });

    const report = await fetchTabularReport(
      cashFlowConfig,
      "This month",
      null,
      1,
      50,
    );

    expect(report.summary).toEqual([
      { label: "Total Cash Inflows", amount: 1100 },
      { label: "Total Cash Outflows", amount: 0 },
      { label: "Net Cash Movement", amount: 1100 },
    ]);
  });

  it("has no summary at all when the backend sends none", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: [], pagination: { total: 0 } },
    });
    const report = await fetchTabularReport(cashFlowConfig, "This month", null, 1, 50);
    expect(report.summary).toBeUndefined();
  });
});

describe("audit trail", () => {
  it("posts an encrypted body to the audit-log endpoint", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          details: [
            {
              log_id: 91,
              performed_at: "29/09/2026 at 03:41 PM",
              performed_by: "sam@example.com",
              module: "Reporting Suite",
              action: "report.viewed",
              description: "Viewed BAS report",
            },
          ],
          total: 1,
          total_pages: 0,
        },
      },
    });

    const result = await auditTrailSource({
      span: { from: new Date(), to: new Date() },
      page: 1,
      pageSize: 25,
      extra: {},
    });

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.settings.auditLogs);
    // This endpoint IS decrypt-aware, unlike /report — so it gets the
    // encrypted body every other non-GET call in the app uses.
    expect(body).toHaveProperty("data");
    expect(typeof (body as { data: string }).data).toBe("string");

    expect(result.rows[0].id).toBe("91");
    expect(result.rows[0].cells[AUDIT_COLUMNS.who]).toBe("sam@example.com");
    expect(result.rows[0].cells[AUDIT_COLUMNS.module]).toBe("Reporting Suite");
    // total_pages came back as 0 (floor bug) for 1 row — derived instead.
    expect(result.pageCount).toBe(1);
  });

  it("offers no export, because the endpoint has none", () => {
    expect(auditTrailConfig.reportTypeId).toBeUndefined();
    expect(auditTrailConfig.dated).toBe(false);
  });

  it("every configured column key is one the source actually writes", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: { details: [{ log_id: 1 }], total: 1, total_pages: 1 },
      },
    });
    const result = await auditTrailSource({
      span: { from: new Date(), to: new Date() },
      page: 1,
      pageSize: 25,
      extra: {},
    });
    for (const column of auditTrailConfig.columns) {
      expect(Object.keys(result.rows[0].cells)).toContain(column.key);
    }
  });
});
