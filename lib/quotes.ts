/**
 * Quote domain. Quotes and invoices share their line-item shape and maths, so
 * this module reuses lib/invoices rather than restating any of it — the only
 * real differences are the status set, the expiry date and the numbering.
 */
import { formatEventDateTime } from "@/lib/datetime";
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import {
  accentForId,
  fetchInvoiceDefaultDetail,
  isGlobalTemplateOwner,
  NDIS_INDUSTRY_ID,
  templateItemPayload,
  withoutBlanks,
  type ApiDefaultInvoice,
  type ApiDefaultInvoiceDetail,
} from "@/lib/invoice-templates";
import {
  billableEntries,
  depositPayload,
  documentTotals,
} from "@/lib/invoice-submit";
import type { DocumentNumbering } from "@/lib/sales-settings";
import {
  addDays,
  apiDate,
  apiNumber,
  assertApiSuccess,
  daysBetween,
  depositAmount,
  isLineItemFilled,
  invoiceMoney,
  invoiceTotals,
  newLineItem,
  newNdisLineItem,
  normaliseCurrency,
  toIsoDate,
  toNdisClaimType,
  toQtyType,
  type DocumentCurrency,
  type InvoiceAttachment,
  type InvoiceDeposit,
  type InvoiceDraft,
  type InvoiceLineItem,
  type InvoiceRecipient,
} from "@/lib/invoices";

export const QUOTE_STATUSES = [
  "Draft",
  "Sent",
  "Accepted",
  "Declined",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/**
 * What the list shows, which is one state further than what's stored.
 *
 * "Converted" isn't a status a quote is put into — it's what an accepted quote
 * becomes once it has been billed, and the invoice reference is the evidence.
 * Storing it as a fifth status would mean two fields that could disagree about
 * the same fact, so the status set stays as it is and the extra state is
 * derived from the link.
 *
 * "Expired" is derived the same way: a sent quote whose `expiry` has passed has
 * lapsed whether or not anything wrote that down, and the reference frontend
 * resolves it exactly so — a stored `expired` status there falls through to the
 * same date comparison rather than being trusted on its own.
 *
 * "Saved" splits the stored `sent` the same way: "Save" finalises a quote
 * without emailing it, and the server stores that as sent too. Only `sentAt`
 * says whether it actually reached the client.
 */
export const QUOTE_DISPLAY_STATUSES = [
  "Draft",
  "Sent",
  "Saved",
  "Accepted",
  "Converted",
  "Declined",
  "Expired",
] as const;
export type QuoteDisplayStatus = (typeof QUOTE_DISPLAY_STATUSES)[number];

/** The pills filter on what the list shows, so Converted is one of them. */
export const QUOTE_FILTERS = ["All", ...QUOTE_DISPLAY_STATUSES] as const;
export type QuoteFilter = (typeof QUOTE_FILTERS)[number];

/** Same shape as an invoice line, so the totals maths is shared. */
export type QuoteLineItem = InvoiceLineItem;

/** Same deposit terms an invoice offers — a percentage or a flat amount. */
export type QuoteDeposit = InvoiceDeposit;

export type Quote = {
  id: string;
  number: string;
  /** Null once the contact is deleted; `clientName` is then the only record. */
  clientId: string | null;
  clientName: string;
  /** ISO `YYYY-MM-DD`. */
  issued: string;
  expiry: string;
  status: QuoteStatus;
  description: string;
  items: QuoteLineItem[];
  extraDiscount: string;
  notes: string;
  /**
   * What's asked for up front, or null where nothing is.
   *
   * The same terms as an invoice deposit, because that's what it becomes on
   * conversion — quoting 30% up front and then billing something else would be
   * a different agreement.
   */
  deposit?: QuoteDeposit | null;
  /**
   * The server's own view of whether the quote has lapsed.
   *
   * Read in preference to the expiry date, because the two can legitimately
   * disagree — a quote can be closed off early — and the date comparison is
   * only the fallback for a row that doesn't carry the flag.
   */
  expired?: boolean;
  /**
   * Whether this is an NDIS quote rather than an ordinary one.
   *
   * Unlike an invoice — which has no such column and infers it from its lines
   * — a quote records it outright, as `quote_type`. All it changes is which
   * line-item table the editor shows and which PDF layout renders it; the
   * participant's own details belong to the client, not the document.
   */
  ndis: boolean;
  /**
   * When it was emailed to the client, or null if it hasn't been.
   *
   * Separate from `status` for the same reason as an invoice's: "Save" also
   * finalises a quote — the server stores it as sent — without anything going
   * to the client, and that's the case worth surfacing in the list.
   */
  sentAt?: string | null;
  /**
   * When it was finalised with Save (PDF only, nothing emailed), or null.
   * `sentAt` wins wherever both are set — a later send keeps this as history.
   */
  savedAt?: string | null;

  /*
   * The rest of what a quote carries when it's actually raised. Optional
   * because a quote mapped from the list endpoint has none of it — that
   * response returns only totals and status — while the editor always fills
   * them in. Read them with a fallback rather than assuming they're set.
   */

  /** Who the quote is addressed to: one or more contacts at the client. */
  recipients?: InvoiceRecipient[];
  /** The address the quote is sent from and copied to. */
  quoteEmail?: string;
  /** Files that travel with the quote. */
  attachments?: InvoiceAttachment[];
  /**
   * Whether the client's own currency is being used rather than AUD. Off even
   * for a foreign client until the person says to convert, since a client
   * recorded in USD may still be quoted in dollars.
   */
  convertCurrency?: boolean;
  /** Units of `currency` per one AUD, as at the quote date. */
  exchangeRate?: number | null;
  /** True once the published rate has been overridden by hand. */
  rateEdited?: boolean;
  /** Prints the saved quote note under the totals. */
  displayNote?: boolean;
  /** A one-off note for this quote only, printed alongside the saved one. */
  customNote?: string;
  /**
   * Which visual/PDF layout this quote was raised on — the server's own id,
   * needed to ask it for a real PDF.
   */
  templateId?: string;
  /** Absent means AUD, which is the vast majority of them. */
  currency?: DocumentCurrency;
  /**
   * AUD per one unit of `currency`, as at the quote date.
   *
   * Held on the quote rather than looked up live: what the quote is worth to
   * the business is what the rate was when it was written, and a figure that
   * moves every time the list is opened can't be reconciled against anything.
   * TODO: set this from a rates feed when the quote is raised.
   */
  audRate?: number;
  /**
   * The invoice this quote became, once it has become one.
   *
   * Converting currently opens a prefilled invoice editor, and the invoice may
   * never be saved — so nothing writes this yet beyond the seed.
   * TODO: set it when the invoice created from a quote is saved.
   */
  convertedInvoice?: string;
};

export type QuoteDraft = Omit<Quote, "id" | "status">;

/** How long a new quote stays open by default. */
export const DEFAULT_QUOTE_VALIDITY = 7;

/**
 * What the list shows for a quote, resolved in the reference frontend's own
 * order of precedence (`getQuoteStatus` in QuoteList): billed beats everything,
 * then a settled answer, and only a quote still waiting on one can be lapsed.
 */
export function quoteDisplayStatus(
  quote: Quote,
  today: string = todayIso(),
): QuoteDisplayStatus {
  // Billed wins outright — the invoice reference is the strongest fact there
  // is about the quote, whatever status was last written to it.
  if (quote.convertedInvoice) return "Converted";

  // A quote that was answered was answered while it was open; expiry can't
  // overturn that after the fact.
  if (quote.status !== "Sent") return quote.status;

  // The server's own flag first, then the date — a quote can be marked lapsed
  // for reasons the expiry alone doesn't show.
  if (quote.expired) return "Expired";
  if (quote.expiry && quote.expiry < today) return "Expired";

  // Finalised but never emailed. Null rather than merely falsy: the list
  // always fills it in, while a quote built elsewhere leaves it undefined and
  // has nothing to say either way.
  if (quote.sentAt === null) return "Saved";

  return "Sent";
}

/**
 * Semantic only: accepted green, converted indigo, sent amber, declined red,
 * draft neutral. Note the Expiry column stays muted — unlike the invoice Due
 * column, the design keeps quote expiry neutral.
 */
export function quoteStatusVariant(
  status: QuoteDisplayStatus,
): "success" | "warning" | "danger" | "secondary" | "default" | "outline" {
  if (status === "Accepted") return "success";
  // Billed, and so a step past accepted — a second green badge would read as
  // the same state twice.
  if (status === "Converted") return "default";
  if (status === "Sent") return "warning";
  // Finished but still on the desk — set apart from a draft's grey, without
  // the amber that means the client has it.
  if (status === "Saved") return "outline";
  // Lapsed and declined are both dead ends, and the label is what separates
  // them — the reference frontend reds them both too.
  if (status === "Declined" || status === "Expired") return "danger";
  return "secondary";
}

/** The total, in whatever currency the quote is written in. */
export function quoteAmount(quote: Quote): number {
  return invoiceTotals(quote.items, quote.extraDiscount).total;
}

/** The same total in AUD, which is what the books are kept in. */
export function quoteAmountAud(quote: Quote): number {
  return quoteAmount(quote) * (quote.audRate ?? 1);
}

/** Whether the figures need saying twice — once quoted, once converted. */
export function isForeignQuote(quote: Quote): boolean {
  // `currency` is only set on a quote written in a currency other than the business's own.
  return Boolean(quote.currency);
}

/** What the deposit asks for, in the quote's own currency. */
export function quoteDepositAmount(quote: Quote): number | null {
  return depositAmount(quote.deposit ?? null, quoteAmount(quote));
}

/**
 * The four stat cards on the list, over whatever the list itself is showing.
 *
 * Derived here rather than read from `/quote/statistics`, which answers a
 * different question — it returns period-compared counts of total, pending and
 * converted quotes, with no money figure for the Accepted card and nothing for
 * Drafts. Counting the rows keeps all four cards meaningful and keeps them
 * agreeing with the table underneath them.
 */
export function quoteSummary(quotes: Quote[]) {
  return {
    total: quotes.length,
    drafts: quotes.filter((quote) => quote.status === "Draft").length,
    // Display status, so a lapsed or saved-but-unsent quote drops out of
    // "Awaiting response" — the table shows it as Expired or Saved, and the
    // card has to agree.
    sent: quotes.filter((quote) => quoteDisplayStatus(quote) === "Sent").length,
    // Stored status, deliberately: a quote that went on to be billed was still
    // won, and dropping it once it converts would make Won value fall as the
    // work actually completes.
    acceptedValue: quotes
      .filter((quote) => quote.status === "Accepted")
      .reduce((sum, quote) => sum + quoteAmount(quote), 0),
  };
}

export const DEFAULT_QUOTE_NUMBERING: DocumentNumbering = {
  prefix: "QUO",
  next: "1",
};

/**
 * Next number in the `QUO-00000` sequence, with prefix and start read from Sales
 * settings. As with invoices the configured start is a floor, never an override.
 */
export function nextQuoteNumber(
  quotes: Quote[],
  numbering: DocumentNumbering = DEFAULT_QUOTE_NUMBERING,
): string {
  const highest = quotes.reduce((max, quote) => {
    const digits = quote.number.match(/(\d+)\s*$/);
    return digits ? Math.max(max, Number(digits[1])) : max;
  }, 0);
  const configured = Number(numbering.next.replace(/\D/g, "")) || 0;
  const prefix = numbering.prefix.trim() || "QUO";
  return `${prefix}-${Math.max(highest + 1, configured)}`;
}

export function emptyQuoteDraft(number: string, today: string): QuoteDraft {
  return {
    number,
    clientId: null,
    clientName: "",
    issued: today,
    expiry: addDays(today, DEFAULT_QUOTE_VALIDITY),
    description: "",
    items: [newLineItem()],
    extraDiscount: "",
    notes: "",
    ndis: false,
    deposit: null,
    recipients: [],
    quoteEmail: "",
    attachments: [],
    convertCurrency: false,
    exchangeRate: null,
    rateEdited: false,
    displayNote: false,
    customNote: "",
  };
}

/** A blank NDIS quote: the general draft, marked as one, with one support. */
export function emptyNdisQuoteDraft(
  number: string,
  today: string,
): QuoteDraft {
  return {
    ...emptyQuoteDraft(number, today),
    items: [newNdisLineItem()],
    ndis: true,
  };
}

export function draftFromQuote(quote: Quote): QuoteDraft {
  return {
    number: quote.number,
    clientId: quote.clientId,
    clientName: quote.clientName,
    issued: quote.issued,
    expiry: quote.expiry,
    description: quote.description,
    items: quote.items.map((item) => ({ ...item })),
    extraDiscount: quote.extraDiscount,
    notes: quote.notes,
    ndis: quote.ndis,
    deposit: quote.deposit ?? null,
    recipients: quote.recipients ?? [],
    quoteEmail: quote.quoteEmail ?? "",
    attachments: quote.attachments ?? [],
    convertCurrency: quote.convertCurrency ?? false,
    currency: quote.currency,
    exchangeRate: quote.exchangeRate ?? null,
    rateEdited: quote.rateEdited ?? false,
    displayNote: quote.displayNote ?? false,
    customNote: quote.customNote ?? "",
  };
}

/** How many days a quote stays open — expiry less issue date, never negative. */
export function quoteValidityDays(issued: string, expiry: string): number {
  if (!issued || !expiry) return DEFAULT_QUOTE_VALIDITY;
  return Math.max(0, daysBetween(issued, expiry));
}

/**
 * A copy of an existing quote, as AddQuote.js builds one for "Duplicate".
 *
 * The work and the terms cross over — client, recipients, description, lines,
 * discount, notes, currency and the whole deposit (type, value, chosen lines
 * and its due date). What makes it a document of its own does not: it takes
 * the next number and the standing custom note from `/v2/quote-no`, is raised
 * today, stays open for as many days as the original did, and starts as a
 * draft. The id, status, sent/saved stamps, expiry flag and converted invoice
 * aren't on a draft at all, and the original's stored attachments belong to
 * the original — copying the rows would point at files the copy doesn't own.
 * The layout isn't copied either: it's re-resolved from branding on save.
 */
export function duplicateQuoteDraft(
  source: Quote,
  today: string,
  next: { number: string; note: string } | null,
): QuoteDraft {
  const copy = draftFromQuote(source);
  const validity = quoteValidityDays(source.issued, source.expiry);
  return {
    ...copy,
    number: next?.number ?? "",
    customNote: next?.note ?? "",
    issued: today,
    expiry: addDays(today, validity),
    // Fresh line ids — the copies are the new quote's own lines — priced at
    // today's rate rather than the one the original was quoted at.
    items: copy.items.map((item) => ({ ...item, id: newLineItem().id, gstPercent: undefined })),
    deposit: copy.deposit
      ? {
          ...copy.deposit,
          selectedItems: copy.deposit.selectedItems
            ? [...copy.deposit.selectedItems]
            : undefined,
        }
      : null,
    attachments: [],
  };
}

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

export type QuoteEventKind =
  | "created"
  | "sent"
  | "viewed"
  | "accepted"
  | "rejected"
  | "converted"
  | "expired";

/**
 * Where a step has got to.
 *
 * The server's timeline is the whole life of a quote, not only the part that
 * has happened — a quote that has been sent still lists "Accepted" ahead of
 * it. So an event carries its state, and only a completed one has a date.
 */
export type QuoteEventStatus = "completed" | "pending" | "upcoming";

export type QuoteEvent = {
  kind: QuoteEventKind;
  label: string;
  status: QuoteEventStatus;
  /**
   * The API's timestamp as sent — an ISO-8601 instant — or empty for a step
   * that hasn't happened yet. Formatted at render time, in the business's
   * timezone, by `formatQuoteEventTime`.
   */
  at: string;
  /** The one fact worth carrying with the event, where there is one. */
  detail?: string;
};

/** Today, as the ISO date a quote's expiry is judged against. */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * `22 Jul 2026 · 9:12 am` — the date as the editors write it, plus the time,
 * both in `timeZone` (the business's own zone; the browser's when omitted).
 */
export function formatQuoteEventTime(at: string, timeZone?: string): string {
  return formatEventDateTime(at, { timeZone, style: "dot" });
}

/* ------------------------------------------------------------------ *
 * Templates — the picker's second tier
 * ------------------------------------------------------------------ */

export type QuoteTemplateAccent = "indigo" | "orange" | "teal";

export const QUOTE_ACCENT_CLASS: Record<QuoteTemplateAccent, string> = {
  indigo: "bg-primary",
  orange: "bg-orange-500",
  teal: "bg-teal-500",
};

export type QuoteTemplate = {
  id: string;
  name: string;
  summary: string;
  accent: QuoteTemplateAccent;
  description: string;
  /**
   * The collection it belongs to — "General" for the shared set, or the
   * industry that ships it. Shown on the card so an NDIS template is
   * recognisable before it's opened.
   */
  industry: string;
  /** Whether picking it opens the NDIS editor rather than the general one. */
  ndis: boolean;
  /** The server's scope label — "General", or the industry's name. */
  scopeLabel?: string;
  /** A template Sole ships (`user_id = 0`) — shared, never editable or deletable. */
  standard?: boolean;
  /** The row's industry, sent back to the preview endpoint. */
  industryId?: number | null;
  /** "general" or "industry" — which collection the template belongs to. */
  scope?: string;
  items: {
    description: string;
    quantity: string;
    price: string;
    gst: boolean;
  }[];
};

/** Short form for the card's badge; the general set doesn't need one. */
export function quoteTemplateIndustryTag(
  template: QuoteTemplate,
): string | undefined {
  if (template.ndis) return "NDIS";
  return template.industry && template.industry !== "General"
    ? template.industry
    : undefined;
}

/**
 * What the preview endpoint is asked for. sole-webapp drops the industry for a
 * general template on an NDIS-industry row, so a general quote isn't rendered
 * in the NDIS layout.
 */
export function quoteTemplatePreviewTarget(template: QuoteTemplate) {
  return {
    id: template.id,
    industryId:
      !template.ndis && template.industryId === NDIS_INDUSTRY_ID
        ? null
        : (template.industryId ?? null),
    scope: template.scope,
  };
}

/** Which editor a template's card opens — the NDIS one only for an NDIS template. */
export function quoteTemplateHref(template: QuoteTemplate): string {
  const editor = template.ndis ? "ndis" : "manual";
  return `/quotes/new/${editor}?template=${template.id}`;
}

/* ------------------------------------------------------------------ *
 * Converting to an invoice
 * ------------------------------------------------------------------ */

/**
 * The quote's content on an invoice, ready for the editor.
 *
 * Takes the blank draft the editor has already built rather than making its own,
 * so the invoice keeps its own number, issue date, payment terms and the notes
 * Sales settings prefills. What crosses over is the work: the client, the
 * description, the lines and any whole-document discount.
 *
 * The quote's notes deliberately don't cross over — they say things like how long
 * the quote stays open, which is untrue of an invoice.
 */
export function invoiceDraftFromQuote(
  quote: Quote,
  blank: InvoiceDraft,
): InvoiceDraft {
  return {
    ...blank,
    clientId: quote.clientId,
    clientName: quote.clientName,
    description: quote.description,
    extraDiscount: quote.extraDiscount,
    // Fresh line ids: the copies are the invoice's own, and reusing the quote's
    // would give two documents lines that claim the same identity.
    items: quote.items.map((item) => ({ ...item, id: newLineItem().id })),
  };
}

/* ------------------------------------------------------------------ *
 * API — the list, and the two ways of deleting from it
 *
 * Mirrors sole-webapp's components/Quotes/QuoteList.js: the same routes off
 * apiRoutes.quote, through the same shared Axios client, so the apiKey header,
 * the Bearer token, the business_id param and the 401 refresh are all handled
 * exactly once and identically for every module.
 * ------------------------------------------------------------------ */

/** One row of `GET /quote`'s `quote_details`, as the reference frontend reads it. */
type ApiQuote = {
  quote_id: number | string;
  quote_no?: string;
  description?: string;
  /** The AUD total. A foreign quote carries its own figure in `exchange_total`. */
  total?: number | string;
  quote_date?: string;
  valid_till?: string;
  status?: string;
  /** Some rows carry the status here instead — QuoteList reads both. */
  mark_as?: string;
  /** `1` once the quote has been billed. */
  converted?: number | string;
  /** The server's own lapsed flag, checked before the expiry date. */
  expired?: boolean | number;
  invoice_id?: number | string | null;
  invoice?: { invoice_no?: string } | null;
  client_id?: number | string | null;
  client?: { client_id?: number | string; name?: string } | null;
  is_multicurrency?: number | string;
  currency_code?: string;
  /** Units of `currency_code` per one AUD. */
  exchange_rate?: number | string;
  /** The total already converted into `currency_code`. */
  exchange_total?: number | string;
  /** "general" or "ndis" — which kind of quote this is. */
  quote_type?: string;
  /** Datetimes — emailed, and finalised with Save (PDF only). */
  sent_at?: string | null;
  saved_at?: string | null;
  /** The PDF layout the quote was raised on. */
  template_id?: number | string;
  /** "deposit_balance" when a deposit is asked for, else "full". */
  payment_structure?: string | null;
  is_deposit?: number | string | boolean | null;
  /** "percentage" or "fixed" — an items deposit is stored as fixed. */
  deposit_type?: string | null;
  /** "select_items" when the deposit is the value of chosen lines. */
  deposit_selection_type?: string | null;
  deposit_value?: number | string | null;
  /** The fixed deposit in the quote's own currency, for a foreign quote. */
  exchange_deposit_value?: number | string | null;
  /** Line positions an items deposit covers. */
  deposit_selected_items?: (number | string)[] | null;
  /** When the deposit itself falls due — a date or a full datetime. */
  deposit_due_date?: string | null;
};

/**
 * `is_multicurrency` is only ever set when the quote's currency differs from
 * the business's own (the server refuses it otherwise) — so it is the whole
 * test. Comparing with "AUD" would call an AUD quote under a New Zealand
 * business "not foreign" and drop its converted figure.
 */
function isMultiCurrencyQuote(raw: ApiQuote): boolean {
  return Number(raw.is_multicurrency) === 1 && Boolean(raw.currency_code);
}

/**
 * The total in the quote's own currency.
 *
 * `total` is always AUD, so a foreign quote's own figure is either the
 * `exchange_total` the server worked out or, failing that, the AUD total put
 * through the rate — which is exactly what getQuoteDisplayAmount does.
 */
function quoteDisplayTotal(raw: ApiQuote): number {
  const total = apiNumber(raw.total);
  if (!isMultiCurrencyQuote(raw)) return total;

  const exchangeTotal = apiNumber(raw.exchange_total);
  if (exchangeTotal > 0) return round2(exchangeTotal);

  const rate = apiNumber(raw.exchange_rate);
  return round2(rate ? total * rate : total);
}

/** Money, to the cent — the reference frontend's roundAmount. */
function round2(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

/**
 * Which of the four stored statuses the row is in.
 *
 * Deliberately narrower than getQuoteStatus: `converted` and `expired` are both
 * derived for display rather than stored here, so a row in either of those
 * states resolves to the status underneath it and quoteDisplayStatus puts the
 * badge back. A raw `expired` therefore lands on Sent, which is what it is — a
 * quote that went out and was never answered.
 */
function mapQuoteStatus(raw: ApiQuote): QuoteStatus {
  const value = String(raw.status ?? raw.mark_as ?? "sent").toLowerCase();
  if (value === "draft") return "Draft";
  if (value === "accepted") return "Accepted";
  if (value === "rejected" || value === "declined") return "Declined";
  return "Sent";
}

/** The deposit-shaped fields a quote and a quote template both carry. */
export type ApiQuoteDepositFields = Pick<
  ApiQuote,
  | "payment_structure"
  | "is_deposit"
  | "deposit_type"
  | "deposit_selection_type"
  | "deposit_value"
  | "exchange_deposit_value"
  | "deposit_selected_items"
  | "deposit_due_date"
  | "is_multicurrency"
  | "currency_code"
>;

/**
 * The deposit asked for, read the way mapInvoiceDeposit reads an invoice's —
 * the same three shapes, the per-line selection and the due date included.
 *
 * An items deposit is stored as a fixed amount with `deposit_selection_type`
 * recording how it was arrived at (a template may instead store it as
 * `deposit_type: "select_items"`), so the selection is checked first or the
 * chosen lines are lost. A foreign quote's fixed deposit is read from
 * `exchange_deposit_value` — the figure in the quote's own currency — where
 * there is one, as AddQuote.js does; `deposit_value` is the AUD conversion.
 *
 * Reading only `deposit_type`/`deposit_value` used to drop the due date and
 * the selection, so editing and re-saving a quote wiped both.
 */
export function mapQuoteDeposit(
  raw: ApiQuoteDepositFields,
): QuoteDeposit | null {
  const requested =
    Number(raw.is_deposit) === 1 ||
    raw.is_deposit === true ||
    raw.is_deposit === "true" ||
    raw.payment_structure === "deposit_balance";
  if (!requested) return null;

  const mode: QuoteDeposit["mode"] =
    raw.deposit_selection_type === "select_items" ||
    raw.deposit_type === "select_items"
      ? "items"
      : raw.deposit_type === "percentage"
        ? "percent"
        : "amount";

  const exchangeValue = apiNumber(raw.exchange_deposit_value ?? undefined);
  const multi = Number(raw.is_multicurrency) === 1 && !!raw.currency_code;
  const value =
    mode === "amount" && multi && exchangeValue > 0
      ? exchangeValue
      : apiNumber(raw.deposit_value ?? undefined);

  return {
    mode,
    value: String(value),
    selectedItems:
      mode === "items" && Array.isArray(raw.deposit_selected_items)
        ? raw.deposit_selected_items.map(Number).filter(Number.isInteger)
        : undefined,
    dueDate: raw.deposit_due_date ? apiDate(raw.deposit_due_date) : undefined,
  };
}

function mapApiQuote(raw: ApiQuote): Quote {
  const converted = Number(raw.converted) === 1;
  const total = quoteDisplayTotal(raw);
  const currency = normaliseCurrency(raw.currency_code);
  const multi = isMultiCurrencyQuote(raw);

  return {
    id: String(raw.quote_id),
    number: raw.quote_no ?? "",
    clientId:
      raw.client_id != null
        ? String(raw.client_id)
        : raw.client?.client_id != null
          ? String(raw.client.client_id)
          : null,
    clientName: raw.client?.name ?? "",
    issued: apiDate(raw.quote_date),
    expiry: apiDate(raw.valid_till),
    status: mapQuoteStatus(raw),
    description: raw.description ?? "",
    // The list endpoint doesn't send line items, so the total stands in as a
    // single GST-inclusive line — the same stand-in fetchInvoices makes, and
    // for the same reason: quoteAmount() then reports the real total. The
    // detail endpoint supplies the actual lines when a quote is opened.
    items: [
      {
        ...newLineItem(),
        description: raw.description ?? "",
        quantity: "1",
        price: String(total),
        discountPercent: "",
        gst: false,
      },
    ],
    extraDiscount: "",
    notes: "",
    // Recorded outright as `quote_type`, unlike an invoice's inferred flag.
    ndis: String(raw.quote_type ?? "").toLowerCase() === "ndis",
    expired: Boolean(raw.expired),
    // Full datetimes from the API; the list only ever shows the date.
    sentAt: raw.sent_at ? apiDate(raw.sent_at) : null,
    savedAt: raw.saved_at ? apiDate(raw.saved_at) : null,
    templateId: raw.template_id != null ? String(raw.template_id) : undefined,
    deposit: mapQuoteDeposit(raw),
    currency: multi ? (currency ?? undefined) : undefined,
    // `exchange_rate` counts foreign units per AUD; `audRate` is AUD per unit.
    audRate: multi ? reciprocalQuoteRate(raw.exchange_rate) : undefined,
    // Only a billed quote has one, and the invoice number is the evidence the
    // Converted badge is derived from.
    convertedInvoice: converted
      ? (raw.invoice?.invoice_no ??
        (raw.invoice_id != null ? String(raw.invoice_id) : undefined))
      : undefined,
  };
}

/** Guards against a zero or missing rate turning a total into Infinity. */
function reciprocalQuoteRate(
  value: number | string | undefined,
): number | undefined {
  const rate = apiNumber(value);
  return rate > 0 ? 1 / rate : undefined;
}

/**
 * Every quote for the business, newest first.
 *
 * The reference frontend pages this endpoint server-side and refetches on each
 * search, filter and page change. The new list does all three client-side over
 * the whole set, so this asks for one large page instead — the same trade
 * fetchInvoices already makes, and the same `sort_by[quote_id]=desc` ordering
 * QuoteList's getList sends.
 */
export async function fetchQuotes(): Promise<Quote[]> {
  const response = await api.get<{
    success: boolean;
    data?: { quote_details?: ApiQuote[] };
  }>(apiRoutes.quote.list, {
    params: {
      page: 1,
      page_size: 200,
      "sort_by[quote_id]": "desc",
    },
  });

  return (response.data?.data?.quote_details ?? []).map(mapApiQuote);
}

/* ------------------------------------------------------------------ *
 * A filtered, paginated page of the list — GET /quote with the same
 * filter_by/sort_by bracket params the invoice list sends.
 *
 * Separate from `fetchQuotes` above, which the Dashboard and every other
 * screen reading `useQuotesStore` still use for their own full-book figures —
 * narrowing the list to a tab or a search has no business shrinking those.
 * ------------------------------------------------------------------ */

export type QuoteListFilters = {
  /** Omit, or "All", to leave the tab unfiltered. */
  status?: QuoteFilter;
  search?: string;
  /** ISO `YYYY-MM-DD`, inclusive. */
  issuedFrom?: string;
  issuedTo?: string;
  minTotal?: number;
  maxTotal?: number;
  sent?: "sent" | "not_sent";
  type?: "general" | "ndis";
  /** Narrows to these clients' quotes — an area filter resolves to this too. */
  clientIds?: string[];
};

export type QuoteListPage = {
  quotes: Quote[];
  total: number;
};

function clientIdParams(
  clientIds: string[] | undefined,
): Record<string, string> {
  const params: Record<string, string> = {};
  clientIds?.forEach((id, index) => {
    // 1-indexed — the same bracket numbering the invoice list sends.
    params[`filter_by[client_id][${index + 1}]`] = id;
  });
  return params;
}

/**
 * The tab goes as `display_status`, which the server resolves the same way
 * `quoteDisplayStatus` does — Saved, Converted and Expired included. Plain
 * `status` there still means the stored `mark_as`, which can't express them.
 */
function quoteListParams(
  page: number,
  pageSize: number,
  filters: QuoteListFilters,
): Record<string, string | number> {
  const params: Record<string, string | number> = {
    page,
    page_size: pageSize,
    "sort_by[quote_id]": "desc",
    ...clientIdParams(filters.clientIds),
  };

  if (filters.status && filters.status !== "All") {
    params["filter_by[display_status]"] = filters.status.toLowerCase();
  }
  if (filters.search?.trim()) {
    params["filter_by[search]"] = filters.search.trim();
  }
  if (filters.issuedFrom) params["filter_by[start_date]"] = filters.issuedFrom;
  if (filters.issuedTo) params["filter_by[end_date]"] = filters.issuedTo;
  if (filters.minTotal != null) params["filter_by[min_price]"] = filters.minTotal;
  if (filters.maxTotal != null) params["filter_by[max_price]"] = filters.maxTotal;
  if (filters.sent) {
    params["filter_by[sent_status]"] = filters.sent === "sent" ? 1 : 0;
  }
  if (filters.type) params["filter_by[type]"] = filters.type;

  return params;
}

export async function fetchQuotesPage(
  page: number,
  pageSize: number,
  filters: QuoteListFilters = {},
): Promise<QuoteListPage> {
  const response = await api.get<{
    success: boolean;
    data?: { quote_details?: ApiQuote[]; total?: number };
  }>(apiRoutes.quote.list, {
    params: quoteListParams(page, pageSize, filters),
  });

  const data = response.data?.data;
  const raw = data?.quote_details ?? [];
  return {
    quotes: raw.map(mapApiQuote),
    total: data?.total ?? raw.length,
  };
}

export type QuoteStatusCounts = Record<QuoteFilter, number>;

/**
 * Tab counts across the whole account — a server-side aggregate rather than a
 * count of whichever page is loaded. Scoped by the same client ids an area
 * deep-link narrows the rows to.
 */
export async function fetchQuoteStatusCounts(
  clientIds?: string[],
): Promise<QuoteStatusCounts> {
  const response = await api.get<{
    success: boolean;
    data?: Partial<Record<string, number>>;
  }>(apiRoutes.quote.statusCounts, { params: clientIdParams(clientIds) });

  const data = response.data?.data ?? {};
  return QUOTE_FILTERS.reduce((counts, option) => {
    counts[option] = data[option.toLowerCase()] ?? 0;
    return counts;
  }, {} as QuoteStatusCounts);
}

/** One quote, by the row's own delete route. */
export async function deleteQuoteApi(id: string): Promise<void> {
  const response = await api.delete<{ success: boolean; message?: string }>(
    `${apiRoutes.quote.delete}/${id}`,
  );
  assertApiSuccess(response.data, "Couldn't delete that quote.");
}

/**
 * A whole selection at once.
 *
 * QuoteList posts these as FormData `quote_ids[]` entries; the same array sent
 * as JSON reaches the route identically and keeps this consistent with the
 * invoice bulk delete next door.
 */
export async function deleteQuotesApi(ids: string[]): Promise<void> {
  if (ids.length === 1) {
    await deleteQuoteApi(ids[0]);
    return;
  }

  const response = await api.post<{ success: boolean; message?: string }>(
    apiRoutes.quote.bulkDelete,
    { quote_ids: ids.map(Number) },
  );
  assertApiSuccess(response.data, "Couldn't delete those quotes.");
}

/* ------------------------------------------------------------------ *
 * Templates — GET /invoice/default?module=quote, GET /invoice/default/:id
 *
 * Quote templates are the same "default invoices" the invoice gallery browses:
 * sole-webapp's own quote create page calls `/invoice/default` with
 * `module=quote&is_quote=true` and reads `data.invoices` back, then fetches the
 * chosen one's full record from the shared `/invoice/default/:id`. So this
 * reuses lib/invoice-templates' detail fetch outright and only maps the list
 * rows into the shape the quote card already takes.
 * ------------------------------------------------------------------ */

/**
 * Whether a saved quote template is an NDIS one.
 *
 * `type` is the authority. Only a legacy row saved before the column was
 * filled falls back to the industry, and then only to the NDIS industry
 * itself — a general template also carries the business's own industry, so
 * keying on industry alone would open an NDIS provider's general templates in
 * the NDIS editor.
 */
export function isNdisQuoteTemplate(raw: {
  type?: string | null;
  industry_id?: string | number | null;
}): boolean {
  const type = String(raw.type ?? "").trim().toLowerCase();
  if (type) return type === "ndis";
  return Number(raw.industry_id) === NDIS_INDUSTRY_ID;
}

/**
 * Which editor a template *detail* belongs in, or null when the response
 * can't say. The detail endpoint's `type` is always "invoice" (the old API's
 * document type), so only `template_type` answers it. Unknown means "trust
 * the route the gallery chose": guessing here is what bounced NDIS templates
 * into the general editor a second after they opened.
 */
export function templateEditorFromDetail(detail: {
  template_type?: string | null;
}): "ndis" | "general" | null {
  const kind = String(detail.template_type ?? "").trim().toLowerCase();
  if (kind === "ndis") return "ndis";
  if (kind === "general") return "general";
  // No explicit kind (an older row, or an older API): an NDIS business's
  // general templates carry industry 9 too, so industry can't settle it here.
  return null;
}

export function mapApiQuoteTemplate(raw: ApiDefaultInvoice): QuoteTemplate {
  const id = String(raw.id);
  const label = raw.template_scope_label?.trim() || "General";
  const ndis = isNdisQuoteTemplate(raw);

  return {
    id,
    name: raw.category?.trim() || "Untitled template",
    summary: raw.description?.trim() || `${label} template`,
    accent: accentForId(id),
    description: raw.description ?? "",
    industry: ndis ? "NDIS" : label,
    ndis,
    scopeLabel: label,
    standard: isGlobalTemplateOwner(raw.user_id),
    industryId:
      raw.industry_id != null && raw.industry_id !== ""
        ? Number(raw.industry_id)
        : null,
    scope: raw.template_scope || (raw.is_default ? "general" : "industry"),
    // The list endpoint sends a line count, not the lines — enough for the
    // card's decorative skeleton bars. The real lines arrive with the detail
    // once the template is opened.
    items: Array.from({ length: raw.item_count ?? 0 }, () => ({
      description: "",
      quantity: "",
      price: "",
      gst: false,
    })),
  };
}

/**
 * The account's saved quote starting points.
 *
 * `industryId` narrows the set the same way the invoice gallery does; the
 * `module`/`is_quote` pair is what marks the request as the quote side of the
 * shared endpoint.
 */
export async function fetchQuoteTemplates(
  industryId: number | null,
): Promise<QuoteTemplate[]> {
  const response = await api.get<{
    success: boolean;
    data?: { invoices?: ApiDefaultInvoice[] };
  }>(apiRoutes.invoice.default, {
    params: {
      module: "quote",
      is_quote: true,
      page_size: 100,
      ...(industryId != null ? { industry_id: industryId } : {}),
    },
  });

  return (response.data?.data?.invoices ?? []).map(mapApiQuoteTemplate);
}

/** A template's full record, with the deposit terms it was saved with. */
export type ApiQuoteDefaultDetail = ApiDefaultInvoiceDetail &
  ApiQuoteDepositFields & { payment_term?: number | string | null };

/**
 * One quote template in full — the shared `/invoice/default/:id` record, which
 * also carries the deposit terms the template was saved with.
 */
export async function fetchQuoteDefaultDetail(
  id: string,
): Promise<ApiQuoteDefaultDetail> {
  return (await fetchInvoiceDefaultDetail(id)) as ApiQuoteDefaultDetail;
}

/**
 * How many days a quote opened from this template stays open — its
 * `payment_term`, which is what the template was saved with as expiry less
 * issue date, or the standard week when it carries none. The same rule
 * sole-webapp's quote create page applies.
 */
export function quoteDefaultValidity(detail: {
  payment_term?: number | string | null;
}): number {
  const raw = detail.payment_term;
  if (raw === null || raw === undefined || raw === "") {
    return DEFAULT_QUOTE_VALIDITY;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.round(parsed))
    : DEFAULT_QUOTE_VALIDITY;
}

/**
 * Prefills a quote draft from a saved template's real record.
 *
 * Takes the blank draft the editor has already built, so the quote keeps its
 * own number and issue date. The template supplies the work, its deposit
 * terms, and how long the quote stays open: expiry is the issue date plus the
 * template's `payment_term` — the validity it was saved with — exactly as
 * sole-webapp's quote create page derives it.
 */
export function draftFromQuoteDefault(
  detail: ApiQuoteDefaultDetail,
  blank: QuoteDraft,
): QuoteDraft {
  const ndis = blank.ndis;
  const items = (detail.invoice_item ?? []).map((item) => ({
    ...(ndis ? newNdisLineItem() : newLineItem()),
    description: item.description ?? "",
    quantity: item.qty != null ? String(item.qty) : "",
    price: item.price != null ? String(item.price) : "",
    qtyType: toQtyType(item.qty_type),
    // NDIS supports are GST-free; a general template's lines carry whatever
    // rate the template was saved with.
    gst: ndis ? false : apiNumber(item.gst_percentage) > 0,
    ...(ndis
      ? {
          supportItemNumber: item.item_support_no ?? "",
          claimType: toNdisClaimType(item.claim_type),
          // A template's supports are undated — the delivery date belongs to
          // the quote being written, so it opens on the quote's own date.
          date: item.date || blank.issued,
        }
      : {}),
  }));

  return {
    ...blank,
    // A template is a starting point for any client, so none is preselected —
    // the user picks one, and the editor's client check holds the save until
    // they do. (Shared defaults carry client_id 0, which isn't a client at all.)
    clientId: null,
    clientName: "",
    description: detail.description?.trim() || blank.description,
    expiry: addDays(blank.issued, quoteDefaultValidity(detail)),
    items: items.length > 0 ? items : blank.items,
    extraDiscount:
      detail.extra_discount != null
        ? String(detail.extra_discount)
        : blank.extraDiscount,
    notes: detail.notes ?? blank.notes,
    // The template's own lines, in its own order, so an items deposit's
    // positions still point at the same work. Without lines there is nothing
    // for such a selection to cover, so it isn't carried.
    deposit: (() => {
      const deposit = mapQuoteDeposit(detail);
      if (deposit?.mode === "items" && items.length === 0) return null;
      return deposit;
    })(),
  };
}

/* ------------------------------------------------------------------ *
 * Saving the current quote as a template — POST /invoice/default,
 * PUT /invoice/default/:id
 *
 * The same shared "default invoices" store the gallery reads, marked as the
 * quote side with `module: "quote"` — what AddQuote.js's
 * handleQuoteTemplateSave sends. Reuses the invoice-save path's totals, line
 * and deposit builders, so a template's figures are computed exactly the way
 * the quote that becomes one would be.
 * ------------------------------------------------------------------ */

/**
 * The one thing that blocks saving a quote as a template that doesn't also
 * block saving the quote — the same rule as the invoice side's
 * templateSaveIssue: at least one filled line.
 */
export function quoteTemplateSaveIssue(
  draft: Pick<QuoteDraft, "items">,
): string | undefined {
  if (!draft.items.some(isLineItemFilled)) {
    return "Add at least one line item with a description, quantity and price.";
  }
  return undefined;
}

export type SaveQuoteTemplateInput = {
  draft: QuoteDraft;
  /** The name it's saved under — what the gallery card shows and searches. */
  category: string;
  ndis: boolean;
  /**
   * The business's own industry, for general and NDIS templates alike — the
   * gallery lists a business's templates by it, so anything else hides them.
   * `type` is what tells the two kinds apart.
   */
  industryId: number | null;
  gstPercent: number;
  gstEnabled: boolean;
  /** The quote PDF layout — quoteTemplateIdFor(branding, ndis). */
  renderTemplateId: string;
};

export function buildQuoteDefaultPayload(
  input: SaveQuoteTemplateInput,
): Record<string, unknown> {
  const {
    draft,
    category,
    ndis,
    industryId,
    gstPercent,
    gstEnabled,
    renderTemplateId,
  } = input;

  const kept = billableEntries(draft.items);
  const items = kept.map((entry) => entry.item);
  const indexMap = new Map(
    kept.map((entry, position) => [entry.index, position]),
  );
  const totals = documentTotals({ ...draft, items }, gstPercent);

  return {
    category: category.trim(),
    description: draft.description,
    industry_id: industryId ?? (ndis ? NDIS_INDUSTRY_ID : null),
    template_id: renderTemplateId,
    notes: draft.notes,
    // The backend requires both dates; `payment_term` is the validity a
    // quote opened from this template gets.
    invoice_date: draft.issued,
    due_date: draft.expiry,
    payment_term: quoteValidityDays(draft.issued, draft.expiry),
    sub_total: totals.subTotal,
    total_discount: totals.discount,
    extra_discount: totals.extraDiscount,
    total_gst: totals.gst,
    total: totals.total,
    gst_enabled: gstEnabled,
    gst_percentage: gstPercent,
    module: "quote",
    type: ndis ? "ndis" : "general",
    ...(draft.clientId ? { client_id: draft.clientId } : {}),
    // A template isn't priced for anyone yet, so nothing is converted to AUD.
    ...depositPayload(draft, totals, gstPercent, null, indexMap),
    items: items.map((item) => templateItemPayload(item, gstPercent, ndis)),
  };
}

type SaveQuoteDefaultResponse = {
  success: boolean;
  message?: string;
  data?: { invoice?: { id?: string | number } };
};

/** Creates a new quote template from the current draft. */
export async function createQuoteDefaultApi(
  input: SaveQuoteTemplateInput,
): Promise<{ id: string }> {
  const response = await api.post<SaveQuoteDefaultResponse>(
    apiRoutes.invoice.default,
    buildEncryptedRequestBody(withoutBlanks(buildQuoteDefaultPayload(input))),
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't save that template.");
  }
  const id = response.data?.data?.invoice?.id;
  if (id == null) {
    throw new Error("The template saved but the server returned no id.");
  }
  return { id: String(id) };
}

/** Overwrites the quote template this draft was opened from. */
export async function updateQuoteDefaultApi(
  id: string,
  input: SaveQuoteTemplateInput,
): Promise<void> {
  const response = await api.put<{ success: boolean; message?: string }>(
    apiRoutes.invoice.defaultDetail(id),
    buildEncryptedRequestBody(buildQuoteDefaultPayload(input)),
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't update that template.");
  }
}

/* ------------------------------------------------------------------ *
 * Detail, numbering and history
 * ------------------------------------------------------------------ */

type ApiQuoteItem = {
  description?: string;
  qty?: number | string;
  price?: number | string;
  qty_type?: string;
  product_id?: number | string | null;
  disc_criteria?: string;
  discount_percentage?: number | string;
  discount_amount?: number | string;
  gst?: boolean | number | string;
  gst_percentage?: number | string;
  /* NDIS supports only. */
  item_support_no?: string;
  claim_type?: string;
  /** The date the support was delivered. */
  date?: string | null;
};

type ApiQuoteDetail = ApiQuote & {
  quote_item?: ApiQuoteItem[] | null;
  /**
   * The detail endpoint names the id `document_id`, not `id` — reading `id`
   * here is what produced attachments with an id of the string "undefined",
   * which then couldn't be opened or removed. Both are accepted so a change
   * on either side can't silently break it again.
   */
  documents?:
    | {
        document_id?: string | number;
        id?: string | number;
        file_name?: string;
        file_path?: string;
      }[]
    | null;
  /** Written as `selected_contact` but read back as `selected_contacts`. */
  selected_contacts?:
    | { id?: string | number; contact_id?: string | number; name?: string; email?: string }[]
    | null;
  selected_contact?:
    | { id?: string | number; contact_id?: string | number; name?: string; email?: string }[]
    | null;
  notes?: string;
  extra_discount?: number | string;
  invoice_email?: string | null;
  display_note?: boolean | number;
  custom_note?: string | null;
};

/** The reference frontend accepts any of these as "GST applies to this line". */
function apiBool(value: boolean | number | string | undefined): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

/**
 * A flat discount amount is converted to its equivalent percentage of the
 * line's gross — the editor only offers a percentage per line, and AddQuote
 * reads whichever of the two the server sent.
 */
function itemDiscountPercent(raw: ApiQuoteItem): string {
  if (raw.disc_criteria === "percent") {
    return raw.discount_percentage != null
      ? String(raw.discount_percentage)
      : "";
  }
  const gross = apiNumber(raw.qty) * apiNumber(raw.price);
  const amount = apiNumber(raw.discount_amount);
  if (gross <= 0 || amount <= 0) return "";
  return String(Math.round((amount / gross) * 10000) / 100);
}

/**
 * One quote in full, line items included.
 *
 * The list's single stand-in line is replaced by the real ones here, which is
 * why the editor and the details dialog both load this rather than working
 * from the row they were opened from.
 */
export async function fetchQuoteDetail(id: string): Promise<Quote> {
  const response = await api.get<{
    success: boolean;
    message?: string;
    data?: ApiQuoteDetail;
  }>(`${apiRoutes.quote.info}${id}`);

  const raw = response.data?.data;
  if (!raw) throw new Error(response.data?.message || "Quote not found");

  const quote = mapApiQuote(raw);
  // A support line is one the server sent a support number for; the flag on
  // the quote is the authority, but a stray general line inside an NDIS quote
  // still keeps its own shape.
  const ndis = quote.ndis;
  const items = (raw.quote_item ?? []).map((item) => ({
    ...(ndis ? newNdisLineItem() : newLineItem()),
    description: item.description ?? "",
    quantity: item.qty != null ? String(item.qty) : "",
    price: item.price != null ? String(item.price) : "",
    qtyType: toQtyType(item.qty_type),
    productId: item.product_id != null ? String(item.product_id) : undefined,
    discountPercent: itemDiscountPercent(item),
    gst: apiBool(item.gst),
    // The rate the line was quoted at stays with it, so editing a quote never
    // re-prices lines already there (see `InvoiceLineItem.gstPercent`).
    gstPercent: apiBool(item.gst) && Number(item.gst_percentage) > 0 ? Number(item.gst_percentage) : undefined,
    ...(ndis
      ? {
          supportItemNumber: item.item_support_no ?? "",
          claimType: toNdisClaimType(item.claim_type),
          date: item.date ? apiDate(item.date) : "",
        }
      : {}),
  }));

  return {
    ...quote,
    items: items.length > 0 ? items : quote.items,
    notes: raw.notes && raw.notes !== "null" ? raw.notes : "",
    extraDiscount:
      raw.extra_discount != null ? String(raw.extra_discount) : "",
    quoteEmail: raw.invoice_email ?? "",
    displayNote: apiBool(raw.display_note as boolean | number | undefined),
    customNote: raw.custom_note ?? "",
    recipients: (raw.selected_contacts ?? raw.selected_contact ?? []).map(
      (person) => {
        const personId = person.contact_id ?? person.id;
        return {
          id: personId != null ? String(personId) : "",
          name: person.name ?? "",
          email: person.email ?? "",
        };
      },
    ),
    attachments: (raw.documents ?? []).flatMap((document) => {
      const documentId = document.document_id ?? document.id;
      // Without an id there is nothing to remove server-side, so listing it
      // would offer an action that can't work.
      if (documentId == null) return [];
      return [
        {
          id: String(documentId),
          name: document.file_name ?? "Attachment",
          // The record stores no byte count; the row hides the size rather
          // than claiming a stored file is 0 B.
          size: 0,
          url: document.file_path || undefined,
        },
      ];
    }),
    // The rate is stored as foreign-units-per-AUD; the editor's control edits
    // it in that same direction, so it is carried across unconverted.
    convertCurrency: Number(raw.is_multicurrency) === 1,
    exchangeRate: raw.exchange_rate != null ? apiNumber(raw.exchange_rate) : null,
  };
}

export type NextQuoteNumber = {
  number: string;
  /** The saved quote note, which prefills a new document's notes field. */
  note: string;
};

/**
 * The server owns the sequence. It skips numbers already taken rather than
 * simply incrementing, so a locally-derived guess can and does collide —
 * which is why the editor asks rather than computing its own.
 */
export async function fetchNextQuoteNumber(): Promise<NextQuoteNumber> {
  const response = await api.get<{
    success: boolean;
    data?: { no?: string; note?: string };
  }>(apiRoutes.quote.getNo);

  return {
    number: response.data?.data?.no ?? "",
    note: response.data?.data?.note ?? "",
  };
}

/** One entry of the history response's `timeline`, as QuoteHistory.js reads it. */
type ApiQuoteEvent = {
  key?: string;
  title?: string;
  status?: string;
  occurred_at?: string | null;
  /**
   * Whatever that step is worth saying beyond its title — who it went to, the
   * invoice it became, the amount. An object, not a string: the reference
   * renders each of these as its own chip.
   */
  meta?: {
    sent_to?: string[];
    invoice_no?: string;
    amount?: number | string;
  } | null;
};

type ApiQuoteHistory = {
  status?: string;
  currency_code?: string;
  timeline?: ApiQuoteEvent[] | null;
};

/** The chips QuoteHistory.js puts under an event, as one line of detail. */
function eventDetail(raw: ApiQuoteEvent): string | undefined {
  const parts: string[] = [];
  const sentTo = raw.meta?.sent_to;
  if (Array.isArray(sentTo) && sentTo.length > 0) {
    parts.push(sentTo.join(", "));
  }
  if (raw.meta?.invoice_no) parts.push(`Invoice ${raw.meta.invoice_no}`);
  if (raw.meta?.amount !== undefined && raw.meta.amount !== null) {
    parts.push(invoiceMoney(apiNumber(raw.meta.amount)));
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function eventStatus(value: string | undefined): QuoteEventStatus {
  const status = String(value ?? "").toLowerCase();
  if (status === "completed") return "completed";
  if (status === "pending") return "pending";
  return "upcoming";
}

/** The server's vocabulary for what happened, mapped onto the timeline's. */
function mapEventKind(key: string | undefined): QuoteEventKind {
  const value = String(key ?? "").toLowerCase();
  if (value.includes("sent") || value.includes("email")) return "sent";
  if (value.includes("view") || value.includes("open")) return "viewed";
  if (value.includes("accept") || value.includes("approve")) return "accepted";
  if (value.includes("reject") || value.includes("declin")) return "rejected";
  if (value.includes("convert") || value.includes("invoice"))
    return "converted";
  if (value.includes("expire") || value.includes("lapse")) return "expired";
  return "created";
}

/**
 * What has actually happened to this quote, oldest first.
 *
 * Replaces the date-derived timeline this module used to produce: that guessed
 * at a plausible sequence from the quote's dates and status, where this is the
 * server's own record of it.
 */
export async function fetchQuoteHistory(id: string): Promise<QuoteEvent[]> {
  const response = await api.get<{
    success: boolean;
    message?: string;
    data?: ApiQuoteHistory;
  }>(apiRoutes.quote.history(id));

  const data = response.data?.data;
  const rejected = String(data?.status ?? "").toLowerCase() === "rejected";

  return (data?.timeline ?? [])
    // A declined quote was never going to be converted, so the step doesn't
    // belong on its timeline at all — the same filter QuoteHistory.js applies.
    .filter((event) => !(rejected && event.key === "quote_converted"))
    .map((event) => ({
      kind: mapEventKind(event.key),
      label: event.title?.trim() || "Quote updated",
      status: eventStatus(event.status),
      // Kept whole — the instant's zone designator is what lets the dialog
      // show it in the business's timezone. A step not yet reached has none.
      at: event.occurred_at ?? "",
      detail: eventDetail(event),
    }));
}

/**
 * Downloads a selection of quotes as one file.
 *
 * The server names it, so the name is read back off the response rather than
 * invented here — `X-Filename` first, then `content-disposition`, which is the
 * same order QuoteList's `download` tries them in.
 */
export async function downloadQuotesApi(
  ids: string[],
): Promise<{ blob: Blob; filename: string }> {
  const response = await api.post<Blob>(
    apiRoutes.quote.download,
    { data: ids },
    { responseType: "blob" },
  );

  const headerName = response.headers?.["x-filename"] as string | undefined;
  const disposition = response.headers?.["content-disposition"] as
    | string
    | undefined;
  const fromDisposition = disposition?.includes("Filename=")
    ? disposition.split("Filename=")[1].replace(/"/g, "").trim()
    : undefined;

  return {
    blob: response.data,
    filename: headerName || fromDisposition || "quotes.zip",
  };
}

/**
 * Emails one already-saved quote to its client.
 *
 * The same route sole-webapp's quick actions use — sending an existing quote
 * is its own action, distinct from the `send: 1` flag that emails a quote at
 * the moment it's saved.
 */
export async function sendQuoteApi(id: string): Promise<void> {
  const response = await api.post<{ success: boolean; message?: string }>(
    apiRoutes.unibox.sendQuote(id),
  );
  assertApiSuccess(response.data, "Couldn't send that quote.");
}

/* ------------------------------------------------------------------ *
 * PDF — GET /quote/preview/:templateId?render_type=pdf
 *
 * Mirrors sole-webapp's QuoteInfo.js exactly: the server renders the real
 * document — real branding, real client, real line items — and this only ever
 * displays or saves those bytes. Nothing here reconstructs the quote from
 * local data, so the preview can't drift from what is actually on the record.
 * ------------------------------------------------------------------ */

/**
 * The layout QuoteInfo.js falls back to when a row carries no `template_id`
 * of its own. Deliberately not the 13 that `getQuoteTemplateId` uses when
 * *saving* — that one picks the business's configured layout for a new quote,
 * where this renders one that already exists.
 */
export const DEFAULT_QUOTE_PREVIEW_TEMPLATE_ID = "11";

export async function fetchQuotePdfBlob(quote: Quote): Promise<Blob> {
  const response = await api.get(
    apiRoutes.quote.preview(
      quote.templateId || DEFAULT_QUOTE_PREVIEW_TEMPLATE_ID,
    ),
    {
      params: {
        quoteId: quote.id,
        useDemo: "false",
        type: "quote",
        render_type: "pdf",
      },
      responseType: "blob",
    },
  );

  return new Blob([response.data as BlobPart], { type: "application/pdf" });
}

/* ------------------------------------------------------------------ *
 * Converting to an invoice — POST /invoice/convert-quote
 * ------------------------------------------------------------------ */

/**
 * Bills a quote.
 *
 * The server does the conversion: it raises the invoice from the quote's own
 * record and links the two, which is what sets `converted` and `invoice_id`
 * and so what makes the quote read as Converted afterwards. Opening a
 * prefilled invoice editor instead — which is what this used to do — created
 * an unrelated invoice and left the quote looking as though it had never been
 * billed.
 *
 * The due date follows the reference's own fallback chain: the quote's expiry,
 * then its due date, then when it was sent, and today if it has none of them.
 *
 * The body is AES-encrypted. QuoteList doesn't call this route through the raw
 * Axios client the way it calls the quote CRUD routes — it goes through
 * useService's generic `post`, which folds every non-file field into one
 * object and encrypts it into a single `data` string. Sending plain FormData
 * here is what the server answers with "Failed to decrypt payload".
 */
export async function convertQuoteToInvoiceApi(
  quote: Quote,
  /** The business's own currency, which `quoteAmountAud` is in. */
  baseCurrency = "AUD",
): Promise<void> {
  const response = await api.post<{ success: boolean; message?: string }>(
    apiRoutes.invoice.convertToInvoice,
    buildEncryptedRequestBody({
      id: quote.id,
      due_date: quote.expiry || toIsoDate(new Date()),
    }),
  );
  assertApiSuccess(response.data, "Couldn't convert that quote.");

  /*
   * Converting is what winning a quote looks like in this product — there is
   * no separate "mark accepted" action, and the comment above `statusVariant`
   * says as much: "Converted" is not a status a quote is put into, it is what
   * an accepted quote becomes. So this is the honest place for the event, and
   * the AUD figure is used so quotes raised in different currencies can be
   * summed against each other.
   */
  track(EVENTS.QUOTE_ACCEPTED, {
    amount: quoteAmountAud(quote),
    // `amount` is in the books' currency, so that is the currency to report it in.
    currency: baseCurrency,
  });
}

/**
 * Chases a quote that has gone out and not been answered.
 *
 * Encrypted for the same reason converting is — QuoteList sends this through
 * the same generic `post`.
 */
export async function sendQuoteReminderApi(id: string): Promise<void> {
  const response = await api.post<{ success: boolean; message?: string }>(
    apiRoutes.communicationPreference.sendReminder,
    buildEncryptedRequestBody({ id, type: "quote" }),
  );
  assertApiSuccess(response.data, "Couldn't send that reminder.");
}
