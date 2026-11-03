/**
 * Periods for the Cash flow card, and the comparison behind them.
 *
 * The owner's question isn't "what did I make" but "am I doing better than
 * before", so a period here always comes with something to measure it
 * against. Everything is expressed as index ranges into the fetched months
 * array (oldest first, newest last) rather than dates: months are uniform
 * buckets, and working in indices means "the six months before these six" is
 * arithmetic rather than date handling.
 *
 * Every helper below takes that array explicitly instead of closing over a
 * module-level constant — the months come from `useDashboardCashFlowQuery`
 * now, so there's nothing left to close over.
 */

import type { CashFlowMonth } from "@/lib/dashboard";

export const CASH_FLOW_PERIODS = [
  "This month",
  "This quarter",
  "Last 6 months",
  "This year",
  "Custom",
] as const;
export type CashFlowPeriod = (typeof CASH_FLOW_PERIODS)[number];

export const COMPARE_MODES = [
  "Previous period",
  "Same period last year",
] as const;
export type CompareMode = (typeof COMPARE_MODES)[number];

/** A run of months, inclusive of both ends. */
export type MonthRange = { start: number; end: number };

/** A custom period is stored as the two keys the selects hold. */
export type CustomRange = { fromKey: string; toKey: string };

export const MONTHS_IN_QUARTER = 3;

/** The most recent month in the data is "now". */
export function anchorOf(months: CashFlowMonth[]): number {
  return months.length - 1;
}

function clampStart(end: number, count: number): MonthRange {
  return { start: Math.max(0, end - count + 1), end };
}

/** Months from the start of the anchor month's calendar quarter. */
function quarterToDate(months: CashFlowMonth[]): MonthRange {
  const anchor = anchorOf(months);
  const monthNumber = Number(months[anchor].key.slice(5, 7));
  const intoQuarter = (monthNumber - 1) % MONTHS_IN_QUARTER;
  return { start: anchor - intoQuarter, end: anchor };
}

/** Months from January of the anchor year. */
function yearToDate(months: CashFlowMonth[]): MonthRange {
  const anchor = anchorOf(months);
  const monthNumber = Number(months[anchor].key.slice(5, 7));
  return { start: Math.max(0, anchor - (monthNumber - 1)), end: anchor };
}

export function indexOfKey(months: CashFlowMonth[], key: string): number {
  return months.findIndex((month) => month.key === key);
}

/** The default custom range — the last three months, so the picker opens on
 *  something rather than on nothing. */
export function defaultCustomRange(months: CashFlowMonth[]): CustomRange {
  const anchor = anchorOf(months);
  return {
    fromKey: months[Math.max(0, anchor - 2)]?.key ?? "",
    toKey: months[anchor]?.key ?? "",
  };
}

export function periodRange(
  months: CashFlowMonth[],
  period: CashFlowPeriod,
  custom?: CustomRange,
): MonthRange {
  const anchor = anchorOf(months);
  if (anchor < 0) return { start: 0, end: 0 };

  if (period === "This month") return { start: anchor, end: anchor };
  if (period === "This quarter") return quarterToDate(months);
  if (period === "Last 6 months") return clampStart(anchor, 6);
  if (period === "This year") return yearToDate(months);

  // Custom, normalised: a range picked back-to-front is still a range.
  const resolved = custom ?? defaultCustomRange(months);
  const from = indexOfKey(months, resolved.fromKey);
  const to = indexOfKey(months, resolved.toKey);
  if (from === -1 || to === -1) return clampStart(anchor, 3);
  return { start: Math.min(from, to), end: Math.max(from, to) };
}

/**
 * What the current period is measured against, or null when the data doesn't
 * reach back far enough — better to say the comparison is unavailable than to
 * compare six months against the three that happen to exist.
 */
export function comparisonRange(
  range: MonthRange,
  mode: CompareMode,
): MonthRange | null {
  const length = range.end - range.start + 1;
  const shift = mode === "Previous period" ? length : 12;
  const start = range.start - shift;
  if (start < 0) return null;
  return { start, end: range.end - shift };
}

export function monthsIn(
  months: CashFlowMonth[],
  range: MonthRange,
): CashFlowMonth[] {
  return months.slice(range.start, range.end + 1);
}

export type CashFlowTotals = {
  moneyIn: number;
  moneyOut: number;
  net: number;
};

export function totalsFor(
  months: CashFlowMonth[],
  range: MonthRange,
): CashFlowTotals {
  const inRange = monthsIn(months, range);
  const moneyIn = inRange.reduce((sum, month) => sum + month.moneyIn, 0);
  const moneyOut = inRange.reduce((sum, month) => sum + month.moneyOut, 0);
  return { moneyIn, moneyOut, net: moneyIn - moneyOut };
}

/**
 * Signed percentage change, or null where there's nothing to divide by.
 *
 * A baseline of zero has no percentage — "up 100%" from nothing is a sentence
 * with no meaning, so the caller shows a dash instead.
 */
export function percentChange(
  current: number,
  baseline: number,
): number | null {
  if (baseline === 0) return null;
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

export type CashFlowSeriesPoint = {
  /** Axis tick — the current period's month. */
  label: string;
  /** "Jul 2026", for the tooltip heading. */
  currentLabel: string;
  moneyIn: number;
  moneyOut: number;
  /** Null on the months where the comparison period has run out. */
  compareLabel: string | null;
  compareIn: number | null;
  compareOut: number | null;
};

function monthLabel(month: CashFlowMonth): string {
  return `${month.month} ${month.year}`;
}

/**
 * The two periods zipped by position, not by date — month 1 against month 1.
 *
 * Position is what makes the comparison readable: a January bar sitting under a
 * July one is only confusing, where "the first month of each period" is the
 * thing being asked about. The axis stays on the current period's months.
 */
export function cashFlowSeries(
  months: CashFlowMonth[],
  range: MonthRange,
  comparison: MonthRange | null,
): CashFlowSeriesPoint[] {
  const current = monthsIn(months, range);
  const compared = comparison ? monthsIn(months, comparison) : [];

  return current.map((month, index) => {
    const against = compared[index];
    return {
      label:
        // A year of months needs the year dropped or the axis turns to mush;
        // anything shorter is unambiguous with just the month.
        current.length > 12 ? `${month.month} ${month.year % 100}` : month.month,
      currentLabel: monthLabel(month),
      moneyIn: month.moneyIn,
      moneyOut: month.moneyOut,
      compareLabel: against ? monthLabel(against) : null,
      compareIn: against ? against.moneyIn : null,
      compareOut: against ? against.moneyOut : null,
    };
  });
}

/** "Aug 2026" for a single month, "Mar – Aug 2026" for a run of them. */
export function rangeLabel(months: CashFlowMonth[], range: MonthRange): string {
  const inRange = monthsIn(months, range);
  const first = inRange[0];
  const last = inRange[inRange.length - 1];
  if (!first || !last) return "—";
  if (first.key === last.key) return monthLabel(first);
  return first.year === last.year
    ? `${first.month} – ${last.month} ${last.year}`
    : `${monthLabel(first)} – ${monthLabel(last)}`;
}

/** The phrase the deltas are read with: "vs last year". */
export function compareSuffix(mode: CompareMode): string {
  return mode === "Previous period" ? "vs previous period" : "vs last year";
}
