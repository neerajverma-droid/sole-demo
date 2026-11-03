/**
 * The Trial Balance.
 *
 * Real data from `POST /report` (`report_type_id=8`, `action="view"`) — the
 * same endpoint and FormData shape as every other report. Point-in-time like
 * the Balance Sheet: `getTrialBalanceReport` takes a single `asOfDate` (the
 * request's `end_date`) and filters `entry_date <= asOfDate`, so this reuses
 * the same financial-year "as at" picker rather than a date range.
 *
 * `sole-webapp`'s own screen *does* show a date-range picker for this report —
 * confirmed a leftover, not a real capability: the backend discards
 * `start_date` for it exactly as it does for Balance Sheet, the print header
 * already special-cases this report to read "As at …" rather than a range,
 * and Balance Sheet's own picker is correctly hidden. A control offering a
 * range the server ignores is worse than the "as at" picker this uses instead.
 *
 * The response shape genuinely differs from the Balance Sheet's, in the two
 * ways that matter to a reader of `lib/ladder-report.ts`:
 *
 *  - Columns are always the same four — `Account Code`, `Account Name`,
 *    `Total Debit`, `Total Credit` — never a dynamic list of periods.
 *  - A section's total isn't a separate `total` object; it's the *last* row
 *    of `section.rows`, flagged `isTotal: true` (confirmed against
 *    `controllers/reports.js`'s `trial_balance` branch). `toBlock` below pulls
 *    that row back out into `LadderBlock.summary`, which is the one place this
 *    file's shape and Balance Sheet's are made to agree.
 *
 * The backend also sends a real balance check (`total_debit === total_credit`,
 * the classic definition) — `sole-webapp` renders this one, so it's kept here
 * too, just re-typed to this app's camelCase.
 */

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { asAtLabel } from "@/lib/balance-sheet";
import { recentFinancialYears, type FinancialYearOption } from "@/lib/asset-depreciation-report";
import { parseLadderAmount, type LadderBlock, type LadderColumn, type LadderReport } from "@/lib/ladder-report";

export const TRIAL_BALANCE_REPORT_TYPE_ID = "8";

export { recentFinancialYears, type FinancialYearOption };

export type TrialBalanceValidation = {
  totalDebit: number;
  totalCredit: number;
  difference: number;
  balanced: boolean;
};

export type TrialBalanceReport = LadderReport & {
  asAt: FinancialYearOption;
  validation: TrialBalanceValidation | null;
};

/* ------------------------------------------------------------------ *
 * Backend shape
 * ------------------------------------------------------------------ */

type BackendTrialRow = {
  "Account Code": string;
  "Account Name": string;
  "Total Debit"?: string | number;
  "Total Credit"?: string | number;
  isTotal?: boolean;
};

type BackendTrialSection = { section: string; rows: BackendTrialRow[] };

type BackendTrialBalanceResponse = {
  success?: boolean;
  message?: string;
  columns?: string[];
  sections?: BackendTrialSection[];
  validation?: {
    total_debit?: number | string;
    total_credit?: number | string;
    difference?: number | string;
    balanced?: boolean;
  } | null;
};

const AMOUNT_COLUMNS = ["Total Debit", "Total Credit"] as const;

function toBlock(section: BackendTrialSection): LadderBlock {
  const totalIndex = section.rows.findIndex((row) => row.isTotal);
  const accountRows = totalIndex === -1 ? section.rows : section.rows.slice(0, totalIndex);
  const totalRow = totalIndex === -1 ? null : section.rows[totalIndex];

  const amounts = (row: BackendTrialRow) => AMOUNT_COLUMNS.map((key) => parseLadderAmount(row[key]));

  return {
    id: section.section,
    section: section.section,
    rows: accountRows.map((row, index) => ({
      id: `${section.section}-${index}`,
      label: row["Account Name"],
      code: row["Account Code"] || undefined,
      values: amounts(row),
    })),
    summary: totalRow
      ? { id: `${section.section}-total`, label: totalRow["Account Name"], values: amounts(totalRow) }
      : null,
  };
}

/* ------------------------------------------------------------------ *
 * Fetching
 * ------------------------------------------------------------------ */

export async function fetchTrialBalance(asAt: FinancialYearOption): Promise<TrialBalanceReport> {
  const form = new FormData();
  form.append("report_type_id", TRIAL_BALANCE_REPORT_TYPE_ID);
  form.append("action", "view");
  form.append("start_date", asAt.start);
  form.append("end_date", asAt.end);

  const response = await api.post<BackendTrialBalanceResponse>(apiRoutes.reporting.reports, form);
  const body = response.data;
  if (body.success === false) {
    throw new Error(body.message ?? "Couldn't load the Trial Balance");
  }

  const columns: LadderColumn[] = AMOUNT_COLUMNS.map((key) => ({ key, label: key }));
  const blocks = (body.sections ?? []).map(toBlock);

  const validation = body.validation
    ? {
        totalDebit: parseLadderAmount(body.validation.total_debit),
        totalCredit: parseLadderAmount(body.validation.total_credit),
        difference: parseLadderAmount(body.validation.difference),
        balanced: Boolean(body.validation.balanced),
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
