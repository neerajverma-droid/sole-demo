/**
 * The BAS report.
 *
 * Real data from `POST /report/gst-extract` — its own endpoint rather than a
 * `report_type_id` on `POST /report` (`gst_extract: '7'` is commented out of
 * `sole-ocr`'s `src/constants/index.js`, which is why). Same plain multipart
 * `FormData` as the other reports: `handleGstExtract` reads `req.body` behind
 * `upload.none()` with no decrypt step, so the encrypted-body helper would
 * arrive as one unreadable `data` field. `business_id`/auth come from the
 * axios interceptor.
 *
 * One call answers two questions at once:
 *
 *  - `data.quarters[]` — the GST worksheet for every Australian BAS quarter
 *    the range touches, each measured over the *whole* quarter (the backend
 *    widens a partial range to its quarters). Labelled G1/G3/G6/G9 for sales
 *    and G10/G11/G14/G20 for purchases; G9 and G20 are what the ATO form calls
 *    1A and 1B. There is no W1/W2/PAYG on this endpoint, so none is shown.
 *  - `data.transactions` — a paginated `{key, value}[]` listing of every row
 *    that fed those figures, from `sp_bas_transactions_v3`.
 *
 * Every figure comes back pre-formatted (`"$1,234.56"`), the net as
 * `"$123.45 (Refund)"` / `"$123.45 (Payable)"` with the amount unsigned, and
 * every date as `DD/MM/YYYY` — all parsed here, so the screen only ever sees
 * numbers and ISO dates.
 *
 * Periods come from `report-periods`, shared with the other reports.
 */

import { format } from "date-fns";

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import type { CountryContext } from "@/lib/country-context";
import { AU_FISCAL_YEAR_START, type FiscalYearStart } from "@/lib/fiscal-year";
import {
  periodShape,
  round2,
  spanLabel,
  type NamedRange,
  type ReportPeriod,
  type ReportRange,
  type Span,
} from "@/lib/report-periods";

/**
 * The periods a BAS is worth running for — quarters first, because that's
 * what most sole traders lodge. A month isn't offered: the backend always
 * widens to whole quarters, so a month would show a quarter's worksheet under
 * a month's name.
 */
export const BAS_PERIODS: readonly ReportPeriod[] = [
  "This quarter",
  "Last quarter",
  "This financial year",
  "Last financial year",
  "Custom range",
];

/**
 * The presets for a business that doesn't file quarterly — New Zealand's
 * two-monthly or six-monthly GST. Its filing periods ("This period", "Last
 * period") are offered above these, from `filingPeriodChoices`; a calendar
 * quarter is left out because it isn't a period anyone there files on.
 */
export const BAS_FILING_PERIOD_PRESETS: readonly ReportPeriod[] = [
  "This financial year",
  "Last financial year",
  "Custom range",
];

/**
 * Whether the return screen offers the business's own filing periods instead
 * of calendar quarters: outside Australia, for anyone not filing quarterly,
 * once the country context has said which periods those are. Australia keeps
 * its quarter presets exactly as they were.
 */
export function usesFilingPeriods(
  country: Pick<CountryContext, "iso2" | "filingFrequency" | "currentFilingPeriod">,
): boolean {
  return (
    country.iso2 !== "AU" &&
    Boolean(country.filingFrequency) &&
    country.filingFrequency !== "quarterly" &&
    Boolean(country.currentFilingPeriod?.startDate && country.currentFilingPeriod?.endDate)
  );
}

/**
 * "This period" and "Last period", with the dates the backend's own filing
 * calendar gives them (`/country-context` → `filing.current_period` /
 * `previous_period`, built by the same `getFilingPeriods` the return uses), so
 * the range asked for is exactly one period the return reports.
 */
export function filingPeriodChoices(
  country: Pick<CountryContext, "currentFilingPeriod" | "previousFilingPeriod">,
): NamedRange[] {
  const choices: NamedRange[] = [];
  const add = (key: string, name: string, period: CountryContext["currentFilingPeriod"]) => {
    if (period?.startDate && period.endDate) {
      choices.push({ key, name, scope: period.label, range: { from: period.startDate, to: period.endDate } });
    }
  };
  add("this-period", "This period", country.currentFilingPeriod);
  add("last-period", "Last period", country.previousFilingPeriod);
  return choices;
}

/**
 * What one filing period is called on the worksheet: "quarter" where the
 * backend labelled them "Quarter N" (quarterly filers), "period" otherwise.
 */
export function periodNoun(report: Pick<BasReport, "quarters">): "quarter" | "period" {
  return report.quarters.every((q) => q.label.startsWith("Quarter")) ? "quarter" : "period";
}

/**
 * The return's own label for a listed transaction, or null to show the BAS
 * code. A row with no GST gets the return's "no GST" label where it has one:
 * on a GST101A a purchase without GST is not in Box 11, and a sale without GST
 * sits in Boxes 5 and 6.
 */
export function transactionLabelFor(
  labels: BasReport["transactionLabels"],
  code: BasCode,
  gst: number,
): string | null {
  if (!labels) return null;
  const noGst = gst === 0;
  const specific =
    noGst && code === "G1" ? "SALE_NO_GST" : noGst && (code === "G10" || code === "G11") ? "PURCHASE_NO_GST" : null;
  return (specific && labels[specific]) || labels[code] || null;
}

/** What the return screen runs for: a period, its range, and the named filing period it is, if any. */
export type BasPeriodChoice = {
  period: ReportPeriod;
  range: ReportRange | null;
  namedKey: string | null;
};

/**
 * The period the return screen runs for, from what's stored and what the
 * business is:
 *  - a named filing period picked on another business isn't carried over —
 *    its dates belong to that business's filing calendar;
 *  - a named period follows the calendar's own dates for it;
 *  - a quarter preset (the default) means nothing to a two-monthly filer, so it
 *    starts on the last filing period, the one most likely being prepared.
 * Until the country context has answered, the stored choice stands.
 */
export function resolveBasPeriod(input: {
  stored: BasPeriodChoice;
  ready: boolean;
  businessId: string | null;
  periodOwner: string | null;
  filingMode: boolean;
  filingChoices: readonly NamedRange[];
}): BasPeriodChoice {
  const { stored, ready, businessId, periodOwner, filingMode, filingChoices } = input;
  let next: BasPeriodChoice = { ...stored };
  if (!ready) return next;
  if (businessId !== null && periodOwner !== null && periodOwner !== businessId && next.namedKey !== null) {
    next = { period: "This quarter", range: null, namedKey: null };
  }
  const named = next.namedKey ? filingChoices.find((choice) => choice.key === next.namedKey) : undefined;
  if (named) {
    next = { period: "Custom range", range: { ...named.range }, namedKey: named.key };
  } else if (next.namedKey !== null) {
    next = { ...next, namedKey: null };
  }
  if (filingMode && (next.period === "This quarter" || next.period === "Last quarter")) {
    const start = filingChoices.find((choice) => choice.key === "last-period") ?? filingChoices[0];
    if (start) next = { period: "Custom range", range: { ...start.range }, namedKey: start.key };
  }
  return next;
}

export const BAS_PAGE_SIZE = 25;

/** The three BAS codes a transaction row can be tagged with, or neither. */
export type BasCode = "G1" | "G10" | "G11" | "Other";

export type BasLine = {
  /** "G1", "G20". */
  code: string;
  /** "Total Sales (Incl. GST)", as the backend names it. */
  label: string;
  amount: number;
};

/** One block of the return, as the country's own form groups it. */
export type BasSection = {
  /** "GST amounts you owe the tax office (Sales)", "GST on sales and income". */
  title: string;
  rows: BasLine[];
};

export type BasQuarter = {
  /** "Quarter 1", or "Quarter 1 (FY 2024-25)" when the range spans years. */
  label: string;
  /** ISO `YYYY-MM-DD`. */
  from: string;
  to: string;
  rangeLabel: string;
  /**
   * Every block of the return, in the order the country's form prints them.
   *
   * Two in Australia (sales then purchases) and in New Zealand; two in South
   * Africa with different names. The worksheet renders whatever it is handed
   * rather than looking for a block by title — which is what the old parser
   * did, and why a GST101A came back blank.
   */
  sections: BasSection[];
  /** The two headline figures, whichever boxes this country puts them in. */
  taxOnSales: number;
  taxOnPurchases: number;
  /** Unsigned — `outcome` says which way it goes. */
  net: number;
  outcome: "payable" | "refund";
  /**
   * Where the form prints the bottom line, when it numbers it: GST101A's Box
   * 15, "Difference between Box 10 and Box 14". Null for the BAS, whose
   * worksheet has no such box.
   */
  summaryCode: string | null;
  summaryLabel: string | null;
  /** ISO date the return and payment are due; "" where the screen doesn't show one (the BAS). */
  dueDate: string;
};

export type BasTransaction = {
  id: string;
  type: string;
  name: string;
  /** ISO `YYYY-MM-DD`, or "" when the backend sent none. */
  date: string;
  reconcileDate: string;
  party: string;
  basCode: BasCode;
  category: string;
  description: string;
  exGst: number;
  gst: number;
  incGst: number;
};

export type BasReport = {
  period: ReportPeriod;
  rangeLabel: string;
  range: { from: string; to: string };
  /** "BAS", "GST return", "VAT return" — the country's name for the form. */
  returnName: string;
  /** "GST", "VAT" — the word for the tax itself. */
  taxLabel: string;
  /** The authority the net amount is paid to: ATO, Inland Revenue, SARS. */
  taxAuthority: string | null;
  /**
   * True when the country has no mapped form yet. The figures are right; the
   * layout is not something to lodge, and the screen says so.
   */
  draft: boolean;
  /**
   * What to show for a transaction's code, when the country's form groups it
   * differently from the BAS: "Purchases (Box 11)" rather than G11 on a
   * GST101A. Null keeps the codes themselves (Australia).
   */
  transactionLabels: Partial<Record<string, string>> | null;
  quarters: BasQuarter[];
  transactions: BasTransaction[];
  /** Transactions across every page, not just this one. */
  total: number;
  pageCount: number;
};

/* ------------------------------------------------------------------ *
 * Backend shapes
 * ------------------------------------------------------------------ */

type BackendCell = { key: string; value: string | number | null };
type BackendLine = { code: string; amount: string };

/**
 * What the backend returns per filing period.
 *
 * `tax_return` is the country's own form: its sections, their rows and the
 * box codes, built by sole-ocr's `reporting/taxReturn/` templates. The
 * title-keyed blocks beside it are the legacy Australian shape, kept for
 * older clients — this module reads `tax_return` and falls back to them only
 * if a deploy ever serves a response without it.
 */
type BackendTaxReturn = {
  template?: string;
  return_name?: string;
  tax_label?: string;
  tax_authority?: string | null;
  draft?: boolean;
  sections?: { title?: string; rows?: { box?: string | null; label?: string; amount?: number }[] }[];
  boxes?: Record<string, { label?: string; amount?: number }>;
  summary?: { direction?: string; amount?: number; net_tax?: number; box?: string; box_label?: string };
  period?: { due_date?: string | null };
  transaction_labels?: Partial<Record<string, string>>;
};

type BackendQuarter = {
  Quarter: string;
  "Quarter Start Date": string;
  "Quarter End Date": string;
  tax_return?: BackendTaxReturn;
  "GST amounts you owe the tax office (Sales)"?: Record<string, BackendLine>;
  "GST amounts tax office owes you (Purchases)"?: Record<string, BackendLine>;
  "GST Refund/Payable"?: string;
};

type BackendBasResponse = {
  success?: boolean;
  message?: string;
  data?: { transactions?: BackendCell[][]; quarters?: BackendQuarter[] };
  pagination?: { total?: number; total_pages?: number };
};

const SALES_KEY = "GST amounts you owe the tax office (Sales)";
const PURCHASES_KEY = "GST amounts tax office owes you (Purchases)";

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

/** `"$1,234.56"` → `1234.56`. Numbers pass through; anything else is 0. */
export function parseBasAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** `"31/03/2026"` → `"2026-03-31"`; "" for anything that isn't that shape. */
export function parseBasDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function linesOf(block: Record<string, BackendLine> | undefined): BasLine[] {
  return Object.entries(block ?? {}).map(([label, line]) => ({
    code: line?.code ?? "",
    label,
    amount: parseBasAmount(line?.amount),
  }));
}

/**
 * The country's own sections, from the structured block the backend builds.
 *
 * Falls back to the two Australian title-keyed blocks only if a response
 * arrives without `tax_return` — an older backend, mid-deploy. Reading the
 * titles was how this module used to work, and why a New Zealand GST101A came
 * back empty: its sections are called something else.
 */
function sectionsOf(raw: BackendQuarter): BasSection[] {
  const fromTemplate = raw.tax_return?.sections;
  if (Array.isArray(fromTemplate) && fromTemplate.length > 0) {
    return fromTemplate.map((section) => ({
      title: section?.title ?? "",
      rows: (section?.rows ?? []).map((row) => ({
        code: row?.box ?? "",
        label: row?.label ?? "",
        amount: parseBasAmount(row?.amount),
      })),
    }));
  }

  return [
    { title: SALES_KEY, rows: linesOf(raw[SALES_KEY]) },
    { title: PURCHASES_KEY, rows: linesOf(raw[PURCHASES_KEY]) },
  ].filter((section) => section.rows.length > 0);
}

/**
 * The tax on sales and on purchases, wherever this country puts them.
 *
 * By box code, from the country's own map: G9/G20 on an Australian worksheet,
 * boxes 10 and 14 on a GST101A (the totals, adjustments included), fields 13
 * and 19 on a VAT201, 3.1(a) and 4(C) on a GSTR-3B. The first code present
 * wins, so a form that labels the same figure twice — the BAS repeats G9 as
 * 1A — is counted once.
 *
 * Order matters where forms reuse a number for different things: GST101A's
 * Box 13 is a purchase-side adjustment but VAT201's field 13 is output tax,
 * so "10" and "8" come first; VAT201's field 14 is a capital-goods VALUE, not
 * tax, so "19" comes before GST101A's "14".
 */
const SALES_TAX_BOXES = ["G9", "1A", "10", "8", "13", "4A", "3.1(a) tax"];
const PURCHASE_TAX_BOXES = ["G20", "1B", "19", "14", "4(C)"];

function amountForBoxes(sections: BasSection[], codes: string[]): number {
  const rows = sections.flatMap((section) => section.rows);
  for (const code of codes) {
    const row = rows.find((entry) => entry.code === code);
    if (row) return row.amount;
  }
  return 0;
}

function toQuarter(raw: BackendQuarter): BasQuarter {
  const sections = sectionsOf(raw);
  const summary = raw.tax_return?.summary;
  const netText = raw["GST Refund/Payable"] ?? "";
  const from = parseBasDate(raw["Quarter Start Date"]);
  const to = parseBasDate(raw["Quarter End Date"]);

  return {
    label: raw.Quarter,
    from,
    to,
    rangeLabel:
      from && to
        ? spanLabel({ from: new Date(`${from}T00:00:00`), to: new Date(`${to}T00:00:00`) })
        : `${raw["Quarter Start Date"]} – ${raw["Quarter End Date"]}`,
    sections,
    taxOnSales: amountForBoxes(sections, SALES_TAX_BOXES),
    taxOnPurchases: amountForBoxes(sections, PURCHASE_TAX_BOXES),
    // The structured summary is already unsigned and already says which way it
    // goes; the formatted string is the fallback for a response without one.
    net:
      summary?.amount !== undefined
        ? Math.abs(Number(summary.amount) || 0)
        : Math.abs(parseBasAmount(netText)),
    outcome:
      summary?.direction === "refund" || summary?.direction === "payable"
        ? summary.direction
        : /refund/i.test(netText)
          ? "refund"
          : "payable",
    summaryCode: summary?.box?.trim() || null,
    summaryLabel: summary?.box_label?.trim() || null,
    // Shown for the countries whose return screen gained it; the BAS keeps the
    // heading it always had.
    dueDate:
      raw.tax_return?.template && raw.tax_return.template !== "au_bas"
        ? /^\d{4}-\d{2}-\d{2}$/.test(raw.tax_return.period?.due_date ?? "")
          ? (raw.tax_return.period?.due_date as string)
          : ""
        : "",
  };
}

const BAS_CODES: readonly BasCode[] = ["G1", "G10", "G11"];

function toTransaction(row: BackendCell[], index: number, page: number): BasTransaction {
  const cell = (key: string) => row.find((entry) => entry.key === key)?.value ?? null;
  const text = (key: string) => {
    const value = cell(key);
    return value === null ? "" : String(value);
  };
  const code = text("Category").toUpperCase();

  return {
    // The listing has no row id — position within the whole result is the
    // only stable key it offers.
    id: `${page}-${index}`,
    type: text("Type"),
    name: text("Transaction Name"),
    date: parseBasDate(cell("Date")),
    reconcileDate: parseBasDate(cell("Reconcile Date")),
    party: text("Client/Supplier"),
    basCode: (BAS_CODES as readonly string[]).includes(code) ? (code as BasCode) : "Other",
    category: text("Category Name"),
    description: text("Description"),
    exGst: parseBasAmount(cell("Amount Ex GST")),
    gst: parseBasAmount(cell("GST Amount")),
    incGst: parseBasAmount(cell("Amount Inc GST")),
  };
}

/* ------------------------------------------------------------------ *
 * Requests
 * ------------------------------------------------------------------ */

/** The exact span a period asks the backend about, as ISO dates. */
export function basRange(
  period: ReportPeriod,
  range: ReportRange | null,
  fiscalYearStart: FiscalYearStart = AU_FISCAL_YEAR_START,
) {
  const { current } = periodShape(period, range, undefined, fiscalYearStart);
  return isoRange(current);
}

function isoRange(span: Span) {
  return {
    from: format(span.from, "yyyy-MM-dd"),
    to: format(span.to, "yyyy-MM-dd"),
  };
}

export async function fetchBasReport(
  period: ReportPeriod,
  range: ReportRange | null,
  page = 1,
  pageSize: number = BAS_PAGE_SIZE,
  fiscalYearStart: FiscalYearStart = AU_FISCAL_YEAR_START,
): Promise<BasReport> {
  const shape = periodShape(period, range, undefined, fiscalYearStart);
  const iso = isoRange(shape.current);

  const form = new FormData();
  form.append("action", "view");
  form.append("start_date", iso.from);
  form.append("end_date", iso.to);
  form.append("page", String(page));
  form.append("page_size", String(pageSize));

  const response = await api.post<BackendBasResponse>(apiRoutes.reporting.gst, form);
  const body = response.data;
  if (body.success === false) {
    throw new Error(body.message ?? "Couldn't load the BAS report");
  }

  const total = body.pagination?.total ?? 0;
  const quarters = (body.data?.quarters ?? []).map(toQuarter);
  // Every period of one report is the same country's form, so the first one
  // names the whole report. A response with no periods keeps the Australian
  // wording rather than rendering a blank heading.
  const template = body.data?.quarters?.[0]?.tax_return;

  return {
    period,
    rangeLabel: spanLabel(shape.current),
    range: iso,
    returnName: template?.return_name?.trim() || "BAS",
    taxLabel: template?.tax_label?.trim() || "GST",
    taxAuthority: template?.tax_authority?.trim() || null,
    draft: template?.draft === true,
    transactionLabels: template?.transaction_labels ?? null,
    quarters,
    transactions: (body.data?.transactions ?? []).map((row, index) =>
      toTransaction(row, index, page),
    ),
    total,
    pageCount: Math.max(1, body.pagination?.total_pages ?? Math.ceil(total / pageSize)),
  };
}

/**
 * Downloads the BAS workbook. The backend already renders PDF and CSV from the
 * same workbook it emails — `sole-webapp` just never asked for anything but
 * the xlsx default.
 */
export async function downloadBasReport(
  range: { from: string; to: string },
  fileFormat: "pdf" | "csv" | "xlsx",
): Promise<void> {
  const form = new FormData();
  form.append("action", "download");
  form.append("start_date", range.from);
  form.append("end_date", range.to);
  // Anything the backend doesn't recognise is xlsx, so xlsx is simply unsent.
  if (fileFormat !== "xlsx") form.append("format", fileFormat);

  const response = await api.post(apiRoutes.reporting.gst, form, {
    responseType: "blob",
  });

  const disposition: string | undefined = response.headers["content-disposition"];
  const filename =
    disposition?.match(/filename="?([^"]+)"?/)?.[1] ?? `BAS Report.${fileFormat}`;

  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ *
 * Presentation helpers
 * ------------------------------------------------------------------ */

/**
 * Every quarter added together — what a financial-year view headlines. The
 * net is re-signed before summing, since one quarter's refund offsets
 * another's payment.
 */
export function basTotals(quarters: BasQuarter[]): {
  taxOnSales: number;
  taxOnPurchases: number;
  net: number;
  outcome: "payable" | "refund";
} {
  const taxOnSales = round2(quarters.reduce((sum, q) => sum + q.taxOnSales, 0));
  const taxOnPurchases = round2(
    quarters.reduce((sum, q) => sum + q.taxOnPurchases, 0),
  );
  const signed = round2(
    quarters.reduce((sum, q) => sum + (q.outcome === "refund" ? -q.net : q.net), 0),
  );
  return {
    taxOnSales,
    taxOnPurchases,
    net: Math.abs(signed),
    outcome: signed < 0 ? "refund" : "payable",
  };
}

/** "31 Mar 2026" from an ISO date; "—" when there isn't one. */
export function basDate(iso: string): string {
  if (!iso) return "—";
  return format(new Date(`${iso}T00:00:00`), "d MMM yyyy");
}
