/**
 * The financial year, from wherever it starts.
 *
 * Australia's runs 1 July to 30 June, and that was written into every helper
 * that scoped a figure to "this year" — `getMonth() >= 6`, `-07-01`, `-06-30`.
 * New Zealand's runs 1 April to 31 March, and the business's country context
 * says which one it is (`fiscalYearStartMonth` / `fiscalYearStartDay`, read
 * through `useFiscalYearStart`). These
 * are the pure date sums those helpers now share, so "which year is this date
 * in" has one answer for every start.
 *
 * Every function defaults to 1 July. That keeps each existing caller — and
 * the Australian statutory features that must stay on the ATO year whatever
 * the business's country (payroll, the tax estimator, investment property) —
 * exactly as they were; only a caller that passes the country's start moves.
 *
 * A year is named here by the calendar year it *starts* in. The labels on top
 * ("FY 26/27", "2026-27", "Financial year 2026") are each call site's own and
 * stay there; this module only hands them the numbers.
 */

/** When a financial year starts. `month` is 1-12, as the registry stores it. */
export type FiscalYearStart = { month: number; day: number };

/** The ATO's year: 1 July. The default everywhere, so Australia is unchanged. */
export const AU_FISCAL_YEAR_START: FiscalYearStart = { month: 7, day: 1 };

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Guards against a registry value that would make the maths nonsense (month 13,
 * day 99): anything out of range falls back to Australia's 1 July. Days stop at
 * 28 so every month has the start day.
 */
export function normalizeFiscalYearStart(
  start: FiscalYearStart | undefined,
): FiscalYearStart {
  const month = Number(start?.month);
  const day = Number(start?.day);
  return {
    month:
      Number.isInteger(month) && month >= 1 && month <= 12
        ? month
        : AU_FISCAL_YEAR_START.month,
    day:
      Number.isInteger(day) && day >= 1 && day <= 28
        ? day
        : AU_FISCAL_YEAR_START.day,
  };
}

/** Whether a calendar month/day falls before the year's start, i.e. in the year begun last calendar year. */
function beforeStart(
  month: number,
  day: number,
  rawStart: FiscalYearStart,
): boolean {
  const start = normalizeFiscalYearStart(rawStart);
  return month < start.month || (month === start.month && day < start.day);
}

/** The calendar year the financial year containing `date` starts in. */
export function fiscalYearOf(
  date: Date,
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): number {
  return beforeStart(date.getMonth() + 1, date.getDate(), start)
    ? date.getFullYear() - 1
    : date.getFullYear();
}

/**
 * The same, for an ISO `YYYY-MM-DD` — read as written rather than parsed into a
 * Date, so a timezone can't move 1 July into the year before. NaN when the
 * string isn't a date.
 */
export function fiscalYearOfIso(
  iso: string,
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): number {
  const [year, month, day] = iso.split("-").map(Number);
  return beforeStart(month, day || 1, start) ? year - 1 : year;
}

/** The first and last day of the financial year starting in `startYear`, as local midnights. */
export function fiscalYearSpan(
  startYear: number,
  rawStart: FiscalYearStart = AU_FISCAL_YEAR_START,
): { from: Date; to: Date } {
  const start = normalizeFiscalYearStart(rawStart);
  return {
    from: new Date(startYear, start.month - 1, start.day),
    // The day before the next one starts — 30 June, 31 March, 28 or 29 Feb.
    to: new Date(startYear + 1, start.month - 1, start.day - 1),
  };
}

/** The same bounds as inclusive ISO dates: AU 2026 → 2026-07-01 to 2027-06-30. */
export function fiscalYearRange(
  startYear: number,
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): { start: string; end: string } {
  const span = fiscalYearSpan(startYear, start);
  return { start: toIso(span.from), end: toIso(span.to) };
}

/** The financial year containing `today` and the `count - 1` before it, newest first, by start year. */
export function recentFiscalYears(
  count: number,
  today: Date = new Date(),
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): number[] {
  const current = fiscalYearOf(today, start);
  return Array.from(
    { length: Math.max(0, count) },
    (_, offset) => current - offset,
  );
}

/**
 * Which quarter of its financial year `date` falls in, 1-4 — Q1 is July to
 * September in Australia, April to June in New Zealand.
 */
export function fiscalQuarterOf(
  date: Date,
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): 1 | 2 | 3 | 4 {
  const monthsIn = (date.getMonth() - (start.month - 1) + 12) % 12;
  return (Math.floor(monthsIn / 3) + 1) as 1 | 2 | 3 | 4;
}

/**
 * A financial year's name, by the year it starts in, in the three shapes the
 * app already uses:
 *  - `short`: "FY 26/27" — the Transactions list's period picker.
 *  - `span`: "2026-27" — the reports' scope line.
 *  - `long`: "FY 2026/2027" — the balance sheet, trial balance and
 *    depreciation year pickers.
 */
export function fiscalYearLabel(
  startYear: number,
  style: "short" | "span" | "long",
): string {
  const endYear = startYear + 1;
  switch (style) {
    case "short":
      return `FY ${String(startYear).slice(2)}/${String(endYear).slice(2)}`;
    case "span":
      return `${startYear}-${String(endYear % 100).padStart(2, "0")}`;
    case "long":
      return `FY ${startYear}/${endYear}`;
  }
}
