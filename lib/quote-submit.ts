/**
 * Raising a quote — POST /v2/quote and PUT /v2/quote/:id.
 *
 * The quote payload is the invoice payload with the invoice-only parts taken
 * out: sole-webapp's `handleFormSubmit` in AddQuote.js builds the same fields,
 * the same nested `item[...]` lines and the same deposit block, but has no
 * payment rails, no recurrence and no follow-up reminders. So everything about
 * the money — per-line GST, AUD conversion, the deposit — is imported from
 * lib/invoice-submit rather than restated here, and only the document-level
 * fields differ.
 *
 * The body is AES-encrypted, through the same `buildEncryptedRequestBody` the
 * business module uses. sole-webapp posts this one as plain multipart, so the
 * endpoints accept either: they decrypt when a `data` field is present and
 * read `req.body` directly when it isn't, which keeps the old frontend working
 * against the same route. Attachments always travel as raw `files[]` beside
 * the ciphertext — bytes can't be encrypted into a JSON string.
 *
 * Same two rules about the figures apply as on an invoice: line prices are in
 * the document's currency, the top-level totals are always AUD, and GST is
 * rounded per line before being summed.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import {
  audTotals,
  billableEntries,
  depositPayload,
  documentTotals,
  itemPayload,
  money,
} from "@/lib/invoice-submit";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { activeBaseCurrency } from "@/lib/country-context";
import type { QuoteDraft } from "@/lib/quotes";

/** Which button was pressed, and so what the server does with the quote. */
export type QuoteSubmitMode = "draft" | "send" | "print";

export type QuoteSubmitContext = {
  /** Percentage points from the business's tax settings. */
  gstPercent: number;
  /** Whether GST applies to this document at all. */
  gstEnabled: boolean;
  /** The PDF layout id — the quote one, not the invoice one. */
  templateId: string;
  /** Units of the document's currency per one unit of the base currency. Null when it's in the base. */
  exchangeRate: number | null;
  /** The business's own currency, which the base totals are in. Absent means AUD. */
  baseCurrency?: string;
  /** Files picked in this session, which still have to be uploaded. */
  files: File[];
  /** Set when editing; absent when creating. */
  quoteId?: string;
};

/**
 * Everything the server is told about a quote, ready to be flattened.
 * Exported so it can be inspected in isolation — the shape is the contract
 * with two endpoints, and it's worth being able to assert on directly.
 */
export function buildQuotePayload(
  draft: QuoteDraft,
  mode: QuoteSubmitMode,
  context: QuoteSubmitContext,
): Record<string, unknown> {
  const { gstPercent, gstEnabled, templateId } = context;

  const kept = billableEntries(draft.items);
  const items = kept.map((entry) => entry.item);
  const indexMap = new Map(
    kept.map((entry, position) => [entry.index, position]),
  );

  // Only convert when the quote is genuinely written in another currency; a
  // rate hanging around from a client who was since swapped out must not apply.
  const baseCurrency = context.baseCurrency ?? activeBaseCurrency();
  const converting =
    !!draft.convertCurrency && !!draft.currency && draft.currency !== baseCurrency;
  const rate = converting ? context.exchangeRate : null;

  const document = documentTotals({ ...draft, items }, gstPercent);
  const aud = audTotals(document, rate);

  const payload: Record<string, unknown> = {
    quote_no: draft.number,
    quote_type: draft.ndis ? "ndis" : "general",
    client_id: draft.clientId ?? "",
    selected_contact: (draft.recipients ?? []).map((person) => ({
      id: person.id,
      name: person.name,
      email: person.email,
    })),
    invoice_email: draft.quoteEmail ?? "",
    description: draft.description,
    quote_date: draft.issued,
    valid_till: draft.expiry,
    template_id: templateId,

    notes: draft.notes,
    display_note: draft.displayNote ? 1 : 0,
    custom_note: draft.customNote ?? "",

    // In the document's currency, unlike the AUD totals around it: the quotes
    // table has no column for it, and the server only uses it to recompute
    // the totals from the line prices — which are in the document's currency.
    // Sent in AUD, a foreign quote's whole-document discount came off short.
    extra_discount: document.extraDiscount,
    sub_total: aud.subTotal,
    total_discount: aud.discount,
    total_gst: aud.gst,
    total: aud.total,

    currency_code: converting ? draft.currency : baseCurrency,
    is_multicurrency: converting ? 1 : 0,
    exchange_extra_discount: converting ? document.extraDiscount : 0,
    exchange_sub_total: converting ? document.subTotal : 0,
    exchange_total_discount: converting ? document.discount : 0,
    exchange_total_gst: converting ? document.gst : 0,
    exchange_total: converting ? document.total : 0,

    // The draft's own, unfiltered lines: an items deposit stores editor
    // positions, so summing it has to happen before the renumbering.
    ...depositPayload(draft, document, gstPercent, rate, indexMap, baseCurrency),

    item: items.map((item) => itemPayload(item, gstPercent, draft.ndis)),
  };

  if (converting && rate) {
    payload.exchange_rate = money(rate);
    payload.total_after_exchange = document.total;
    payload.is_exchange_rate_edited = draft.rateEdited ? 1 : 0;
  }

  if (gstEnabled) {
    payload.gst_percentage = gstPercent;
  }

  // Same two flags the invoice endpoints take: `save: 0` parks it as a draft,
  // and `send` decides whether the client is emailed (1) or it's finalised
  // quietly for printing (2).
  if (mode === "draft") {
    payload.save = 0;
    payload.send = 0;
  } else {
    payload.save = 1;
    payload.send = mode === "send" ? 1 : 2;
  }

  if (context.quoteId) {
    payload.id = context.quoteId;
  }

  return payload;
}

export type SavedQuote = {
  /** The server's id — the same one whether it was created or updated. */
  id: string;
};

/**
 * Creates or updates one quote. Which endpoint and verb is used follows from
 * whether the context carries an id, so the editor's save path doesn't branch
 * — an update is a PUT to `/v2/quote/:id`, a create a POST to `/v2/quote`,
 * exactly as AddQuote.js does it.
 */
export async function saveQuoteApi(
  draft: QuoteDraft,
  mode: QuoteSubmitMode,
  context: QuoteSubmitContext,
): Promise<SavedQuote> {
  const payload = buildQuotePayload(draft, mode, context);

  /*
   * Attachments ride along only when the quote is being created. The update
   * route takes no files — `AddQuote.js` appends `files[]` in its create
   * branch alone, and the service behind the update endpoint has no parameter
   * for them, so sending them there would be rejected outright.
   */
  const body = context.quoteId
    ? buildEncryptedRequestBody(payload)
    : buildEncryptedRequestBody(payload, context.files);

  const response = context.quoteId
    ? await api.put<QuoteSaveResponse>(
        `${apiRoutes.quote.update}${context.quoteId}`,
        body,
      )
    : await api.post<QuoteSaveResponse>(apiRoutes.quote.add, body);

  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't save that quote.");
  }

  const id = context.quoteId ?? response.data?.data?.quote_id;
  if (id == null) {
    throw new Error("The quote saved but the server returned no id.");
  }

  // Same shape as the invoice save, deliberately: a quote and an invoice are
  // the two halves of the same funnel, and a report comparing them should not
  // have to reconcile two different property names for the same thing.
  const common = {
    amount: Number(payload.total) || 0,
    currency: String(payload.currency_code ?? context.baseCurrency ?? activeBaseCurrency()),
    line_count: Array.isArray(payload.item) ? payload.item.length : 0,
    is_ndis: Boolean(draft.ndis),
  };

  if (!context.quoteId) track(EVENTS.QUOTE_CREATED, common);
  if (mode === "send") track(EVENTS.QUOTE_SENT, common);

  return { id: String(id) };
}

type QuoteSaveResponse = {
  success: boolean;
  message?: string;
  data?: { quote_id?: string | number };
};

/* ------------------------------------------------------------------ *
 * Runtime preview — POST /quote/runtime-preview
 *
 * The real PDF for a quote that hasn't been saved yet — what the editor's
 * "Preview" button asks for, mirroring AddQuote.js's generateDataForPreview /
 * openRuntimePreview. Built from the same payload save sends, so the preview
 * and the saved quote can't disagree about the figures, the deposit or the
 * layout; only what the preview endpoint reads differently is added.
 * ------------------------------------------------------------------ */

/**
 * Everything the preview endpoint is told about the draft. Exported so the
 * shape can be asserted on directly.
 */
export function buildQuoteRuntimePreviewPayload(
  draft: QuoteDraft,
  context: QuoteSubmitContext,
): Record<string, unknown> {
  const base = buildQuotePayload(draft, "draft", context);
  const currency = String(base.currency_code ?? context.baseCurrency ?? activeBaseCurrency());
  const lines = (base.item as Record<string, unknown>[]) ?? [];

  return {
    ...base,
    client_name: draft.clientName,
    // The save endpoints read lines from `item`; the preview reads `items`.
    // Each line is priced in the document's own currency — said outright, or
    // the renderer treats an unlabelled price as AUD and converts it twice.
    // `disc` is the spelling the preview reads a line's discount from.
    items: lines.map((line) => ({
      ...line,
      disc: line.discount,
      discount_percentage:
        line.disc_criteria === "percent" ? line.discount : 0,
      price_currency: currency,
      amount_currency: currency,
      gst_amount_currency: currency,
    })),
    // AddQuote.js's own names for the two dates, alongside the save
    // endpoint's `quote_date` / `valid_till` already in the payload.
    quoteDate: draft.issued,
    quoteExpDate: draft.expiry,
    render_type: "pdf",
    // Which saved quote this previews, so its stored attachments and client
    // context are read — never written.
    ...(context.quoteId ? { quoteId: context.quoteId } : {}),
  };
}

export async function fetchQuoteRuntimePreviewBlob(
  draft: QuoteDraft,
  context: QuoteSubmitContext,
): Promise<Blob> {
  const payload = buildQuoteRuntimePreviewPayload(draft, context);
  const encrypted = buildEncryptedRequestBody(payload) as { data: string };

  /*
   * Picked files ride along for a new quote only, as AddQuote.js sends them,
   * and under `files` — the one field the route's multer accepts. The
   * `files[]` buildEncryptedRequestBody would use is rejected there as an
   * unexpected field.
   */
  const files = context.quoteId ? [] : context.files;
  let body: FormData | { data: string } = encrypted;
  if (files.length > 0) {
    const form = new FormData();
    form.append("data", encrypted.data);
    files.forEach((file) => form.append("files", file));
    body = form;
  }

  const response = await api.post(apiRoutes.quote.runtimePreview, body, {
    responseType: "blob",
  });

  return new Blob([response.data as BlobPart], { type: "application/pdf" });
}
