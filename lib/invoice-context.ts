/**
 * Everything the invoice editor has to know before it can raise a real
 * invoice: which PDF layout to stamp on it, what GST rate applies, what the
 * next number is, which address the copy goes to, today's exchange rates and
 * which card-payment rails the business has switched on.
 *
 * sole-webapp loads all of this on mount too (`AddInvoiceNew`'s STEP 1) — the
 * only difference is that each lookup lives in its own function here so React
 * Query can cache and retry them independently.
 */
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { normaliseCurrency, type DocumentCurrency } from "@/lib/invoices";

/* ------------------------------------------------------------------ *
 * Branding — which template renders the PDF
 * ------------------------------------------------------------------ */

/**
 * The layout ids the business has chosen. The fallbacks are sole-webapp's own:
 * template 1 for a general invoice, 2 for an NDIS claim, since the NDIS layout
 * is the one that composes the participant/plan-manager header.
 */
export const DEFAULT_INVOICE_TEMPLATE_ID = "1";
export const DEFAULT_NDIS_TEMPLATE_ID = "2";

/**
 * Quotes render on their own layouts, and their fallbacks are their own too —
 * 13 and 25, the numbers sole-webapp's `getQuoteTemplateId` falls back to.
 */
export const DEFAULT_QUOTE_TEMPLATE_ID = "13";
export const DEFAULT_NDIS_QUOTE_TEMPLATE_ID = "25";

export type InvoiceBranding = {
  invoiceTemplateId: string;
  ndisTemplateId: string;
  quoteTemplateId: string;
  ndisQuoteTemplateId: string;
  /** The default note stamped on a new invoice, editable per document. */
  invoiceNote: string;
};

export async function fetchInvoiceBranding(): Promise<InvoiceBranding> {
  const response = await api.get<{
    success: boolean;
    data?: {
      invoice_template?: string | number | null;
      ndis_template?: string | number | null;
      quote_template?: string | number | null;
      ndis_quote_template?: string | number | null;
      invoice_note?: string | null;
    };
  }>(apiRoutes.settings.getBranding);

  const data = response.data?.data;
  return {
    invoiceTemplateId: data?.invoice_template
      ? String(data.invoice_template)
      : DEFAULT_INVOICE_TEMPLATE_ID,
    ndisTemplateId: data?.ndis_template
      ? String(data.ndis_template)
      : DEFAULT_NDIS_TEMPLATE_ID,
    quoteTemplateId: data?.quote_template
      ? String(data.quote_template)
      : DEFAULT_QUOTE_TEMPLATE_ID,
    ndisQuoteTemplateId: data?.ndis_quote_template
      ? String(data.ndis_quote_template)
      : DEFAULT_NDIS_QUOTE_TEMPLATE_ID,
    invoiceNote: data?.invoice_note ?? "",
  };
}

/** Which layout this document renders on, given what kind of document it is. */
export function templateIdFor(
  branding: InvoiceBranding | undefined,
  ndis: boolean,
): string {
  if (!branding) {
    return ndis ? DEFAULT_NDIS_TEMPLATE_ID : DEFAULT_INVOICE_TEMPLATE_ID;
  }
  return ndis ? branding.ndisTemplateId : branding.invoiceTemplateId;
}

/** Which layout a quote renders on. Same branding record, different fields. */
export function quoteTemplateIdFor(
  branding: InvoiceBranding | undefined,
  ndis = false,
): string {
  if (!branding) {
    return ndis ? DEFAULT_NDIS_QUOTE_TEMPLATE_ID : DEFAULT_QUOTE_TEMPLATE_ID;
  }
  return ndis ? branding.ndisQuoteTemplateId : branding.quoteTemplateId;
}

/* ------------------------------------------------------------------ *
 * Tax — the GST rate and whether it's on by default
 * ------------------------------------------------------------------ */

export type InvoiceTaxSettings = {
  /** Percentage points, e.g. 10 — not a fraction. */
  gstPercent: number;
  /** Whether a fresh line item starts with GST switched on. */
  gstEnabled: boolean;
};

export const DEFAULT_TAX_SETTINGS: InvoiceTaxSettings = {
  gstPercent: 10,
  gstEnabled: false,
};

export async function fetchInvoiceTaxSettings(): Promise<InvoiceTaxSettings> {
  const response = await api.get<{
    success: boolean;
    data?: {
      tax_settings?:
        | { tax_percentage?: number | string; is_default?: boolean | number }
        | Array<{
            tax_percentage?: number | string;
            is_default?: boolean | number;
          }>
        | null;
    };
  }>(apiRoutes.tax.getDetails);

  const raw = response.data?.data?.tax_settings;
  // The endpoint answers with either the single default tax or a list of them.
  const settings = Array.isArray(raw) ? raw[0] : raw;
  if (!settings) return DEFAULT_TAX_SETTINGS;

  return {
    gstPercent:
      Number(settings.tax_percentage) || DEFAULT_TAX_SETTINGS.gstPercent,
    gstEnabled: Boolean(settings.is_default),
  };
}

/* ------------------------------------------------------------------ *
 * Numbering — the server's next available number
 * ------------------------------------------------------------------ */

export type NextInvoiceNumber = {
  number: string;
  /** The saved invoice note, which prefills a new document's notes field. */
  note: string;
};

/**
 * The server owns the sequence. It skips numbers already taken rather than
 * simply incrementing, so a locally-derived guess can and does collide —
 * which is why the editor asks rather than computing its own.
 */
export async function fetchNextInvoiceNumber(): Promise<NextInvoiceNumber> {
  const response = await api.get<{
    success: boolean;
    data?: { no?: string; note?: string };
  }>(apiRoutes.invoice.getNo);

  return {
    number: response.data?.data?.no ?? "",
    note: response.data?.data?.note ?? "",
  };
}

/**
 * The address the invoice is sent from and copied to. Editable per invoice —
 * `invoice_email` on the payload — but defaults to the saved one.
 */
export async function fetchInvoiceEmail(): Promise<string> {
  const response = await api.get<{
    success: boolean;
    data?: { invoice_email?: string | null };
  }>(apiRoutes.settings.getSeqNumber);

  return response.data?.data?.invoice_email ?? "";
}

/* ------------------------------------------------------------------ *
 * Exchange rates — AUD base
 * ------------------------------------------------------------------ */

/**
 * Rates are published per currency against AUD, so a rate is "how many units
 * of that currency one dollar buys". An invoice written in the client's
 * currency therefore converts back to AUD by *dividing* — the same direction
 * sole-webapp's `audPayloadTotals` uses.
 */
export type ExchangeRates = Partial<Record<DocumentCurrency, number>>;

/**
 * `base` is the business's own currency (NZD for a New Zealand business): the
 * server answers with that base's table, so a rate is "units of that currency
 * per one unit of base". Left out, the server uses the business's own base.
 */
export async function fetchExchangeRates(base?: string): Promise<ExchangeRates> {
  const response = await api.get<{
    success: boolean;
    data?: Array<{ target_currency?: string; rate?: number | string }>;
  }>(apiRoutes.exchangeRates.getAll, { params: base ? { base } : undefined });

  const rates: ExchangeRates = {};
  for (const row of response.data?.data ?? []) {
    const code = normaliseCurrency(row.target_currency);
    const rate = Number(row.rate);
    if (code && Number.isFinite(rate) && rate > 0) rates[code] = rate;
  }
  return rates;
}

/* ------------------------------------------------------------------ *
 * Card payments — Stripe and Payrix/Worldpay
 * ------------------------------------------------------------------ */

export type InvoicePaymentRails = {
  /** Stripe has finished onboarding, so a Pay link can be put on the invoice. */
  stripeConnected: boolean;
  /** Payrix/Worldpay (SolePay) is set up and approved for this account. */
  payrixConnected: boolean;
  /**
   * The account's own "Automate payments?" answer (`test_payrix`) — what a
   * new invoice starts with when it hasn't been switched either way.
   */
  payrixAutomate: boolean;
  /** "direct_payment" means bank transfer only; anything else routes through Payrix. */
  paymentType: string;
  /** Whether the saved bank details are printed on the invoice. */
  showBankDetails: boolean;
};

export const DEFAULT_PAYMENT_RAILS: InvoicePaymentRails = {
  stripeConnected: false,
  payrixConnected: false,
  payrixAutomate: false,
  paymentType: "direct_payment",
  showBankDetails: true,
};

/**
 * Both rails in one lookup, each failing soft: a business with neither
 * connected is the common case, and a 404 or 500 from one of them must not
 * stop the invoice being raised at all.
 */
export async function fetchInvoicePaymentRails(
  userId: string | null,
): Promise<InvoicePaymentRails> {
  const stripe = api
    .get<{
      success: boolean;
      data?: { account?: { onboarding_complete?: boolean } };
    }>(apiRoutes.stripeConnect.account)
    .then((response) =>
      Boolean(response.data?.data?.account?.onboarding_complete),
    )
    .catch(() => false);

  const payrix = userId
    ? api
        .post<{
          success: boolean;
          data?: {
            account?: {
              payrix_status?: boolean;
              test_payrix?: number | string;
              payment_type?: string;
              show_bank_details?: number | boolean;
            };
          };
        }>(apiRoutes.payrix.getAccountMap, { user_id: userId })
        .then((response) => {
          const account = response.data?.data?.account;
          if (!account?.payrix_status) return null;
          return {
            automate: Number(account.test_payrix) === 1,
            paymentType:
              account.payment_type || DEFAULT_PAYMENT_RAILS.paymentType,
            showBankDetails: Number(account.show_bank_details) === 1,
          };
        })
        .catch(() => null)
    : Promise.resolve(null);

  const [stripeConnected, payrixAccount] = await Promise.all([stripe, payrix]);

  return {
    stripeConnected,
    payrixConnected: payrixAccount != null,
    payrixAutomate: payrixAccount?.automate ?? false,
    paymentType:
      payrixAccount?.paymentType ?? DEFAULT_PAYMENT_RAILS.paymentType,
    showBankDetails:
      payrixAccount?.showBankDetails ?? DEFAULT_PAYMENT_RAILS.showBankDetails,
  };
}

/** SolePay's payment methods, as sole-webapp offers them. */
export const SOLEPAY_PAYMENT_TYPES = [
  {
    value: "credit_card",
    label: "Credit card",
    hint: "Clients pay by card through SolePay.",
  },
  {
    value: "payto",
    label: "PayTo",
    hint: "Clients authorise a real-time payment from their bank account.",
  },
  {
    value: "bank_transfer",
    label: "Bank transfer",
    hint: "Clients pay by transfer, matched automatically through SolePay.",
  },
  {
    value: "direct_payment",
    label: "Direct payment",
    hint: "No SolePay link — clients pay into the bank details on the invoice.",
  },
] as const;

/**
 * SolePay's account-wide settings — the payment method its pay link routes
 * to, and "Automate payments?". Account-wide, not per invoice, exactly as
 * sole-webapp's invoice editor saves them (POST /v1/payrix/updatePayrixToggle).
 */
export async function updateSolePaySettingsApi(
  userId: string,
  settings: { paymentMethod?: string; automate?: boolean },
): Promise<void> {
  const response = await api.post<{ success?: boolean; message?: string }>(
    apiRoutes.payrix.updateInvoiceToggle,
    buildEncryptedRequestBody({
      user_id: userId,
      ...(settings.paymentMethod
        ? { payment_method: settings.paymentMethod }
        : {}),
      ...(settings.automate !== undefined
        ? { status: settings.automate ? 1 : 0 }
        : {}),
    }),
  );
  if (response.data?.success === false) {
    throw new Error(
      response.data.message || "Couldn't update the SolePay setting.",
    );
  }
}
