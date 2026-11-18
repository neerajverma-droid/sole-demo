/**
 * The dashboard's period filter — Monthly, Yearly, Previous Year.
 *
 * sole-webapp's dashboard had this dropdown beside "Create a new", and every
 * period-based figure on the page reported over what it chose. Yearly is the
 * financial year the business is in, Previous Year the one before it, and
 * Monthly the current calendar month. The year is the business's own — 1 July
 * by default, 1 April in New Zealand — never a hardcoded Australian one.
 */
import {
  AU_FISCAL_YEAR_START,
  fiscalYearOf,
  fiscalYearRange,
  type FiscalYearStart,
} from "@/lib/fiscal-year";
import type { DashboardPeriodQuery } from "@/lib/dashboard";
import type { FinancialYear } from "@/lib/invoices";

export type DashboardPeriod = "month" | "year" | "previous year";

/** In the old dropdown's order and with its words. */
export const DASHBOARD_PERIODS: { value: DashboardPeriod; label: string }[] = [
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
  { value: "previous year", label: "Previous Year" },
];

/** The old page opened on Yearly. */
export const DEFAULT_DASHBOARD_PERIOD: DashboardPeriod = "year";

export const dashboardPeriodLabel = (period: DashboardPeriod) =>
  DASHBOARD_PERIODS.find((option) => option.value === period)?.label ?? "Yearly";

export type DashboardWindow = FinancialYear & {
  period: DashboardPeriod;
  /**
   * The financial year the window sits in — the window itself for Yearly and
   * Previous Year, the current year for Monthly. A yearly goal is measured
   * against this, as sole-webapp's goal tracker was.
   */
  financialYear: FinancialYear;
  /** Last year's figures are history: they can be read, not planned against. */
  isPast: boolean;
  /** For "You've billed $X {phrase}". */
  phrase: string;
};

const pad = (value: number) => String(value).padStart(2, "0");

function financialYearStarting(startYear: number, start: FiscalYearStart): FinancialYear {
  const range = fiscalYearRange(startYear, start);
  return { startIso: range.start, endIso: range.end, label: `Financial year ${startYear}` };
}

/** What a period choice covers, on the business's own financial year. */
export function dashboardWindow(
  period: DashboardPeriod,
  today: Date = new Date(),
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): DashboardWindow {
  const thisYear = fiscalYearOf(today, start);
  const current = financialYearStarting(thisYear, start);

  if (period === "previous year") {
    const previous = financialYearStarting(thisYear - 1, start);
    return {
      ...previous,
      period,
      financialYear: previous,
      isPast: true,
      phrase: "last financial year",
    };
  }

  if (period === "month") {
    const year = today.getFullYear();
    const month = today.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    return {
      startIso: `${year}-${pad(month + 1)}-01`,
      endIso: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
      label: today.toLocaleDateString("en-AU", { month: "long", year: "numeric" }),
      period,
      financialYear: current,
      isPast: false,
      phrase: "this month",
    };
  }

  return {
    ...current,
    period,
    financialYear: current,
    isPast: false,
    phrase: "this year",
  };
}

/** Whether an ISO date falls inside a window, ends included. */
export const inWindow = (iso: string, span: Pick<FinancialYear, "startIso" | "endIso">) =>
  iso >= span.startIso && iso <= span.endIso;

/**
 * The query the server's period-aware dashboard routes take — what the old
 * page sent: `period=month` for Monthly, `period=year` otherwise, and the
 * window's own bounds.
 */
export const dashboardPeriodParams = (span: DashboardWindow): DashboardPeriodQuery => ({
  period: span.period === "month" ? "month" : "year",
  start: span.startIso,
  end: span.endIso,
});
