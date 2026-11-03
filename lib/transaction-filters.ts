/**
 * The Transactions lists' filters — sole-webapp's `BankBalanceSmartFilter`
 * (Unmatched) and `SoleBalanceSmartFilter` (Matched), as a draft the popover
 * edits and the params the list request takes.
 *
 * Both tabs filter by date (a preset or a custom range), type (credit,
 * debit) and amount. Unmatched also narrows by bank account; Matched by
 * category and by cash payments.
 */

import {
  AU_FISCAL_YEAR_START,
  fiscalYearOf,
  fiscalYearRange,
  type FiscalYearStart,
} from "@/lib/fiscal-year";

export type DatePreset = "custom" | "prev_month" | "prev_fy";

/** What the popover edits — strings and ids, applied only on Apply. */
export type TransactionFilterDraft = {
  datePreset: DatePreset;
  /** `YYYY-MM-DD`, or "". */
  from: string;
  to: string;
  credit: boolean;
  debit: boolean;
  minAmount: string;
  maxAmount: string;
  /** Unmatched only: `/bank/accounts` ids. */
  accountIds: string[];
  /** Matched only: account_subcategory ids. */
  categoryIds: string[];
  /** Matched only: paid with cash. */
  cash: boolean;
};

export const EMPTY_TRANSACTION_FILTERS: TransactionFilterDraft = {
  datePreset: "custom",
  from: "",
  to: "",
  credit: false,
  debit: false,
  minAmount: "",
  maxAmount: "",
  accountIds: [],
  categoryIds: [],
  cash: false,
};

/** What the list request takes — sole-webapp's `filter_by[...]` fields. */
export type TransactionFilterParams = {
  startDate?: string;
  endDate?: string;
  /** "credit", "debit", or both as sole-webapp sends it: "credit|debit". */
  type?: "credit" | "debit" | "credit|debit";
  minPrice?: number;
  maxPrice?: number;
  bankAccountIds?: string[];
  categoryIds?: string[];
  cash?: boolean;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function iso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * sole-webapp's presets: last calendar month, or the last financial year —
 * July to June, or the business's own year when `start` is passed.
 */
export function presetRange(
  preset: Exclude<DatePreset, "custom">,
  today: Date = new Date(),
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): { from: string; to: string } {
  if (preset === "prev_month") {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const last = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: iso(first), to: iso(last) };
  }
  // The FY before the current one.
  const previous = fiscalYearRange(fiscalYearOf(today, start) - 1, start);
  return { from: previous.start, to: previous.end };
}

function amount(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * The draft as request params, for one tab. Fields the other tab owns are
 * left out, and a min above the max is swapped, as sole-webapp swaps it.
 */
export function resolveTransactionFilters(
  draft: TransactionFilterDraft,
  tab: "unmatched" | "matched",
): TransactionFilterParams {
  const params: TransactionFilterParams = {};
  if (draft.from) params.startDate = draft.from;
  if (draft.to) params.endDate = draft.to;

  if (draft.credit && draft.debit) params.type = "credit|debit";
  else if (draft.credit) params.type = "credit";
  else if (draft.debit) params.type = "debit";

  let min = amount(draft.minAmount);
  let max = amount(draft.maxAmount);
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  if (min !== undefined) params.minPrice = min;
  if (max !== undefined) params.maxPrice = max;

  if (tab === "unmatched") {
    if (draft.accountIds.length > 0) params.bankAccountIds = draft.accountIds;
  } else {
    if (draft.categoryIds.length > 0) params.categoryIds = draft.categoryIds;
    if (draft.cash) params.cash = true;
  }
  return params;
}

/** How many filters are narrowing the list, for the button's badge. */
export function activeTransactionFilterCount(
  draft: TransactionFilterDraft,
  tab: "unmatched" | "matched",
): number {
  let count = 0;
  if (draft.from || draft.to) count += 1;
  if (draft.credit || draft.debit) count += 1;
  if (draft.minAmount.trim() || draft.maxAmount.trim()) count += 1;
  if (tab === "unmatched" && draft.accountIds.length > 0) count += 1;
  if (tab === "matched" && draft.categoryIds.length > 0) count += 1;
  if (tab === "matched" && draft.cash) count += 1;
  return count;
}

/** sole-webapp's "Select All" for one parent: all off if all on, else all on. */
export function toggleCategoryGroup(
  selected: string[],
  groupIds: string[],
): string[] {
  const allOn = groupIds.length > 0 && groupIds.every((id) => selected.includes(id));
  if (allOn) return selected.filter((id) => !groupIds.includes(id));
  return [...new Set([...selected, ...groupIds])];
}

/** Income subcategories sole-webapp's Matched filter leaves out. */
export const FILTER_HIDDEN_CATEGORY_IDS = ["174", "79"];
