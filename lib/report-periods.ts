/**
 * The basis every Reporting suite report is built from: the periods they can be
 * run for, the spans those resolve to, and the two formatters their figures go
 * through.
 *
 * Extracted from the Profit & Loss report when the Transaction Listing wanted
 * the same period control over a different set of presets. One engine, because
 * a quarter has to mean the same three months in every report — two copies of
 * this is two chances for one report to disagree with another about which days
 * "last quarter" covers.
 */

import {
  differenceInCalendarDays,
  eachMonthOfInterval,
  endOfMonth,
  endOfQuarter,
  format,
  getDaysInMonth,
  isValid,
  parseISO,
  startOfMonth,
  startOfQuarter,
  subDays,
  subMonths,
  subQuarters,
} from "date-fns";

import {
  AU_FISCAL_YEAR_START,
  fiscalQuarterOf,
  fiscalYearLabel,
  fiscalYearOf,
  fiscalYearSpan,
  normalizeFiscalYearStart,
  type FiscalYearStart,
} from "@/lib/fiscal-year";
import { activeAmountDigits, activeCurrencySymbol } from "@/lib/country-context";

/**
 * Every period any report offers. A report declares its own subset — the P&L
 * wants both financial years, the listing wants last quarter — so the engine
 * knows them all and no report has to invent one.
 */
export const REPORT_PERIODS = [
  "This month",
  "Last month",
  "This quarter",
  "Last quarter",
  "This financial year",
  "Last financial year",
  "Custom range",
] as const;

export type ReportPeriod = (typeof REPORT_PERIODS)[number];

/** ISO `YYYY-MM-DD` either side, as the two date inputs hold it. */
export type ReportRange = { from: string; to: string };

export type Span = { from: Date; to: Date };

/**
 * "Today", for resolving a period into a span.
 *
 * A parameter with a `new Date()` default rather than a module-level
 * constant, so each call reads the actual current moment instead of whatever
 * day the module happened to load on — the reports read real, live data now,
 * so a period like "This month" has to track the real month.
 */
function reportToday(): Date {
  return new Date();
}

/* ------------------------------------------------------------------ *
 * Spans and their names
 * ------------------------------------------------------------------ */

/**
 * The financial year containing a date — 1 July to 30 June by default, the
 * business's own year (1 April to 31 March in New Zealand) when `start` is
 * passed.
 */
export function financialYear(
  date: Date,
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): Span {
  return fiscalYearSpan(fiscalYearOf(date, start), start);
}

/** "2026-27", the financial year a date falls in. */
export function fyLabel(
  date: Date,
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): string {
  const fy = normalizeFiscalYearStart(start);
  const startYear = fiscalYearOf(date, fy);
  // A calendar year is one year: "2026-27" would be a lie about a year ending in December.
  if (fy.month === 1 && fy.day === 1) return String(startYear);
  return fiscalYearLabel(startYear, "span");
}

/**
 * "Q1 FY27", when the quarter is one of the financial year's own.
 *
 * Counted the way the business counts them — from the start of its financial
 * year, so Q1 is July to September in Australia (the BAS quarters) and April
 * to June in New Zealand. Both line up with the calendar quarters exactly;
 * only the numbering differs, which is why `startOfQuarter` can be trusted here
 * and only the label needs working out.
 */
export function quarterLabel(
  start: Date,
  fiscalYearStart: FiscalYearStart = AU_FISCAL_YEAR_START,
): string {
  const fy = normalizeFiscalYearStart(fiscalYearStart);
  // A year that doesn't start on a calendar quarter (South Africa's 1 March) has
  // no quarter numbering anyone files on, so the label names the months instead.
  const monthsIn = (start.getMonth() + 1 - fy.month + 12) % 12;
  if (fy.day !== 1 || monthsIn % 3 !== 0) {
    return `${format(start, "MMM")}–${format(endOfQuarter(start), "MMM yyyy")}`;
  }
  const quarter = fiscalQuarterOf(start, fy);
  const startYear = fiscalYearOf(start, fy);
  const suffix = fy.month === 1 ? String(startYear) : `FY${String((startYear + 1) % 100).padStart(2, "0")}`;
  return `Q${quarter} ${suffix}`;
}

const monthSpan = (date: Date): Span => ({
  from: startOfMonth(date),
  to: endOfMonth(date),
});

const quarterSpan = (date: Date): Span => ({
  from: startOfQuarter(date),
  to: endOfQuarter(date),
});

/** "1 Jul 2026 – 30 Jun 2027". */
export function spanLabel(span: Span): string {
  return `${format(span.from, "d MMM yyyy")} – ${format(span.to, "d MMM yyyy")}`;
}

export type PeriodShape = {
  current: Span;
  previous: Span;
  /** "This month", "This FY" — the top line of a comparison column's header. */
  label: string;
  previousHeaderLabel: string;
  /** "Aug 2026", "Q1 FY27", "2026-27" — the muted line beneath it. */
  scope: string;
  previousScope: string;
  /** "last month" — how a summary card names the baseline in a sentence. */
  previousLabel: string;
};

/**
 * What a period resolves to: two spans, and the words for both of them. The
 * financial years and quarter names follow `fiscalYearStart` — the business's
 * country — and 1 July without it.
 */
export function periodShape(
  period: ReportPeriod,
  range: ReportRange | null,
  today: Date = reportToday(),
  fiscalYearStart: FiscalYearStart = AU_FISCAL_YEAR_START,
): PeriodShape {
  const yearOf = (date: Date) => financialYear(date, fiscalYearStart);
  const fyLabelOf = (date: Date) => fyLabel(date, fiscalYearStart);
  const quarterLabelOf = (date: Date) => quarterLabel(date, fiscalYearStart);
  switch (period) {
    case "This month": {
      const current = monthSpan(today);
      const previous = monthSpan(subMonths(today, 1));
      return {
        current,
        previous,
        label: "This month",
        previousHeaderLabel: "Last month",
        scope: format(current.from, "MMM yyyy"),
        previousScope: format(previous.from, "MMM yyyy"),
        previousLabel: "last month",
      };
    }
    case "Last month": {
      const current = monthSpan(subMonths(today, 1));
      const previous = monthSpan(subMonths(today, 2));
      return {
        current,
        previous,
        label: "Last month",
        previousHeaderLabel: "Month before",
        scope: format(current.from, "MMM yyyy"),
        previousScope: format(previous.from, "MMM yyyy"),
        previousLabel: "the month before",
      };
    }
    case "This quarter": {
      const current = quarterSpan(today);
      const previous = quarterSpan(subQuarters(today, 1));
      return {
        current,
        previous,
        label: "This quarter",
        previousHeaderLabel: "Last quarter",
        scope: quarterLabelOf(current.from),
        previousScope: quarterLabelOf(previous.from),
        previousLabel: "last quarter",
      };
    }
    case "Last quarter": {
      const current = quarterSpan(subQuarters(today, 1));
      const previous = quarterSpan(subQuarters(today, 2));
      return {
        current,
        previous,
        label: "Last quarter",
        previousHeaderLabel: "Quarter before",
        scope: quarterLabelOf(current.from),
        previousScope: quarterLabelOf(previous.from),
        previousLabel: "the quarter before",
      };
    }
    case "This financial year": {
      const current = yearOf(today);
      const previous = yearOf(subDays(current.from, 1));
      return {
        current,
        previous,
        label: "This FY",
        previousHeaderLabel: "Previous FY",
        scope: fyLabelOf(current.from),
        previousScope: fyLabelOf(previous.from),
        previousLabel: "last financial year",
      };
    }
    case "Last financial year": {
      const current = yearOf(subDays(yearOf(today).from, 1));
      const previous = yearOf(subDays(current.from, 1));
      return {
        current,
        previous,
        label: "Last FY",
        previousHeaderLabel: "Previous FY",
        scope: fyLabelOf(current.from),
        previousScope: fyLabelOf(previous.from),
        previousLabel: "the year before",
      };
    }
    default: {
      // A custom range compares itself against the same number of days
      // immediately before it, which is the only baseline an arbitrary stretch
      // has available.
      const from = range ? parseISO(range.from) : null;
      const to = range ? parseISO(range.to) : null;
      const usable =
        from && to && isValid(from) && isValid(to) && to >= from
          ? { from, to }
          : { from: subDays(today, 29), to: today };
      const days = differenceInCalendarDays(usable.to, usable.from) + 1;
      const previous = {
        from: subDays(usable.from, days),
        to: subDays(usable.from, 1),
      };
      return {
        current: usable,
        previous,
        label: "This period",
        previousHeaderLabel: "Previous",
        scope: spanLabel(usable),
        previousScope: spanLabel(previous),
        previousLabel: "the previous range",
      };
    }
  }
}

/** Every calendar month a span touches, in order. */
export function monthsIn(span: Span): Date[] {
  return eachMonthOfInterval({ start: span.from, end: span.to });
}

/** Whole days a span covers, both ends included. */
export function daysIn(span: Span): number {
  return differenceInCalendarDays(span.to, span.from) + 1;
}

/**
 * How much of a month a span covers, 0–1.
 *
 * Whole-month presets always come back 1, so their figures stay clean. It's
 * custom ranges this is for: a range starting mid-month should take part of that
 * month's trading, not all of it.
 */
export function coverage(month: Date, span: Span): number {
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const from = first > span.from ? first : span.from;
  const to = last < span.to ? last : span.to;
  const days = differenceInCalendarDays(to, from) + 1;
  return Math.max(0, Math.min(1, days / getDaysInMonth(month)));
}

/* ------------------------------------------------------------------ *
 * Figures
 * ------------------------------------------------------------------ */

export const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Money, two decimals always, so a column of these has its decimal points in a
 * line. Signed with the minus in front of the dollar rather than inside it:
 * "$-1,200.00" reads as a strange currency.
 */
export function reportMoney(value: number): string {
  const formatted = activeAmountDigits(Math.abs(value), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${value < 0 ? "-" : ""}${activeCurrencySymbol()}${formatted}`;
}

/** "34.2%", the one place a report percentage is formatted. */
export function reportPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/* ------------------------------------------------------------------ *
 * Comparisons
 * ------------------------------------------------------------------ */

/** A figure and the same figure last period, kept together so they can't drift. */
export type ReportAmounts = { amount: number; previous: number };

/**
 * Which direction is good news for a figure.
 *
 * Expenses are the reason this exists. Colouring a movement by its sign alone
 * would paint a rise in costs green, which is the opposite of what happened —
 * so a figure declares which way is up for it and the colour follows that.
 */
export type ReportDirection = "up-good" | "down-good";

export type ReportDelta = {
  /** Signed: this period minus last. */
  amount: number;
  /** "+$1,240.00 vs last month", or that nothing moved. */
  label: string;
  up: boolean;
  /** Zero movement, which gets no arrow and no colour. */
  flat: boolean;
  favourable: boolean;
};

export function reportDelta(
  amounts: ReportAmounts,
  previousLabel: string,
  direction: ReportDirection = "up-good",
  /** Formats the movement — money by default, a plain count for a tally. */
  formatValue: (value: number) => string = reportMoney,
): ReportDelta {
  const change = round2(amounts.amount - amounts.previous);
  const up = change > 0;
  // A hundredth either way is rounding, not a movement.
  const flat = Math.abs(change) < 0.01;

  return {
    amount: change,
    up,
    flat,
    favourable: direction === "up-good" ? up : !up,
    label: flat
      ? `No change vs ${previousLabel}`
      : `${up ? "+" : "-"}${formatValue(Math.abs(change))} vs ${previousLabel}`,
  };
}

/**
 * The fiscal-year start from a country context, for the reports.
 *
 * A tiny adapter so report code imports one shape rather than reaching into
 * the context twice at every call site, and so the context module and this one
 * stay independent of each other.
 */

