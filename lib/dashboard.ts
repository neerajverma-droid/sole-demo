/**
 * Dashboard backend wiring — sole-ocr's `/dashboard/*` resource.
 *
 * Read-only: every function here fetches and maps a report, none of them
 * write anything. The other dashboard figures (invoice totals, revenue goal,
 * business snapshot) already come from the real invoice/expense/asset/quote
 * stores — this module only covers what has no store yet: bank balances,
 * cash flow history, GST and the ranked movers.
 */
import { BANKS } from "@/lib/banks";
import type { FilingPeriod } from "@/lib/country-context";
import {
  AU_FISCAL_YEAR_START,
  fiscalYearOf,
  fiscalYearRange,
  type FiscalYearStart,
} from "@/lib/fiscal-year";
import type { ConnectedAccount } from "@/stores/accounts";
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/** `months` back from the first of this month, inclusive of the current month. */
function startOfMonthsAgo(months: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
}

export type DateRange = { start: string; end: string };

/**
 * The financial-year-to-date range GST and top-mover figures report over — the
 * business's year, so 1 April onwards in New Zealand; 1 July by default.
 */
export function currentFinancialYearRange(
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): DateRange {
  const now = new Date();
  return {
    start: fiscalYearRange(fiscalYearOf(now, start), start).start,
    end: toIso(endOfMonth(now)),
  };
}

/* ------------------------------------------------------------------ *
 * Balance — the hero card's current figure and its monthly history
 * ------------------------------------------------------------------ */

type ApiBalancePoint = {
  year: number;
  month: number;
  net_flow: number;
  current_balance: number;
};

export type BalancePoint = { month: string; balance: number };

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export type DashboardBalance = {
  currentBalance: number;
  /** Cumulative balance at each month end, oldest first. */
  series: BalancePoint[];
};

export async function fetchDashboardBalance(): Promise<DashboardBalance> {
  const response = await api.get<
    ApiEnvelope<{ current_balance: number; total: ApiBalancePoint[] }>
  >(apiRoutes.dashboard.balance);

  const data = response.data?.data;
  const total = data?.total ?? [];

  return {
    currentBalance: Number(data?.current_balance) || 0,
    series: total.map((point) => ({
      month: MONTH_LABELS[(point.month - 1 + 12) % 12] ?? "",
      balance: Number(point.current_balance) || 0,
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Bank accounts — Connected accounts card + cash-on-hand total
 * ------------------------------------------------------------------ */

type ApiBankAccount = {
  id: number | string;
  bank_name?: string | null;
  account_name?: string | null;
  balance?: number | string | null;
};

export type DashboardBankAccounts = {
  accounts: ConnectedAccount[];
  totalBalance: number;
};

/** Loose match on the feed's free-text bank name, for the row's mark. */
export function bankIdFor(bankName: string | null | undefined): string | null {
  if (!bankName) return null;
  const needle = bankName.trim().toLowerCase();
  const match = BANKS.find(
    (bank) =>
      needle.includes(bank.name.toLowerCase()) ||
      bank.name.toLowerCase().includes(needle),
  );
  return match?.id ?? null;
}

export async function fetchDashboardBankAccounts(): Promise<DashboardBankAccounts> {
  const response = await api.get<
    ApiEnvelope<{ accounts: ApiBankAccount[]; total_balance: number }>
  >(apiRoutes.dashboard.bankAccountsBalance);

  const data = response.data?.data;
  const rows = data?.accounts ?? [];

  return {
    accounts: rows.map((row) => ({
      id: String(row.id),
      bankId: bankIdFor(row.bank_name),
      name: row.bank_name?.trim() || "Bank account",
      account: row.account_name?.trim() || "",
      balance: Number(row.balance) || 0,
      accountType: "TRANS_AND_SAVINGS_ACCOUNTS",
      syncedAt: "just now",
      archived: false,
    })),
    totalBalance: Number(data?.total_balance) || 0,
  };
}

/* ------------------------------------------------------------------ *
 * Cash flow — money in vs money out, month by month
 * ------------------------------------------------------------------ */

type ApiIncomeExpenseMonth = {
  month: string;
  income: number;
  expense: number;
  net_profit?: number;
  forecast?: boolean;
};

export type CashFlowMonth = {
  /** `YYYY-MM`. Periods resolve against this rather than parsing labels. */
  key: string;
  month: string;
  year: number;
  moneyIn: number;
  moneyOut: number;
};

/** How far back the fetch reaches, so every in-card comparison (up to a full
 *  year back) always has history to measure against. */
const CASH_FLOW_MONTHS = 24;

export async function fetchDashboardCashFlow(): Promise<CashFlowMonth[]> {
  const start = toIso(startOfMonthsAgo(CASH_FLOW_MONTHS));
  const end = toIso(endOfMonth(new Date()));

  const response = await api.get<ApiEnvelope<ApiIncomeExpenseMonth[]>>(
    apiRoutes.dashboard.incomeExpense,
    { params: { period: "year", start, end } },
  );

  const rows = response.data?.data ?? [];

  return rows
    .filter((row) => !row.forecast)
    .map((row) => {
      // Parsed from the "YYYY-MM-DD" string directly rather than through
      // `new Date(row.month)` — that goes via UTC midnight, and reading it
      // back with local-time accessors rolls the month back a day in any
      // timezone behind UTC.
      const year = Number(row.month.slice(0, 4));
      const monthIndex = Number(row.month.slice(5, 7)) - 1;
      return {
        key: `${year}-${pad(monthIndex + 1)}`,
        month: MONTH_LABELS[monthIndex] ?? "",
        year,
        moneyIn: Number(row.income) || 0,
        moneyOut: Number(row.expense) || 0,
      };
    });
}

/* ------------------------------------------------------------------ *
 * GST — the BAS (or GST return) set-aside tile
 * ------------------------------------------------------------------ */

type ApiGstSummary = {
  gst_collected: number;
  gst_paid: number;
  net_gst_payable: number;
  taxable_sales: number;
};

export type GstSetAside = {
  amount: number;
  /** The period the return is for: "Q1 FY26", or "Apr – May 2026" in New Zealand. */
  quarter: string;
  dueLabel: string;
  daysAway: number;
  /** What the return is called — "BAS", "GST return". Added by `useDashboardGstQuery`. */
  returnName?: string;
};

type ReturnDue = { quarter: string; due: Date };

/**
 * AU BAS quarters and their due dates — the fallback for when the country
 * context hasn't said what this business files (see `nextReturnDue`), which
 * until it lands means an Australian business on quarterly BAS.
 *
 * One financial year (1 July `fyStartYear` – 30 June `fyStartYear + 1`) has
 * four fixed due dates; the FY label uses the year it *starts* in, matching
 * `currentFinancialYear()` in `lib/invoices.ts`.
 */
function financialYearDues(fyStartYear: number): { quarter: string; due: Date }[] {
  const label = String(fyStartYear).slice(-2);
  return [
    { quarter: `Q1 FY${label}`, due: new Date(fyStartYear, 9, 28) }, // 28 Oct
    { quarter: `Q2 FY${label}`, due: new Date(fyStartYear + 1, 1, 28) }, // 28 Feb
    { quarter: `Q3 FY${label}`, due: new Date(fyStartYear + 1, 3, 28) }, // 28 Apr
    { quarter: `Q4 FY${label}`, due: new Date(fyStartYear + 1, 6, 28) }, // 28 Jul
  ];
}

function nextBasDueDate(today: Date): ReturnDue {
  const currentFyStart = fiscalYearOf(today);

  // A three-FY window either side of "now" — early in a calendar year the
  // next due date (Feb/Apr) still belongs to the *previous* FY's quarters.
  const candidates = [
    ...financialYearDues(currentFyStart - 1),
    ...financialYearDues(currentFyStart),
    ...financialYearDues(currentFyStart + 1),
  ].sort((a, b) => a.due.getTime() - b.due.getTime());

  return (
    candidates.find((entry) => entry.due >= today) ??
    candidates[candidates.length - 1]
  );
}

/** An ISO `YYYY-MM-DD` as local midnight, the way the hardcoded due dates are; null if it isn't one. */
function localDate(iso: string | null | undefined): Date | null {
  const match = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : null;
}

/**
 * What the tile calls a filing period. A quarter keeps the name this tile has
 * always given a BAS quarter — "Q1 FY26", by the year the financial year starts
 * in — rather than the registry's "Jul – Sep 2026"; anything else (New
 * Zealand's two-monthly "Apr – May 2026") is the registry's own label.
 */
function filingPeriodLabel(period: FilingPeriod, start: FiscalYearStart): string {
  const from = localDate(period.startDate);
  if (/^Q[1-4]$/.test(period.code) && from) {
    return `${period.code} FY${String(fiscalYearOf(from, start)).slice(-2)}`;
  }
  return period.label || period.code;
}

/**
 * The next return falling due, from the business's own filing periods — the
 * country context's previous and current ones, each with the due date the
 * registry's rule gives it. Early in a period the one just ended is still to
 * lodge, so it's the earliest due date that hasn't passed; once both have, the
 * latest of them.
 *
 * Without any (the context still loading, or a business with no filing
 * frequency) it's the Australian BAS calendar this tile always used.
 */
export function nextReturnDue(
  today: Date,
  periods: FilingPeriod[] = [],
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): ReturnDue {
  const candidates = periods
    .flatMap((period) => {
      const due = localDate(period.dueDate);
      return due ? [{ quarter: filingPeriodLabel(period, start), due }] : [];
    })
    .sort((a, b) => a.due.getTime() - b.due.getTime());

  if (candidates.length === 0) return nextBasDueDate(today);
  return (
    candidates.find((entry) => entry.due >= today) ??
    candidates[candidates.length - 1]
  );
}

/** The tile's period, due date and countdown for `today`. See `nextReturnDue`. */
export function returnDueTiming(
  today: Date,
  periods: FilingPeriod[] = [],
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): Pick<GstSetAside, "quarter" | "dueLabel" | "daysAway"> {
  const { quarter, due } = nextReturnDue(today, periods, start);
  // Calendar-day difference, not a raw millisecond one — otherwise late in
  // the day before the due date, the leftover hours round down to "0 days
  // away" a full day early.
  const todayMidnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const daysAway = Math.max(
    0,
    Math.round((due.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24)),
  );

  return {
    quarter,
    dueLabel: `${due.getDate()} ${MONTH_LABELS[due.getMonth()]}`,
    daysAway,
  };
}

/**
 * The net GST over the financial year to date, and the next return it goes on.
 * The year is the business's (`fiscalYearStart`, 1 July by default); the
 * period comes from `filingPeriods` when given, otherwise the BAS calendar.
 */
export async function fetchDashboardGstSetAside(
  options: { fiscalYearStart?: FiscalYearStart; filingPeriods?: FilingPeriod[] } = {},
): Promise<GstSetAside> {
  const start = options.fiscalYearStart ?? AU_FISCAL_YEAR_START;
  const range = currentFinancialYearRange(start);
  const response = await api.get<ApiEnvelope<ApiGstSummary>>(
    apiRoutes.dashboard.gstSummary,
    { params: { period: "year", start: range.start, end: range.end } },
  );

  const data = response.data?.data;
  return {
    amount: Number(data?.net_gst_payable) || 0,
    ...returnDueTiming(new Date(), options.filingPeriods, start),
  };
}

/* ------------------------------------------------------------------ *
 * Top movers — ranked income and expense categories
 * ------------------------------------------------------------------ */

type ApiTopMover = {
  label: string;
  client_name?: string | null;
  entry_date?: string | null;
  amount: number;
};

export type TopMover = {
  id: string;
  label: string;
  amount: number;
  clientName?: string;
  category?: string;
};

function formatTopMoverLabel(row: ApiTopMover): string {
  const client = row.client_name?.trim();
  const hasClient = Boolean(
    client &&
      client.toLowerCase() !== "n/a" &&
      client.toLowerCase() !== "unknown" &&
      client.toLowerCase() !== "null",
  );
  const category = row.label?.trim();
  const hasCategory = Boolean(
    category &&
      category.toLowerCase() !== "uncategorised" &&
      category.toLowerCase() !== "null",
  );

  if (hasClient && hasCategory) {
    // If the category is generic "Sales Income" or "Income", showing the client name is most informative
    if (/^(sales\s+income|income|expenses?|general\s+expenses?)$/i.test(category!)) {
      return client!;
    }
    return `${client} — ${category}`;
  }

  if (hasClient) return client!;
  if (hasCategory) return category!;
  return "Uncategorised";
}

async function fetchTopMovers(
  route: string,
  start: FiscalYearStart,
): Promise<TopMover[]> {
  const range = currentFinancialYearRange(start);
  const response = await api.get<ApiEnvelope<ApiTopMover[]>>(route, {
    params: { period: "year", start: range.start, end: range.end },
  });
  const rows = response.data?.data ?? [];
  return rows.map((row, index) => {
    const label = formatTopMoverLabel(row);
    return {
      id: `${label}-${index}`,
      label,
      amount: Number(row.amount) || 0,
      clientName: row.client_name?.trim() || undefined,
      category: row.label?.trim() || undefined,
    };
  });
}

export function fetchDashboardTopIncomes(
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): Promise<TopMover[]> {
  return fetchTopMovers(apiRoutes.dashboard.topIncomes, start);
}

export function fetchDashboardTopExpenses(
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): Promise<TopMover[]> {
  return fetchTopMovers(apiRoutes.dashboard.topExpenses, start);
}
