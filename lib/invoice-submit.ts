/**
 * Raising an invoice — POST /invoice/add and POST /invoice/edit.
 *
 * Both endpoints take multipart form data with nested keys (`item[0][price]`),
 * which is why the payload is built as a plain object and flattened at the
 * end rather than appended field by field.
 *
 * Two things about the money are worth knowing before reading further:
 *
 * 1. Line prices are entered and stored in the *document's* currency. The
 *    top-level totals, though, are always in the business's own (base)
 *    currency, because the books are — AUD for an Australian business, NZD for a
 *    New Zealand one. When an invoice is written in a client's currency the
 *    totals are converted back by dividing by the rate (rates are published as
 *    units per one unit of the base), and
 *    the un-converted figures are sent alongside as `exchange_*`.
 * 2. GST is per line and rounded per line, then summed — not applied to the
 *    subtotal. Rounding the sum instead drifts by a cent on long invoices.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { activeBaseCurrency } from "@/lib/country-context";
import {
  DEFAULT_QTY_TYPE,
  REPEAT_FREQUENCY_IDS,
  addDays,
  daysBetween,
  depositAmount,
  invoiceTotals,
  lineGstPercent,
  lineTotals,
  type InvoiceDeposit,
  type InvoiceDraft,
  type InvoiceLineItem,
} from "@/lib/invoices";
import type { InvoicePaymentRails } from "@/lib/invoice-context";

/** Which button was pressed, and so what the server does with the invoice. */
export type InvoiceSubmitMode = "draft" | "send" | "print";

export type InvoiceSubmitContext = {
  /** Percentage points from the business's tax settings. */
  gstPercent: number;
  /** Whether GST applies to this document at all. */
  gstEnabled: boolean;
  /** The PDF layout id — the NDIS one for a claim, the general one otherwise. */
  templateId: string;
  /** Which card rails are live, so the pay-link flags aren't set on air. */
  rails: InvoicePaymentRails;
  /** Units of the document's currency per one unit of the base currency. Null when it's in the base. */
  exchangeRate: number | null;
  /** The business's own currency, which the base totals are in. Absent means AUD. */
  baseCurrency?: string;
  /** Files picked in this session, which still have to be uploaded. */
  files: File[];
  /** Set when editing; absent when creating. */
  invoiceId?: string;
  /** The project a seeded invoice belongs to; the server keeps it on later edits. */
  projectId?: string | null;
};

/* ------------------------------------------------------------------ *
 * Rounding
 * ------------------------------------------------------------------ */

/** Two decimals, the precision every money column on the server holds. */
export function money(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function toNumber(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

/* ------------------------------------------------------------------ *
 * Totals
 * ------------------------------------------------------------------ */

export type SubmitTotals = {
  subTotal: number;
  discount: number;
  extraDiscount: number;
  gst: number;
  total: number;
};

/**
 * The figures as typed, in whatever currency the document is written in.
 *
 * Takes only the two fields the maths needs rather than a whole InvoiceDraft,
 * so a quote — same lines, same totals, different document — can use it too.
 */
export function documentTotals(
  draft: { items: InvoiceLineItem[]; extraDiscount: string },
  gstPercent: number,
): SubmitTotals {
  const totals = invoiceTotals(draft.items, draft.extraDiscount, gstPercent);
  return {
    subTotal: money(totals.subtotal),
    discount: money(totals.discountTotal),
    extraDiscount: money(totals.extra),
    gst: money(totals.gstTotal),
    total: money(totals.total),
  };
}

/** The same figures in the base currency, which is what the accounts are kept in. */
export function audTotals(
  totals: SubmitTotals,
  rate: number | null,
): SubmitTotals {
  if (!rate || rate <= 0) return totals;
  return {
    subTotal: money(totals.subTotal / rate),
    discount: money(totals.discount / rate),
    extraDiscount: money(totals.extraDiscount / rate),
    gst: money(totals.gst / rate),
    total: money(totals.total / rate),
  };
}

/* ------------------------------------------------------------------ *
 * Line items
 * ------------------------------------------------------------------ */

type ApiItemPayload = Record<string, string | number | boolean | null>;

export function itemPayload(
  item: InvoiceLineItem,
  gstPercent: number,
  ndis: boolean,
): ApiItemPayload {
  const line = lineTotals(item, gstPercent);
  const gst = item.gst ? money(line.gst) : 0;

  const payload: ApiItemPayload = {
    description: item.description,
    price: item.price,
    qty: item.quantity,
    product_id: item.productId ?? null,
    discount: item.discountPercent === "" ? 0 : item.discountPercent,
    // "currency" is the stored spelling for a flat-amount discount — the
    // invoice_items table's own enum — not the "amount" this codebase calls
    // it everywhere else.
    disc_criteria: item.discountType === "amount" ? "currency" : "percent",
    amount: money(line.net + gst),
    // The line's own switch decides this, not the business-wide setting: the
    // editor already clears the switch on every line when GST is off for the
    // document, so the two can't disagree, and gating it again here would
    // make `gst_amount` contradict the `total_gst` sent below it.
    gst: !!item.gst,
    gst_amount: gst,
    gst_percentage: item.gst ? lineGstPercent(item, gstPercent) : 0,
    qty_type: item.qtyType ?? DEFAULT_QTY_TYPE,
  };

  if (ndis) {
    payload.item_support_no = item.supportItemNumber ?? "";
    payload.claim_type = item.claimType ?? "";
    payload.date = item.date ?? "";
  }

  return payload;
}

/**
 * Lines that would actually be billed, each keeping the position it held in
 * the editor. A spare blank row at the foot of the table is an editing
 * affordance, not a zero-dollar line item, and sending it puts an empty row
 * on the client's invoice.
 *
 * The original index is kept because a deposit can be pinned to *chosen*
 * lines, by position — drop a row without remapping those positions and the
 * deposit silently starts covering different work.
 */
export function billableEntries(
  items: InvoiceLineItem[],
): { item: InvoiceLineItem; index: number }[] {
  const filled = items
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        item.description.trim() ||
        toNumber(item.quantity) > 0 ||
        toNumber(item.price) > 0,
    );
  return filled.length > 0
    ? filled
    : items.slice(0, 1).map((item, index) => ({ item, index }));
}

/* ------------------------------------------------------------------ *
 * Deposit
 * ------------------------------------------------------------------ */

export function depositPayload(
  draft: { deposit?: InvoiceDeposit | null; items: InvoiceLineItem[] },
  totals: SubmitTotals,
  gstPercent: number,
  rate: number | null,
  /** Editor position → position in the lines actually being sent. */
  indexMap: Map<number, number>,
  /** The business's own currency, which `deposit_value` is in. */
  baseCurrency: string = activeBaseCurrency(),
): Record<string, unknown> {
  const deposit = draft.deposit;

  if (!deposit) {
    return {
      payment_structure: "full",
      is_deposit: 0,
      // The server's columns are NOT NULL with defaults, so a full-payment
      // invoice still has to say what it isn't.
      deposit_type: "fixed",
      deposit_selection_type: null,
      deposit_value: null,
      exchange_deposit_value: null,
      deposit_value_currency: null,
      deposit_selected_items: [],
      deposit_due_date: null,
    };
  }

  const requested =
    depositAmount(deposit, totals.total, draft.items, gstPercent) ?? 0;
  const converted =
    rate && rate > 0 ? money(requested / rate) : money(requested);

  return {
    payment_structure: "deposit_balance",
    is_deposit: 1,
    // A selection of line items is stored as the fixed amount they come to,
    // with the selection type recording how that amount was arrived at.
    deposit_type: deposit.mode === "percent" ? "percentage" : "fixed",
    deposit_selection_type: deposit.mode === "items" ? "select_items" : null,
    deposit_value:
      deposit.mode === "percent" ? money(toNumber(deposit.value)) : converted,
    // The figure in the document's own currency, kept so the client sees the
    // amount they were actually asked for rather than a round-trip of it.
    exchange_deposit_value: rate && rate > 0 ? money(requested) : null,
    deposit_value_currency: baseCurrency,
    // Renumbered against the lines actually being sent, and any line that was
    // dropped falls out of the selection rather than pointing at its neighbour.
    deposit_selected_items:
      deposit.mode === "items"
        ? (deposit.selectedItems ?? [])
            .map((index) => indexMap.get(index))
            .filter((index): index is number => index !== undefined)
        : [],
    deposit_due_date: deposit.dueDate || null,
  };
}

/* ------------------------------------------------------------------ *
 * FormData
 * ------------------------------------------------------------------ */

/**
 * Flattens a nested object into `parent[child][0][leaf]` keys, the shape the
 * endpoints' body parser reconstructs. Null and undefined become empty
 * strings rather than the literal "null" a naive append would produce.
 */
export function objectToFormData(
  data: unknown,
  form: FormData = new FormData(),
  parentKey = "",
): FormData {
  if (data === null || data === undefined) {
    if (parentKey) form.append(parentKey, "");
    return form;
  }

  if (data instanceof File || data instanceof Blob) {
    form.append(parentKey, data);
    return form;
  }

  if (Array.isArray(data)) {
    data.forEach((entry, index) => {
      objectToFormData(entry, form, `${parentKey}[${index}]`);
    });
    return form;
  }

  if (typeof data === "object") {
    for (const [key, value] of Object.entries(
      data as Record<string, unknown>,
    )) {
      objectToFormData(value, form, parentKey ? `${parentKey}[${key}]` : key);
    }
    return form;
  }

  form.append(parentKey, String(data));
  return form;
}

/* ------------------------------------------------------------------ *
 * The payload
 * ------------------------------------------------------------------ */

/**
 * Everything the server is told about an invoice, ready to be flattened.
 * Exported so it can be inspected in isolation — the shape is the contract
 * with two endpoints, and it's worth being able to assert on directly.
 */
/** Stripe is on for this invoice and the account can actually take it. */
export function stripeRailOn(
  draft: Pick<InvoiceDraft, "stripeEnabled">,
  rails: InvoicePaymentRails,
): boolean {
  return rails.stripeConnected && !!draft.stripeEnabled;
}

/**
 * SolePay (Payrix/Worldpay) is on for this invoice and routes a card, PayTo
 * or bank-transfer link — "direct payment" means plain bank details only.
 * An invoice that hasn't chosen follows the account's "Automate payments?".
 */
export function solePayRailOn(
  draft: Pick<InvoiceDraft, "solePayEnabled">,
  rails: InvoicePaymentRails,
): boolean {
  return (
    rails.payrixConnected &&
    (draft.solePayEnabled ?? rails.payrixAutomate) &&
    rails.paymentType !== "direct_payment"
  );
}

export function buildInvoicePayload(
  draft: InvoiceDraft,
  mode: InvoiceSubmitMode,
  context: InvoiceSubmitContext,
): Record<string, unknown> {
  const { gstPercent, gstEnabled, templateId, rails } = context;
  const ndis = draft.ndis;

  const kept = billableEntries(draft.items);
  const items = kept.map((entry) => entry.item);
  const indexMap = new Map(
    kept.map((entry, position) => [entry.index, position]),
  );

  // Only convert when the document is genuinely in another currency; a rate
  // hanging around from a client who was since swapped out must not apply.
  const baseCurrency = context.baseCurrency ?? activeBaseCurrency();
  const converting =
    !!draft.convertCurrency && !!draft.currency && draft.currency !== baseCurrency;
  const rate = converting ? context.exchangeRate : null;

  /*
   * A document billed in a foreign currency with no rate to convert it back
   * to AUD is a document that can't be sent — without this, `audTotals`
   * below would fall through to sending the client's own figures unconverted
   * as the AUD `total`/`sub_total`, while still flagging `is_multicurrency: 1`
   * and omitting `exchange_rate` altogether. That's not "close enough": it's
   * the books recording the wrong currency's numbers as AUD outright. The
   * editor is expected to block Save before this is ever reached — this is
   * the backstop for a caller (a test, the runtime preview) that isn't going
   * through that check.
   */
  if (converting && !(rate && rate > 0)) {
    throw new Error(
      "This invoice is billed in a foreign currency but has no exchange rate. Enter one before saving.",
    );
  }

  const document = documentTotals({ ...draft, items }, gstPercent);
  const aud = audTotals(document, rate);

  const payload: Record<string, unknown> = {
    invoice_no: draft.number,
    client_id: draft.clientId ?? "",
    selected_contact: (draft.recipients ?? []).map((person) => ({
      id: person.id,
      name: person.name,
      email: person.email,
    })),
    invoice_email: draft.invoiceEmail ?? "",
    invoice_date: draft.issued,
    due_date: draft.due,
    description: draft.description,
    // Derived rather than stored: the field the editor shows is the gap
    // between the two dates, so this can't disagree with them.
    payment_term: Math.max(0, daysBetween(draft.issued, draft.due)),
    template_id: templateId,
    project_id: context.projectId ?? null,
    // Sending an already-paid deposit's balance is its own flow; a normal
    // save is never that.
    is_outstanding_balance_flow: 0,

    notes: draft.notes,

    extra_discount: aud.extraDiscount,
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

    /* Payment rails, as sole-webapp sends them. Each flag is gated on the
       rail actually being connected, so a switch left on for an account that
       never finished onboarding can't put a dead pay link on the invoice.
       Where both are on, the backend makes Stripe the pay link. */
    is_stripe_enabled: stripeRailOn(draft, rails) ? 1 : 0,
    is_payrixpay: solePayRailOn(draft, rails) ? 1 : 0,
    is_InstantPay: 1,
    show_bank_details: draft.showBankDetails === false ? 0 : 1,

    due_reminder: draft.overdueReminder ? 1 : 0,

    // The draft's own, unfiltered lines: an items deposit stores editor
    // positions, so summing it has to happen before the renumbering.
    ...depositPayload(draft, document, gstPercent, rate, indexMap, baseCurrency),

    item: items.map((item) => itemPayload(item, gstPercent, ndis)),
  };

  if (converting && rate) {
    payload.exchange_rate = money(rate);
    payload.total_after_exchange = document.total;
    payload.is_exchange_rate_edited = draft.rateEdited ? 1 : 0;
  }

  if (gstEnabled) {
    payload.gst_percentage = gstPercent;
  }

  // Follow-up reminder. Stored as an absolute date, so the days-before value
  // the editor collects is resolved against the due date here.
  const followUpDays = Math.floor(toNumber(draft.followUpDays));
  if (draft.followUpReminder && followUpDays > 0) {
    payload.is_notify_future_work = 1;
    payload.notify_future_work_days_before_due = followUpDays;
    payload.notify_future_work_date = addDays(draft.due, -followUpDays);
    payload.notify_future_work_description = draft.followUpNote ?? "";
    payload.notify_future_work_me_only = draft.followUpNotifyClient ? 0 : 1;
    payload.notify_future_work_both = draft.followUpNotifyClient ? 1 : 0;
  }

  if (draft.repeating) {
    payload.is_recurring_invoice = 1;
    // 1 holds each copy as a draft and alerts you; 2 sends it straight out.
    payload.on_occurance = draft.reviewBeforeSending ? 1 : 2;
    payload.frequency = REPEAT_FREQUENCY_IDS[draft.repeatFrequency];
    payload.tag_line = draft.repeatTagLine ?? "";
    payload.no_of_occurance = draft.repeatOccurrences ?? "";
    if (draft.repeatStart) payload.start_date = draft.repeatStart;
  }

  // Draft and sent are mutually exclusive: `save: 0` parks it, and `send`
  // decides whether the client is emailed (1) or it's finalised quietly for
  // printing (2).
  if (mode === "draft") {
    payload.save = 0;
  } else {
    payload.send = mode === "send" ? 1 : 2;
  }

  if (context.invoiceId) {
    payload.id = context.invoiceId;
  }

  return payload;
}

/* ------------------------------------------------------------------ *
 * The calls
 * ------------------------------------------------------------------ */

export type SavedInvoice = {
  /** The server's id — the same one whether it was created or updated. */
  id: string;
};

/**
 * Creates or updates one invoice. Which endpoint is used follows from whether
 * the context carries an id, so the editor's save path doesn't branch.
 */
export async function saveInvoiceApi(
  draft: InvoiceDraft,
  mode: InvoiceSubmitMode,
  context: InvoiceSubmitContext,
): Promise<SavedInvoice> {
  const payload = buildInvoicePayload(draft, mode, context);

  /*
   * AES-encrypted, through the same helper the business and quote modules use.
   * sole-webapp posts this one as plain multipart, so the endpoints accept
   * either: they decrypt when a `data` field is present and read `req.body`
   * directly when it isn't, which keeps the old frontend working against the
   * same route. Attachments always travel as raw `files[]` beside the
   * ciphertext — bytes can't be encrypted into a JSON string.
   */
  const body = buildEncryptedRequestBody(payload, context.files);

  const url = context.invoiceId
    ? apiRoutes.invoice.update
    : apiRoutes.invoice.add;
  const response = await api.post<{
    success: boolean;
    message?: string;
    data?: { invoice_id?: string | number };
  }>(url, body);

  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't save that invoice.");
  }

  const id = context.invoiceId ?? response.data?.data?.invoice_id;
  if (id == null)
    throw new Error("The invoice saved but the server returned no id.");

  /*
   * After the server confirmed it, and carrying what the invoice is worth.
   *
   * A count on its own does not answer "invoices sent with invoice value",
   * which is the question actually being asked of this — so `amount` is a
   * required property of both events and the dev validator says so when it is
   * missing. `payload.total` is the AUD figure the server was sent, not a
   * second calculation that could drift from it.
   *
   * Created and sent are separate events because they are separate decisions:
   * an invoice saved as a draft and never sent is a different outcome from one
   * that went out, and an edit that sends an existing invoice is a send
   * without a create.
   */
  const amount = Number(payload.total) || 0;
  const common = {
    amount,
    currency: String(payload.currency_code ?? context.baseCurrency ?? activeBaseCurrency()),
    line_count: Array.isArray(payload.item) ? payload.item.length : 0,
    is_ndis: Boolean(draft.ndis),
  };

  if (!context.invoiceId) track(EVENTS.INVOICE_CREATED, common);
  if (mode === "send") track(EVENTS.INVOICE_SENT, common);

  return { id: String(id) };
}

/* ------------------------------------------------------------------ *
 * Runtime preview — POST /template/runtime-preview
 *
 * The real PDF for a draft that hasn't been saved yet — what the editor's
 * "Preview" button asks for. Same payload as /invoice/add, so nothing about
 * building it is duplicated; the only preview-specific things added are
 * which template to render on (already in the payload, via `templateId`) and,
 * when editing, which invoice this is a preview *of* — `invoiceId`, a
 * separate field from the `id` `/invoice/edit` reads, since this endpoint
 * uses it only to read the saved record and its attachments, never to write
 * anything.
 *
 * Sent encrypted, through the same helper — and so the same either-shape
 * tolerance — as the save endpoints: the server decrypts a `data` field when
 * present and reads the body directly when it isn't, which is what lets
 * sole-webapp's own unencrypted preview button keep working against the
 * identical route.
 * ------------------------------------------------------------------ */

export async function fetchInvoiceRuntimePreviewBlob(
  draft: InvoiceDraft,
  context: InvoiceSubmitContext,
): Promise<Blob> {
  const base = buildInvoicePayload(draft, "draft", context);
  const payload = {
    ...base,
    // The save endpoints read the lines from `item`; this one reads them from
    // `items` (or `invoice_item`), as sole-webapp's preview sends them —
    // without it the PDF rendered with no line items at all.
    items: base.item,
    // The preview reads the pay button from these two, not from the saved
    // flags above (sole-webapp's generateDataForPreview sends both).
    isStripe: base.is_stripe_enabled ? 1 : 0,
    isPayrix: base.is_payrixpay === 1,
    render_type: "pdf",
    ...(context.invoiceId ? { invoiceId: context.invoiceId } : {}),
  };

  const body = buildEncryptedRequestBody(payload, context.files);

  const response = await api.post(apiRoutes.templates.runtimePreview, body, {
    responseType: "blob",
  });

  return new Blob([response.data as BlobPart], { type: "application/pdf" });
}
