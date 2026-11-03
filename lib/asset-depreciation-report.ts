/**
 * The depreciation report — every asset with an active depreciation record,
 * and what it claimed in a given financial year (the business's own: 1 July in
 * Australia, 1 April in New Zealand).
 *
 * `GET /assets/depreciation/summary` doesn't recompute anything: it sums
 * pre-generated `asset_depreciation_entries` rows for the FY window and
 * returns them alongside each asset's *current* (not FY-scoped) opening
 * value, accumulated depreciation and book value — confirmed against
 * `services/assetDepreciation.js`. Only `fyDepreciation` below is actually
 * scoped to the selected year; the other three describe the asset as it
 * stands today, same as sole-webapp's own report shows them.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { depreciationMethodFromApi, type DepreciationMethod } from "@/lib/assets";
import {
  AU_FISCAL_YEAR_START,
  fiscalYearLabel,
  fiscalYearRange,
  recentFiscalYears,
  type FiscalYearStart,
} from "@/lib/fiscal-year";

export type FinancialYearOption = {
  /** ISO `YYYY-MM-DD` — 1 July in Australia. */
  start: string;
  /** ISO `YYYY-MM-DD` — 30 June the following year in Australia. */
  end: string;
  label: string;
};

/**
 * The financial year containing `today`, and the four before it — same window
 * sole-webapp's own FY picker offers. 1 July to 30 June unless `start` (the
 * business's country) says otherwise.
 */
export function recentFinancialYears(
  today: string,
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): FinancialYearOption[] {
  const date = new Date(`${today}T00:00:00`);
  return recentFiscalYears(5, date, start).map((y) => ({
    ...fiscalYearRange(y, start),
    label: fiscalYearLabel(y, "long"),
  }));
}

export type DepreciationReportRow = {
  assetId: string;
  assetName: string;
  assetType: string;
  purchasePrice: number;
  method: DepreciationMethod;
  /** Current lifetime figures — not scoped to the selected FY. */
  openingValue: number;
  accumulatedDepreciation: number;
  bookValue: number;
  /** The one figure that IS scoped to the selected FY. */
  fyDepreciation: number;
};

export type DepreciationReport = {
  totalDepreciation: number;
  assetCount: number;
  rows: DepreciationReportRow[];
};

type ApiDepreciationReportRow = {
  asset_id: number | string;
  asset_name?: string | null;
  asset_type?: string | null;
  purchase_price?: number | string | null;
  depreciation_method?: string | null;
  opening_value?: number | string | null;
  accumulated_depreciation?: number | string | null;
  book_value?: number | string | null;
  fy_depreciation?: number | string | null;
};

function mapReportRow(raw: ApiDepreciationReportRow): DepreciationReportRow {
  return {
    assetId: String(raw.asset_id),
    assetName: raw.asset_name ?? "",
    assetType: raw.asset_type ?? "",
    purchasePrice: Number(raw.purchase_price) || 0,
    method: depreciationMethodFromApi(raw.depreciation_method ?? null),
    openingValue: Number(raw.opening_value) || 0,
    accumulatedDepreciation: Number(raw.accumulated_depreciation) || 0,
    bookValue: Number(raw.book_value) || 0,
    fyDepreciation: Number(raw.fy_depreciation) || 0,
  };
}

/** Both bounds are required by the endpoint — full ISO dates, not bare years. */
export async function fetchDepreciationReport(
  fyStart: string,
  fyEnd: string,
): Promise<DepreciationReport> {
  const response = await api.get<{
    success: boolean;
    message?: string;
    data?: {
      total_depreciation?: number | string;
      asset_count?: number;
      assets?: ApiDepreciationReportRow[];
    };
  }>(apiRoutes.asset.depreciation.summary, {
    params: { fy_start: fyStart, fy_end: fyEnd },
  });
  const data = response.data?.data;
  const rows = (data?.assets ?? []).map(mapReportRow);
  return {
    totalDepreciation: Number(data?.total_depreciation) || 0,
    assetCount: data?.asset_count ?? rows.length,
    rows,
  };
}

/** Quotes a field only when it needs it, per RFC 4180. */
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The same columns, in the same order, as sole-webapp's own report export —
 * but with fields actually quoted. Its version joins raw values with commas
 * and would silently corrupt a row the moment an asset name contained one
 * (e.g. "Desk, standing") — worth matching the content, not that bug.
 */
export function depreciationReportCsv(report: DepreciationReport): string {
  const headers = [
    "Asset Name",
    "Asset Type",
    "Purchase Price",
    "Method",
    "Opening Value",
    "Accumulated Dep.",
    "Book Value",
    "FY Depreciation",
  ];
  const rows = report.rows.map((row) => [
    row.assetName,
    row.assetType,
    String(row.purchasePrice),
    row.method,
    String(row.openingValue),
    String(row.accumulatedDepreciation),
    String(row.bookValue),
    String(row.fyDepreciation),
  ]);
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}
