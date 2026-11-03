/**
 * The three `…/bulk/create` endpoints: invoices, expenses and assets.
 *
 * All three take the same envelope — one array under a named key — and answer
 * with `{ success, message: "N … created successfully", data: [created rows] }`.
 * They share a controller shape too, so they share one client here rather
 * than three near-identical files.
 *
 * Each is **all-or-nothing**: the service wraps the batch in a database
 * transaction and a single bad row 500s the lot. That's why the wizards
 * validate hard before submitting and only ever send rows with no issues.
 *
 * sole-webapp posts these in the clear. This sends them AES-encrypted, which
 * is the convention here — and the reason all three sole-ocr controllers
 * needed `handlePayload` added: they read `req.body.invoices` (and
 * `.expenses`, `.assets`) directly, so an encrypted body arrived as
 * `undefined` and failed with "… array is required".
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import type { BulkImportResult } from "@/lib/bulk-import";
import type { InvoiceImportPayload } from "@/lib/invoice-import";
import type { ExpenseImportPayload } from "@/lib/expense-import";
import type { AssetImportPayload } from "@/lib/asset-bulk-import";

type ApiBulkCreateResponse = {
  success?: boolean;
  message?: string;
  /** The created rows. Its length is the only count the server returns. */
  data?: unknown[];
  error?: string;
};

/**
 * Posts one batch and reports how many landed.
 *
 * `created` comes from the length of the returned array rather than from the
 * message, which is prose. Where the server answers 2xx but echoes no array,
 * the honest reading is that the batch it just confirmed went in whole.
 */
async function postBulk<T>(
  url: string,
  key: string,
  rows: T[],
): Promise<BulkImportResult> {
  if (rows.length === 0) throw new Error("There are no rows to import.");

  const response = await api.post<ApiBulkCreateResponse>(
    url,
    buildEncryptedRequestBody({ [key]: rows }),
  );

  const body = response.data;

  if (body?.success === false) {
    throw new Error(body.message || body.error || "The import failed.");
  }

  const created = Array.isArray(body?.data) ? body.data.length : rows.length;

  return {
    created,
    // All-or-nothing: anything not created is a row the transaction rolled
    // back, not one the server skipped.
    failed: Math.max(rows.length - created, 0),
    skipped: 0,
  };
}

export function createBulkInvoices(
  rows: InvoiceImportPayload[],
): Promise<BulkImportResult> {
  return postBulk(apiRoutes.invoice.bulkCreate, "invoices", rows);
}

export function createBulkExpenses(
  rows: ExpenseImportPayload[],
): Promise<BulkImportResult> {
  return postBulk(apiRoutes.expense.bulkCreate, "expenses", rows);
}

export function createBulkAssets(
  rows: AssetImportPayload[],
): Promise<BulkImportResult> {
  return postBulk(apiRoutes.asset.bulkCreate, "assets", rows);
}
