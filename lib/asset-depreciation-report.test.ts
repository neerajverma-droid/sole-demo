import { describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = { get: vi.fn() };

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

const {
  fetchDepreciationReport,
  recentFinancialYears,
  depreciationReportCsv,
} = await import("@/lib/asset-depreciation-report");

describe("recentFinancialYears", () => {
  it("starts the current FY at 1 July, for a date in the first half of the calendar year", () => {
    const [current] = recentFinancialYears("2026-03-15");
    expect(current).toEqual({
      start: "2025-07-01",
      end: "2026-06-30",
      label: "FY 2025/2026",
    });
  });

  it("rolls over to the new FY once July arrives", () => {
    const [current] = recentFinancialYears("2026-07-01");
    expect(current).toEqual({
      start: "2026-07-01",
      end: "2027-06-30",
      label: "FY 2026/2027",
    });
  });

  it("returns the current FY plus the four before it", () => {
    // September is inside FY 2026/2027 (which starts that July), not 2025/2026.
    const years = recentFinancialYears("2026-09-16");
    expect(years).toHaveLength(5);
    expect(years.map((fy) => fy.label)).toEqual([
      "FY 2026/2027",
      "FY 2025/2026",
      "FY 2024/2025",
      "FY 2023/2024",
      "FY 2022/2023",
    ]);
  });
});

describe("fetchDepreciationReport", () => {
  it("GETs with fy_start/fy_end and maps every row", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          total_depreciation: "4200.50",
          asset_count: 1,
          assets: [
            {
              asset_id: 501,
              asset_name: "MacBook Pro",
              asset_type: "Technology",
              purchase_price: "4299.00",
              depreciation_method: "diminishing_value",
              opening_value: "4299.00",
              accumulated_depreciation: "4200.50",
              book_value: "98.50",
              fy_depreciation: "1200.00",
            },
          ],
        },
      },
    });

    const report = await fetchDepreciationReport("2025-07-01", "2026-06-30");

    expect(apiMock.get).toHaveBeenCalledWith(
      apiRoutes.asset.depreciation.summary,
      { params: { fy_start: "2025-07-01", fy_end: "2026-06-30" } },
    );
    expect(report).toEqual({
      totalDepreciation: 4200.5,
      assetCount: 1,
      rows: [
        {
          assetId: "501",
          assetName: "MacBook Pro",
          assetType: "Technology",
          purchasePrice: 4299,
          method: "Diminishing value",
          openingValue: 4299,
          accumulatedDepreciation: 4200.5,
          bookValue: 98.5,
          fyDepreciation: 1200,
        },
      ],
    });
  });

  it("returns an empty report rather than throwing when nothing comes back", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    const report = await fetchDepreciationReport("2025-07-01", "2026-06-30");
    expect(report).toEqual({ totalDepreciation: 0, assetCount: 0, rows: [] });
  });
});

describe("depreciationReportCsv", () => {
  it("quotes a field containing a comma, unlike sole-webapp's own export", () => {
    const csv = depreciationReportCsv({
      totalDepreciation: 100,
      assetCount: 1,
      rows: [
        {
          assetId: "1",
          assetName: "Desk, standing",
          assetType: "Furniture",
          purchasePrice: 500,
          method: "Straight line",
          openingValue: 500,
          accumulatedDepreciation: 100,
          bookValue: 400,
          fyDepreciation: 100,
        },
      ],
    });
    const lines = csv.split("\n");
    expect(lines[0]).toBe(
      "Asset Name,Asset Type,Purchase Price,Method,Opening Value,Accumulated Dep.,Book Value,FY Depreciation",
    );
    expect(lines[1]).toBe(
      '"Desk, standing",Furniture,500,Straight line,500,100,400,100',
    );
  });
});
