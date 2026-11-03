/**
 * The BAS review — "is this safe to lodge?"
 *
 * `POST /v2/bas-review` reads the same rows and quarter totals as the BAS
 * report, runs arithmetic checks (duplicates, GST that isn't the standard rate,
 * GST with no BAS label, entries booked after their quarter closed…) and asks
 * Claude for the judgement calls arithmetic can't make (a bank fee carrying
 * GST, a laptop coded as office supplies). Plain multipart `FormData`, like the
 * report itself.
 *
 * It only reports. Nothing here changes the ledger — each finding names the
 * transactions involved, what to check and (for expenses) the change it
 * suggests; the user makes it where the transaction lives.
 *
 * Money is already numbers and dates already ISO on the wire, so this file is a
 * thin typed boundary plus the wording for the backend's action codes.
 */

import api from "@/utils/axiosInstance";
import {
  AU_FISCAL_YEAR_START,
  fiscalYearOfIso,
  type FiscalYearStart,
} from "@/lib/fiscal-year";
import { financialYearLabel } from "@/lib/transactions";
import apiRoutes from "@/config/api-routes";

export type FindingSeverity = "high" | "medium" | "low";

/** What the backend suggests doing about a finding. */
export type FindingAction =
  | "check_gst"
  | "recategorise"
  | "check_duplicate"
  | "add_details"
  | "check_date"
  | "check_lodged"
  | "review";

/**
 * A change a finding suggests for one expense, in words ("Don't claim the
 * GST", "Move to Computers"). Advice only — the user makes the change on the
 * transaction itself; the review never edits the books.
 */
export type ReviewSuggestion = {
  rowId: string;
  kind: "gst_off" | "gst_on" | "category";
  label: string;
  current: string;
  proposed: string;
};

/** The record a row came from; null when it has no page of its own (bank-feed entries, manual uploads). */
export type ReviewSource = {
  kind:
    | "expense"
    | "invoice"
    | "asset"
    | "client_refund"
    | "vendor_refund"
    | "bank_transaction";
  id: number;
  /** Bank transactions: the text that finds it on the Transactions page. */
  search?: string;
};

export type ReviewRow = {
  id: string;
  /** Tied to exactly one expense. */
  linked: boolean;
  source: ReviewSource | null;
  type: string;
  /** ISO `YYYY-MM-DD`, or "" when the backend had none. */
  date: string;
  name: string;
  party: string;
  /** "G1", "G10", "G11" or "Other". */
  code: string;
  category: string;
  exGst: number;
  gst: number;
  incGst: number;
};

export type ReviewFinding = {
  id: string;
  /** `rule` = arithmetic, `ai` = Claude's judgement. */
  source: "rule" | "ai";
  severity: FindingSeverity;
  title: string;
  detail: string;
  action: FindingAction;
  /** GST at stake, when the check can say. */
  impactAmount: number | null;
  /** The change suggested for each linked expense. Empty when there is nothing specific to suggest. */
  suggestions: ReviewSuggestion[];
  /** Every transaction involved; `rows` is the first few of them. */
  rowCount: number;
  rows: ReviewRow[];
};

export type BasReview = {
  period: { from: string; to: string };
  generatedAt: string;
  summary: string;
  counts: Record<FindingSeverity, number>;
  findings: ReviewFinding[];
  coverage: { reviewed: number; total: number; truncated: boolean };
  /** `used: false` with a `note` means the AI step was down and only the automatic checks ran. */
  ai: { used: boolean; model: string | null; note: string | null };
  /** How many expense rows could be tied to one expense (for exact Edit links and suggestions). */
  linking: {
    expenseRows: number;
    linked: number;
    expensesLoaded: number;
    lookupFailed: boolean;
    /** False when the backend couldn't link rows to their records (Edit then opens a search). */
    sourceIds: boolean;
  };
};

type BackendReviewResponse = {
  success?: boolean;
  message?: string;
  data?: BasReview;
};

export async function fetchBasReview(range: {
  from: string;
  to: string;
}): Promise<BasReview> {
  const form = new FormData();
  form.append("start_date", range.from);
  form.append("end_date", range.to);

  const response = await api.post<BackendReviewResponse>(
    apiRoutes.reporting.basReview,
    form,
  );
  const body = response.data;
  if (body.success === false || !body.data) {
    throw new Error(body.message ?? "Couldn't review the BAS");
  }
  return body.data;
}

export const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  high: "Fix before lodging",
  medium: "Worth fixing",
  low: "Take a look",
};

/** The word on a finding's call to action. */
export const ACTION_LABEL: Record<FindingAction, string> = {
  check_gst: "Check the GST",
  recategorise: "Re-categorise",
  check_duplicate: "Check for a duplicate",
  add_details: "Add the details",
  check_date: "Check the date",
  check_lodged: "Check if already lodged",
  review: "Review",
};

const SEVERITY_ORDER: FindingSeverity[] = ["high", "medium", "low"];

/** Findings grouped high → low, empty groups left out. */
export function groupFindings(
  findings: ReviewFinding[],
): { severity: FindingSeverity; findings: ReviewFinding[] }[] {
  return SEVERITY_ORDER.map((severity) => ({
    severity,
    findings: findings.filter((finding) => finding.severity === severity),
  })).filter((group) => group.findings.length > 0);
}

/** "Fix 2 before lodging" / "Nothing needs fixing" — the headline a review opens with. */
export function reviewHeadline(counts: BasReview["counts"]): string {
  if (counts.high > 0) {
    return `${counts.high} ${counts.high === 1 ? "thing needs" : "things need"} fixing before you lodge`;
  }
  if (counts.medium > 0) {
    return `${counts.medium} ${counts.medium === 1 ? "thing is" : "things are"} worth fixing`;
  }
  if (counts.low > 0) {
    return `${counts.low} ${counts.low === 1 ? "thing is" : "things are"} worth a look`;
  }
  return "Nothing needs attention";
}

/* ------------------------------------------------------------------ *
 * Decisions, readiness, applying, saving
 * ------------------------------------------------------------------ */

/** What the user has done with a finding. `accepted` = changed it / marked done; `rejected` = ignored. */
export type Decision = "pending" | "accepted" | "rejected";
export type Decisions = Record<string, Decision>;

/** Percent of findings dealt with, either way. A review with none is fully ready. */
export function readiness(findings: ReviewFinding[], decisions: Decisions): number {
  if (findings.length === 0) return 100;
  const handled = findings.filter((f) => {
    const decision = decisions[f.id];
    return decision === "accepted" || decision === "rejected";
  }).length;
  return Math.round((handled / findings.length) * 100);
}

export type SavedReportSummary = {
  id: number;
  periodFrom: string;
  periodTo: string;
  readiness: number;
  summary: string;
  createdAt: string;
};

export type SavedReport = SavedReportSummary & {
  payload: { review: BasReview; decisions: Decisions };
};

export async function saveBasReviewReport(
  review: BasReview,
  decisions: Decisions,
): Promise<{ id: number; readiness: number }> {
  const response = await api.post<{
    success?: boolean;
    message?: string;
    data?: { id: number; readiness: number };
  }>(apiRoutes.reporting.basReviewReports, {
    period_from: review.period.from,
    period_to: review.period.to,
    review,
    decisions,
  });
  const body = response.data;
  if (body.success === false || !body.data) {
    throw new Error(body.message ?? "Couldn't save the report");
  }
  return body.data;
}

export async function fetchSavedReports(): Promise<SavedReportSummary[]> {
  const response = await api.get<{ success?: boolean; data?: SavedReportSummary[] }>(
    apiRoutes.reporting.basReviewReports,
  );
  return response.data.data ?? [];
}

export async function fetchSavedReport(id: number): Promise<SavedReport> {
  const response = await api.get<{
    success?: boolean;
    message?: string;
    data?: SavedReport;
  }>(`${apiRoutes.reporting.basReviewReports}/${id}`);
  if (response.data.success === false || !response.data.data) {
    throw new Error(response.data.message ?? "Couldn't open the report");
  }
  return response.data.data;
}

/**
 * Where to fix a row. A record with a page of its own opens that page. When the
 * row has no record id (bank-feed entries, manual uploads, or a server that
 * hasn't been updated yet) the link lands on the right list *already searched
 * for the transaction*, rather than on a module the user has to dig through.
 * Vendor refunds have a list but no page per refund.
 */
export function sourceHref(
  source: ReviewSource | null,
  row?: Pick<ReviewRow, "type" | "name"> & Partial<Pick<ReviewRow, "date" | "incGst">>,
  /** The business's financial year, so the link names the year the list will show. 1 July if absent. */
  fiscalYearStart: FiscalYearStart = AU_FISCAL_YEAR_START,
): { href: string; label: string } {
  switch (source?.kind) {
    case "expense":
      return { href: `/expenses/${source.id}`, label: "Open expense" };
    case "invoice":
      return { href: `/invoices/${source.id}`, label: "Open invoice" };
    case "asset":
      // Not straight to the form: a matched asset can't be edited, so the list
      // checks, and has the match undone first if there is one.
      return { href: `/assets?edit=${source.id}`, label: "Open asset" };
    case "client_refund":
      return { href: `/sales/client-refunds/${source.id}`, label: "Open refund" };
    case "vendor_refund":
      return { href: "/expenses/vendor-refunds", label: "Open refunds" };
    case "bank_transaction": {
      // The bank's own text finds it; the ledger's wording for the row ("matched
      // from transaction #123") matches nothing on the Transactions page. These
      // rows are in the BAS because they're reconciled, so open the Matched tab
      // (the list starts on Review, where they never appear), in the financial
      // year the transaction falls in (the list starts on the current one).
      const term = (source.search || row?.name || "").trim();
      const params = new URLSearchParams({ status: "Matched" });
      // The search is for this one transaction. A matched transaction can't be
      // edited, so the page opens its Undo dialog: undo it, then edit it.
      if (source.search) {
        params.set("undo", "1");
        // A search by id is unique; one by the bank's description often isn't
        // ("huhu" also finds "huhu ha"), so the amount picks the right one.
        if (row?.incGst !== undefined) params.set("amount", Math.abs(row.incGst).toFixed(2));
      }
      if (term) params.set("search", term);
      const fy = row && "date" in row ? financialYearOfDate(row.date, fiscalYearStart) : null;
      if (fy) params.set("period", fy);
      return {
        href: `/transactions?${params.toString()}`,
        label: "Open in Transactions",
      };
    }
  }

  const term = row?.name?.trim();
  const search = term ? `?search=${encodeURIComponent(term)}` : "";
  return row?.type === "Expense"
    ? { href: `/expenses${search}`, label: "Find expense" }
    : { href: `/transactions${search}`, label: "Find in Transactions" };
}

/** The financial year an ISO date falls in (July to June by default), labelled as the Transactions list does. */
function financialYearOfDate(date: string | undefined, start: FiscalYearStart): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return financialYearLabel(fiscalYearOfIso(date, start) + 1);
}
