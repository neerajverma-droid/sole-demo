/**
 * The Transaction Listing report.
 *
 * A read-only ledger of everything coded in a period, grouped by the category it
 * was coded to — the report an accountant asks for, and the one you export at
 * year end. Nothing here edits anything; the Transactions screen is where a
 * coding gets changed.
 *
 * Real data from `POST /report` (`report_type_id=4`, `action="view"`), the same
 * plain multipart `FormData` endpoint the P&L uses — see `lib/reports.ts` for why
 * it's FormData and not JSON. The generic (non-P&L) branch of `handleReports`
 * returns a flat, paginated list of rows shaped `{key, value}[]` rather than the
 * mock's ready-grouped categories, with keys `Type`, `Transaction Name`,
 * `"Amount (EX GST)"`, `"Amount (INC. GST)"`, `Category Name`, `Reconcile Date`,
 * `Transaction Date`, `Client/Supplier`, `Description` (confirmed against
 * `getTransactionReport` in `sole-ocr`'s `services/reports.js`) — grouping by
 * category, the direction per row, and the reconciled flag are all derived here
 * rather than sent ready-made:
 *
 *  - `direction` ("in"/"out") comes from the category's real top-level type
 *    (`categoryType` in `lib/transactions.ts`), falling back to the amount's own
 *    sign for a category this app doesn't recognise.
 *  - `reconciled` is whether `Reconcile Date` came back at all — every row here
 *    is already sourced from `reconciliation_records`, but only some carry an
 *    actual reconcile date.
 *  - `gst` is `Amount (INC. GST) − Amount (EX GST)` — the endpoint gives the two
 *    totals, not the tax line itself.
 *  - `reference` has no backend equivalent on this endpoint at all — left blank
 *    rather than invented; see `docs/module-migration-prompt.md` §4 for the same
 *    call made on Liability's Date field.
 *
 * The endpoint paginates (`page`/`page_size`); this fetches every page for the
 * span so the category grouping and period totals describe the whole period,
 * matching what the mock always showed — not just one page of it.
 *
 * Periods and formatting come from `report-periods`, shared with the P&L.
 */

import { format, isValid, parseISO } from "date-fns";

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { AU_FISCAL_YEAR_START, type FiscalYearStart } from "@/lib/fiscal-year";
import { categoryType, type TransactionCategoryType } from "@/lib/transactions";
import {
  periodShape,
  reportDelta,
  reportMoney,
  round2,
  spanLabel,
  type ReportAmounts,
  type ReportDelta,
  type ReportPeriod,
  type ReportRange,
  type Span,
} from "@/lib/report-periods";

/** `sole-ocr`'s `report_type_id` for Transaction Listing — see `src/constants/index.js`. */
export const TRANSACTION_LISTING_REPORT_TYPE_ID = "4";

/** The periods a listing is worth running for. */
export const TL_PERIODS: readonly ReportPeriod[] = [
  "This month",
  "Last quarter",
  "This financial year",
  "Custom range",
];

export type ListedTransaction = {
  id: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  description: string;
  /** The client or supplier on the other side. */
  party: string;
  reference: string;
  /** Always positive — `direction` carries the sign. */
  gross: number;
  gst: number;
  net: number;
  direction: "in" | "out";
  reconciled: boolean;
};

export type ListingGroup = {
  category: string;
  type: TransactionCategoryType | null;
  direction: "in" | "out";
  /** Most recent first, which is how anyone reads a ledger. */
  rows: ListedTransaction[];
  totals: { net: number; gst: number; gross: number };
  reconciled: number;
};

export type TransactionListing = {
  period: ReportPeriod;
  rangeLabel: string;
  previousLabel: string;
  /** Categories with nothing in them are dropped, not shown empty. */
  groups: ListingGroup[];
  summary: {
    count: ReportAmounts;
    moneyIn: ReportAmounts;
    moneyOut: ReportAmounts;
    reconciled: number;
    unreconciled: number;
    gst: number;
  };
};

/* ------------------------------------------------------------------ *
 * Talking to `/report`
 * ------------------------------------------------------------------ */

type BackendListingCell = { key: string; value: string | number | null };
type BackendListingRow = BackendListingCell[];

type BackendListingResponse = {
  success?: boolean;
  message?: string;
  data?: BackendListingRow[];
  pagination?: { total?: number; total_pages?: number };
};

/** Every page the endpoint hands back for one span is fetched this many rows at a time. */
const LISTING_PAGE_SIZE = 200;

function cellValue(row: BackendListingRow, key: string): string | null {
  const cell = row.find((entry) => entry.key === key);
  if (cell === undefined || cell.value === null || cell.value === undefined) {
    return null;
  }
  return String(cell.value);
}

function parseReportAmount(value: string | null): number {
  if (value === null) return 0;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Whatever date shape the SQL layer sent back, as the `YYYY-MM-DD` the rest of the report expects. */
function toListingIsoDate(value: string | null): string {
  const parsed = value ? parseISO(value) : null;
  return parsed && isValid(parsed) ? format(parsed, "yyyy-MM-dd") : "";
}

async function postListingView(
  span: Span,
  page: number,
): Promise<BackendListingResponse> {
  const form = new FormData();
  form.append("report_type_id", TRANSACTION_LISTING_REPORT_TYPE_ID);
  form.append("action", "view");
  form.append("start_date", format(span.from, "yyyy-MM-dd"));
  form.append("end_date", format(span.to, "yyyy-MM-dd"));
  form.append("page", String(page));
  form.append("page_size", String(LISTING_PAGE_SIZE));
  const response = await api.post<BackendListingResponse>(
    apiRoutes.reporting.reports,
    form,
  );
  return response.data;
}

/** Every row for a span, across every page — not just whichever page loaded first. */
async function fetchAllListingRows(span: Span): Promise<BackendListingRow[]> {
  const first = await postListingView(span, 1);
  if (first.success === false) {
    throw new Error(first.message ?? "Couldn't load the transaction listing");
  }

  const rows = [...(first.data ?? [])];
  const totalPages = first.pagination?.total_pages ?? 1;
  if (totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, index) =>
        postListingView(span, index + 2),
      ),
    );
    rest.forEach((response) => rows.push(...(response.data ?? [])));
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 * Shaping rows into the ledger
 * ------------------------------------------------------------------ */

function mapListedTransaction(
  row: BackendListingRow,
  index: number,
): { category: string; row: ListedTransaction } {
  const signedGross = parseReportAmount(cellValue(row, "Amount (INC. GST)"));
  const net = Math.abs(parseReportAmount(cellValue(row, "Amount (EX GST)")));
  const gross = Math.abs(signedGross);
  const category = cellValue(row, "Category Name") ?? "Uncategorised";
  const type = categoryType(category);
  // A recognised category says its own direction; an unrecognised one falls
  // back to the amount's own sign rather than guessing "out" for everything.
  const direction: "in" | "out" =
    type === "Income"
      ? "in"
      : type === "Expense"
        ? "out"
        : signedGross < 0
          ? "out"
          : "in";

  const txName = cellValue(row, "Transaction Name") ?? "";
  const desc = cellValue(row, "Description") ?? "";
  const refField = cellValue(row, "Reference");
  const reference =
    refField ||
    (txName && txName !== "---" && txName !== desc
      ? txName
      : txName && txName !== "---" && !desc
        ? txName
        : "");

  return {
    category,
    row: {
      id: `${cellValue(row, "Transaction Date") ?? "row"}-${index}`,
      date: toListingIsoDate(cellValue(row, "Transaction Date")),
      description: desc,
      party: cellValue(row, "Client/Supplier") ?? "",
      reference,
      gross,
      gst: round2(gross - net),
      net,
      direction,
      reconciled: cellValue(row, "Reconcile Date") !== null,
    },
  };
}

/** Whichever way most of a category's rows go — a tie-break for the rare unrecognised category whose rows split on amount sign alone. */
function dominantDirection(rows: ListedTransaction[]): "in" | "out" {
  const inCount = rows.filter((row) => row.direction === "in").length;
  return inCount * 2 >= rows.length ? "in" : "out";
}

function buildGroups(
  mapped: { category: string; row: ListedTransaction }[],
): ListingGroup[] {
  const byCategory = new Map<string, ListedTransaction[]>();
  mapped.forEach(({ category, row }) => {
    const rows = byCategory.get(category) ?? [];
    rows.push(row);
    byCategory.set(category, rows);
  });

  return Array.from(byCategory.entries()).map(([category, rows]) => {
    const sorted = [...rows].sort(
      (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
    );
    return {
      category,
      type: categoryType(category),
      direction: dominantDirection(sorted),
      rows: sorted,
      totals: {
        net: round2(sorted.reduce((sum, row) => sum + row.net, 0)),
        gst: round2(sorted.reduce((sum, row) => sum + row.gst, 0)),
        gross: round2(sorted.reduce((sum, row) => sum + row.gross, 0)),
      },
      reconciled: sorted.filter((row) => row.reconciled).length,
    };
  });
}

/** Count, money in and money out for a span — what a comparison needs. */
function totalsFor(rows: ListedTransaction[]) {
  return {
    count: rows.length,
    moneyIn: round2(
      rows.reduce(
        (sum, row) => (row.direction === "in" ? sum + row.gross : sum),
        0,
      ),
    ),
    moneyOut: round2(
      rows.reduce(
        (sum, row) => (row.direction === "out" ? sum + row.gross : sum),
        0,
      ),
    ),
    reconciled: rows.filter((row) => row.reconciled).length,
    gst: round2(rows.reduce((sum, row) => sum + row.gst, 0)),
  };
}

/**
 * Fetches and shapes the Transaction Listing for a period — every page for
 * the selected span, grouped by category, plus the same for `periodShape`'s
 * own `previous` span so the summary cards' comparison has something real to
 * read rather than an estimate.
 */
export async function fetchTransactionListing(
  period: ReportPeriod,
  range: ReportRange | null,
  fiscalYearStart: FiscalYearStart = AU_FISCAL_YEAR_START,
): Promise<TransactionListing> {
  const shape = periodShape(period, range, undefined, fiscalYearStart);
  const [currentRows, previousRows] = await Promise.all([
    fetchAllListingRows(shape.current),
    fetchAllListingRows(shape.previous),
  ]);

  const currentMapped = currentRows.map((row, index) =>
    mapListedTransaction(row, index),
  );
  const previousMapped = previousRows.map((row, index) =>
    mapListedTransaction(row, index),
  );

  const groups = buildGroups(currentMapped);
  const current = totalsFor(currentMapped.map((entry) => entry.row));
  const previous = totalsFor(previousMapped.map((entry) => entry.row));

  return {
    period,
    rangeLabel: spanLabel(shape.current),
    previousLabel: shape.previousLabel,
    groups,
    summary: {
      count: { amount: current.count, previous: previous.count },
      moneyIn: { amount: current.moneyIn, previous: previous.moneyIn },
      moneyOut: { amount: current.moneyOut, previous: previous.moneyOut },
      reconciled: current.reconciled,
      unreconciled: current.count - current.reconciled,
      gst: current.gst,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Presentation helpers
 * ------------------------------------------------------------------ */

/** "12 transactions", or the singular — the tally cards' formatter. */
export function transactionCount(value: number): string {
  const whole = Math.round(value);
  return `${whole.toLocaleString("en-AU")}`;
}

/** The movement on a count, worded as a tally rather than as money. */
export function countDelta(
  amounts: ReportAmounts,
  previousLabel: string,
): ReportDelta {
  return reportDelta(
    amounts,
    previousLabel,
    "up-good",
    (value) => `${Math.round(value).toLocaleString("en-AU")}`,
  );
}

/** The movement on a money figure. */
export function moneyDelta(
  amounts: ReportAmounts,
  previousLabel: string,
  direction: "up-good" | "down-good" = "up-good",
): ReportDelta {
  return reportDelta(amounts, previousLabel, direction, reportMoney);
}

/** "12 Aug 2026", matching how a date reads everywhere else in the product. */
export function listingDate(iso: string): string {
  const parsed = parseISO(iso);
  return isValid(parsed) ? format(parsed, "d MMM yyyy") : "—";
}
