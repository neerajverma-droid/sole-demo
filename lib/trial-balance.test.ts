import { describe, expect, it, vi, beforeEach } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const { fetchTrialBalance } = await import("@/lib/trial-balance");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchTrialBalance", () => {
  const asAt = { start: "2025-07-01", end: "2026-06-30", label: "FY 2025/2026" };

  it("posts a plain multipart view request with report_type_id 8", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, columns: [], sections: [] },
    });

    await fetchTrialBalance(asAt);

    const [url, form] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.reporting.reports);
    expect(form.get("report_type_id")).toBe("8");
    expect(form.get("action")).toBe("view");
    expect(form.get("start_date")).toBe("2025-07-01");
    expect(form.get("end_date")).toBe("2026-06-30");
  });

  it("fixed columns are always Total Debit / Total Credit, never a period list", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, columns: ["Account Code", "Account Name", "Total Debit", "Total Credit"], sections: [] },
    });
    const report = await fetchTrialBalance(asAt);
    expect(report.columns).toEqual([
      { key: "Total Debit", label: "Total Debit" },
      { key: "Total Credit", label: "Total Credit" },
    ]);
  });

  it("pulls the isTotal-flagged row out of `rows` into `summary`, with the code kept on account rows only", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        columns: ["Account Code", "Account Name", "Total Debit", "Total Credit"],
        sections: [
          {
            section: "Assets",
            rows: [
              { "Account Code": "100", "Account Name": "Cash at bank", "Total Debit": "$500.00", "Total Credit": "$0.00" },
              { "Account Code": "110", "Account Name": "Accounts Receivable", "Total Debit": "$200.00", "Total Credit": "$0.00" },
              { "Account Code": "", "Account Name": "Total Assets", "Total Debit": "$700.00", "Total Credit": "$0.00", isTotal: true },
            ],
          },
        ],
        validation: { total_debit: 700, total_credit: 700, difference: 0, balanced: true },
      },
    });

    const report = await fetchTrialBalance(asAt);

    expect(report.blocks).toHaveLength(1);
    expect(report.blocks[0].rows).toHaveLength(2);
    expect(report.blocks[0].rows[0]).toMatchObject({
      label: "Cash at bank",
      code: "100",
      values: [500, 0],
    });
    expect(report.blocks[0].summary).toMatchObject({ label: "Total Assets", values: [700, 0] });
    // The total row has no code of its own — it must not leak the last
    // account's code onto the summary line.
    expect(report.blocks[0].summary?.code).toBeUndefined();

    expect(report.validation).toEqual({
      totalDebit: 700,
      totalCredit: 700,
      difference: 0,
      balanced: true,
    });
  });

  it("a section with no isTotal row has no summary, rather than losing its last account row", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        columns: ["Account Code", "Account Name", "Total Debit", "Total Credit"],
        sections: [
          {
            section: "Equity",
            rows: [
              { "Account Code": "300", "Account Name": "Owner's Capital", "Total Debit": "$0.00", "Total Credit": "$1,000.00" },
            ],
          },
        ],
      },
    });
    const report = await fetchTrialBalance(asAt);
    expect(report.blocks[0].rows).toHaveLength(1);
    expect(report.blocks[0].summary).toBeNull();
  });

  it("throws the backend's message on success: false", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "No data available" } });
    await expect(fetchTrialBalance(asAt)).rejects.toThrow("No data available");
  });
});
