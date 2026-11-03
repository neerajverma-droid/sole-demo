/**
 * The shared engine behind every plain tabular report in the Reporting suite.
 *
 * Four of the suite's reports — Asset Listing, Customer/Supplier, Chart of
 * Accounts and Audit Trail — are the same thing wearing different columns: a
 * paginated grid of rows for a period, with a download and a send. Only the
 * Profit & Loss (a section ladder) and BAS (a quarter worksheet) genuinely
 * need bespoke shapes. So this is one engine and four configs rather than four
 * near-identical screens that drift apart the first time one of them is fixed.
 *
 * Two things vary and are therefore pluggable:
 *
 *  - **Where the rows come from.** Three of the four post to `POST /report`
 *    with their own `report_type_id` and come back as `{key, value}[]` per row
 *    (`reportEndpointSource` below). Audit Trail is on a different endpoint
 *    with a different shape and its own encrypted body, so it brings its own
 *    source function instead of the engine special-casing it.
 *  - **What the columns are.** A column names the *exact* backend key string,
 *    which is what the row object is keyed by — get the string wrong and the
 *    column silently renders blank, so every one of them is asserted in the
 *    tests against a recorded response.
 *
 * Amounts arrive from `sole-ocr` pre-formatted (`"$1,234.56"`) and dates as
 * `DD/MM/YYYY`; both are parsed here so the screen only ever sees numbers and
 * ISO dates, exactly as `lib/bas-report.ts` does for the same reason.
 */

import { format } from "date-fns";

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { AU_FISCAL_YEAR_START, type FiscalYearStart } from "@/lib/fiscal-year";
import {
  periodShape,
  spanLabel,
  type ReportPeriod,
  type ReportRange,
  type Span,
} from "@/lib/report-periods";
import { activeAmountDigits, activeCurrencySymbol } from "@/lib/country-context";

/* ------------------------------------------------------------------ *
 * Column specs
 * ------------------------------------------------------------------ */

/**
 * How a cell is read and drawn.
 *
 * `money` and `number` right-align and get tabular figures, because a column
 * of amounts is only scannable when its decimal points line up.
 */
export type ReportCellFormat = "text" | "money" | "number" | "date" | "badge";

/** What a `badge` cell is tinted with. Mirrors the Badge component's variants. */
export type BadgeTone = "success" | "warning" | "secondary" | "outline";

export type ReportColumnSpec = {
  /** The backend's own key, exactly — `"Account Code"`, not `"account_code"`. */
  key: string;
  /** The heading shown. Defaults to `key` when the backend's wording already reads well. */
  label?: string;
  format?: ReportCellFormat;
  /** Overrides the alignment the format implies. */
  align?: "left" | "right" | "center";
  /** Carries the row's weight — the name column, usually. */
  emphasis?: boolean;
  /** Hidden below `sm`, for the columns a phone has no room for. */
  secondary?: boolean;
  /**
   * The server-side sort key this column offers, where it offers one. A column
   * without it isn't sortable, because only some of them are indexed for it.
   */
  sortKey?: string;
  /** Colours a `badge` cell by its value — a GST treatment, a Yes/No. */
  tone?: (value: string) => BadgeTone;
  /**
   * Repeats of this column's value are blanked, so a run of rows sharing a
   * section reads as one group. Only within a page: the backend paginates, and
   * the first row of page two legitimately restates its section.
   */
  groupRuns?: boolean;
};

export type ReportRow = {
  /** Stable within a page: the backend sends no row id on most of these. */
  id: string;
  cells: Record<string, string | null>;
};

/** One of a report's own headline figures — Cash Flow's inflow/outflow/net. */
export type ReportSummaryFigure = { label: string; amount: number };

export type TabularReport = {
  rows: ReportRow[];
  total: number;
  pageCount: number;
  rangeLabel: string;
  range: { from: string; to: string };
  /** Only where the backend computes one — most reports have none. */
  summary?: ReportSummaryFigure[];
};

/** What a source is handed. `extra` is a report's own server-side controls. */
export type ReportSourceArgs = {
  span: Span;
  page: number;
  pageSize: number;
  extra: Record<string, string>;
};

export type ReportSource = (args: ReportSourceArgs) => Promise<{
  rows: ReportRow[];
  total: number;
  pageCount: number;
  summary?: ReportSummaryFigure[];
}>;

export type TabularReportConfig = {
  /** Stable id — the query key and the atom namespace. */
  id: string;
  title: string;
  /** One sentence under the title. */
  description: string;
  /** The tooltip beside the title: what the rows actually are. */
  tip: string;
  columns: ReportColumnSpec[];
  periods: readonly ReportPeriod[];
  source: ReportSource;
  /** Singular noun for the pagination label — "asset", "entry". */
  itemLabel: string;
  /**
   * `sole-ocr`'s `report_type_id`, where the report has one. Drives download
   * and send; a report without one (Audit Trail) offers neither, rather than
   * posting to an endpoint that would silently return someone else's report.
   */
  reportTypeId?: string;
  /** Whether the period control applies at all — the Audit Trail isn't dated. */
  dated?: boolean;
};

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

/** `"$1,234.56"` → `1234.56`. Numbers pass through; anything else is 0. */
export function parseReportMoney(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * `"31/03/2026"` → `"2026-03-31"`.
 *
 * Also takes the audit log's `"31/03/2026 at 03:45 PM"`, which is the same
 * date with a time stapled on — the date half is all a column needs.
 */
export function parseReportDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return "";
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * The backend writes a missing value as the *string* `"NULL"` on some columns
 * and a real `null` on others; both mean nothing was recorded.
 */
export function isBlankCell(value: string | null | undefined): boolean {
  return value == null || value === "" || value.toUpperCase() === "NULL";
}

/** One cell, drawn the way its column asked for. */
export function formatReportCell(
  value: string | null,
  spec: ReportColumnSpec,
): string {
  if (isBlankCell(value)) return "—";
  switch (spec.format) {
    case "money":
      return reportTableMoney(parseReportMoney(value));
    case "date": {
      const iso = parseReportDate(value);
      return iso ? format(new Date(`${iso}T00:00:00`), "d MMM yyyy") : value!;
    }
    default:
      return value!;
  }
}

/** Money, two decimals, minus outside the symbol — as every other report. */
export function reportTableMoney(value: number): string {
  const formatted = activeAmountDigits(Math.abs(value), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${value < 0 ? "-" : ""}${activeCurrencySymbol()}${formatted}`;
}

/** Where a cell sits, from its format unless the column overrode it. */
export function cellAlignment(spec: ReportColumnSpec): "left" | "right" | "center" {
  if (spec.align) return spec.align;
  return spec.format === "money" || spec.format === "number" ? "right" : "left";
}

/**
 * Whether this cell repeats the row above it in a `groupRuns` column, and so
 * should render nothing at all — not even `formatReportCell`'s own blank.
 *
 * That distinction is the reason this isn't just "blank the value and format
 * it like any other cell": `formatReportCell` draws an em dash for a value
 * that's genuinely missing, and routing a grouped repeat through it would draw
 * that dash on every row after the first — reading as the data having gone
 * missing rather than as "same as the row above".
 */
export function isGroupedRepeat(
  rows: ReportRow[],
  index: number,
  column: ReportColumnSpec,
): boolean {
  if (!column.groupRuns || index === 0) return false;
  return rows[index - 1].cells[column.key] === rows[index].cells[column.key];
}

/* ------------------------------------------------------------------ *
 * The standard `POST /report` source
 * ------------------------------------------------------------------ */

type BackendCell = { key: string; value: string | number | null };

type BackendTabularResponse = {
  success?: boolean;
  message?: string;
  /** The generic branch returns rows as arrays of `{key, value}`. */
  data?: BackendCell[][] | { details?: unknown };
  pagination?: { total?: number; total_pages?: number };
  /** Cash Flow's period totals — `[{Label, Amount}]`, capitalised as the
   *  backend's generic branch spreads it in verbatim (`controllers/reports.js`'s
   *  `...(reportData?.summary ? { summary: reportData.summary } : {})`). */
  summary?: { Label?: string; Amount?: string | number }[];
};

/** `{key, value}[]` → a plain object keyed by the backend's own column names. */
export function rowFromCells(cells: BackendCell[]): Record<string, string | null> {
  const row: Record<string, string | null> = {};
  for (const cell of cells) {
    row[cell.key] = cell.value === null ? null : String(cell.value);
  }
  return row;
}

/**
 * A source for any report served by `POST /report` — the plain multipart
 * endpoint the P&L and Transaction Listing already use, and for the same
 * reason: `handleReports` reads `req.body` behind `upload.none()` with no
 * decrypt step, so the encrypted-body helper would arrive unreadable.
 */
export function reportEndpointSource(reportTypeId: string): ReportSource {
  return async ({ span, page, pageSize, extra }) => {
    const form = new FormData();
    form.append("report_type_id", reportTypeId);
    form.append("action", "view");
    form.append("start_date", format(span.from, "yyyy-MM-dd"));
    form.append("end_date", format(span.to, "yyyy-MM-dd"));
    form.append("page", String(page));
    form.append("page_size", String(pageSize));
    for (const [key, value] of Object.entries(extra)) {
      if (value) form.append(key, value);
    }

    const response = await api.post<BackendTabularResponse>(
      apiRoutes.reporting.reports,
      form,
    );
    const body = response.data;
    if (body.success === false) {
      throw new Error(body.message ?? "Couldn't load the report");
    }

    const raw = Array.isArray(body.data) ? body.data : [];
    const total = body.pagination?.total ?? raw.length;
    return {
      rows: raw.map((cells, index) => ({
        id: `${page}-${index}`,
        cells: rowFromCells(cells),
      })),
      total,
      pageCount: pageCountOf(body.pagination?.total_pages, total, pageSize),
      summary: body.summary
        ?.filter((figure) => figure.Label)
        .map((figure) => ({
          label: figure.Label!,
          amount: parseReportMoney(figure.Amount),
        })),
    };
  };
}

/**
 * How many pages there really are.
 *
 * The backend's own `total_pages` is trusted only when it agrees with the
 * arithmetic. `sole-ocr`'s audit-log service computes it with `Math.floor`
 * (`services/auditLog.js`), so 25 rows at 20 a page reports 1 page and the
 * second page becomes unreachable — deriving it from `total` here means a
 * fix on the server is a no-op rather than a second bug to chase.
 */
export function pageCountOf(
  reported: number | undefined,
  total: number,
  pageSize: number,
): number {
  const derived = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (!reported || reported < derived) return derived;
  return reported;
}

/* ------------------------------------------------------------------ *
 * The Audit Trail source
 * ------------------------------------------------------------------ */

type BackendAuditResponse = {
  success?: boolean;
  message?: string;
  data?: {
    details?: {
      log_id?: number | string;
      performed_at?: string | null;
      performed_by?: string | null;
      module?: string | null;
      action?: string | null;
      description?: string | null;
    }[];
    total?: number;
    total_pages?: number;
  };
};

/** The Audit Trail's column keys, which are its own — not a report's. */
export const AUDIT_COLUMNS = {
  when: "When",
  who: "Performed by",
  module: "Module",
  action: "Action",
  description: "Description",
} as const;

/**
 * The Audit Trail's rows.
 *
 * `POST /v2/settings/audit-logs`, which — unlike every `/report` endpoint — is
 * decrypt-aware (`req.body?.data ? decryptPayload(...)` in
 * `controllers/projectSettings.js`), so this one does go through the app's
 * encrypted-body helper like the rest of the app's non-GET calls.
 *
 * It takes no dates: the log is a stream, and the endpoint offers only
 * `page`/`page_size`. The screen therefore shows no period control rather than
 * one that silently does nothing.
 */
export const auditTrailSource: ReportSource = async ({ page, pageSize }) => {
  const body = buildEncryptedRequestBody({ page, page_size: pageSize });
  const response = await api.post<BackendAuditResponse>(
    apiRoutes.settings.auditLogs,
    body,
  );
  if (response.data.success === false) {
    throw new Error(response.data.message ?? "Couldn't load the audit trail");
  }

  const details = response.data.data?.details ?? [];
  const total = response.data.data?.total ?? details.length;
  return {
    rows: details.map((entry, index) => ({
      id: String(entry.log_id ?? `${page}-${index}`),
      cells: {
        [AUDIT_COLUMNS.when]: entry.performed_at ?? null,
        [AUDIT_COLUMNS.who]: entry.performed_by ?? null,
        [AUDIT_COLUMNS.module]: entry.module ?? null,
        [AUDIT_COLUMNS.action]: entry.action ?? null,
        [AUDIT_COLUMNS.description]: entry.description ?? null,
      },
    })),
    total,
    pageCount: pageCountOf(response.data.data?.total_pages, total, pageSize),
  };
};

/* ------------------------------------------------------------------ *
 * Fetching
 * ------------------------------------------------------------------ */

export async function fetchTabularReport(
  config: TabularReportConfig,
  period: ReportPeriod,
  range: ReportRange | null,
  page: number,
  pageSize: number,
  extra: Record<string, string> = {},
  fiscalYearStart: FiscalYearStart = AU_FISCAL_YEAR_START,
): Promise<TabularReport> {
  const shape = periodShape(period, range, undefined, fiscalYearStart);
  const result = await config.source({
    span: shape.current,
    page,
    pageSize,
    extra,
  });

  return {
    ...result,
    rangeLabel: spanLabel(shape.current),
    range: {
      from: format(shape.current.from, "yyyy-MM-dd"),
      to: format(shape.current.to, "yyyy-MM-dd"),
    },
  };
}

/**
 * Downloads a report the `/report` endpoint serves. PDF, CSV and xlsx all come
 * off the same workbook server-side; `sole-webapp` only ever asked for xlsx.
 */
export async function downloadTabularReport(
  reportTypeId: string,
  range: { from: string; to: string },
  fileFormat: "pdf" | "csv" | "xlsx",
  title: string,
  extra: Record<string, string> = {},
): Promise<void> {
  const form = new FormData();
  form.append("report_type_id", reportTypeId);
  form.append("action", "download");
  form.append("start_date", range.from);
  form.append("end_date", range.to);
  // Anything unrecognised is xlsx server-side, so xlsx is simply unsent.
  if (fileFormat !== "xlsx") form.append("format", fileFormat);
  for (const [key, value] of Object.entries(extra)) {
    if (value) form.append(key, value);
  }

  const response = await api.post(apiRoutes.reporting.reports, form, {
    responseType: "blob",
  });

  const disposition: string | undefined = response.headers["content-disposition"];
  const filename =
    disposition?.match(/filename="?([^"]+)"?/)?.[1] ?? `${title}.${fileFormat}`;

  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);

  /*
   * One place, covering all six report screens that download — they each call
   * this, so instrumenting the screens instead would have been six edits and
   * six chances to miss the seventh.
   *
   * `report` is the human title rather than the numeric type id, so a chart
   * reads "Balance Sheet" instead of "14" and nobody has to keep a lookup
   * table alongside the dashboard.
   */
  track(EVENTS.REPORT_EXPORTED, { report: title, format: fileFormat });
}
