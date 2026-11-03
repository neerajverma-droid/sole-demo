/**
 * The audit trail for one invoice — GET /invoice/invoices/:id/history.
 *
 * A single timeline serves both a plain invoice and a deposit one: sole-webapp
 * renders them with two different components (StandardInvoiceHistory,
 * DepositInvoiceHistory) that share almost all their markup, so this keeps one
 * shape and one component, switching only on `historyType` for the couple of
 * deposit-only figures. The "send the outstanding balance" action those pages
 * offer isn't ported here — nothing in this codebase can raise that invoice
 * yet (see the deposit card's own note), so it isn't offered as a dead button.
 */
import apiRoutes from "@/config/api-routes";
import api from "@/utils/axiosInstance";
import { apiNumber, normaliseCurrency } from "@/lib/invoices";
import { formatEventDateTime } from "@/lib/datetime";

export type InvoiceHistoryStatus = "completed" | "pending" | "upcoming";

export type InvoiceHistoryPayment = {
  amount: number;
  /** The day it was paid, `YYYY-MM-DD` — a calendar date, never shifted by timezone. */
  date: string | null;
  description: string | null;
  /** How it was paid, where the server says ("Cash", "Bank transfer"…). */
  method: string | null;
};

export type InvoiceHistoryEvent = {
  key: string;
  title: string;
  status: InvoiceHistoryStatus;
  /** The API's ISO-8601 instant, formatted at render time — see `formatTimelineDateTime`. */
  occurredAt: string | null;
  amount: number | null;
  /** Cumulative paid so far, on a "partially paid" step. */
  paidAmount: number | null;
  remainingAmount: number | null;
  paymentCount: number | null;
  payments: InvoiceHistoryPayment[];
  /** Addresses the reminder or the deposit request went to. */
  sentTo: string[];
};

export type InvoiceHistory = {
  invoiceNo: string;
  historyType: "standard" | "deposit";
  currencyCode: string;
  totalAmount: number;
  totalAllocatedAmount: number;
  remainingAmount: number;
  depositPaidAmount: number | null;
  recipientName?: string;
  recipientEmail?: string;
  timeline: InvoiceHistoryEvent[];
};

type ApiInvoiceHistoryEvent = {
  key?: string;
  title?: string;
  status?: string;
  occurred_at?: string | null;
  meta?: {
    amount?: number | string | null;
    paid_amount?: number | string | null;
    remaining_amount?: number | string | null;
    payment_count?: number | string | null;
    payments?: Array<{
      amount?: number | string;
      transaction_date?: string | null;
      payment_date?: string | null;
      description?: string | null;
      source?: string | null;
    }> | null;
    sent_to?: string[] | null;
  } | null;
};

type ApiInvoiceHistory = {
  invoice_no?: string;
  history_type?: string;
  payment_structure?: string;
  currency_code?: string;
  total_amount?: number | string;
  total_allocated_amount?: number | string;
  remaining_amount?: number | string;
  deposit_paid_amount?: number | string | null;
  selected_contacts?: Array<{ name?: string; email?: string }> | null;
  timeline?: ApiInvoiceHistoryEvent[] | null;
};

function mapEvent(raw: ApiInvoiceHistoryEvent, index: number): InvoiceHistoryEvent {
  const status: InvoiceHistoryStatus =
    raw.status === "completed" || raw.status === "pending"
      ? raw.status
      : "upcoming";

  return {
    key: raw.key || `event-${index}`,
    title: raw.title || "",
    status,
    occurredAt: raw.occurred_at || null,
    amount: raw.meta?.amount != null ? apiNumber(raw.meta.amount) : null,
    paidAmount:
      raw.meta?.paid_amount != null ? apiNumber(raw.meta.paid_amount) : null,
    remainingAmount:
      raw.meta?.remaining_amount != null
        ? apiNumber(raw.meta.remaining_amount)
        : null,
    paymentCount:
      raw.meta?.payment_count != null
        ? apiNumber(raw.meta.payment_count)
        : null,
    payments: (raw.meta?.payments ?? []).map((payment) => ({
      amount: apiNumber(payment.amount),
      // Date-only on current API builds; older ones sent it as a midnight
      // datetime, so only its date part is ever meaningful.
      date: (payment.payment_date || payment.transaction_date || "").slice(0, 10) || null,
      description: payment.description ?? null,
      method: paymentMethodLabel(payment.source),
    })),
    sentTo: raw.meta?.sent_to ?? [],
  };
}

function mapInvoiceHistory(raw: ApiInvoiceHistory): InvoiceHistory {
  const contact = raw.selected_contacts?.[0];
  return {
    invoiceNo: raw.invoice_no ?? "",
    historyType:
      raw.history_type === "deposit" ||
      raw.payment_structure === "deposit_balance"
        ? "deposit"
        : "standard",
    currencyCode: normaliseCurrency(raw.currency_code) ?? "AUD",
    totalAmount: apiNumber(raw.total_amount),
    totalAllocatedAmount: apiNumber(raw.total_allocated_amount),
    remainingAmount: apiNumber(raw.remaining_amount),
    depositPaidAmount:
      raw.deposit_paid_amount != null
        ? apiNumber(raw.deposit_paid_amount)
        : null,
    recipientName: contact?.name,
    recipientEmail: contact?.email,
    timeline: (raw.timeline ?? []).map(mapEvent),
  };
}

/**
 * An event's instant as `08 Jul 26, 2:22 pm` — the timeline's own format —
 * in `timeZone` (the business's own zone; the browser's when omitted). A
 * date-only value prints as just the date.
 */
export function formatTimelineDateTime(
  value: string | null,
  timeZone?: string,
): string {
  return formatEventDateTime(value, { timeZone, style: "compact" });
}

/** `transactions.source` as a person would say it, or null when it says nothing useful. */
export function paymentMethodLabel(source: string | null | undefined): string | null {
  const value = String(source ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value === "paid_with_cash" || value.includes("cash")) return "Cash";
  if (value.includes("stripe")) return "Stripe";
  if (value.includes("payrix") || value.includes("worldpay")) return "SolePay";
  if (value === "bank_feed") return "Bank feed";
  if (value === "manual_upload" || value === "upload") return "Bank statement";
  if (value === "manual") return "Manual entry";
  return null;
}

export async function fetchInvoiceHistory(
  invoiceId: string,
): Promise<InvoiceHistory> {
  const response = await api.get<{ success: boolean; data?: ApiInvoiceHistory }>(
    apiRoutes.invoice.history(invoiceId),
  );
  const raw = response.data?.data;
  if (!raw) throw new Error("Couldn't load that invoice's history.");
  return mapInvoiceHistory(raw);
}
