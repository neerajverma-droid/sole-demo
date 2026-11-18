/**
 * The Transactions screen's two lists — sole-webapp's `BankTransactions.js`:
 *
 * - Unmatched: `GET /v2/bank/bank-transactions` (bank lines nobody has
 *   reconciled yet).
 * - Matched: `GET /v2/bank/sole-saved-transactions` (lines reconciled against
 *   one or more accounts, including the ones marked personal or transfer).
 *
 * Both are paged and filtered server-side by financial year and search, and
 * the pill totals come from `/transaction/balance-unmatched-saved`. Rows are
 * mapped into the screen's existing `Transaction` shape so the table and its
 * dialogs read them unchanged.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import {
  AU_FISCAL_YEAR_START,
  fiscalYearOf,
  fiscalYearRange,
  type FiscalYearStart,
} from "@/lib/fiscal-year";
import type { TransactionFilterParams } from "@/lib/transaction-filters";
import { matchSingleTransaction, type BankMatchType } from "@/lib/bank-match";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import {
  TRANSACTION_FILTERS,
  financialYearLabel,
  pendingSuggestions,
  type AiSuggestions,
  type SuggestedClient,
  type SuggestedDocument,
  type SuggestedDocumentType,
  type Transaction,
  type TransactionFilter,
  type TransactionSource,
  type TransactionSplit,
} from "@/lib/transactions";

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

/** sole-webapp's personal and transfer accounts (`config.js`). */
const PERSONAL_ACCOUNT_ID = "133";
const TRANSFER_ACCOUNT_ID = "139";

/* ------------------------------------------------------------------ *
 * Financial years
 * ------------------------------------------------------------------ */

/** The first financial year sole-webapp's picker offers: FY 21/22. */
const FIRST_FY_END = 2022;

/**
 * The financial year (by its end year) a date falls in — July to June, or the
 * business's own year when `start` is passed (April to March in New Zealand).
 */
export function financialYearEnd(
  date: Date,
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): number {
  return fiscalYearOf(date, start) + 1;
}

/** Newest first, from this year back to FY 21/22 — as sole-webapp's `getFYList`. */
export function financialYearChoices(
  today: Date = new Date(),
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): string[] {
  const choices: string[] = [];
  for (let fy = financialYearEnd(today, start); fy >= FIRST_FY_END; fy -= 1) {
    choices.push(financialYearLabel(fy));
  }
  return choices;
}

export function currentFinancialYearLabel(
  today: Date = new Date(),
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): string {
  return financialYearLabel(financialYearEnd(today, start));
}

/**
 * "FY 25/26" → 2025-07-01 to 2026-06-30 (2025-04-01 to 2026-03-31 on a New
 * Zealand year); null for anything else.
 */
export function financialYearRange(
  label: string,
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): { start: string; end: string } | null {
  const match = label.match(/(\d{2})\/(\d{2})$/);
  if (!match) return null;
  return fiscalYearRange(2000 + Number(match[1]), start);
}

/* ------------------------------------------------------------------ *
 * Tabs and query
 * ------------------------------------------------------------------ */

export type TransactionsTab = "unmatched" | "matched";

/** Personal and Transfer are views of the matched list, as in sole-webapp. */
export function tabForFilter(filter: TransactionFilter): TransactionsTab {
  return filter === "Review" ? "unmatched" : "matched";
}

/** The tab a `?status=` deep link names, whatever its case — or null. */
export function filterFromStatusParam(
  status: string | null | undefined,
): TransactionFilter | null {
  if (!status) return null;
  return (
    TRANSACTION_FILTERS.find(
      (option) => option.toLowerCase() === status.toLowerCase(),
    ) ?? null
  );
}

/**
 * The Transactions URL with `filter` as its tab. Unmatched is the default, so
 * it drops `status` rather than writing it; every other param (a search or
 * undo deep link) is kept as it was.
 */
export function transactionsTabHref(
  pathname: string,
  search: string,
  filter: TransactionFilter,
): string {
  const params = new URLSearchParams(search);
  if (filter === "Review") params.delete("status");
  else params.set("status", filter.toLowerCase());
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Skeleton or fade for the list's own fetch.
 *
 * The first load, and the refetch after an undo, delete, match or approve —
 * rows on screen are stale then, so they're replaced by a skeleton. A page or
 * page-size change keeps the previous page on screen (`placeholderData`) and
 * only fades it. Focus refetching is off app-wide, so nothing else refetches
 * the same list.
 */
export function listLoadState(query: {
  isPending: boolean;
  isFetching: boolean;
  isPlaceholderData: boolean;
}): { loading: boolean; fetching: boolean } {
  return {
    loading: query.isPending || (query.isFetching && !query.isPlaceholderData),
    fetching: query.isFetching && query.isPlaceholderData,
  };
}

export type TransactionListParams = {
  tab: TransactionsTab;
  /** 1-based. */
  page: number;
  pageSize: number;
  /** A financial-year label, e.g. "FY 25/26". */
  period: string;
  /** When the business's financial year starts — what `period` means. 1 July if absent. */
  fiscalYearStart?: FiscalYearStart;
  search: string;
  /** Matched list only. */
  personal?: boolean;
  transfer?: boolean;
  /** The Filters popover's choices, already resolved for this tab. */
  filters?: TransactionFilterParams;
};

export function listQueryParams(
  params: TransactionListParams,
): Record<string, string | number | string[]> {
  const query: Record<string, string | number | string[]> = {
    page: params.page,
    page_size: params.pageSize,
  };
  const filters = params.filters ?? {};
  // A custom date in the filters replaces the financial year, as in
  // sole-webapp — the year only applies when no date was chosen.
  const customDates = !!(filters.startDate || filters.endDate);
  const range = customDates
    ? null
    : financialYearRange(params.period, params.fiscalYearStart);
  if (range) {
    query["filter_by[start_date]"] = range.start;
    query["filter_by[end_date]"] = range.end;
  }
  if (filters.startDate) query["filter_by[start_date]"] = filters.startDate;
  if (filters.endDate) query["filter_by[end_date]"] = filters.endDate;
  if (filters.type) query["filter_by[type]"] = filters.type;
  if (filters.minPrice !== undefined) query["filter_by[min_price]"] = filters.minPrice;
  if (filters.maxPrice !== undefined) query["filter_by[max_price]"] = filters.maxPrice;
  // Arrays go out as repeated `filter_by[...][]=` keys.
  if (params.tab === "unmatched" && filters.bankAccountIds?.length) {
    query["filter_by[bank_account_id]"] = filters.bankAccountIds;
  }
  if (params.tab === "matched") {
    if (filters.categoryIds?.length) {
      query["filter_by[account_subcategory_id]"] = filters.categoryIds;
    }
    if (filters.cash) query["filter_by[cash]"] = 1;
  }
  const search = params.search.trim();
  if (search) query["filter_by[search]"] = search;
  if (params.tab === "matched") {
    if (params.personal) query["filter_by[personal]"] = 1;
    if (params.transfer) query["filter_by[transfer]"] = 1;
  }
  return query;
}

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoDay(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 10) : "";
}

const SOURCE_LABELS: Record<string, TransactionSource> = {
  bank_feed: "Bank Feed",
  paid_with_cash: "Cash Payment",
  manual_upload: "Manual",
};

export function sourceLabel(source: unknown): TransactionSource {
  return (typeof source === "string" && SOURCE_LABELS[source]) || "Unknown";
}

function typeOf(direction: unknown): Transaction["type"] {
  return String(direction).toLowerCase() === "credit" ? "Credit" : "Debit";
}

/** The model's confidence, as a whole percent whichever scale it came in. */
export function confidencePercent(value: unknown): number {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.round(raw <= 1 ? raw * 100 : Math.min(raw, 100));
}

type ApiPrediction = {
  /** What the model settled on: a document of the user's own, else a category. */
  type?: string | null;
  document?: {
    type?: string | null;
    id?: number | string | null;
    reference?: string | null;
    name?: string | null;
    amount?: number | string | null;
    client_name?: string | null;
  } | null;
  client?: { client_id?: number | string | null; name?: string | null } | null;
  account_subcategory_id?: number | string | null;
  name?: string | null;
  confidence?: number | string | null;
  reason?: string | null;
  alternatives?: {
    account_subcategory_id?: number | string | null;
    name?: string | null;
    confidence?: number | string | null;
  }[];
};

const DOCUMENT_TYPES: readonly SuggestedDocumentType[] = ["invoice", "expense", "asset"];

/** The invoice, expense or asset the model paired the line with, if it did. */
export function suggestedDocumentFrom(
  prediction: ApiPrediction | null | undefined,
): SuggestedDocument | null {
  const document = prediction?.document;
  const type = String(document?.type ?? "").toLowerCase() as SuggestedDocumentType;
  if (!document || !DOCUMENT_TYPES.includes(type) || document.id == null) return null;
  return {
    type,
    id: String(document.id),
    reference: document.reference?.trim() || document.name?.trim() || `#${document.id}`,
    clientName: document.client_name?.trim() ?? "",
    amount: num(document.amount),
    confidence: optionalPercent(prediction?.confidence),
    reason: prediction?.reason?.trim() || null,
  };
}

/** The client / supplier the model knew for the line, if it knew one. */
export function suggestedClientFrom(
  prediction: ApiPrediction | null | undefined,
): SuggestedClient | null {
  const client = prediction?.client;
  if (client?.client_id == null || !client.name?.trim()) return null;
  return { id: String(client.client_id), name: client.name.trim() };
}

/** "INV-0021 · Turner Consulting" — the form `suggestedMatch` has always taken. */
function suggestedMatchLabel(document: SuggestedDocument | null): string {
  if (!document) return "";
  return document.clientName
    ? `${document.reference} · ${document.clientName}`
    : document.reference;
}

/** A confidence as a whole percent; null only where the model gave none. */
export function optionalPercent(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw < 0) return null;
  return confidencePercent(raw);
}

/** The model's top pick, its alternatives (deduped) and its reason. */
export function aiSuggestionsFrom(
  prediction: ApiPrediction | null | undefined,
): AiSuggestions | null {
  if (!prediction?.name || prediction.account_subcategory_id == null) return null;
  const primaryId = String(prediction.account_subcategory_id);
  const seen = new Set([primaryId]);
  const alternatives = (prediction.alternatives ?? []).flatMap((alt) => {
    if (alt.account_subcategory_id == null || !alt.name) return [];
    const id = String(alt.account_subcategory_id);
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ id, name: alt.name, confidence: optionalPercent(alt.confidence) }];
  });
  const reason = prediction.reason?.replace(/^\s*matched on:\s*/i, "").trim();
  return {
    primary: {
      id: primaryId,
      name: prediction.name,
      confidence: optionalPercent(prediction.confidence),
    },
    alternatives,
    reason: reason || null,
  };
}

type ApiUnmatchedRow = {
  bank_transacton_id?: number | string;
  bank_account_id?: number | string | null;
  transaction_id?: number | string;
  bank_name?: string | null;
  source?: string | null;
  amount?: number | string | null;
  description?: string | null;
  user_description?: string | null;
  direction?: string | null;
  type?: string | null;
  transaction_date?: string | null;
  available_amount?: number | string | null;
  gst_exclude?: number | string | null;
  classification_prediction?: ApiPrediction | null;
};

/**
 * One unmatched bank line. Note the id field's spelling —
 * `bank_transacton_id` — which is the backend's own.
 */
export function mapUnmatchedRow(row: ApiUnmatchedRow): Transaction {
  const id = String(row.bank_transacton_id ?? row.transaction_id ?? "");
  const amount = Math.abs(num(row.amount));
  const available = row.available_amount == null ? amount : num(row.available_amount);
  const type = typeOf(row.direction ?? row.type);
  const source = sourceLabel(row.source);
  const prediction = row.classification_prediction;
  const suggestedDocument = suggestedDocumentFrom(prediction);

  return {
    id,
    reference: id,
    date: isoDay(row.transaction_date),
    description: row.description?.trim() || row.user_description?.trim() || "",
    category: "",
    type,
    amount,
    status: "Review",
    account:
      source === "Bank Feed"
        ? row.bank_name?.trim() || "—"
        : source === "Cash Payment"
          ? "Cash"
          : source === "Manual"
            ? "Manual Upload"
            : "—",
    source,
    bankAccountId:
      row.bank_account_id != null && row.bank_account_id !== ""
        ? String(row.bank_account_id)
        : null,
    // On money in as well as out: sole-webapp only reviewed debits, this
    // app reviews every unmatched line.
    suggestedCategory:
      prediction?.name
        ? {
            category: prediction.name,
            confidence: confidencePercent(prediction.confidence),
          }
        : null,
    suggestedCategoryId:
      prediction?.account_subcategory_id != null
        ? String(prediction.account_subcategory_id)
        : null,
    aiSuggestions: aiSuggestionsFrom(prediction),
    suggestedDocument,
    suggestedClient: suggestedClientFrom(prediction),
    supplier: "",
    // `gst_exclude` 0 means GST is included — the backend's inverted naming.
    gst: row.gst_exclude != null && Number(row.gst_exclude) === 0,
    suggestedMatch: suggestedMatchLabel(suggestedDocument),
    splits: [],
    personal: false,
    transfer: null,
    matchedTotal: Math.max(0, amount - Math.abs(available)),
    // sole-webapp offers Delete only on lines that didn't come from the bank
    // feed — manual uploads and cash payments.
    deletable: row.source !== "bank_feed",
  };
}

type ApiMatchedLine = {
  entry_id?: number | string | null;
  item_code?: string | null;
  amount?: number | string | null;
  account_subcategory_id?: number | string | null;
  name?: string | null;
  reference_type?: string | null;
  client_name?: string | null;
};

type ApiMatchedRow = {
  id: number | string;
  transaction_date?: string | null;
  amount?: number | string | null;
  direction?: string | null;
  description?: string | null;
  user_description?: string | null;
  source?: string | null;
  data?: ApiMatchedLine[] | null;
};

function isAccount(line: ApiMatchedLine, id: string, name: string): boolean {
  return (
    String(line.account_subcategory_id ?? "") === id ||
    (line.name ?? "").trim().toLowerCase() === name
  );
}

/** One reconciled line, with the accounts it landed in as its splits. */
export function mapMatchedRow(row: ApiMatchedRow): Transaction {
  const id = String(row.id);
  const date = isoDay(row.transaction_date);
  const lines = row.data ?? [];
  const personal = lines.some((line) =>
    isAccount(line, PERSONAL_ACCOUNT_ID, "personal"),
  );
  const transfer = lines.some((line) =>
    isAccount(line, TRANSFER_ACCOUNT_ID, "transfer"),
  );
  // The category shown is the first line that isn't a tax posting, as in
  // sole-webapp's category chip — "GST Payable" or, in South Africa, "VAT Payable".
  const primary =
    lines.find((line) => !/\b(gst|vat)\b/i.test(line.name ?? "")) ??
    lines[0];

  const splits: TransactionSplit[] =
    lines.length > 1
      ? lines.map((line, index) => ({
          id: String(line.entry_id ?? `${id}-${index}`),
          date,
          category: line.name ?? "",
          reference: line.item_code ?? "",
          referenceType: line.reference_type ?? "",
          clientName: line.client_name ?? "",
          amount: Math.abs(num(line.amount)),
        }))
      : [];

  return {
    id,
    reference: id,
    date,
    description: row.description?.trim() || row.user_description?.trim() || "",
    category: primary?.name ?? "",
    type: typeOf(row.direction),
    amount: Math.abs(num(row.amount)),
    status: "Matched",
    account: "—",
    source: sourceLabel(row.source),
    suggestedCategory: null,
    suggestedCategoryId: null,
    aiSuggestions: null,
    entryId:
      lines.length === 1 && lines[0].entry_id != null
        ? String(lines[0].entry_id)
        : null,
    // sole-webapp shows the first line's item code, or "--" once it's split.
    matchReference: lines.length > 1 ? "" : (lines[0]?.item_code ?? ""),
    supplier: primary?.client_name ?? "",
    gst: false,
    suggestedMatch: "",
    splits,
    personal,
    transfer: transfer ? { counterAccount: "", pairedId: null } : null,
    matchedTotal: lines.reduce((sum, line) => sum + Math.abs(num(line.amount)), 0),
    deletable: false,
  };
}

/* ------------------------------------------------------------------ *
 * Fetching
 * ------------------------------------------------------------------ */

export type TransactionsPage = {
  rows: Transaction[];
  total: number;
};

export async function fetchTransactionsPage(
  params: TransactionListParams,
): Promise<TransactionsPage> {
  const query = listQueryParams(params);

  if (params.tab === "unmatched") {
    const response = await api.get<
      ApiEnvelope<{
        bank_transactions?: {
          bank_transaction_details?: ApiUnmatchedRow[];
          total?: number | string;
        };
      }>
    >(apiRoutes.bankTransaction.bankTransactions, { params: query });

    const body = response.data;
    if (body?.success === false) {
      throw new Error(body.message || "Couldn't load unmatched transactions.");
    }
    const list = body?.data?.bank_transactions;
    return {
      rows: (list?.bank_transaction_details ?? []).map(mapUnmatchedRow),
      total: num(list?.total),
    };
  }

  // The saved list replies without the usual `data` wrapper.
  const response = await api.get<{
    success?: boolean;
    message?: string;
    sole_transaction_details?: ApiMatchedRow[];
    total?: number | string;
  }>(apiRoutes.bankTransaction.soleTransactions, { params: query });

  const body = response.data;
  if (body?.success === false) {
    throw new Error(body.message || "Couldn't load matched transactions.");
  }
  return {
    rows: (body?.sole_transaction_details ?? []).map(mapMatchedRow),
    total: num(body?.total),
  };
}

export type TransactionBalances = { unmatched: number; matched: number };

/** The money in each pile for the year — the figures on the two pills. */
export async function fetchTransactionBalances(
  period: string,
  fiscalYearStart: FiscalYearStart = AU_FISCAL_YEAR_START,
): Promise<TransactionBalances> {
  const range = financialYearRange(period, fiscalYearStart);
  const response = await api.get<
    ApiEnvelope<{
      balances?: {
        total_unmatched?: number | string;
        total_saved?: number | string;
      };
    }>
  >(apiRoutes.bankTransaction.fetchMatchingBalance, {
    params: range
      ? {
          "filter_by[start_date]": range.start,
          "filter_by[end_date]": range.end,
        }
      : undefined,
  });

  const balances = response.data?.data?.balances;
  return {
    unmatched: num(balances?.total_unmatched),
    matched: num(balances?.total_saved),
  };
}

/* ------------------------------------------------------------------ *
 * Row actions — each POST is encrypted, as sole-webapp's `useService.post`
 * ------------------------------------------------------------------ */

/**
 * What the server says when the line it was asked to record looks like one
 * that's already in the books. sole-ocr answers that with `success: true` and
 * `data.direction: "duplicate"` — nothing was created or matched — so it is
 * thrown rather than returned, or the caller would toast a success for a
 * record that doesn't exist. sole-webapp read it the same way
 * (`MatchTransaction.js`, `result.data.direction === "duplicate"`).
 */
export class DuplicateTransactionError extends Error {
  readonly duplicate = true;

  constructor(message?: string) {
    super(
      message ||
        "This looks like a duplicate of something already recorded — nothing was created.",
    );
    this.name = "DuplicateTransactionError";
  }
}

/** Whether a successful reply is really the server declining a duplicate. */
export function isDuplicateReply(data: unknown): boolean {
  return (
    !!data &&
    typeof data === "object" &&
    (data as { direction?: unknown }).direction === "duplicate"
  );
}

async function postAction(
  url: string,
  fields: Record<string, unknown>,
  fallback: string,
): Promise<string> {
  const response = await api.post<ApiEnvelope<unknown>>(
    url,
    buildEncryptedRequestBody(fields),
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || fallback);
  }
  if (isDuplicateReply(response.data.data)) {
    throw new DuplicateTransactionError(response.data.message);
  }
  return response.data.message || "";
}

export type MarkKind = "personal" | "transfer";

/** Unmatched → marked personal or transfer (it moves to the matched list). */
export function markTransactionApi(id: string, kind: MarkKind) {
  return postAction(
    apiRoutes.bankTransaction.markTransaction,
    { bank_transaction_id: id, type: kind },
    `Couldn't mark the transaction as ${kind}.`,
  );
}

/** Undoes a personal or transfer mark — back to the unmatched list. */
export function undoMarkTransactionApi(id: string, kind: MarkKind) {
  return postAction(
    apiRoutes.bankTransaction.undoMarkTransaction,
    { bank_transaction_id: id, type: kind },
    "Couldn't undo the transaction.",
  );
}

/**
 * Unmatches a whole transaction, however many lines it was matched across —
 * sole-webapp's bulk undo, for one id.
 */
export function unmatchTransactionApi(id: string) {
  return unmatchTransactionsApi([id]);
}

/** sole-webapp's "Bulk Undo Match": every selected transaction, in one call. */
export function unmatchTransactionsApi(ids: string[]) {
  return postAction(
    apiRoutes.bankTransaction.bulkUndoMatchTransaction,
    { transaction_ids: ids },
    "Couldn't undo the match.",
  );
}

/** Undoes one matched line — sole-webapp's per-line Undo, by journal entry. */
export function undoMatchEntryApi(entryId: string) {
  return postAction(
    apiRoutes.bankTransaction.undoMatchTransaction,
    { journal_entry_id: entryId },
    "Couldn't undo the match.",
  );
}

/** Deletes an unmatched transaction that didn't come from the bank feed. */
export function deleteUnmatchedTransactionApi(id: string) {
  return postAction(
    apiRoutes.bankTransaction.deleteUnmatchedTransaction,
    { transaction_id: id },
    "Couldn't delete the transaction.",
  );
}

export type BulkDeleteSelection = {
  /** Rows the user owns — manual uploads and cash payments. */
  deletableIds: string[];
  /** Rows that came from the bank feed, which can't be deleted here. */
  bankFeedIds: string[];
};

/**
 * sole-webapp's bulk delete split: bank feed rows belong to the feed, so they
 * are set aside and only the rest is sent.
 */
export function bulkDeleteSelection(
  rows: Pick<Transaction, "id" | "deletable">[],
): BulkDeleteSelection {
  const deletableIds: string[] = [];
  const bankFeedIds: string[] = [];
  for (const row of rows) {
    if (row.deletable === false) bankFeedIds.push(row.id);
    else deletableIds.push(row.id);
  }
  return { deletableIds, bankFeedIds };
}

/** What stops a bulk delete, in sole-webapp's order and words — or null. */
export function bulkDeleteIssue(selection: BulkDeleteSelection): string | null {
  const { deletableIds, bankFeedIds } = selection;
  if (!deletableIds.length && !bankFeedIds.length) {
    return "Please select any bank transaction first then you can perform bulk action.";
  }
  if (!deletableIds.length) {
    return "Bank feed transactions can't be deleted. Please deselect them and try again.";
  }
  return null;
}

/** sole-webapp's confirmation, naming any bank feed rows left behind. */
export function bulkDeleteMessage(selection: BulkDeleteSelection): string {
  const { deletableIds, bankFeedIds } = selection;
  return bankFeedIds.length
    ? `${bankFeedIds.length} of the ${deletableIds.length + bankFeedIds.length} selected transaction(s) come from a bank feed and can't be deleted. Do you want to delete the remaining ${deletableIds.length} transaction(s)? This action cannot be undone.`
    : `Do you want to delete the selected ${deletableIds.length} transaction(s)? This action cannot be undone.`;
}

/** sole-webapp's bulk delete: every selected non-bank-feed row, in one call. */
export function deleteUnmatchedTransactionsApi(ids: string[]) {
  if (!ids.length) {
    return Promise.reject(
      new Error("Please select any bank transaction first then you can perform bulk action."),
    );
  }
  return postAction(
    apiRoutes.bankTransaction.bulkDeleteUnmatchedTransaction,
    { transaction_ids: ids },
    "Couldn't delete the transactions.",
  );
}

/* ------------------------------------------------------------------ *
 * Approve — an unmatched row's inline coding, committed
 * ------------------------------------------------------------------ */

export type ApprovalInput = {
  transactionId: string;
  /** account_subcategory_id */
  categoryId: string;
  /** The company's client_id. */
  clientId: string;
  gstIncluded: boolean;
  /**
   * The invoice, expense or asset the model paired the line with, when that is
   * what's being approved. The document already carries its own category and
   * client, so neither is asked for.
   */
  document?: { type: SuggestedDocumentType; id: string } | null;
};

/**
 * What still stops a row being approved — sole-webapp's two checks, in its
 * order and words — or null when it's ready.
 */
export function approvalIssue(
  input: Pick<ApprovalInput, "categoryId" | "clientId" | "document">,
): string | null {
  if (input.document) return null;
  if (!input.categoryId) return "Please select a suggested category to approve.";
  if (!input.clientId) return "Please select a client/supplier before approving.";
  return null;
}

/**
 * Approving a document suggestion reconciles the line against that invoice,
 * expense or asset — the same call as picking it in the Match dialog.
 */
async function approveDocumentApi(
  transactionId: string,
  document: NonNullable<ApprovalInput["document"]>,
): Promise<string> {
  await matchSingleTransaction(
    document.type as BankMatchType,
    document.id,
    transactionId,
  );
  track(EVENTS.TRANSACTION_RECONCILED, { document_type: document.type });
  return "Transaction matched successfully.";
}

/**
 * sole-webapp's inline Approve: `POST /v2/bank/transaction-detail-match`,
 * flagged as an AI match. The server reconciles the line against that
 * account — creating the invoice, expense or asset behind it. A line the
 * model paired with a document of its own is matched to that instead.
 */
export async function approveTransactionApi(
  input: ApprovalInput,
): Promise<string> {
  const issue = approvalIssue(input);
  if (issue) throw new Error(issue);
  if (input.document) {
    return approveDocumentApi(input.transactionId, input.document);
  }
  const result = await postAction(
    apiRoutes.bankTransaction.setMatch,
    {
      transaction_id: input.transactionId,
      account_subcategory_id: input.categoryId,
      client_id: input.clientId,
      gst_included: input.gstIncluded ? "1" : "0",
      is_ai_match: "1",
    },
    "Failed to approve transaction.",
  );
  return result;
}

/* ------------------------------------------------------------------ *
 * Bulk actions on unmatched rows — sole-webapp's Bulk Personal, Bulk
 * Transfer and Bulk Match
 * ------------------------------------------------------------------ */

/** Bulk Personal / Bulk Transfer: every selected line, in one call. */
export function markTransactionsApi(ids: string[], kind: MarkKind) {
  return postAction(
    apiRoutes.bankTransaction.markBulkPersonalTransfer,
    { type: kind, bank_transaction_ids: ids },
    `Couldn't mark the transactions as ${kind}.`,
  );
}

/** A Bulk Match account that needs no client/supplier, as in sole-webapp. */
export function bulkMatchSkipsContact(
  direction: "Credit" | "Debit",
  account: { id: string; name: string } | null,
): boolean {
  if (!account) return false;
  const name = account.name.trim().toLowerCase();
  if (direction === "Credit") return account.id === "118";
  return (
    account.id === "140" || // super contribution takes a fund instead
    account.id === "46" ||
    name === "drawing" ||
    name === "drawings"
  );
}

export type BulkMatchInput = {
  direction: "Credit" | "Debit";
  transactionIds: string[];
  /** account_subcategory_id */
  categoryId: string;
  categoryName: string;
  /** client_id, or the fund's id for a super contribution. */
  contactId: string;
  gstIncluded: boolean;
  notes: string;
};

/** What stops a Bulk Match, in sole-webapp's order — or null. */
export function bulkMatchIssue(input: BulkMatchInput): string | null {
  if (input.transactionIds.length < 2) {
    return "Select at least two transactions to bulk match.";
  }
  if (!input.categoryId) return "Please select a category.";
  const account = { id: input.categoryId, name: input.categoryName };
  if (input.categoryId === "140" && input.direction === "Debit" && !input.contactId) {
    return "Fund Name is required";
  }
  if (!bulkMatchSkipsContact(input.direction, account) && !input.contactId) {
    return input.direction === "Credit"
      ? "Client is required"
      : "Supplier is required";
  }
  return null;
}

/**
 * sole-webapp's bulk match: one `matches[]` entry per line, all against the
 * same account and counterparty. The server creates the invoice (money in) or
 * expense/asset (money out) behind each, as it does for a single match.
 */
export async function bulkMatchApi(input: BulkMatchInput): Promise<string> {
  const issue = bulkMatchIssue(input);
  if (issue) throw new Error(issue);
  const account = { id: input.categoryId, name: input.categoryName };
  const skip = bulkMatchSkipsContact(input.direction, account);
  const superFund = input.direction === "Debit" && input.categoryId === "140";

  return postAction(
    apiRoutes.bankTransaction.bulkMatchNew,
    {
      matches: input.transactionIds.map((transactionId) => ({
        transaction_id: transactionId,
        client_id: skip ? "" : input.contactId,
        ...(superFund ? { fund_id: input.contactId } : {}),
        account_subcategory_id: input.categoryId,
        gst_included: superFund ? false : input.gstIncluded,
        user_description: input.notes.trim(),
      })),
    },
    "Couldn't match the transactions.",
  );
}

/* ------------------------------------------------------------------ *
 * AI suggestions — sole-webapp's "Expense classification" review, over every
 * unmatched line (money in and out)
 * ------------------------------------------------------------------ */

/** sole-webapp loads the review 25 rows at a time, as the list scrolls. */
export const SUGGESTIONS_PAGE_SIZE = 25;

/** One page of unmatched lines to review — all time, newest first. */
export function fetchSuggestionsPage(page: number) {
  return fetchTransactionsPage({
    tab: "unmatched",
    page,
    pageSize: SUGGESTIONS_PAGE_SIZE,
    // No financial year: the review covers every unmatched line, as there.
    period: "",
    search: "",
  });
}

/**
 * The unmatched endpoint has no "has a suggestion" filter, so finding the ones
 * that do means walking every page. Capped well past what a business ever has
 * sitting unmatched, so a bad `total` from the server can't loop forever.
 */
const MAX_SUGGESTION_PAGES = 40;

/**
 * Every unmatched line the model actually had something to say about — a
 * suggested category or a document to match. One function so the banner's
 * count and the review dialog's rows are the same question, answered the same
 * way: see `pendingSuggestions`.
 */
export async function fetchSuggestedTransactions(): Promise<Transaction[]> {
  const found: Transaction[] = [];
  for (let page = 1; page <= MAX_SUGGESTION_PAGES; page += 1) {
    const result = await fetchSuggestionsPage(page);
    found.push(...pendingSuggestions(result.rows));
    if (page * SUGGESTIONS_PAGE_SIZE >= result.total) break;
  }
  return found;
}

/** How many unmatched lines actually carry a suggestion, for the banner. */
export async function fetchSuggestionsCount(): Promise<number> {
  return (await fetchSuggestedTransactions()).length;
}

export type ApprovalRow = ApprovalInput & {
  /** The picked contact person, and the name both sides go by. */
  contactPersonId: string;
  contactName: string;
};

/**
 * Approve All's check over every loaded row — sole-webapp's bulk messages.
 * A row paired with a document needs neither a category nor a client.
 */
export function bulkApprovalIssue(rows: ApprovalRow[]): string | null {
  if (rows.length === 0) return "There are no suggestions to approve.";
  const coded = rows.filter((row) => !row.document);
  if (coded.some((row) => !row.categoryId)) {
    return "Please select a suggested category for all transactions to approve.";
  }
  if (coded.some((row) => !row.clientId)) {
    return "Please select a client/supplier for all transactions before approving.";
  }
  return null;
}

/**
 * Approve All: every loaded row — sole-webapp's bulk form of the single
 * approve, `{ transactions: [...], is_ai_match: true }` to the same endpoint,
 * which takes the array as a bulk match. Rows the model paired with an
 * invoice, expense or asset are matched to it one by one afterwards: each is a
 * match of its own, and one that fails (say, the invoice was paid in the
 * meantime) must not stop the rest.
 */
export async function approveAllApi(rows: ApprovalRow[]): Promise<string> {
  const issue = bulkApprovalIssue(rows);
  if (issue) throw new Error(issue);

  const documentRows = rows.filter((row) => row.document);
  const codedRows = rows.filter((row) => !row.document);

  let message = "";
  if (codedRows.length > 0) {
    message = await approveCodedRowsApi(codedRows);
  }
  if (documentRows.length === 0) return message;

  let failed = 0;
  let firstError = "";
  for (const row of documentRows) {
    try {
      await approveDocumentApi(row.transactionId, row.document!);
    } catch (error) {
      failed += 1;
      firstError ||= error instanceof Error ? error.message : "Couldn't match it.";
    }
  }
  if (failed > 0) {
    throw new Error(
      `${documentRows.length - failed} of ${documentRows.length} document matches approved. ${firstError}`,
    );
  }
  return message || `${documentRows.length} transactions matched successfully.`;
}

async function approveCodedRowsApi(rows: ApprovalRow[]): Promise<string> {
  return postAction(
    apiRoutes.bankTransaction.setMatch,
    {
      transactions: rows.map((row) => ({
        transaction_id: row.transactionId,
        category_id: row.categoryId,
        account_subcategory_id: row.categoryId,
        client_id: row.clientId,
        supplier_id: row.clientId,
        contact_id: row.contactPersonId || row.clientId,
        client_name: row.contactName,
        supplier_name: row.contactName,
        name: row.contactName,
        gst_included: row.gstIncluded ? 1 : 0,
        gst: row.gstIncluded ? 1 : 0,
        is_ai_match: true,
      })),
      is_ai_match: true,
    },
    "Failed to approve transactions.",
  );
}

/** Reject All — sole-webapp's only reject, over every loaded row. */
export function rejectSuggestionsApi(ids: string[]) {
  return postAction(
    apiRoutes.bankTransaction.rejectAiSuggestions,
    { transaction_ids: ids, action: "reject" },
    "Couldn't reject the suggestions.",
  );
}
