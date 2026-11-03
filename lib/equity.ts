/**
 * Equity / capital — the owner's own money moving in and out of the business.
 *
 * Sibling to a Liability rather than a variant of it: both sit under the same
 * nav group, both reconcile against a bank transaction, both carry a document.
 * What sets equity apart is that it isn't owed to anybody — it's the owner
 * putting money in or taking it back out, so there's no supplier on the record,
 * and unlike a liability its date (`transaction_date`) is a real, required,
 * user-set field rather than a server-set timestamp.
 *
 * Backed by sole-webapp's `/equity` endpoints (`components/Equity/`) — same
 * list/add/update/delete routes, same `price`/`transaction_date`/
 * `account_subcategory_id` field names on write, same `rows`/`paginationData`
 * envelope on read. Its "undo" action is `undoPaidWithCash`
 * (`/equity/undo-match`) — one endpoint the backend uses for both undoing a
 * cash settlement and undoing a real bank match, keyed off nothing but the
 * entry's own id.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import type { ExpenseReceipt } from "@/lib/expenses";
import { formatInvoiceDate, invoiceMoney } from "@/lib/invoices";
import { activeCurrencySymbol } from "@/lib/country-context";
import type { TransactionType } from "@/lib/transactions";

export const EQUITY_CATEGORIES = ["Drawings", "Owner Capital Input"] as const;
export type EquityCategory = (typeof EQUITY_CATEGORIES)[number];

/** What each category is for, in the tooltip beside the field. */
export const EQUITY_CATEGORY_HINTS: Record<EquityCategory, string> = {
  Drawings:
    "Money you've taken out of the business for yourself. Not a wage and not deductible — it reduces your stake.",
  "Owner Capital Input":
    "Money or assets you've put into the business from your own pocket. It increases your stake rather than counting as income.",
};

/** Reuses the expense receipt shape — same dropzone, same preview. */
export type EquityAttachment = ExpenseReceipt;

/** Matches the liability cap: capital paperwork runs longer than a receipt. */
export const MAX_EQUITY_BYTES = 20 * 1024 * 1024;

export type EquityStatus = "Matched" | "Pending";

export type Equity = {
  id: string;
  /** ISO `YYYY-MM-DD` — when the money moved (`transaction_date`, user-set). */
  date: string;
  name: string;
  /** The subcategory's display name, straight from the server
   *  (`subcategory_name`) — a managed list (`equity.subcategoryList`), not a
   *  closed set this app can enumerate itself. */
  category: string;
  /** The full value of the movement. */
  amount: number;
  /** Settled from cash on hand rather than a bank account. Cash never appears in
   *  the feed, so it's what makes the entry complete without a match. */
  paidWithCash: boolean;
  /** Settled so far. Equal to `amount` once the entry is fully drawn down. */
  paidAmount: number;
  status: EquityStatus;
  /** The bank transaction it reconciles against, once matched — the server
   *  doesn't return a human reference for it. */
  transactionRef: string | null;
  attachment: EquityAttachment | null;
  /** Bank-feed candidates the server already sees for this entry — what
   *  picks "AI Match" over a plain "Match" on the list (`possible_match`). */
  possibleMatch: number;
};

export type EquityDraft = {
  /** `transaction_date` — real and required, unlike a liability's date. */
  date: string;
  name: string;
  categoryId: string;
  amount: number;
  paidWithCash: boolean;
  attachment: EquityAttachment | null;
};

export function emptyEquityDraft(todayIso: string): EquityDraft {
  return {
    date: todayIso,
    name: "",
    categoryId: "",
    amount: 0,
    paidWithCash: false,
    attachment: null,
  };
}

/**
 * Which side of the bank feed would carry this entry. Drawings leave the
 * account; capital going in arrives in it. Matched by name against the
 * static category list, since the category shown is a display name from the
 * server, not this union — falls back to "Credit" (capital in) where a
 * subcategory doesn't match either known name.
 */
export function equityDirection(category: string): TransactionType {
  return category.trim().toLowerCase() === "drawings" ? "Debit" : "Credit";
}

/** Still outstanding. Zero once the entry is settled. */
export function equityRemaining(equity: Equity): number {
  return Math.max(0, equity.amount - equity.paidAmount);
}

export function formatEquityAmount(equity: Equity): string {
  return invoiceMoney(equity.amount);
}

export function formatEquityRemaining(equity: Equity): string {
  const remaining = equityRemaining(equity);
  return remaining > 0 ? invoiceMoney(remaining) : "—";
}

export function formatEquityDate(iso: string): string {
  return formatInvoiceDate(iso);
}

export type EquityIssue = { key: string; message: string };

/**
 * What's stopping this being saved. Validated in the order the fields appear,
 * so the first message is the first problem someone sees. Matches
 * sole-webapp's own `EquityDataSchema` (schemas/EquitySchema.js): a category
 * id and a date are both required, the name is 2–120 characters, and the
 * total has to be strictly greater than zero (unlike a liability's, which
 * only has to be zero or more).
 */
export function equityIssues(draft: EquityDraft): EquityIssue[] {
  const issues: EquityIssue[] = [];
  if (!draft.categoryId) {
    issues.push({ key: "category", message: "Choose a category." });
  }
  const trimmedName = draft.name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 120) {
    issues.push({
      key: "name",
      message: "Equity name must be 2–120 characters.",
    });
  }
  if (!(draft.amount > 0)) {
    issues.push({ key: "amount", message: `Enter an amount over ${activeCurrencySymbol()}0.` });
  }
  if (!draft.date) {
    issues.push({ key: "date", message: "Choose a date." });
  }
  return issues;
}

/** The line the toast shows after saving. */
export function equitySummaryLine(draft: EquityDraft): string {
  return invoiceMoney(draft.amount);
}

/* ------------------------------------------------------------------ *
 * API — GET/POST/PUT/DELETE /equity, sole-webapp's
 * components/Equity/index.js and EquityList.js.
 * ------------------------------------------------------------------ */

type ApiEquityRow = {
  id: string | number;
  name?: string | null;
  subcategory_name?: string | null;
  price: string | number;
  remainingAmount?: string | number | null;
  transaction_date?: string | null;
  created_at?: string | null;
  is_reconciled?: boolean | number | string;
  paid_with_cash?: boolean | number | string;
  possible_match?: string | number | null;
};

/** Accepts the same boolean/number/string-ish values the backend does. */
function parseFlag(value: boolean | number | string | undefined): boolean {
  return !!value && value !== "0";
}

function mapApiEquity(raw: ApiEquityRow): Equity {
  const amount = Number(raw.price ?? 0);
  const remaining =
    raw.remainingAmount != null ? Number(raw.remainingAmount) : amount;

  return {
    id: String(raw.id),
    date: raw.transaction_date
      ? String(raw.transaction_date).slice(0, 10)
      : raw.created_at
        ? String(raw.created_at).slice(0, 10)
        : "",
    name: raw.name ?? "",
    category: raw.subcategory_name ?? "",
    amount,
    paidWithCash: parseFlag(raw.paid_with_cash),
    paidAmount: Math.max(0, amount - remaining),
    status: parseFlag(raw.is_reconciled) ? "Matched" : "Pending",
    transactionRef: null,
    // The list endpoint doesn't say whether an entry has a document, same as
    // sole-webapp's own list.
    attachment: null,
    possibleMatch: Number(raw.possible_match ?? 0),
  };
}

export type EquityPage = {
  equity: Equity[];
  total: number;
};

/**
 * `searchQuery`/`page`/`limit` are exactly sole-webapp's own params
 * (`getEquityList`, components/Equity/index.js) — `page` here is already
 * 1-based, unlike that component's own 0-based UI state.
 */
export async function fetchEquityPage(
  page: number,
  pageSize: number,
  search?: string,
): Promise<EquityPage> {
  const params: Record<string, string> = {
    page: String(page),
    limit: String(pageSize),
  };
  if (search?.trim()) params.searchQuery = search.trim();

  const response = await api.get<{
    success: boolean;
    data?: {
      rows?: ApiEquityRow[];
      paginationData?: { total?: number };
    };
  }>(apiRoutes.equity.list, { params });

  const rows = response.data?.data?.rows ?? [];
  return {
    equity: rows.map(mapApiEquity),
    total: response.data?.data?.paginationData?.total ?? rows.length,
  };
}

/* ------------------------------------------------------------------ *
 * Categories — GET /equity/category-list, sole-webapp's AddEquity.js
 * `mapCategoryOption`.
 * ------------------------------------------------------------------ */

export type EquitySubcategory = { id: string; name: string };

type ApiSubcategoryRow = {
  id?: string | number;
  account_subcategory_id?: string | number;
  name?: string | null;
  account_subcategory_name?: string | null;
  subcategory_name?: string | null;
};

function toSubcategoryRows(payload: unknown): ApiSubcategoryRow[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.rows)) return record.rows as ApiSubcategoryRow[];
    if (Array.isArray(record.data)) return record.data as ApiSubcategoryRow[];
  }
  return [];
}

export async function fetchEquitySubcategories(): Promise<EquitySubcategory[]> {
  const response = await api.get<{ success: boolean; data?: unknown }>(
    apiRoutes.equity.subcategoryList,
  );
  return toSubcategoryRows(response.data?.data ?? response.data)
    .map((row) => ({
      id: String(row.account_subcategory_id ?? row.id ?? ""),
      name: row.account_subcategory_name || row.subcategory_name || row.name || "",
    }))
    .filter((row) => row.id && row.name);
}

/* ------------------------------------------------------------------ *
 * Detail — GET /equity/:id, for the edit form. The list row doesn't carry
 * the real category id, only its display name.
 * ------------------------------------------------------------------ */

export type EquityDocument = { id: string; name: string; url: string };

type ApiEquityDetail = {
  id: string | number;
  name?: string | null;
  price?: string | number | null;
  transaction_date?: string | null;
  paid_with_cash?: boolean | number | string;
  account_subcategory_id?: string | number | null;
  account_subcategory?: { account_subcategory_id?: string | number; id?: string | number } | null;
  documents?: {
    document_id?: string | number;
    id?: string | number;
    file_name?: string | null;
    name?: string | null;
    file_path?: string | null;
    file_url?: string | null;
    url?: string | null;
  }[];
};

export type EquityDetail = EquityDraft & {
  documents: EquityDocument[];
};

/** The API sometimes returns a bare S3 key instead of an absolute URL. */
function normalizeFileUrl(url: string): string {
  if (!url || /^https?:\/\//i.test(url)) return url;
  return `https://s3.ap-southeast-2.amazonaws.com/static.soleapp.com.au/${url.replace(/^\/+/, "")}`;
}

export async function fetchEquityDetail(id: string): Promise<EquityDetail> {
  const response = await api.get<{ success: boolean; data?: ApiEquityDetail }>(
    `${apiRoutes.equity.viewDetail}${id}`,
  );
  const raw = response.data?.data;
  if (!raw) throw new Error("Equity entry not found");

  const documents: EquityDocument[] = (raw.documents ?? [])
    .map((doc) => ({
      id: String(doc.document_id ?? doc.id ?? ""),
      name: doc.file_name || doc.name || "Attachment",
      url: normalizeFileUrl(doc.file_path || doc.file_url || doc.url || ""),
    }))
    .filter((doc) => doc.id);

  const firstDocument = documents[0];

  return {
    date: raw.transaction_date ? String(raw.transaction_date).slice(0, 10) : "",
    name: raw.name ?? "",
    categoryId: String(
      raw.account_subcategory_id ??
        raw.account_subcategory?.account_subcategory_id ??
        raw.account_subcategory?.id ??
        "",
    ),
    amount: Number(raw.price ?? 0),
    paidWithCash: parseFlag(raw.paid_with_cash),
    attachment: firstDocument
      ? { dataUrl: firstDocument.url, name: firstDocument.name, size: 0 }
      : null,
    documents,
  };
}

/* ------------------------------------------------------------------ *
 * Write — POST/PUT /equity/add|update, sole-webapp's AddEquity.js
 * `onSubmit`.
 * ------------------------------------------------------------------ */

function equityWriteFields(draft: EquityDraft) {
  return {
    account_subcategory_id: draft.categoryId,
    name: draft.name.trim(),
    price: draft.amount,
    paid_with_cash: draft.paidWithCash ? 1 : 0,
    transaction_date: draft.date,
  };
}

export async function createEquityApi(
  draft: EquityDraft,
  file: File | null,
): Promise<{ id: string }> {
  const body = buildEncryptedRequestBody(
    equityWriteFields(draft),
    file ? [file] : [],
  );
  const response = await api.post<{
    success: boolean;
    message?: string;
    data?: { id?: string | number };
  }>(apiRoutes.equity.add, body);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to create equity entry.");
  }
  track(EVENTS.EQUITY_RECORDED, { amount: draft.amount });
  const id = response.data.data?.id;
  return { id: id != null ? String(id) : "" };
}

export async function updateEquityApi(
  id: string,
  draft: EquityDraft,
  file: File | null,
): Promise<void> {
  const body = buildEncryptedRequestBody(
    { id, equity_id: id, ...equityWriteFields(draft) },
    file ? [file] : [],
  );
  const response = await api.put<{ success: boolean; message?: string }>(
    apiRoutes.equity.update,
    body,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to save equity entry.");
  }
}

export async function deleteEquityApi(id: string): Promise<void> {
  const response = await api.delete<{ success: boolean; message?: string }>(
    `${apiRoutes.equity.delete}/${id}`,
    { data: buildEncryptedRequestBody({}) },
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to delete equity entry.");
  }
}

/* ------------------------------------------------------------------ *
 * Attachments on an existing entry — for the list's "Add attachment"
 * dialog, same pair the liability list has (POST/DELETE /equity/attach).
 * ------------------------------------------------------------------ */

export async function uploadEquityAttachmentApi(
  equityId: string,
  file: File,
): Promise<void> {
  const body = buildEncryptedRequestBody({ equity_id: equityId }, [file]);
  const response = await api.post<{ success: boolean; message?: string }>(
    apiRoutes.equity.uploadAttachment,
    body,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to upload attachment.");
  }
}

export async function deleteEquityAttachmentApi(
  documentId: string,
): Promise<void> {
  const response = await api.delete<{ success: boolean; message?: string }>(
    `${apiRoutes.equity.deleteAttachment}/${documentId}`,
    { data: buildEncryptedRequestBody({}) },
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to delete attachment.");
  }
}

/* ------------------------------------------------------------------ *
 * Undo — POST /equity/undo-match, sole-webapp's `undoPaidWithCash`
 * (EquityList.js). One endpoint for undoing either a cash settlement or a
 * real bank match — the backend resolves which from the entry's own id, so
 * the frontend only ever sends `{ type: "equity", id }`.
 * ------------------------------------------------------------------ */

export async function undoEquityMatchApi(equity: Equity): Promise<void> {
  const response = await api.post<{ success: boolean; message?: string }>(
    apiRoutes.equity.undoPaidWithCash,
    buildEncryptedRequestBody({ type: "equity", id: equity.id }),
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to undo the match.");
  }
}
