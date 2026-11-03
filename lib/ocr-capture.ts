/**
 * Document capture for invoices and expenses — upload a file, have sole-ocr
 * read it, get a draft back. Ported from sole-webapp's `InvoiceUploadComponent`
 * and the `ExpenseUploadComponent` inside `AddExpenses`, against the same
 * endpoints: `POST /upload/s3`, then `POST /invoice/extract` or
 * `POST /expense/extract`, and `DELETE /upload/file/<key>` when the user
 * discards the file.
 *
 * The extract calls go as plain JSON, not through `buildEncryptedRequestBody`:
 * they read `req.body` directly with no `getPayload` and validate `fileType`
 * with express-validator, so an encrypted envelope would be rejected. They
 * write nothing — the extraction is only ever a suggestion.
 */
import apiRoutes from "@/config/api-routes";
import { LOW_CONFIDENCE, MAX_UPLOAD_BYTES } from "@/lib/assets";
import { newLineItem, toIsoDate, type InvoiceLineItem } from "@/lib/invoices";
import api from "@/utils/axiosInstance";

export { LOW_CONFIDENCE, MAX_UPLOAD_BYTES };

/** What the backend's file-type validator accepts, less GIF which the picker never offers. */
export const CAPTURE_ACCEPT = "application/pdf,image/png,image/jpeg";
const CAPTURE_TYPES = ["application/pdf", "image/png", "image/jpeg"];

/** A reason the file can't be taken, or undefined when it's fine. */
export function captureFileIssue(file: File): string | undefined {
  if (!CAPTURE_TYPES.includes(file.type)) {
    return "That file type isn't supported. Upload a PDF, PNG, JPG or JPEG.";
  }
  if (file.size > MAX_UPLOAD_BYTES) return `${file.name} is over 10MB.`;
  return undefined;
}

/* ------------------------------------------------------------------ *
 * Upload
 * ------------------------------------------------------------------ */

/**
 * `POST /upload/s3`'s response — a flat object, not the `{success, data}`
 * envelope. On S3 the file is addressed by `key`; with no bucket configured
 * the server stores it locally and addresses it by `filename`.
 */
type ApiUploadResponse = {
  success: boolean;
  error?: string;
  key?: string;
  filename?: string;
  storage?: string;
};

export type CaptureUpload = {
  /** What to hand back to extract and delete: the S3 key, or the local filename. */
  identifier: string;
  source: "s3" | "local";
};

export async function uploadCaptureFile(
  file: File,
  folder: "invoice-uploads" | "expense-uploads",
  onProgress?: (percent: number) => void,
): Promise<CaptureUpload> {
  const form = new FormData();
  // `folder` first: multer reads text fields into `req.body` only as they
  // stream past, and sole-ocr names the S3 key from `req.body.folder` when the
  // file arrives — a field sent after the file is ignored, and everything
  // lands in the default `invoice-uploads/`.
  form.append("folder", folder);
  form.append("file", file);

  const response = await api.post<ApiUploadResponse>(
    apiRoutes.invoice.ocr.upload,
    form,
    {
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
    },
  );
  const body = response.data;
  const identifier = body?.key || body?.filename;
  if (!body?.success || !identifier) {
    throw new Error(body?.error || "Failed to upload the file.");
  }
  return { identifier, source: body.storage === "s3" ? "s3" : "local" };
}

/**
 * Drops the uploaded copy. Best effort, as in sole-webapp: the user has
 * already moved on, so a failure here is logged and never surfaced.
 */
export async function deleteCaptureUpload(upload: CaptureUpload): Promise<void> {
  try {
    await api.delete(apiRoutes.invoice.ocr.deleteUpload + upload.identifier);
  } catch (error) {
    console.error("Failed to delete the uploaded file:", error);
  }
}

function extractBody(upload: CaptureUpload, file: File, method: string) {
  return {
    [upload.source === "s3" ? "s3Key" : "localFile"]: upload.identifier,
    fileType: file.type,
    extractionMethod: method,
  };
}

/** The API reports confidence 0–100 (or nothing); this app's pill wants 0–1. */
function confidenceFrom(...candidates: unknown[]): number {
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (candidate !== null && candidate !== undefined && Number.isFinite(value)) {
      return Math.min(Math.max(value / 100, 0), 1);
    }
  }
  return 0;
}

/** Whatever date shape the model produced, as `YYYY-MM-DD`, or `fallback`. */
function isoDateFrom(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? fallback : toIsoDate(parsed);
}

function amountText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : "";
}

/* ------------------------------------------------------------------ *
 * Invoice
 * ------------------------------------------------------------------ */

type ApiInvoiceItem = {
  description?: string | null;
  qty?: number | string | null;
  price?: number | string | null;
  amount?: number | string | null;
};

type ApiInvoiceFields = {
  invoice_no?: string | null;
  client_name?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  totalAmount?: number | string | null;
  description?: string | null;
  notes?: string | null;
  items?: ApiInvoiceItem[] | null;
  confidence?: number | string | null;
};

/** What a read invoice gives the editor. Every field is optional text, as typed. */
export type InvoiceExtractionFields = {
  number: string;
  clientName: string;
  issued: string;
  due: string;
  total: string;
  description: string;
  notes: string;
  /** The lines read off the document, or one line for the total when there were none. */
  items: InvoiceLineItem[];
};

export type InvoiceExtraction = {
  /** 0–1. Below LOW_CONFIDENCE the panel warns rather than reassures. */
  confidence: number;
  fields: InvoiceExtractionFields;
};

export async function extractInvoiceApi(
  file: File,
  upload: CaptureUpload,
  today: string,
): Promise<InvoiceExtraction> {
  const response = await api.post<{
    success: boolean;
    error?: string;
    extractedData?: ApiInvoiceFields;
    processingInfo?: { confidence?: number };
  }>(
    apiRoutes.invoice.ocr.extract,
    // Hybrid, as sole-webapp: AI first, patterns as the fallback.
    extractBody(upload, file, "hybrid"),
  );
  const data = response.data;
  // The plan limit comes back as a 200 with `success: false` and the reason.
  if (!data?.success || !data.extractedData) {
    throw new Error(data?.error || "Couldn't read that document.");
  }

  const raw = data.extractedData;
  const total = amountText(raw.totalAmount);
  const description = raw.description?.trim() ?? "";

  const items = (raw.items ?? [])
    .filter((item) => item && (item.description || item.price || item.amount))
    .map((item): InvoiceLineItem => {
      const price = amountText(item.price) || amountText(item.amount);
      return {
        ...newLineItem(),
        description: item.description?.trim() ?? "",
        quantity: String(Number(item.qty) > 0 ? Number(item.qty) : 1),
        price,
        // sole-webapp leaves GST off the lines it reads: the document's
        // figures are what was billed, and it doesn't say whether they
        // include tax.
        gst: false,
      };
    });

  const issued = isoDateFrom(raw.invoiceDate, today);
  return {
    confidence: confidenceFrom(
      data.processingInfo?.confidence,
      raw.confidence,
    ),
    fields: {
      number: raw.invoice_no?.trim() ?? "",
      clientName: raw.client_name?.trim() ?? "",
      issued,
      due: isoDateFrom(raw.dueDate, ""),
      total,
      description,
      notes: raw.notes?.trim() ?? "",
      items:
        items.length > 0
          ? items
          : [
              {
                ...newLineItem(),
                description,
                quantity: "1",
                price: total,
                gst: false,
              },
            ],
    },
  };
}

/* ------------------------------------------------------------------ *
 * Expense
 * ------------------------------------------------------------------ */

type ApiExpenseFields = {
  description?: string | null;
  price?: number | string | null;
  total?: number | string | null;
  date?: string | null;
  supplier?: { label?: string } | string | null;
  client_name?: string | null;
  category?: string | null;
};

export type ExpenseExtractionFields = {
  description: string;
  /** The total paid, as text — empty when it couldn't be read. */
  amount: string;
  date: string;
  supplierName: string;
  /** The model's own wording; matched to a real category by the form. */
  category: string;
};

export type ExpenseExtraction = {
  confidence: number;
  fields: ExpenseExtractionFields;
};

export async function extractExpenseApi(
  file: File,
  upload: CaptureUpload,
  today: string,
): Promise<ExpenseExtraction> {
  const response = await api.post<{
    success: boolean;
    error?: string;
    extractedData?: ApiExpenseFields;
    rawData?: { confidence?: number | string | null };
    processingInfo?: { confidence?: number };
  }>(
    apiRoutes.expense.ocr.extract,
    // AI only, as sole-webapp: the vision path reads receipts far better than
    // OCR text does.
    extractBody(upload, file, "ai"),
  );
  const data = response.data;
  if (!data?.success || !data.extractedData) {
    throw new Error(data?.error || "Couldn't read that document.");
  }

  const raw = data.extractedData;
  const supplier =
    typeof raw.supplier === "string" ? raw.supplier : raw.supplier?.label;
  return {
    confidence: confidenceFrom(
      data.rawData?.confidence,
      data.processingInfo?.confidence,
    ),
    fields: {
      description: raw.description?.trim() ?? "",
      amount: amountText(raw.price) || amountText(raw.total),
      date: isoDateFrom(raw.date, today),
      supplierName: (supplier || raw.client_name || "").trim(),
      category: raw.category?.trim() ?? "",
    },
  };
}

/* ------------------------------------------------------------------ *
 * Editing a reading before it's used — sole-webapp's "Edit Extracted Data"
 * dialog. Each is the pair the dialog needs: which fields it offers, and how
 * an edit lands back on the extraction.
 * ------------------------------------------------------------------ */

export type CaptureEditField = {
  key: string;
  label: string;
  kind: "text" | "date" | "number" | "multiline";
};

export type CaptureEditor<E> = {
  fields: CaptureEditField[];
  read: (extraction: E) => Record<string, string>;
  write: (extraction: E, values: Record<string, string>) => E;
};

export const invoiceCaptureEditor: CaptureEditor<InvoiceExtraction> = {
  fields: [
    { key: "number", label: "Invoice number", kind: "text" },
    { key: "clientName", label: "Client name", kind: "text" },
    { key: "issued", label: "Invoice date", kind: "date" },
    { key: "due", label: "Due date", kind: "date" },
    { key: "total", label: "Total amount", kind: "number" },
    { key: "description", label: "Description", kind: "multiline" },
  ],
  read: ({ fields }) => ({
    number: fields.number,
    clientName: fields.clientName,
    issued: fields.issued,
    due: fields.due,
    total: fields.total,
    description: fields.description,
  }),
  write: (extraction, values) => {
    const { fields } = extraction;
    const total = amountText(values.total);
    // A single line that was only ever the total (no lines were read) follows
    // the total and description; lines read off the document are left alone.
    const onlyLine = fields.items.length === 1 ? fields.items[0] : undefined;
    const derived = !!onlyLine && onlyLine.price === fields.total;
    return {
      ...extraction,
      fields: {
        ...fields,
        number: values.number.trim(),
        clientName: values.clientName.trim(),
        issued: values.issued,
        due: values.due,
        total,
        description: values.description.trim(),
        items:
          derived && onlyLine
            ? [
                {
                  ...onlyLine,
                  description: values.description.trim(),
                  price: total,
                },
              ]
            : fields.items,
      },
    };
  },
};

export const expenseCaptureEditor: CaptureEditor<ExpenseExtraction> = {
  fields: [
    { key: "description", label: "Description", kind: "multiline" },
    { key: "supplierName", label: "Supplier", kind: "text" },
    { key: "amount", label: "Amount", kind: "number" },
    { key: "date", label: "Date", kind: "date" },
  ],
  read: ({ fields }) => ({
    description: fields.description,
    supplierName: fields.supplierName,
    amount: fields.amount,
    date: fields.date,
  }),
  write: (extraction, values) => ({
    ...extraction,
    fields: {
      ...extraction.fields,
      description: values.description.trim(),
      supplierName: values.supplierName.trim(),
      amount: amountText(values.amount),
      date: values.date,
    },
  }),
};
