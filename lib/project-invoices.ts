/**
 * A project's invoices — sole-webapp's `Projects/invoices-expenses/InvoicesTab.js`.
 *
 * Read from sole-ocr's `GET /project/invoiceList`, which returns the raw
 * `Invoices` rows linked to the project (top-level only, `parent_id = 0`) with
 * their first line items and client. It is not the main invoice list endpoint:
 * `mark_as` comes back as the stored enum (draft, sent, paid, partially_paid)
 * rather than the main list's pre-resolved due/overdue status, and there is no
 * `remainingAmount`, currency or deposit — so these rows are mapped into their
 * own narrow shape here instead of being forced into the main `Invoice` type.
 *
 * The row actions hit the same invoice endpoints the old tab did, with the old
 * tab's payload keys. Every body goes through `buildEncryptedRequestBody`, as
 * sole-webapp's `useService.post` encrypted them; each controller reads
 * `req.body.data` through `decryptPayload` first (invoice.js `paidWithCash`,
 * `sendPaidReceipt`, `bulkDeleteInvoices`; reminder.js `sendReminder`). The
 * values are all numbers and strings — no booleans or nulls for encryption to
 * rewrite — and `payment_date` is left out entirely on an undo, as the old tab
 * did, rather than sent as "".
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { assertApiSuccess } from "@/lib/invoices";
import type { PageInfo } from "@/lib/products";
import { compactPayload, num, str, toFlag, toIsoDay } from "@/lib/projects";

/* ------------------------------------------------------------------ *
 * Shape
 * ------------------------------------------------------------------ */

/**
 * What a project invoice is shown as. `sent` splits on the due date into
 * Sent and Overdue — the old tab offered its reminder for "due" and "overdue",
 * the main list's vocabulary, which this endpoint never sends; deriving them
 * here is what lets the reminder appear on the rows it was meant for.
 */
export type ProjectInvoiceStatus =
  | "draft"
  | "sent"
  | "overdue"
  | "partially_paid"
  | "paid";

export type ProjectInvoice = {
  id: string;
  number: string;
  clientName: string;
  /** The first line item's description — the old tab's "Job/Task" column. */
  description: string;
  /** yyyy-MM-dd, or "" when unset. */
  issued: string;
  due: string;
  total: number;
  status: ProjectInvoiceStatus;
  /** The template the PDF renders from — the old tab fell back to 1. */
  templateId: string;
  paidWithCash: boolean;
  /** Matched to a bank transaction, so deleting it undoes a reconciliation. */
  reconciled: boolean;
  /** Raised by the bulk importer — the old tab offered only View and Delete on these. */
  bulkUpload: boolean;
  /**
   * `isBulkUploadMatched` from the old tab: an imported invoice with nothing
   * left owing can't be deleted. The project endpoint doesn't return
   * `remainingAmount`, so today this is false for every row — the rule is kept
   * so it reads the same as the old one if the endpoint ever sends it.
   */
  bulkUploadMatched: boolean;
};

type ApiProjectInvoice = Record<string, unknown> & {
  id?: unknown;
  invoice_no?: unknown;
  invoice_date?: unknown;
  due_date?: unknown;
  total?: unknown;
  mark_as?: unknown;
  template_id?: unknown;
  paid_with_cash?: unknown;
  bank_transaction_id?: unknown;
  bulk_upload?: unknown;
  remainingAmount?: unknown;
  client?: { name?: unknown; business_name?: unknown } | null;
  invoiceItem?: { description?: unknown }[] | null;
};

function todayIso(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function mapStatus(markAs: string, due: string, today: string): ProjectInvoiceStatus {
  if (markAs === "paid" || markAs === "partially_paid" || markAs === "draft") return markAs;
  return due && due < today ? "overdue" : "sent";
}

function mapProjectInvoice(raw: ApiProjectInvoice, today: string): ProjectInvoice {
  const due = toIsoDay(raw.due_date);
  const bankTransactionId = num(raw.bank_transaction_id);
  const bulkUpload = toFlag(raw.bulk_upload);
  return {
    id: str(raw.id),
    number: str(raw.invoice_no),
    clientName: str(raw.client?.name) || str(raw.client?.business_name),
    description: str(raw.invoiceItem?.[0]?.description),
    issued: toIsoDay(raw.invoice_date),
    due,
    total: num(raw.total),
    status: mapStatus(str(raw.mark_as).toLowerCase(), due, today),
    templateId: str(raw.template_id) || "1",
    paidWithCash: toFlag(raw.paid_with_cash),
    reconciled: bankTransactionId > 0,
    bulkUpload,
    bulkUploadMatched:
      bulkUpload && raw.remainingAmount != null && num(raw.remainingAmount) <= 0,
  };
}

/* ------------------------------------------------------------------ *
 * List
 * ------------------------------------------------------------------ */

export const PROJECT_INVOICE_PAGE_SIZE = 10;

export type ProjectInvoicePage = {
  rows: ProjectInvoice[];
  total: number;
};

type ListResponse = {
  success?: boolean;
  message?: string;
  data?: {
    invoices?: ApiProjectInvoice[];
    pagination?: { totalItems?: unknown; totalPages?: unknown };
  };
};

async function fetchRawPage(projectId: string, page: number, limit: number) {
  const response = await api.get<ListResponse>(apiRoutes.projects.getInvoiceList, {
    params: { project_id: projectId, page, limit },
  });
  assertApiSuccess(response.data, "Couldn't load this project's invoices.");
  return response.data?.data;
}

/** One page, newest first — the endpoint's default `created_at DESC`, as the old tab used. */
export async function fetchProjectInvoicesPage(
  projectId: string,
  page: number,
  pageSize: number,
): Promise<ProjectInvoicePage> {
  const data = await fetchRawPage(projectId, page, pageSize);
  const today = todayIso();
  return {
    rows: (data?.invoices ?? []).map((raw) => mapProjectInvoice(raw, today)),
    total: num(data?.pagination?.totalItems),
  };
}

export type ProjectInvoiceSummary = {
  /** Non-draft invoices — a draft hasn't billed anyone yet. */
  count: number;
  invoiced: number;
  paid: number;
  outstanding: number;
};

/** The endpoint caps `limit` at 100, so the totals walk every page at that size. */
const SUMMARY_PAGE_SIZE = 100;

/**
 * Invoiced / Paid / Outstanding across every invoice on the project, not just
 * the page on screen. There's no totals endpoint for a project's invoices
 * (`/project/stats/:id/financial-metrics` splits money by bank-match state,
 * not by paid vs owing), so these are summed from the list itself.
 * A partially paid invoice counts as outstanding in full: the endpoint doesn't
 * say how much of it has been paid.
 */
export async function fetchProjectInvoiceSummary(projectId: string): Promise<ProjectInvoiceSummary> {
  const today = todayIso();
  const rows: ProjectInvoice[] = [];
  let page = 1;
  let pages = 1;
  do {
    const data = await fetchRawPage(projectId, page, SUMMARY_PAGE_SIZE);
    rows.push(...(data?.invoices ?? []).map((raw) => mapProjectInvoice(raw, today)));
    pages = num(data?.pagination?.totalPages, 1);
    page += 1;
  } while (page <= pages);

  const billed = rows.filter((invoice) => invoice.status !== "draft");
  const invoiced = billed.reduce((sum, invoice) => sum + invoice.total, 0);
  const paid = billed
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + invoice.total, 0);
  return { count: billed.length, invoiced, paid, outstanding: invoiced - paid };
}

export function projectInvoicePageInfo(page: number, pageSize: number, total: number): PageInfo {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  return {
    page: current,
    pageCount,
    total,
    from: total === 0 ? 0 : (current - 1) * pageSize + 1,
    to: Math.min(current * pageSize, total),
  };
}

/* ------------------------------------------------------------------ *
 * Row actions
 * ------------------------------------------------------------------ */

type WriteResponse = { success?: boolean; message?: string };

async function postEncrypted(
  url: string,
  fields: Record<string, unknown>,
  fallback: string,
): Promise<string | undefined> {
  const response = await api.post<WriteResponse>(
    url,
    buildEncryptedRequestBody(compactPayload(fields)),
  );
  assertApiSuccess(response.data, fallback);
  return response.data?.message;
}

/**
 * Records — or with `undo`, reverses — a cash payment. `payment_date` only
 * travels when marking paid, exactly as the old tab sent it.
 */
export function projectInvoicePaidWithCashApi(
  invoiceId: string,
  options: { undo: boolean; paymentDate?: string },
): Promise<string | undefined> {
  return postEncrypted(
    apiRoutes.invoice.paidWithCash,
    {
      invoice_id: Number(invoiceId),
      undo: options.undo ? 1 : 0,
      payment_date: options.undo ? undefined : options.paymentDate,
    },
    "Failed to update cash payment status",
  );
}

/** Emails the client a payment reminder — `{ id, type: "invoice" }`, as the old tab sent. */
export function sendProjectInvoiceReminderApi(invoiceId: string): Promise<string | undefined> {
  return postEncrypted(
    apiRoutes.communicationPreference.sendReminder,
    { id: Number(invoiceId), type: "invoice" },
    "Couldn't send the reminder.",
  );
}

/** Emails the client the receipt for a paid invoice. */
export function sendProjectInvoicePaidReceiptApi(invoiceId: string): Promise<string | undefined> {
  return postEncrypted(
    apiRoutes.invoice.sendPaidReceipt,
    { id: Number(invoiceId) },
    "Couldn't send the paid receipt.",
  );
}

/** One invoice through the bulk-delete endpoint, which is how the old tab deleted. */
export function deleteProjectInvoiceApi(invoiceId: string): Promise<string | undefined> {
  return postEncrypted(
    apiRoutes.invoice.bulkDelete,
    { id: Number(invoiceId) },
    "Failed to delete invoice",
  );
}
