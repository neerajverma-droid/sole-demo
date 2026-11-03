/**
 * Draft invoices available to append work to.
 *
 * Before raising a brand-new invoice for something billable — an expense being
 * on-charged, a batch of time entries, a logged trip — sole-webapp offers the
 * drafts that already exist, so a week's work doesn't end up spread across
 * five half-finished invoices. There are two endpoints behind that, and which
 * one applies is decided by whether the thing being billed knows its client:
 *
 * - `GET /invoice/drafts?client_id=…` — that client's drafts. Time entries and
 *   km trips both carry a client, so they ask for this.
 * - `GET /invoice/drafts/all` — every draft on the account, with each one's
 *   client attached for display. An expense has a *supplier*, not a client —
 *   who it gets on-charged to isn't decided until the invoice is written — so
 *   the expenses list asks for this one.
 *
 * Both return the same row shape, so one type covers them.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { apiDate } from "@/lib/invoices";

/**
 * A draft as the chooser lists it. Deliberately not the full `Invoice` — the
 * endpoints return a narrow projection (no line items beyond the first
 * description, no status, no client address), and widening it here would mean
 * inventing fields that never arrived.
 */
export type DraftInvoiceSummary = {
  id: string;
  /** The reference shown to the client, e.g. "invoice12". Falls back to `#id`. */
  number: string;
  /** Only ever populated by the all-drafts endpoint, which joins the client. */
  clientName: string;
  /** ISO `YYYY-MM-DD`, or "" when the draft has no date on it yet. */
  date: string;
  /** The draft's note, or its first line's description — whichever it has. */
  description: string;
  total: number;
  /**
   * Which template its PDF renders on — what the row's Preview needs.
   * Undefined rather than null so it lines up with `Invoice["templateId"]`,
   * which the shared PDF viewer takes.
   */
  templateId?: string;
};

type ApiDraftInvoice = {
  id: number | string;
  invoice_no?: string | null;
  client_id?: number | string | null;
  notes?: string | null;
  description?: string | null;
  total?: number | string | null;
  invoice_date?: string | null;
  template_id?: number | string | null;
  client?: { id?: number | string | null; name?: string | null } | null;
  invoiceItem?: { description?: string | null }[] | null;
};

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

/**
 * Same order of preference sole-webapp's own `getDescription` uses: the note
 * first, since that's what someone actually typed about the invoice, then the
 * first line's description as a stand-in.
 */
function draftDescription(raw: ApiDraftInvoice): string {
  const notes = raw.notes?.trim();
  if (notes) return notes;
  const item = raw.invoiceItem?.[0]?.description?.trim();
  if (item) return item;
  return raw.description?.trim() || "";
}

function mapDraft(raw: ApiDraftInvoice): DraftInvoiceSummary {
  return {
    id: String(raw.id),
    number: raw.invoice_no?.trim() || `#${raw.id}`,
    clientName: raw.client?.name?.trim() || "",
    date: apiDate(raw.invoice_date ?? undefined),
    description: draftDescription(raw),
    total: Number(raw.total ?? 0) || 0,
    templateId: raw.template_id != null ? String(raw.template_id) : undefined,
  };
}

/**
 * `clientId` narrows to that client's drafts; leaving it out asks for every
 * draft on the account. Sending `client_id` is what the two endpoints differ
 * by — the per-client one rejects the call outright without it.
 */
export async function fetchDraftInvoices(
  clientId?: string | null,
): Promise<DraftInvoiceSummary[]> {
  const response = clientId
    ? await api.get<ApiEnvelope<ApiDraftInvoice[]>>(apiRoutes.invoice.drafts, {
        params: { client_id: clientId },
      })
    : await api.get<ApiEnvelope<ApiDraftInvoice[]>>(apiRoutes.invoice.allDrafts);

  if (!response.data?.success) {
    throw new Error(
      response.data?.message || "Couldn't load your draft invoices.",
    );
  }
  return (response.data.data ?? []).map(mapDraft);
}

/** Shared between the chooser and whatever opens it, so both read one cache entry. */
export function draftInvoicesQueryKey(clientId?: string | null) {
  return ["invoice-drafts", clientId ?? "all"] as const;
}
