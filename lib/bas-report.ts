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
import { AU_FISCAL_YEAR_START, type FiscalYearStart } from "@/lib/fiscal-year";
import {
  periodShape,
  round2,
  spanLabel,
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
  summary?: { direction?: string; amount?: number; net_tax?: number };
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
 * boxes 8 and 14 on a GST101A, fields 13 and 19 on a VAT201, 3.1(a) and 4(C)
 * on a GSTR-3B. The first code present wins, so a form that labels the same
 * figure twice — the BAS repeats G9 as 1A — is counted once.
 */
const SALES_TAX_BOXES = ["G9", "1A", "8", "13", "4A", "3.1(a) tax"];
const PURCHASE_TAX_BOXES = ["G20", "1B", "14", "19", "4(C)"];

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
