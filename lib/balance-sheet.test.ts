import { describe, expect, it, vi, beforeEach } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const { fetchBalanceSheet, asAtLabel, recentFinancialYears } = await import(
  "@/lib/balance-sheet"
);

beforeEach(() => {
  vi.clearAllMocks();
});

function backendRow(fields: Record<string, string | number | null>) {
  return fields;
}

describe("fetchBalanceSheet", () => {
  const asAt = { start: "2025-07-01", end: "2026-06-30", label: "FY 2025/2026" };

  it("posts a plain multipart view request", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, columns: ["Account Name"], sections: [] },
    });

    await fetchBalanceSheet(asAt);

    const [url, form] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.reporting.reports);
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("report_type_id")).toBe("2");
    expect(form.get("action")).toBe("view");
    expect(form.get("start_date")).toBe("2025-07-01");
    expect(form.get("end_date")).toBe("2026-06-30");
  });

  it("turns financial-year columns and {section,rows,total} into a ladder", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        columns: ["Account Name", "2024-2025", "2025-2026"],
        sections: [
          {
            section: "Assets",
            rows: [
              backendRow({ "Account Name": "Cash at bank", "2024-2025": "$1,000.00", "2025-2026": "$1,500.00" }),
            ],
            total: backendRow({ "Account Name": "Total Assets", "2024-2025": "$1,000.00", "2025-2026": "$1,500.00" }),
          },
        ],
        validation: {
          isBalanced: false,
          rows: [
            { financial_year: "2025-2026", assets: 1500, liabilities: 200, equity: 1000, difference: 300 },
          ],
        },
      },
    });

    const report = await fetchBalanceSheet(asAt);

    expect(report.columns).toEqual([
      { key: "2024-2025", label: "2024-2025" },
      { key: "2025-2026", label: "2025-2026" },
    ]);
    expect(report.blocks).toHaveLength(1);
    expect(report.blocks[0].section).toBe("Assets");
    expect(report.blocks[0].rows[0]).toMatchObject({
      label: "Cash at bank",
      values: [1000, 1500],
    });
    expect(report.blocks[0].summary).toMatchObject({
      label: "Total Assets",
      values: [1000, 1500],
    });
    expect(report.validation).toEqual({
      isBalanced: false,
      rows: [
        { financialYear: "2025-2026", assets: 1500, liabilities: 200, equity: 1000, difference: 300 },
      ],
    });
    expect(report.rangeLabel).toBe("As at 30 Jun 2026");
  });

  it("reads a section with no total as having no summary", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        columns: ["Account Name", "2025-2026"],
        sections: [{ section: "Equity", rows: [], total: null }],
      },
    });
    const report = await fetchBalanceSheet(asAt);
    expect(report.blocks[0].summary).toBeNull();
    expect(report.validation).toBeNull();
  });

  /**
   * `handleReports`' `balance_sheet` branch answers "nothing posted yet" with
   * `success: false, columns: [], sections: []` — confirmed directly against
   * `sole-ocr/src/controllers/reports.js:644-651` — unlike every other report
   * in the suite, which answers the same situation with `success: true`. A
   * brand-new business's first Balance Sheet must render as the report's own
   * empty state, not as a failed fetch.
   */
  it("reads the backend's own 'no data' shape as an empty report, not an error", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: false,
        message: "No data available for this report",
        columns: [],
        sections: [],
      },
    });

    const report = await fetchBalanceSheet(asAt);
    expect(report.blocks).toEqual([]);
    expect(report.columns).toEqual([]);
    expect(report.validation).toBeNull();
  });

  it("still throws for a genuine failure, which carries no columns/sections at all", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Failed to generate report" },
    });
    await expect(fetchBalanceSheet(asAt)).rejects.toThrow("Failed to generate report");
  });
});

describe("asAtLabel", () => {
  it("formats an ISO date as a stated-as-at line", () => {
    expect(asAtLabel("2026-06-30")).toBe("As at 30 Jun 2026");
  });
});

describe("recentFinancialYears", () => {
  it("is re-exported unchanged from the depreciation report's own helper", () => {
    const years = recentFinancialYears("2026-09-28");
    expect(years).toHaveLength(5);
    // September falls after 1 July, so the FY containing it starts in 2026.
    expect(years[0]).toEqual({ start: "2026-07-01", end: "2027-06-30", label: "FY 2026/2027" });
  });
});
