/**
 * Liabilities — what the business owes that isn't a supplier bill.
 *
 * Wages payable, loans, and the residue that fits neither. Deliberately close
 * in shape to an Expense: both record money owed against a supplier, both
 * reconcile against a bank transaction, and both carry an attachment. Where the
 * two differ is that a liability is drawn down over time, so it keeps a paid
 * figure and reports what remains.
 *
 * Backed by sole-webapp's `/liability` endpoints (`components/Liability.js/`)
 * — same list/add/update/delete routes, same `sub_total`/`gst`/
 * `account_subcategory_id` field names on write, same `rows`/`paginationData`
 * envelope on read.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import type { ExpenseReceipt } from "@/lib/expenses";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { formatInvoiceDate, invoiceMoney } from "@/lib/invoices";

export const LIABILITY_CATEGORIES = [
  "Wages Payable — Payroll",
  "Loan",
  "Other Liabilities",
] as const;
export type LiabilityCategory = (typeof LIABILITY_CATEGORIES)[number];

/** What each category is for, in the tooltip beside the field. */
export const LIABILITY_CATEGORY_HINTS: Record<LiabilityCategory, string> = {
  "Wages Payable — Payroll":
    "Wages, super and PAYG you've accrued but not yet paid out.",
  Loan: "Borrowings you're repaying — equipment finance, a business loan, a director's loan.",
  "Other Liabilities":
    "Anything else you owe that isn't a supplier bill: a bond you're holding, unearned income, a provision.",
};

/** Reuses the expense receipt shape — same dropzone, same preview. */
export type LiabilityAttachment = ExpenseReceipt;

/** A liability's attachment cap. Larger than a receipt: loan docs are longer. */
export const MAX_LIABILITY_BYTES = 20 * 1024 * 1024;

export type LiabilityStatus = "Matched" | "Pending";

export type Liability = {
  id: string;
  /** ISO `YYYY-MM-DD` — when the liability was raised. */
  date: string;
  name: string;
  /**
   * The subcategory's display name, straight from the server
   * (`subcategory_name` on the list row) — the account subcategories this
   * can be are a managed list on the backend (`liability.subcategoryList`),
   * not a closed set this app can enumerate itself.
   */
  category: string;
  /** The client this liability is billed against — `client_id` server-side. */
  supplierId: string | null;
  supplierName: string;
  supplierEmail: string;
  /** What's owed in total, GST included where `gst` is on. */
  amount: number;
  /** Whether the amount contains GST at all. */
  gst: boolean;
  /** Paid down so far. Equal to `amount` once settled. */
  paidAmount: number;
  status: LiabilityStatus;
  /** The bank transaction it reconciles against, once matched — the server
   *  doesn't return a human reference for it, only ids to undo the match by. */
  transactionRef: string | null;
  /** Set once matched — needed to undo the match, mirrors sole-webapp's `canUndoLiabilityMatch`. */
  journalEntryId: string | null;
  bankTransactionId: string | null;
  attachment: LiabilityAttachment | null;
  /** Bank-feed candidates the server already sees for this liability — what
   *  picks "AI Match" over a plain "Match" on the list (`possible_match`). */
  possibleMatch: number;
};

/** Sole-webapp's own rule for whether "Unmatch" is offered, wider than the
 *  plain Matched/Pending badge: a liability can be part-paid, or carry a
 *  journal/bank-transaction id, without `status` having flipped to Matched yet. */
export function liabilityCanUndoMatch(liability: Liability): boolean {
  return (
    liability.status === "Matched" ||
    liability.paidAmount > 0 ||
    !!liability.journalEntryId ||
    !!liability.bankTransactionId
  );
}

/**
 * The create/edit form's own shape — a real `account_subcategory_id` to
 * submit rather than the list row's display-only `category` name, since
 * sole-webapp's add/update endpoints take the id, not the name.
 */
export type LiabilityDraft = {
  /** Shown on the form for continuity, but not part of the write payload —
   *  sole-webapp's own add/update services don't accept a date at all; a
   *  liability's date is its `created_at`, set once, server-side. */
  date: string;
  name: string;
  categoryId: string;
  /** The client this liability is billed against — `client_id` server-side. */
  supplierId: string | null;
  supplierName: string;
  supplierEmail: string;
  /** The amount before tax — the server adds the tax on top when `gst` is on. */
  amount: number;
  gst: boolean;
  /** The rate a saved liability was recorded at; null for a new one (today's rate applies). */
  gstPercent: number | null;
  attachment: LiabilityAttachment | null;
};

export function emptyLiabilityDraft(todayIso: string): LiabilityDraft {
  return {
    date: todayIso,
    name: "",
    categoryId: "",
    supplierId: null,
    supplierName: "",
    supplierEmail: "",
    amount: 0,
    gst: false,
    gstPercent: null,
    attachment: null,
  };
}

/** Still owed. Zero once the liability is settled. */
export function liabilityRemaining(liability: Liability): number {
  return Math.max(0, liability.amount - liability.paidAmount);
}

export function formatLiabilityAmount(liability: Liability): string {
  return invoiceMoney(liability.amount);
}

export function formatLiabilityRemaining(liability: Liability): string {
  const remaining = liabilityRemaining(liability);
  return remaining > 0 ? invoiceMoney(remaining) : "—";
}

export function formatLiabilityDate(iso: string): string {
  return formatInvoiceDate(iso);
}

export type LiabilityIssue = { key: string; message: string };

/**
 * What's stopping this being saved. Validated in the order the fields appear,
 * so the first message is the first problem someone sees. Matches
 * sole-webapp's own `LiabilityDataSchema` (schemas/LiabilitySchema.js):
 * a supplier and a category are both required ids, the name is 2–120
 * characters, and the total only has to be zero or more, not strictly
 * positive.
 */
export function liabilityIssues(draft: LiabilityDraft): LiabilityIssue[] {
  const issues: LiabilityIssue[] = [];
  if (!draft.supplierId) {
    issues.push({ key: "supplier", message: "Choose a supplier." });
  }
  if (!draft.categoryId) {
    issues.push({ key: "category", message: "Choose a category." });
  }
  const trimmedName = draft.name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 120) {
    issues.push({
      key: "name",
      message: "Liability name must be 2–120 characters.",
    });
  }
  if (!(draft.amount >= 0)) {
    issues.push({ key: "amount", message: "Sub total must be 0 or greater." });
  }
  return issues;
}

/** The line the toast shows after saving. */
export function liabilitySummaryLine(draft: LiabilityDraft): string {
  return invoiceMoney(draft.amount);
}

/* ------------------------------------------------------------------ *
 * API — GET/POST/PUT/DELETE /liability, sole-webapp's
 * components/Liability.js/index.js and LiabilityList.js.
 * ------------------------------------------------------------------ */

type ApiLiabilityRow = {
  id: string | number;
  name?: string | null;
  subcategory_name?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  client_id?: string | number | null;
  price: string | number;
  remainingAmount?: string | number | null;
  created_at?: string | null;
  is_reconciled?: boolean | number | string;
  possible_match?: string | number | null;
  journal_entry_id?: string | number | null;
  bank_transaction_id?: string | number | null;
  gst?: boolean | number | string;
};

/** Accepts the same boolean/number/string-ish values the backend does. */
function parseFlag(value: boolean | number | string | undefined): boolean {
  return !!value && value !== "0";
}

function mapApiLiability(raw: ApiLiabilityRow): Liability {
  const amount = Number(raw.price ?? 0);
  const remaining =
    raw.remainingAmount != null ? Number(raw.remainingAmount) : amount;

  return {
    id: String(raw.id),
    date: raw.created_at ? String(raw.created_at).slice(0, 10) : "",
    name: raw.name ?? "",
    category: raw.subcategory_name ?? "",
    supplierId: raw.client_id != null ? String(raw.client_id) : null,
    supplierName: raw.contact_name ?? "",
    supplierEmail: raw.contact_email ?? "",
    amount,
    gst: parseFlag(raw.gst),
    paidAmount: Math.max(0, amount - remaining),
    status: parseFlag(raw.is_reconciled) ? "Matched" : "Pending",
    // Sole-webapp's own list doesn't return a human bank reference either —
    // only the ids `canUndoLiabilityMatch` needs, below.
    transactionRef: null,
    journalEntryId: raw.journal_entry_id ? String(raw.journal_entry_id) : null,
    bankTransactionId: raw.bank_transaction_id
      ? String(raw.bank_transaction_id)
      : null,
    // The list endpoint doesn't say whether a liability has a document —
    // sole-webapp's own list shows the same unconditional "Add attachment"
    // affordance regardless, rather than a per-row indicator.
    attachment: null,
    possibleMatch: Number(raw.possible_match ?? 0),
  };
}

export type LiabilitiesPage = {
  liabilities: Liability[];
  total: number;
};

/**
 * `searchQuery`/`page`/`limit` are exactly sole-webapp's own params
 * (`getLiabilityList`, components/Liability.js/index.js) — `page` here is
 * already 1-based, unlike that component's own 0-based UI state.
 */
export async function fetchLiabilitiesPage(
  page: number,
  pageSize: number,
  search?: string,
): Promise<LiabilitiesPage> {
  const params: Record<string, string> = {
    page: String(page),
    limit: String(pageSize),
  };
  if (search?.trim()) params.searchQuery = search.trim();

  const response = await api.get<{
    success: boolean;
    data?: {
      rows?: ApiLiabilityRow[];
      paginationData?: { total?: number };
    };
  }>(apiRoutes.liability.list, { params });

  const rows = response.data?.data?.rows ?? [];
  return {
    liabilities: rows.map(mapApiLiability),
    total: response.data?.data?.paginationData?.total ?? rows.length,
  };
}

/* ------------------------------------------------------------------ *
 * Categories — GET /liability/subcategory-list, sole-webapp's
 * AddLiability.js `mapCategoryOption`.
 * ------------------------------------------------------------------ */

export type LiabilitySubcategory = { id: string; name: string };

type ApiSubcategoryRow = {
  id?: string | number;
  account_subcategory_id?: string | number;
  name?: string | null;
  account_subcategory_name?: string | null;
  subcategory_name?: string | null;
};

/** The response wraps the list differently depending on the route, same defensiveness as sole-webapp's own `toList`. */
function toSubcategoryRows(payload: unknown): ApiSubcategoryRow[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.rows)) return record.rows as ApiSubcategoryRow[];
    if (Array.isArray(record.data)) return record.data as ApiSubcategoryRow[];
  }
  return [];
}

export async function fetchLiabilitySubcategories(): Promise<
  LiabilitySubcategory[]
> {
  const response = await api.get<{ success: boolean; data?: unknown }>(
    apiRoutes.liability.subcategoryList,
  );
  return toSubcategoryRows(response.data?.data ?? response.data)
    .map((row) => ({
      id: String(row.account_subcategory_id ?? row.id ?? ""),
      name: row.account_subcategory_name || row.subcategory_name || row.name || "",
    }))
    .filter((row) => row.id && row.name);
}

/* ------------------------------------------------------------------ *
 * Detail — GET /liability/:id, for the edit form. The list row doesn't
 * carry the real ids (supplier, category) editing needs, only their
 * display names — same reason `fetchContributionDetail` exists separately
 * from `fetchContributionsPage` in lib/super.ts.
 * ------------------------------------------------------------------ */

export type LiabilityDocument = { id: string; name: string; url: string };

type ApiLiabilityDetail = {
  id: string | number;
  name?: string | null;
  sub_total?: string | number | null;
  price?: string | number | null;
  gst?: boolean | number | string;
  gst_percentage?: string | number | null;
  account_subcategory_id?: string | number | null;
  account_subcategory?: { account_subcategory_id?: string | number; id?: string | number } | null;
  client_id?: string | number | null;
  client?: { id?: string | number; name?: string | null } | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact?: { name?: string | null; email?: string | null } | null;
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

export type LiabilityDetail = LiabilityDraft & {
  documents: LiabilityDocument[];
};

/** The API sometimes returns a bare S3 key instead of an absolute URL. */
function normalizeFileUrl(url: string): string {
  if (!url || /^https?:\/\//i.test(url)) return url;
  return `https://s3.ap-southeast-2.amazonaws.com/static.soleapp.com.au/${url.replace(/^\/+/, "")}`;
}

export async function fetchLiabilityDetail(id: string): Promise<LiabilityDetail> {
  const response = await api.get<{ success: boolean; data?: ApiLiabilityDetail }>(
    `${apiRoutes.liability.viewDetail}${id}`,
  );
  const raw = response.data?.data;
  if (!raw) throw new Error("Liability not found");

  const documents: LiabilityDocument[] = (raw.documents ?? [])
    .map((doc) => ({
      id: String(doc.document_id ?? doc.id ?? ""),
      name: doc.file_name || doc.name || "Attachment",
      url: normalizeFileUrl(doc.file_path || doc.file_url || doc.url || ""),
    }))
    .filter((doc) => doc.id);

  const firstDocument = documents[0];

  return {
    date: "",
    name: raw.name ?? "",
    categoryId: String(
      raw.account_subcategory_id ??
        raw.account_subcategory?.account_subcategory_id ??
        raw.account_subcategory?.id ??
        "",
    ),
    supplierId: raw.client_id != null ? String(raw.client_id) : null,
    supplierName: raw.contact_name || raw.contact?.name || raw.client?.name || "",
    supplierEmail: raw.contact_email || raw.contact?.email || "",
    // `sub_total` is the amount before tax — what the form shows and sends
    // back; the server adds the tax on top of it into `price`.
    amount: Number(raw.sub_total ?? raw.price ?? 0),
    gst: parseFlag(raw.gst),
    gstPercent:
      raw.gst_percentage != null && Number(raw.gst_percentage) > 0
        ? Number(raw.gst_percentage)
        : null,
    // Existing documents show through the same single-file dropzone the
    // create form uses — `dataUrl` repurposed to hold the real server URL,
    // same as sole-webapp's own edit form previews an already-uploaded file.
    attachment: firstDocument
      ? { dataUrl: firstDocument.url, name: firstDocument.name, size: 0 }
      : null,
    documents,
  };
}

/* ------------------------------------------------------------------ *
 * Write — POST/PUT /liability/add|update, sole-webapp's AddLiability.js
 * `onSubmit`. `paid_with_cash` has no control in this form either (the old
 * frontend's own form never exposes one), so it's always sent as off.
 * ------------------------------------------------------------------ */

function liabilityWriteFields(draft: LiabilityDraft) {
  return {
    client_id: draft.supplierId,
    account_subcategory_id: draft.categoryId,
    name: draft.name.trim(),
    // The amount before tax: the server adds the tax on top of it.
    sub_total: draft.amount,
    gst: draft.gst ? 1 : 0,
    paid_with_cash: 0,
  };
}

export async function createLiabilityApi(
  draft: LiabilityDraft,
  file: File | null,
): Promise<{ id: string }> {
  const body = buildEncryptedRequestBody(
    liabilityWriteFields(draft),
    file ? [file] : [],
  );
  const response = await api.post<{
    success: boolean;
    message?: string;
    data?: { id?: string | number };
  }>(apiRoutes.liability.add, body);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to create liability.");
  }
  track(EVENTS.LIABILITY_ADDED, { amount: draft.amount });
  const id = response.data.data?.id;
  return { id: id != null ? String(id) : "" };
}

export async function updateLiabilityApi(
  id: string,
  draft: LiabilityDraft,
  file: File | null,
): Promise<void> {
  const body = buildEncryptedRequestBody(
    { id, liability_id: id, ...liabilityWriteFields(draft) },
    file ? [file] : [],
  );
  const response = await api.put<{ success: boolean; message?: string }>(
    apiRoutes.liability.update,
    body,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to save liability.");
  }
}

export async function deleteLiabilityApi(id: string): Promise<void> {
  const response = await api.delete<{ success: boolean; message?: string }>(
    `${apiRoutes.liability.delete}/${id}`,
    { data: buildEncryptedRequestBody({}) },
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to delete liability.");
  }
}

/* ------------------------------------------------------------------ *
 * Attachments on an existing liability — separate from the create/update
 * form's own file, for the list's "Add attachment" dialog. Sole-webapp's
 * own `uploadLiabilityAttachment`/`deleteLiabilityAttachment`
 * (LiabilityList.js) post plain, unencrypted FormData, but every other
 * write in this app — including the create/update calls right above —
 * goes through `buildEncryptedRequestBody`, so these do too.
 * ------------------------------------------------------------------ */

export async function uploadLiabilityAttachmentApi(
  liabilityId: string,
  file: File,
): Promise<void> {
  const body = buildEncryptedRequestBody({ liability_id: liabilityId }, [file]);
  const response = await api.post<{ success: boolean; message?: string }>(
    apiRoutes.liability.uploadAttachment,
    body,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to upload attachment.");
  }
}

export async function deleteLiabilityAttachmentApi(
  documentId: string,
): Promise<void> {
  const response = await api.delete<{ success: boolean; message?: string }>(
    `${apiRoutes.liability.deleteAttachment}/${documentId}`,
    { data: buildEncryptedRequestBody({}) },
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to delete attachment.");
  }
}

/* ------------------------------------------------------------------ *
 * Undo match — POST /liability/undo-match, sole-webapp's
 * `handleUndoLiabilityMatchClose` (LiabilityList.js).
 * ------------------------------------------------------------------ */

export async function undoLiabilityMatchApi(liability: Liability): Promise<void> {
  const fields: Record<string, unknown> = {
    liability_id: liability.id,
    id: liability.id,
    reference_type: "liability",
    reference_id: liability.id,
  };
  if (liability.journalEntryId) fields.journal_entry_id = liability.journalEntryId;
  if (liability.bankTransactionId) fields.bank_transaction_id = liability.bankTransactionId;

  const response = await api.post<{ success: boolean; message?: string }>(
    apiRoutes.liability.undoMatch,
    buildEncryptedRequestBody(fields),
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to undo the match.");
  }
}
