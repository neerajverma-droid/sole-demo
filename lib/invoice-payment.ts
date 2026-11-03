/**
 * The public, anonymous "pay this invoice" flow.
 *
 * sole-ocr emails a signed session token with every invoice
 * (`buildWorldpayPayLink` → `/payments/invoices/{card,bank-transfer,payto,wallet}?p=<token>`).
 * The token — never a business id or bearer token — is the only credential a
 * client has, so every call here goes through `apiGet`/`apiPost`'s default
 * "public" auth: just the apiKey header, nothing that could end a session
 * that was never signed in to begin with.
 *
 * The session endpoint (`/client-billing/pay/session/:token`) is also the
 * only place the amount and invoice id come from — they're verified
 * server-side from the signed token, not read back out of the URL the way
 * spm's own `/worldpay/*` screens do it, so a client can't edit the amount
 * by editing the query string.
 */
import { apiGet, apiPost } from "@/lib/api/client";
import apiRoutes from "@/config/api-routes";

/* ------------------------------------------------------------------ *
 * Session — who's paying, how much, and for what
 * ------------------------------------------------------------------ */

export type InvoicePaymentSession = {
  invoiceId: string;
  userId: number | null;
  amount: number;
  markAs: string | null;
  /** Already settled through SolePay — the form should refuse to submit again. */
  alreadyPaid: boolean;
  /** Worldpay/IntegraPay's public tokenization key for this business — safe
   *  to use client-side, distinct from the server-only REST API credentials. */
  businessKey: string | null;
};

type InvoicePaymentSessionResponse = {
  invoice_id?: string;
  user_id?: number | null;
  amount?: number;
  mark_as?: string | null;
  paid_with_payrix?: number;
  business_id?: string | null;
  business_key?: string | null;
};

/** Thrown by `fetchInvoicePaymentSession` so screens can show one error state. */
export class InvoicePaymentSessionError extends Error {}

export async function fetchInvoicePaymentSession(
  token: string,
): Promise<InvoicePaymentSession> {
  const response = await apiGet<InvoicePaymentSessionResponse>(
    `${apiRoutes.clientBillingPay.session}/${encodeURIComponent(token)}`,
  );

  if (!response.success || !response.data) {
    throw new InvoicePaymentSessionError(
      response.message ?? "This payment link is invalid or has expired.",
    );
  }

  const data = response.data;
  return {
    invoiceId: String(data.invoice_id ?? ""),
    userId: data.user_id ?? null,
    amount: Number(data.amount ?? 0),
    markAs: data.mark_as ?? null,
    alreadyPaid: Number(data.paid_with_payrix ?? 0) === 1,
    businessKey: data.business_key ?? null,
  };
}

/** Best-effort — payment still goes through without it. */
export async function fetchClientIp(): Promise<string> {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = (await response.json()) as { ip?: string };
    return data.ip ?? "";
  } catch {
    return "";
  }
}

export type PaymentOutcome =
  | { success: true }
  | { success: false; message: string };

function outcomeFrom(
  response: { success: boolean; message?: string; data?: unknown },
  fallbackMessage: string,
): PaymentOutcome {
  // The gateway wraps its own result inside `data` — `response.success` is
  // only "the API call itself didn't error", the inner `data.success` (when
  // present) is the actual payment/gateway result and must be checked too.
  const inner = response.data as { success?: boolean; message?: string } | undefined;
  const innerSuccess = inner && typeof inner.success === "boolean" ? inner.success : undefined;

  if (response.success && innerSuccess !== false) {
    return { success: true };
  }

  return {
    success: false,
    message: inner?.message || response.message || fallbackMessage,
  };
}

/* ------------------------------------------------------------------ *
 * Card
 * ------------------------------------------------------------------ */

export async function submitCardPayment(params: {
  invoiceId: string;
  amount: number;
  cardToken: string;
  userIP: string;
}): Promise<PaymentOutcome> {
  const response = await apiPost(apiRoutes.clientBillingPay.token, {
    invoiceId: params.invoiceId,
    type: "CARD",
    cardToken: params.cardToken,
    amount: params.amount.toString(),
    userIP: params.userIP,
  });
  return outcomeFrom(response, "Payment failed.");
}

/** Google/Apple Pay tokens go through the same card endpoint. */
export async function submitWalletPayment(params: {
  invoiceId: string;
  amount: number;
  userIP: string;
  googlePayToken?: string;
  applePayToken?: string;
}): Promise<PaymentOutcome> {
  const response = await apiPost(apiRoutes.clientBillingPay.token, {
    invoiceId: params.invoiceId,
    amount: params.amount.toString(),
    userIP: params.userIP,
    ...(params.googlePayToken ? { googlePayToken: params.googlePayToken } : {}),
    ...(params.applePayToken ? { applePayToken: params.applePayToken } : {}),
  });
  return outcomeFrom(response, "Payment failed.");
}

/* ------------------------------------------------------------------ *
 * Bank transfer / direct debit
 * ------------------------------------------------------------------ */

export async function submitBankAccountPayment(params: {
  invoiceId: string;
  amount: number;
  accountName: string;
  accountBranch: string;
  accountNumber: string;
  userIP: string;
}): Promise<PaymentOutcome> {
  const response = await apiPost(apiRoutes.clientBillingPay.bankAccount, {
    invoiceId: params.invoiceId,
    amount: params.amount.toString(),
    accountName: params.accountName,
    accountBranch: params.accountBranch,
    accountNumber: params.accountNumber,
    accountType: "PERSONAL",
    userIP: params.userIP,
  });
  return outcomeFrom(response, "Couldn't set up the direct debit.");
}

/* ------------------------------------------------------------------ *
 * PayTo
 * ------------------------------------------------------------------ */

export type PayToAgreement = {
  agreementReference: string;
  /** Raw status string from Worldpay, upper-cased — vocabulary isn't
   *  pinned down everywhere, so callers match against a set, not one value. */
  status: string;
};

const PAYTO_ACTIVE_STATUSES = new Set([
  "ACTIVE",
  "AUTHORISED",
  "AUTHORIZED",
  "APPROVED",
  "CONFIRMED",
]);
const PAYTO_FAILED_STATUSES = new Set([
  "REJECTED",
  "CANCELLED",
  "CANCELED",
  "DECLINED",
  "EXPIRED",
  "FAILED",
]);

export function isPayToAgreementActive(status: string): boolean {
  return PAYTO_ACTIVE_STATUSES.has(status.toUpperCase());
}

export function isPayToAgreementFailed(status: string): boolean {
  return PAYTO_FAILED_STATUSES.has(status.toUpperCase());
}

function normalizePayToStatus(data: Record<string, unknown> | undefined): string {
  const raw =
    (data?.agreementStatus as string | undefined) ??
    (data?.AgreementStatus as string | undefined) ??
    (data?.status as string | undefined) ??
    "";
  return String(raw).trim().toUpperCase();
}

export async function createPayToAgreement(params: {
  invoiceId: string;
  amount: number;
  payId: string;
  payIdType: string;
  userIP: string;
}): Promise<PayToAgreement> {
  const response = await apiPost<Record<string, unknown>>(
    apiRoutes.clientBillingPay.payToAgreement,
    {
      invoiceId: params.invoiceId,
      amount: params.amount.toString(),
      payID: params.payId,
      payIDType: params.payIdType,
      paymentAmountType: "FIXE",
      userIP: params.userIP,
    },
  );

  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Couldn't create the PayTo agreement.");
  }

  const data = response.data;
  const reference =
    (data.agreementUniqueReference as string | undefined) ??
    (data.agreementReference as string | undefined) ??
    "";
  if (!reference) {
    throw new Error("Couldn't create the PayTo agreement.");
  }

  return { agreementReference: reference, status: normalizePayToStatus(data) };
}

/** Polled while the client approves the agreement in their banking app. */
export async function fetchPayToAgreementStatus(
  reference: string,
): Promise<string> {
  const response = await apiGet<Record<string, unknown>>(
    `${apiRoutes.clientBillingPay.agreement}/${encodeURIComponent(reference)}`,
  );
  return normalizePayToStatus(response.data);
}

export async function submitPayToPayment(params: {
  invoiceId: string;
  amount: number;
  agreementReference: string;
  userIP: string;
}): Promise<PaymentOutcome> {
  const response = await apiPost(apiRoutes.clientBillingPay.payToPayment, {
    invoiceId: params.invoiceId,
    amount: params.amount.toString(),
    agreementReference: params.agreementReference,
    userIP: params.userIP,
  });
  return outcomeFrom(response, "PayTo payment failed.");
}
