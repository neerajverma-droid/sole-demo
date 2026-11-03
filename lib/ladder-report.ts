/**
 * The shape shared by every "ladder" report — Balance Sheet and Trial Balance,
 * and structurally the same ladder Profit & Loss already renders (though P&L
 * keeps its own component: its columns are months with a previous-period
 * comparison baked into fixed trailing positions, which neither of these two
 * has, so a shared renderer that tried to cover all three would carry P&L's
 * special cases into reports that don't need them).
 *
 * `sole-ocr` sends the two reports in genuinely different shapes — Balance
 * Sheet as `{section, rows, total}` per section (identical to P&L), Trial
 * Balance as `{section, rows}` with its total folded into `rows` as a plain
 * row flagged `isTotal: true` (confirmed against `controllers/reports.js`'s
 * `trial_balance` branch). Both `lib/balance-sheet.ts` and
 * `lib/trial-balance.ts` normalise their own backend shape into the one
 * `LadderBlock` shape below at the data layer, so `LadderTable` never has to
 * know which report it's drawing.
 */

export type LadderColumn = {
  key: string;
  /** The column heading — a financial year, or a fixed label like "Total Debit". */
  label: string;
  /** A second line under the label, muted — a financial year has none. */
  scope?: string;
};

export type LadderRow = {
  id: string;
  label: string;
  /**
   * The account code, where the report has one — Trial Balance does, Balance
   * Sheet doesn't. Kept as its own field rather than folded into `label`, so
   * it draws the same way Chart of Accounts already draws a code: its own
   * column, `font-mono`, not smashed into the name with a separator no other
   * report in the suite uses.
   */
  code?: string;
  /** One parsed amount per `LadderReport.columns`, in the same order. */
  values: number[];
};

export type LadderBlock = {
  id: string;
  section: string;
  rows: LadderRow[];
  /** `null` for a section with nothing to total — folding it would hide its
   *  only line, so `LadderTable` won't offer to fold it either. */
  summary: LadderRow | null;
};

export type LadderReport = {
  rangeLabel: string;
  columns: LadderColumn[];
  blocks: LadderBlock[];
};

/** The backend's own pre-formatted `"$1,234.56"` (or a bare number) → a number. */
export function parseLadderAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
