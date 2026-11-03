/**
 * The client-facing quote response link — `/quotes/respond?token=…`, emailed by
 * sole-ocr's `buildQuoteResponseUrl`.
 *
 * Ported from sole-webapp/pages/quotes/respond.js, which stays the source of
 * truth for the money maths and the copy. The person opening this has no Sole
 * account: every call here is `auth: "public"`, carries only the apiKey, and
 * never a business id or bearer token — and never goes through axiosInstance,
 * whose interceptor would bounce them to a sign-in page they can't use.
 *
 * The three routes are rate-limited by IP (20 per 15 minutes), so nothing here
 * retries on its own.
 */

import apiRoutes from "@/config/api-routes";
import { apiGet, apiPost } from "@/lib/api/client";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";

/* ------------------------------------------------------------------ *
 * Shapes — sole-ocr src/services/v2/quote.js buildPublicQuoteSummary   *
 * ------------------------------------------------------------------ */

export type QuoteRespondViewState = "pending" | "accepted" | "rejected" | "expired";

export type PublicQuoteItem = {
  quote_item_id?: number | string;
  quote_id?: number | string;
  description?: string | null;
  price?: number;
  qty?: number;
  qty_type?: string;
  gst?: boolean;
  gst_percentage?: string | number;
  gst_amount?: number;
  total?: number;
  grand_total?: number;
  exchange_price?: number;
  exchange_gst_amount?: number;
  exchange_total?: number;
  exchange_grand_total?: number;
  /** Older / alternative spellings respond.js also reads. */
  [key: string]: unknown;
};

export type PublicQuoteProvider = {
  id?: number | string | null;
  name?: string;
  email?: string;
  business_name?: string;
  business_email?: string;
  phone?: string;
  website?: string;
};

export type PublicQuote = {
  quote_id?: number | string;
  id?: number | string;
  quote_no?: string;
  status?: string;
  view_state?: QuoteRespondViewState | string;
  /** YYYY-MM-DD — a calendar date, never a moment in time. */
  quote_date?: string | null;
  valid_till?: string | null;
  description?: string;
  total?: number;
  sub_total?: number;
  total_gst?: number;
  exchange_rate?: number | null;
  total_after_exchange?: number | null;
  exchange_total?: number | null;
  currency_code?: string;
  /** The currency the quote's own figures are in when it isn't multi-currency: the business's. */
  base_currency?: string;
  /** What the business's country calls its tax — "GST", "VAT". The viewer isn't signed in, so it rides on the quote. */
  tax_label?: string;
  is_multicurrency?: number | boolean;
  is_deposit?: number | boolean;
  deposit_type?: string | null;
  deposit_value?: number | null;
  exchange_deposit_value?: number | null;
  deposit_due_date?: string | null;
  client?: {
    id?: number | string | null;
    name?: string;
    business_name?: string;
    email?: string;
  };
  item_count?: number;
  items?: PublicQuoteItem[];
  response_reason_category?: string;
  response_reason_text?: string;
  accepted_at?: string | null;
  rejected_at?: string | null;
  can_respond?: boolean;
  rejection_reason_options?: string[];
  provider?: PublicQuoteProvider;
  /** respond.js falls back through these before giving up on items. */
  quote_items?: PublicQuoteItem[];
  item_details?: PublicQuoteItem[];
  items_details?: PublicQuoteItem[];
  line_items?: PublicQuoteItem[];
};

export type QuoteRespondItem = {
  id: string | number;
  name: string;
  qty: number;
  rate: number;
  qtyType: string;
  gst: number;
  total: number;
};

/* ------------------------------------------------------------------ *
 * Copy — word for word from respond.js                                 *
 * ------------------------------------------------------------------ */

export const QUOTE_RESPOND_MESSAGES = {
  invalidLink: "This quote response link is invalid.",
  loadFailed: "Failed to load quote response page.",
  refreshFailed: "Failed to refresh quote.",
  acceptFailed: "Failed to accept quote.",
  rejectFailed: "Failed to reject quote.",
  reasonRequired: "Please choose a rejection reason.",
  otherTextRequired: "Please add your reason.",
} as const;

/** The reason that makes the free-text note mandatory, server-side too. */
export const OTHER_REASON = "Other";

/* ------------------------------------------------------------------ *
 * Money                                                                *
 * ------------------------------------------------------------------ */

export function roundMoney(value: unknown): number {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  return Number(amount.toFixed(2));
}

/** Only a foreign-currency quote is converted; a quote in the business's own currency shows as stored. */
export function isMultiCurrencyQuote(quote: PublicQuote | null | undefined): boolean {
  return Boolean(Number(quote?.is_multicurrency) === 1 && quote?.currency_code);
}

/**
 * The currency to print this quote's figures in. A multi-currency quote's own;
 * otherwise the business's — the server sends it, since this page has no
 * signed-in business to ask.
 */
/** The tax column's heading, in the quoting business's own word for it. */
export function quoteTaxLabel(quote: PublicQuote | null | undefined): string {
  return quote?.tax_label?.trim() || "GST";
}

export function getDisplayCurrencyCode(quote: PublicQuote | null | undefined): string {
  if (isMultiCurrencyQuote(quote)) return quote?.currency_code as string;
  return quote?.base_currency || quote?.currency_code || "AUD";
}

/**
 * An AUD amount in the quote's display currency: the server's own converted
 * figure when it sent a positive one, otherwise AUD × exchange_rate, otherwise
 * the AUD figure untouched.
 */
export function getConvertedAmount(
  quote: PublicQuote | null | undefined,
  value: unknown,
  preferredValue?: unknown,
): number {
  if (!isMultiCurrencyQuote(quote)) return roundMoney(value);

  const preferredAmount = Number(preferredValue);
  if (Number.isFinite(preferredAmount) && preferredAmount > 0) {
    return roundMoney(preferredAmount);
  }

  const exchangeRate = Number(quote?.exchange_rate || 0);
  if (!exchangeRate) return roundMoney(value);

  return roundMoney(Number(value || 0) * exchangeRate);
}

export function getQuoteDisplayTotal(quote: PublicQuote | null | undefined): number {
  return getConvertedAmount(
    quote,
    quote?.total,
    quote?.exchange_total ?? quote?.total_after_exchange,
  );
}

export function isDepositQuote(quote: PublicQuote | null | undefined): boolean {
  return Number(quote?.is_deposit) === 1;
}

/** What the deposit box shows as requested, in the display currency. */
export function getDepositRequestedAmount(quote: PublicQuote | null | undefined): number {
  if (!quote || !isDepositQuote(quote)) return 0;

  if (isMultiCurrencyQuote(quote)) {
    const exchangeDepositValue = Number(quote.exchange_deposit_value);
    if (Number.isFinite(exchangeDepositValue) && exchangeDepositValue > 0) {
      return roundMoney(exchangeDepositValue);
    }
  }

  if (quote.deposit_type === "percentage") {
    return roundMoney(
      (getQuoteDisplayTotal(quote) * Number(quote.deposit_value || 0)) / 100,
    );
  }

  return getConvertedAmount(quote, quote.deposit_value);
}

/** `AUD 1,234.50` — the currency code leads, as respond.js shows it. */
export function formatQuoteMoney(currencyCode: string | null | undefined, value: unknown): string {
  const amount = roundMoney(value);
  return `${currencyCode || "AUD"} ${amount.toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/* ------------------------------------------------------------------ *
 * Dates                                                                *
 * ------------------------------------------------------------------ */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * `2026-10-07` → `07 Oct 2026`, read straight off the string.
 *
 * The server sends quote, valid-till and deposit-due dates as bare calendar
 * dates. Handing one to `new Date()` reads it as UTC midnight, which a browser
 * west of Greenwich then shows as the day before — so the parts are split out
 * rather than parsed. Same output as lib/invoices.ts `formatDateLabel`, kept
 * local so this public page doesn't pull the authenticated invoice module in.
 */
export function formatQuoteDate(value: string | null | undefined): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (!match) return "—";
  const [, year, month, day] = match;
  const monthLabel = MONTHS[Number(month) - 1];
  if (!monthLabel || !Number(day)) return "—";
  return `${day} ${monthLabel} ${year}`;
}

/* ------------------------------------------------------------------ *
 * Items                                                                *
 * ------------------------------------------------------------------ */

/** `per_hour` → `Per Hour`; nothing at all reads as `Items`. */
export function formatQtyTypeLabel(value: unknown): string {
  if (!value) return "Items";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** A numeric field, skipping booleans — the summary's `gst` is a has-GST flag, not an amount. */
function firstNumber(...values: unknown[]): number {
  for (const value of values) {
    if (value === undefined || value === null || typeof value === "boolean") continue;
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : 0;
  }
  return 0;
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

export function normalizeQuoteItems(quote: PublicQuote | null | undefined): QuoteRespondItem[] {
  const candidateLists = [
    quote?.items,
    quote?.quote_items,
    quote?.item_details,
    quote?.items_details,
    quote?.line_items,
  ];

  const items = candidateLists.find(Array.isArray) ?? [];

  return items.map((item, index) => {
    const rate = firstNumber(item?.rate, item?.price, item?.unit_price);
    const gst = firstNumber(item?.total_gst, item?.gst_amount, item?.gst);
    const total = firstNumber(item?.total, item?.amount, item?.line_total);

    return {
      id: (item?.id as string | number) || item?.quote_item_id || index,
      name:
        firstText(item?.name, item?.item_name, item?.description, item?.product_name) ||
        `Item ${index + 1}`,
      qty: firstNumber(item?.qty, item?.quantity),
      rate: getConvertedAmount(quote, rate, item?.exchange_price),
      qtyType: firstText(item?.qty_type, item?.quantity_type) || "items",
      gst: getConvertedAmount(quote, gst, item?.exchange_gst_amount),
      total: getConvertedAmount(quote, total, item?.exchange_total),
    };
  });
}

/* ------------------------------------------------------------------ *
 * State                                                                *
 * ------------------------------------------------------------------ */

const VIEW_STATES: QuoteRespondViewState[] = ["pending", "accepted", "rejected", "expired"];

/** Anything unrecognised reads as pending, as respond.js treats it. */
export function resolveViewState(quote: PublicQuote | null | undefined): QuoteRespondViewState {
  const state = quote?.view_state;
  return VIEW_STATES.includes(state as QuoteRespondViewState)
    ? (state as QuoteRespondViewState)
    : "pending";
}

/**
 * The reject form's own checks, before anything is sent — the server repeats
 * both ("A valid rejection reason is required" / "Please add a custom reason").
 */
export function validateRejection(reasonCategory: string, reasonText: string): string | null {
  if (!reasonCategory) return QUOTE_RESPOND_MESSAGES.reasonRequired;
  if (reasonCategory === OTHER_REASON && !reasonText.trim()) {
    return QUOTE_RESPOND_MESSAGES.otherTextRequired;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Calls                                                                *
 * ------------------------------------------------------------------ */

export const quoteRespondQueryKey = (token: string) => ["quote-respond", token] as const;

/**
 * The quote behind a response token. Throws the server's own message — "Invalid
 * or expired quote response link", the rate limiter's "Too many requests…" —
 * so the page can show it as-is.
 */
export async function fetchPublicQuote(
  token: string,
  fallbackMessage: string = QUOTE_RESPOND_MESSAGES.loadFailed,
): Promise<PublicQuote> {
  const result = await apiGet<PublicQuote>(apiRoutes.quote.publicRespond, {
    auth: "public",
    params: { token },
  });
  if (!result.success || !result.data) {
    throw new Error(result.message || fallbackMessage);
  }
  return result.data;
}

export type QuoteRespondResult = {
  quote_id?: number | string;
  quote_no?: string;
  status?: string;
  invoice_id?: number | string | null;
};

export async function acceptPublicQuote(token: string): Promise<QuoteRespondResult> {
  const result = await apiPost<QuoteRespondResult>(
    apiRoutes.quote.publicRespondAccept,
    buildEncryptedRequestBody({ token }),
    { auth: "public" },
  );
  if (!result.success) {
    throw new Error(result.message || QUOTE_RESPOND_MESSAGES.acceptFailed);
  }
  return result.data ?? {};
}

export async function rejectPublicQuote({
  token,
  reasonCategory,
  reasonText,
}: {
  token: string;
  reasonCategory: string;
  reasonText: string;
}): Promise<QuoteRespondResult> {
  const result = await apiPost<QuoteRespondResult>(
    apiRoutes.quote.publicRespondReject,
    buildEncryptedRequestBody({
      token,
      reason_category: reasonCategory,
      reason_text: reasonText.trim(),
    }),
    { auth: "public" },
  );
  if (!result.success) {
    throw new Error(result.message || QUOTE_RESPOND_MESSAGES.rejectFailed);
  }
  return result.data ?? {};
}
