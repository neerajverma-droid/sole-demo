/**
 * One asset's depreciation schedule, exactly as the backend stores it.
 *
 * `GET /assets/depreciation/:asset_id` returns the active depreciation record
 * with its monthly `entries` already worked out (and kept up to date as they
 * are posted to the journal). The schedule screen shows those rather than
 * recomputing a yearly schedule in the browser, so it can't disagree with the
 * depreciation report or the ledger — the same thing sole-webapp's own
 * schedule drawer did.
 *
 * `fetchAssetDepreciation` in `lib/assets.ts` reads the same endpoint for the
 * settings form, but keeps only the settings; this keeps the money and entries.
 */

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { depreciationMethodFromApi, type DepreciationMethod } from "@/lib/assets";
import {
  AU_FISCAL_YEAR_START,
  fiscalYearLabel,
  fiscalYearOfIso,
  fiscalYearRange,
  type FiscalYearStart,
} from "@/lib/fiscal-year";

type Numeric = number | string | null | undefined;

type ApiScheduleEntry = {
  id?: number | string;
  period_start?: string | null;
  period_end?: string | null;
  depreciation_amount?: Numeric;
  opening_book_value?: Numeric;
  closing_book_value?: Numeric;
  days_held?: Numeric;
  is_posted?: boolean | number | null;
};

export type ApiDepreciationSchedule = {
  id?: number | string;
  asset_id?: number | string;
  depreciation_method?: string | null;
  effective_life_years?: Numeric;
  depreciation_rate?: Numeric;
  residual_value?: Numeric;
  cost_limit?: Numeric;
  start_date?: string | null;
  opening_value?: Numeric;
  accumulated_depreciation?: Numeric;
  book_value?: Numeric;
  entries?: ApiScheduleEntry[] | null;
  asset?: {
    id?: number | string;
    name?: string | null;
    price?: Numeric;
    sub_total?: Numeric;
  } | null;
};

export type DepreciationScheduleEntry = {
  /** ISO `YYYY-MM-DD`, inclusive. */
  periodStart: string;
  /** ISO `YYYY-MM-DD`, inclusive. */
  periodEnd: string;
  daysHeld: number;
  depreciation: number;
  openingBookValue: number;
  closingBookValue: number;
  isPosted: boolean;
};

export type AssetDepreciationSchedule = {
  id: string;
  method: DepreciationMethod;
  /** As the backend stores it: a percentage (20 = 20%), `null` when unset. */
  ratePercent: number | null;
  effectiveLifeYears: number | null;
  residualValue: number;
  costLimit: number | null;
  startDate: string;
  /** The depreciable value — cost (capped by any cost limit) less residual. */
  openingValue: number;
  accumulatedDepreciation: number;
  bookValue: number;
  assetName: string;
  /** Oldest first. */
  entries: DepreciationScheduleEntry[];
};

function toNumber(value: Numeric): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** A positive number, or `null` for missing / zero / nonsense. */
function positiveOrNull(value: Numeric): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** DATEONLY columns arrive as `YYYY-MM-DD`; tolerate a full timestamp too. */
function isoDay(value: string | null | undefined): string {
  return (value ?? "").slice(0, 10);
}

/** Money summed in cents, so a long column of 2dp figures doesn't drift. */
function sumMoney(values: number[]): number {
  return values.reduce((cents, value) => cents + Math.round(value * 100), 0) / 100;
}

function mapEntry(raw: ApiScheduleEntry): DepreciationScheduleEntry {
  return {
    periodStart: isoDay(raw.period_start),
    periodEnd: isoDay(raw.period_end),
    daysHeld: toNumber(raw.days_held),
    depreciation: toNumber(raw.depreciation_amount),
    openingBookValue: toNumber(raw.opening_book_value),
    closingBookValue: toNumber(raw.closing_book_value),
    isPosted: raw.is_posted === true || raw.is_posted === 1,
  };
}

export function mapApiDepreciationSchedule(
  raw: ApiDepreciationSchedule,
): AssetDepreciationSchedule {
  // The include's `order` isn't applied by Sequelize, so sort here.
  const entries = (raw.entries ?? [])
    .map(mapEntry)
    .filter((entry) => entry.periodStart)
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  return {
    id: String(raw.id ?? ""),
    method: depreciationMethodFromApi(raw.depreciation_method ?? null),
    ratePercent: positiveOrNull(raw.depreciation_rate),
    effectiveLifeYears: positiveOrNull(raw.effective_life_years),
    residualValue: toNumber(raw.residual_value),
    costLimit: positiveOrNull(raw.cost_limit),
    startDate: isoDay(raw.start_date),
    openingValue: toNumber(raw.opening_value),
    accumulatedDepreciation: toNumber(raw.accumulated_depreciation),
    bookValue: toNumber(raw.book_value),
    assetName: raw.asset?.name?.trim() ?? "",
    entries,
  };
}

/** `null` on a 404 — the asset has no active depreciation, which isn't an error. */
export async function fetchAssetDepreciationSchedule(
  assetId: string,
): Promise<AssetDepreciationSchedule | null> {
  try {
    const response = await api.get<{
      success: boolean;
      message?: string;
      data?: ApiDepreciationSchedule | null;
    }>(apiRoutes.asset.depreciation.byAsset + assetId);
    return response.data?.data
      ? mapApiDepreciationSchedule(response.data.data)
      : null;
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 404) return null;
    throw error;
  }
}

/** Whether `today` (ISO) falls inside the entry's period, both ends inclusive. */
export function isCurrentPeriod(
  entry: Pick<DepreciationScheduleEntry, "periodStart" | "periodEnd">,
  today: string,
): boolean {
  return entry.periodStart <= today && today <= entry.periodEnd;
}

/** Whether the period is wholly in the future. */
export function isFuturePeriod(
  entry: Pick<DepreciationScheduleEntry, "periodStart">,
  today: string,
): boolean {
  return entry.periodStart > today;
}

export type ScheduleTotals = { depreciation: number; daysHeld: number };

export function scheduleTotals(entries: DepreciationScheduleEntry[]): ScheduleTotals {
  return {
    depreciation: sumMoney(entries.map((entry) => entry.depreciation)),
    daysHeld: entries.reduce((sum, entry) => sum + entry.daysHeld, 0),
  };
}

export type IncomeYearGroup = ScheduleTotals & {
  /** The calendar year the income year starts in. */
  startYear: number;
  /** "FY 2025/2026" — the same label the depreciation report's picker uses. */
  label: string;
  start: string;
  end: string;
  openingBookValue: number;
  closingBookValue: number;
  entries: DepreciationScheduleEntry[];
};

/**
 * The entries bucketed by income year (1 July – 30 June unless another start
 * is given), oldest first, each with its own subtotal — so a year's figure
 * here lines up with the depreciation report for that year. Entries are
 * monthly, so none straddles a year boundary.
 */
export function groupByIncomeYear(
  entries: DepreciationScheduleEntry[],
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): IncomeYearGroup[] {
  const groups = new Map<number, DepreciationScheduleEntry[]>();
  for (const entry of entries) {
    const year = fiscalYearOfIso(entry.periodStart, start);
    const bucket = groups.get(year);
    if (bucket) bucket.push(entry);
    else groups.set(year, [entry]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([startYear, yearEntries]) => {
      const range = fiscalYearRange(startYear, start);
      return {
        startYear,
        label: fiscalYearLabel(startYear, "long"),
        start: range.start,
        end: range.end,
        openingBookValue: yearEntries[0].openingBookValue,
        closingBookValue: yearEntries[yearEntries.length - 1].closingBookValue,
        entries: yearEntries,
        ...scheduleTotals(yearEntries),
      };
    });
}

/** Same columns, same order and same 2dp money as sole-webapp's schedule export. */
export function depreciationScheduleCsv(entries: DepreciationScheduleEntry[]): string {
  const headers = [
    "Period Start",
    "Period End",
    "Days Held",
    "Depreciation Amount",
    "Opening Book Value",
    "Closing Book Value",
  ];
  const rows = entries.map((entry) => [
    entry.periodStart,
    entry.periodEnd,
    entry.daysHeld,
    entry.depreciation.toFixed(2),
    entry.openingBookValue.toFixed(2),
    entry.closingBookValue.toFixed(2),
  ]);
  return [headers, ...rows].map(csvRow).join("\n");
}

/** One CSV row, quoting only the cells that need it (RFC 4180). */
function csvRow(cells: (string | number)[]): string {
  return cells
    .map((cell) => {
      const value = String(cell);
      return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    })
    .join(",");
}

/**
 * Saves the CSV in the browser. Kept here rather than borrowing
 * `lib/file-parser`'s `downloadCsv`, which would pull the whole xlsx parser
 * into this route for a one-line Blob.
 */
export function downloadScheduleCsv(filename: string, content: string): void {
  // The BOM is what stops Excel reading UTF-8 as Latin-1.
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * `depreciation_schedule_<asset name>.csv`, as sole-webapp named it — with
 * characters a filesystem won't take swapped out, and the id when there's no name.
 */
export function depreciationScheduleFilename(assetName: string, assetId: string): string {
  const base = assetName.trim() || assetId;
  return `depreciation_schedule_${base.replace(/[\\/:*?"<>|]+/g, "_")}.csv`;
}
