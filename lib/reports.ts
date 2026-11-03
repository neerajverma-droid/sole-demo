/**
 * The Profit & Loss report.
 *
 * Real data from `POST /report` (`report_type_id=1`, `action="view"`) — a
 * plain multipart `FormData` POST, not JSON and not the app's encrypted-body
 * helper, because that's genuinely how `sole-ocr`'s `handleReports` controller
 * reads this endpoint (confirmed against `src/controllers/reports.js`, which
 * reads `req.body` directly with no decrypt step). `business_id`/auth are
 * attached automatically by `utils/axiosInstance.ts`'s interceptor, the same
 * as every other real endpoint in this app — `userId`/`business_id` in the
 * body would be dead weight, since the controller resolves those from the
 * authenticated session instead.
 *
 * The backend has no notion of a "previous period" comparison — one call
 * returns one date range. To keep the comparison this screen has always
 * shown, `fetchPlReport` calls the endpoint twice, once for the selected
 * period and once for `periodShape`'s own `previous` span, and reads each
 * account's `YTD Amount` out of the second response as the comparison figure
 * rather than inventing one.
 *
 * The response is already shaped to match this report's ladder almost
 * exactly — `sections: [{section, rows, total}]` for Income, Cost of Sales,
 * Gross Profit, Expenses, EBITDA, a no-header section (`" "`) holding
 * Depreciation/Interest/Profit Before Tax/Income Tax as flat rows with a null
 * total, and Net Profit — confirmed against the `handleReports` branch for
 * `report_type_id === 1`. Every figure comes back as a formatted string
 * (`"$1234.56"`), not a number, so every read through it is parsed.
 */

import { format } from "date-fns";

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { AU_FISCAL_YEAR_START, type FiscalYearStart } from "@/lib/fiscal-year";
import {
  periodShape,
  reportDelta,
  spanLabel,
  type PeriodShape,
  type ReportAmounts,
  type ReportDelta,
  type ReportDirection,
  type ReportPeriod,
  type ReportRange,
  type Span,
} from "@/lib/report-periods";

export { reportMoney, reportPercent } from "@/lib/report-periods";

/** `sole-ocr`'s `report_type_id` for Profit & Loss — see `src/constants/index.js`. */
export const PL_REPORT_TYPE_ID = "1";

/** The periods a P&L is worth running for. */
export const PL_PERIODS: readonly ReportPeriod[] = [
  "This month",
  "Last month",
  "This quarter",
  "This financial year",
  "Last financial year",
  "Custom range",
];

/** Kept as names so the atoms and the screen read in the P&L's own terms. */
export type PlPeriod = ReportPeriod;
export type PlRange = ReportRange;
export type PlAmounts = ReportAmounts;
export type PlDelta = ReportDelta;
export type PlDirection = ReportDirection;

/**
 * One amount column.
 *
 * `label` is the top line and `scope` the muted line under it, because a column
 * headed "This period" doesn't say which period and a column headed "Aug 2026"
 * doesn't say why it's there. Both, stacked, answer both.
 */
export type PlColumn = {
  key: string;
  label: string;
  scope: string;
  kind: "month" | "total" | "previous";
};

export type PlRow = {
  id: string;
  label: string;
  /** One figure per column, in column order. */
  values: number[];
};

/**
 * One block of the report — a section of the Section column, and the rows that
 * belong to it.
 *
 * `summary` is the row that closes the block: a bold subtotal for a group of
 * accounts, or the derived figure itself for a result. It's null only where a
 * group holds a single account, since "Income tax expense" followed by "Total
 * income tax expense" is the same number twice.
 */
export type PlBlock = {
  id: string;
  section: string;
  /** The accounts. Empty for a derived result, which is only its summary row. */
  rows: PlRow[];
  summary: PlRow | null;
  /** Gross profit, EBITDA, profit before tax, net profit — the indigo rows. */
  isResult: boolean;
};

export type PlReport = {
  period: PlPeriod;
  /** "1 Jul 2026 – 30 Jun 2027", for under the headline figure. */
  rangeLabel: string;
  /** "last month", "last financial year" — how a comparison names its baseline. */
  previousLabel: string;
  columns: PlColumn[];
  blocks: PlBlock[];
  /** The four figures the summary cards read, without walking the blocks. */
  headline: {
    netProfit: PlAmounts;
    income: PlAmounts;
    expenses: PlAmounts;
    grossProfit: PlAmounts;
  };
};

/* ------------------------------------------------------------------ *
 * Talking to `/report`
 * ------------------------------------------------------------------ */

type BackendReportRow = Record<string, string | number | null | undefined>;

type BackendReportSection = {
  section: string;
  rows: BackendReportRow[];
  total: BackendReportRow | null;
};

type BackendPlResponse = {
  success?: boolean;
  message?: string;
  columns?: string[];
  sections?: BackendReportSection[];
};

const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `"Jan2024"` → `{year: 2024, monthIndex: 0}` — the exact label `getProfitLossV2` builds. */
function monthColumnInfo(
  column: string,
): { year: number; monthIndex: number } | null {
  const match = /^([A-Za-z]{3})(\d{4})$/.exec(column);
  if (!match) return null;
  const monthIndex = MONTH_ABBREVIATIONS.indexOf(match[1]);
  return monthIndex === -1 ? null : { year: Number(match[2]), monthIndex };
}

/** Every real month column, in the order the backend sent them. */
function monthColumnsOf(columns: string[]): string[] {
  return columns.filter(
    (column) =>
      column !== "Account Name" &&
      column !== "YTD Amount" &&
      monthColumnInfo(column) !== null,
  );
}

/** The backend sends every figure as `"$1234.56"` — never a bare number. */
function parseReportAmount(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function postPlView(span: Span): Promise<BackendPlResponse> {
  const form = new FormData();
  form.append("report_type_id", PL_REPORT_TYPE_ID);
  form.append("action", "view");
  form.append("start_date", format(span.from, "yyyy-MM-dd"));
  form.append("end_date", format(span.to, "yyyy-MM-dd"));
  const response = await api.post<BackendPlResponse>(
    apiRoutes.reporting.reports,
    form,
  );
  return response.data;
}

function findSection(
  response: BackendPlResponse,
  sectionName: string,
): BackendReportSection | undefined {
  return response.sections?.find((section) => section.section === sectionName);
}

/**
 * One row's figures across every column: its months, its range total (`"YTD
 * Amount"`), and the same range's total from the *other* response — current
 * when reading a previous figure, previous when reading a current one.
 *
 * `accountName: null` reads a section's own `total` row instead of one of its
 * accounts — the same shape either way, since a section total and an account
 * row are both just a row with an `"Account Name"` and a figure per column.
 */
function valuesFor(
  current: BackendPlResponse,
  previous: BackendPlResponse,
  monthCols: string[],
  sectionName: string,
  accountName: string | null,
): number[] {
  const currentSection = findSection(current, sectionName);
  const currentRow = accountName
    ? currentSection?.rows.find((row) => row["Account Name"] === accountName)
    : currentSection?.total;

  const previousSection = findSection(previous, sectionName);
  const previousRow = accountName
    ? previousSection?.rows.find((row) => row["Account Name"] === accountName)
    : previousSection?.total;

  return [
    ...monthCols.map((column) => parseReportAmount(currentRow?.[column])),
    parseReportAmount(currentRow?.["YTD Amount"]),
    parseReportAmount(previousRow?.["YTD Amount"]),
  ];
}

function buildColumns(monthCols: string[], shape: PeriodShape): PlColumn[] {
  const monthColumns: PlColumn[] = monthCols.flatMap((column) => {
    const info = monthColumnInfo(column);
    if (!info) return [];
    const date = new Date(info.year, info.monthIndex, 1);
    return [
      {
        key: format(date, "yyyy-MM"),
        label: format(date, "MMM"),
        scope: format(date, "yyyy"),
        kind: "month" as const,
      },
    ];
  });

  return [
    ...monthColumns,
    { key: "total", label: shape.label, scope: shape.scope, kind: "total" },
    {
      key: "previous",
      label: shape.previousHeaderLabel,
      scope: shape.previousScope,
      kind: "previous",
    },
  ];
}

function buildBlocks(
  current: BackendPlResponse,
  previous: BackendPlResponse,
  monthCols: string[],
): PlBlock[] {
  const accountBlock = (
    id: string,
    sectionName: string,
    summaryLabel: string,
  ): PlBlock => {
    const section = findSection(current, sectionName);
    const rows: PlRow[] = (section?.rows ?? []).map((row) => {
      const accountName = String(row["Account Name"] ?? "");
      return {
        id: `${id}-${accountName}`,
        label: accountName,
        values: valuesFor(current, previous, monthCols, sectionName, accountName),
      };
    });
    return {
      id,
      section: sectionName,
      rows,
      summary: {
        id: `total-${id}`,
        label: summaryLabel,
        values: valuesFor(current, previous, monthCols, sectionName, null),
      },
      isResult: false,
    };
  };

  const resultBlock = (id: string, sectionName: string, label: string): PlBlock => ({
    id,
    section: sectionName,
    rows: [],
    summary: {
      id,
      label,
      values: valuesFor(current, previous, monthCols, sectionName, null),
    },
    isResult: true,
  });

  /**
   * The backend groups Depreciation, Interest and Income Tax into one
   * no-header section (`" "`) with no combined total. Each is only ever a
   * single aggregated figure — there's no per-account breakdown the way
   * Income or Expenses have — so each becomes a single-row block with no
   * summary, the same convention the ladder already uses for a section that
   * holds exactly one account. (Profit Before Tax lives in the same section
   * but is a *result*, not an account — see the block built for it below.)
   */
  const singleRowBlock = (
    id: string,
    section: string,
    accountName: string,
    rowLabel: string,
  ): PlBlock => ({
    id,
    section,
    rows: [
      {
        id,
        label: rowLabel,
        values: valuesFor(current, previous, monthCols, " ", accountName),
      },
    ],
    summary: null,
    isResult: false,
  });

  return [
    accountBlock("income", "Income", "Total income"),
    accountBlock("cost-of-sales", "Cost of Sales", "Total cost of sales"),
    resultBlock("gross-profit", "Gross Profit", "Gross profit"),
    accountBlock("operating", "Expenses", "Total operating expenses"),
    resultBlock("ebitda", "EBITDA", "EBITDA"),
    singleRowBlock(
      "depreciation",
      "Depreciation & amortisation",
      "Depreciation Expense",
      "Depreciation expense",
    ),
    singleRowBlock("finance", "Finance costs", "Interest Expense", "Finance costs"),
    // Unlike Depreciation/Finance/Taxation, this is a *result* row (its figure
    // is derived, not an account) — same shape as Gross Profit/EBITDA/Net
    // Profit (empty `rows`, the figure in `summary`), just reading a row out
    // of the no-header section instead of another section's own total. Giving
    // it `singleRowBlock`'s shape instead — a populated `rows` — while also
    // marking it `isResult` doubled up the Account name cell with the Section
    // cell's `colSpan={2}`, shifting every figure one column to the right.
    {
      id: "before-tax",
      section: "Profit before tax",
      rows: [],
      summary: {
        id: "before-tax",
        label: "Profit before tax",
        values: valuesFor(current, previous, monthCols, " ", "Profit Before Tax"),
      },
      isResult: true,
    },
    singleRowBlock(
      "taxation",
      "Taxation",
      "Income Tax Expense",
      "Income tax expense",
    ),
    resultBlock("net-profit", "Net Profit", "Net profit"),
  ];
}

/**
 * Fetches and shapes the Profit & Loss report for a period — two real calls
 * (the period, and `periodShape`'s own `previous` span for the comparison
 * column), mapped into the ladder every screen in this module reads.
 */
export async function fetchPlReport(
  period: PlPeriod,
  range: PlRange | null,
  fiscalYearStart: FiscalYearStart = AU_FISCAL_YEAR_START,
): Promise<PlReport> {
  const shape = periodShape(period, range, undefined, fiscalYearStart);
  const [current, previous] = await Promise.all([
    postPlView(shape.current),
    postPlView(shape.previous),
  ]);

  if (current.success === false) {
    throw new Error(current.message ?? "Couldn't load the Profit & Loss report");
  }

  const monthCols = monthColumnsOf(current.columns ?? []);
  const columns = buildColumns(monthCols, shape);
  const blocks = buildBlocks(current, previous, monthCols);

  const width = columns.length;
  const amountsOf = (series: number[]): PlAmounts => ({
    amount: series[width - 2],
    previous: series[width - 1],
  });

  const income = amountsOf(valuesFor(current, previous, monthCols, "Income", null));
  const netProfit = amountsOf(
    valuesFor(current, previous, monthCols, "Net Profit", null),
  );
  const grossProfit = amountsOf(
    valuesFor(current, previous, monthCols, "Gross Profit", null),
  );
  // Everything that isn't income — matches the ladder's own arithmetic
  // (net profit = income − every cost line) without re-deriving each line.
  const expenses: PlAmounts = {
    amount: income.amount - netProfit.amount,
    previous: income.previous - netProfit.previous,
  };

  return {
    period,
    rangeLabel: spanLabel(shape.current),
    previousLabel: shape.previousLabel,
    columns,
    blocks,
    headline: { netProfit, income, expenses, grossProfit },
  };
}

/* ------------------------------------------------------------------ *
 * Presentation helpers
 * ------------------------------------------------------------------ */

/**
 * How the period's income was split, as percentages for the bar.
 *
 * The bar is income at full width, cut into what it cost and what was left —
 * three segments of income, expenses and net profit would sum to twice the
 * income and mean nothing. A loss spends the whole bar on expenses, because
 * there is no remainder to draw.
 */
export function plSplit(report: PlReport): {
  expensePercent: number;
  profitPercent: number;
  expenseShare: number;
  profitShare: number;
  loss: boolean;
} {
  const income = report.headline.income.amount;
  const expenses = report.headline.expenses.amount;
  const net = report.headline.netProfit.amount;
  const scale = Math.max(income, expenses, 1);

  return {
    expensePercent: (expenses / scale) * 100,
    profitPercent: net > 0 ? (net / scale) * 100 : 0,
    // Shares are of income, which is the question people actually ask of a P&L.
    expenseShare: income > 0 ? (expenses / income) * 100 : 0,
    profitShare: income > 0 ? (net / income) * 100 : 0,
    loss: net < 0,
  };
}

/**
 * The movement on a P&L figure. A wrapper rather than a re-export, so the P&L's
 * own components go on calling `plDelta` and the shared engine stays the one
 * place the arithmetic and the wording live.
 */
export function plDelta(
  amounts: PlAmounts,
  previousLabel: string,
  direction: PlDirection = "up-good",
): PlDelta {
  return reportDelta(amounts, previousLabel, direction);
}
