/**
 * The Balance Sheet.
 *
 * Real data from `POST /report` (`report_type_id=2`, `action="view"`), the
 * same plain multipart endpoint every other report in the suite uses — see
 * `lib/reports.ts` for why it's FormData and not the encrypted-body helper.
 *
 * A balance sheet is stated **as at** a date, not over a range: `getBalanceSheet`
 * accepts `start_date` for signature parity with every other report call but
 * never reads it — every figure comes from `entry_date <= end_date` (confirmed
 * against `services/reports.js`). So the only real input here is which
 * financial year's end to report as at, reusing the same FY list the
 * Depreciation report already offers.
 *
 * The response is `{columns: ['Account Name', ...financialYears], sections:
 * [{section, rows, total}]}` — the identical `{section, rows, total}` shape
 * P&L's own ladder reads, just with a financial year per column instead of a
 * month. `lib/ladder-report.ts`'s `LadderReport` is exactly that shape, so
 * this file's only real job is turning the backend's dynamic year columns into
 * `LadderColumn[]` and its rows into parsed `number[]`.
 *
 * The backend also computes a genuine balance check — assets against
 * liabilities plus equity, per year — and the old `sole-webapp` UI silently
 * drops it. It's surfaced here rather than left unused: a real, already-computed
 * figure the reader would otherwise have to add up themselves.
 */

import { format } from "date-fns";

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { recentFinancialYears, type FinancialYearOption } from "@/lib/asset-depreciation-report";
import { parseLadderAmount, type LadderBlock, type LadderReport } from "@/lib/ladder-report";

/** "As at 30 Jun 2026" — the one date a balance sheet is stated against. */
export function asAtLabel(isoDate: string): string {
  return `As at ${format(new Date(`${isoDate}T00:00:00`), "d MMM yyyy")}`;
}

export const BALANCE_SHEET_REPORT_TYPE_ID = "2";

export { recentFinancialYears, type FinancialYearOption };

export type BalanceSheetValidationRow = {
  financialYear: string;
  assets: number;
  liabilities: number;
  equity: number;
  difference: number;
};

export type BalanceSheetValidation = {
  isBalanced: boolean;
  rows: BalanceSheetValidationRow[];
};

export type BalanceSheetReport = LadderReport & {
  asAt: FinancialYearOption;
  validation: BalanceSheetValidation | null;
};

/* ------------------------------------------------------------------ *
 * Backend shape
 * ------------------------------------------------------------------ */

type BackendLadderRow = Record<string, string | number | null> & { "Account Name": string };
type BackendLadderSection = {
  section: string;
  rows: BackendLadderRow[];
  total: BackendLadderRow | null;
};

type BackendValidationRow = {
  financial_year: string;
  assets: number | string;
  liabilities: number | string;
  equity: number | string;
  difference: number | string;
};

type BackendBalanceSheetResponse = {
  success?: boolean;
  message?: string;
  columns?: string[];
  sections?: BackendLadderSection[];
  validation?: { isBalanced?: boolean; rows?: BackendValidationRow[] } | null;
};

function toBlock(section: BackendLadderSection, years: string[]): LadderBlock {
  return {
    id: section.section,
    section: section.section,
    rows: section.rows.map((row, index) => ({
      id: `${section.section}-${index}`,
      label: row["Account Name"],
      values: years.map((year) => parseLadderAmount(row[year])),
    })),
    summary: section.total
      ? {
          id: `${section.section}-total`,
          label: section.total["Account Name"],
          values: years.map((year) => parseLadderAmount(section.total![year])),
        }
      : null,
  };
}

/**
 * Whether a `success: false` response is really just "nothing posted yet",
 * not a fetch failure.
 *
 * `handleReports`' `balance_sheet` branch answers a brand-new business (or any
 * FY with nothing posted) with `success: false` and `columns: [], sections:
 * []` — confirmed directly against `controllers/reports.js`, not inferred —
 * where every other report in the suite answers the same situation with
 * `success: true` and empty arrays. A genuine failure never reaches this
 * branch's response shape at all: `handleReports`' own catch-all returns
 * `{success: false, message: 'Failed to generate report'}` with no `columns`
 * or `sections` field, so checking for those as real (if empty) arrays is
 * what tells the two apart.
 */
function isEmptyBalanceSheetResult(body: BackendBalanceSheetResponse): boolean {
  return (
    Array.isArray(body.columns) &&
    body.columns.length === 0 &&
    Array.isArray(body.sections) &&
    body.sections.length === 0
  );
}

/* ------------------------------------------------------------------ *
 * Fetching
 * ------------------------------------------------------------------ */

export async function fetchBalanceSheet(asAt: FinancialYearOption): Promise<BalanceSheetReport> {
  const form = new FormData();
  form.append("report_type_id", BALANCE_SHEET_REPORT_TYPE_ID);
  form.append("action", "view");
  form.append("start_date", asAt.start);
  form.append("end_date", asAt.end);

  const response = await api.post<BackendBalanceSheetResponse>(
    apiRoutes.reporting.reports,
    form,
  );
  const body = response.data;
  if (body.success === false && !isEmptyBalanceSheetResult(body)) {
    throw new Error(body.message ?? "Couldn't load the Balance Sheet");
  }

  const years = (body.columns ?? []).filter((column) => column !== "Account Name");
  const columns = years.map((year) => ({ key: year, label: year }));
  const blocks = (body.sections ?? []).map((section) => toBlock(section, years));

  const validation = body.validation?.rows
    ? {
        isBalanced: Boolean(body.validation.isBalanced),
        rows: body.validation.rows.map((row) => ({
          financialYear: row.financial_year,
          assets: parseLadderAmount(row.assets),
          liabilities: parseLadderAmount(row.liabilities),
          equity: parseLadderAmount(row.equity),
          difference: parseLadderAmount(row.difference),
        })),
      }
    : null;

  return {
    rangeLabel: asAtLabel(asAt.end),
    columns,
    blocks,
    asAt,
    validation,
  };
}
