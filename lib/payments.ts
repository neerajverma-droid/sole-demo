/**
 * Payments: the gateways that take money for you, and what came through them.
 *
 * Two halves of one question. A gateway is a connection you either have or
 * don't; a payment is what that connection produced, less what it cost. The
 * fee is the reason both live on one screen — a gateway's real price isn't its
 * advertised rate, it's the gap between the amount and the net on every row.
 */

import { CreditCard, Nfc, Wallet, type LucideIcon } from "lucide-react";
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { activeAmountDigits, activeBaseCurrency, activeCurrencySymbol } from "@/lib/country-context";
import { currencySymbol } from "@/lib/invoices";

/**
 * Tab identifiers for the Payments screen.
 *
 * "Gateways" is always present. The two transaction tabs appear conditionally
 * based on which providers the account has connected — same logic as
 * sole-webapp's Payments/index.js tab array.
 */
export const PAYMENT_TABS = [
  "Gateways",
  "SolePay Payments",
  "Stripe Payments",
  "NextTap Payments",
] as const;
export type PaymentTab = (typeof PAYMENT_TABS)[number];

/**
 * Pagination envelope returned by both Payrix and Stripe transaction APIs.
 *
 * Matches the shape sole-webapp's `worldpayPagination` / `stripePagination`
 * state uses, so the same server response can be slotted straight in.
 */
export type GatewayPagination = {
  current_page: number;
  total_pages: number;
  per_page: number;
  total: number;
};

export const EMPTY_GATEWAY_PAGINATION: GatewayPagination = {
  current_page: 1,
  total_pages: 1,
  per_page: 15,
  total: 0,
};

/**
 * Whether a provider can be connected at all.
 *
 * "Coming soon" is a state of the product rather than of the account, so it
 * lives on the gateway rather than on the connection — a provider nobody can
 * connect yet shouldn't offer a button that fails.
 */
export type GatewayAvailability = "available" | "coming-soon";

/**
 * Where a connection actually stands.
 *
 * A boolean could only say connected or not, which left three different
 * situations sharing one "not connected": never started, part-way through the
 * provider's onboarding, and finished but waiting on their checks. Those want
 * three different buttons, so they're three different states.
 *
 * `coming-soon` sits in the same union rather than beside it because it's the
 * one case with no button at all, and a card deciding what to render wants to
 * ask one question.
 */
export type GatewayStatus =
  "not-started" | "onboarding" | "pending" | "connected" | "coming-soon";

export type Gateway = {
  id: string;
  name: string;
  /** One line, on the card under the name. */
  summary: string;
  features: string[];
  /** As the provider quotes it, for the card's fine print. */
  pricing: string;
  /**
   * The provider's own dashboard — disputes, payouts, the things Sole doesn't
   * own. Absent for a provider that's managed here, which is not the same as
   * a provider whose dashboard we haven't linked yet.
   */
  dashboardUrl?: string;
  availability: GatewayAvailability;
  /**
   * Where the connection stands before the session has changed anything.
   *
   * The live connected/disconnected state is the `connectedGatewaysAtom`, which
   * wins where the two disagree — this is the baseline the card falls back to,
   * and the only place the onboarding and pending states are expressed.
   */
  status: GatewayStatus;
  /**
   * The provider's own mark, from `public/`. Rendered through `next/image` the
   * way `SoleLogo` is, and takes the place of the icon tile where it's set.
   *
   * For a first-party or well-known brand whose logo *is* the recognition —
   * anything else keeps the tinted lucide tile, which is the platform's own
   * treatment and doesn't need a file per provider.
   */
  logoSrc?: string;
  /**
   * Where the primary action goes, for a gateway whose next step isn't in this
   * app. An absolute URL opens in a new tab; a path is an internal route.
   */
  actionHref?: string;
  icon: LucideIcon;
};

/**
 * Stripe's hosted onboarding for this account.
 *
 * Theirs, not ours: the remaining steps are identity and payout details that
 * Stripe has to collect itself, so the button leaves the app rather than
 * pretending to a form it can't fill in.
 */
export const STRIPE_ONBOARDING_URL =
  "https://connect.stripe.com/setup/s/acct_1UDkPYH7QHGSpaE0/q1yISSIYthfK";

/** Sole pay's own mark. See `Gateway.logoSrc`. */
export const SOLE_PAY_LOGO_SRC = "/sole-pay-logo.svg";

/** NextTap's onboarding, which is a page in this app rather than the provider's own. */
export const NEXTTAP_ONBOARDING_HREF = "/payments/nexttap/onboarding";

/** Where Sole pay's two ways in go. Both are pages in this app. */
export const SOLE_PAY_ONBOARDING_HREF = "/payments/solepay/onboarding";
export const SOLE_PAY_LINK_HREF = "/payments/solepay/link";

export const GATEWAYS: Gateway[] = [
  {
    id: "stripe",
    name: "Stripe",
    summary: "Card payments on your invoices, paid out every second day.",
    features: [
      "Pay-now button on every invoice",
      "Visa, Mastercard, Amex and Apple Pay",
      "Payouts to your bank in two days",
    ],
    pricing: "1.7% + 30c per domestic card transaction",
    dashboardUrl: "https://dashboard.stripe.com/payments",
    availability: "available",
    // Part-way through Stripe's own onboarding, which is why the card's action
    // continues it rather than offering to start.
    status: "onboarding",
    actionHref: STRIPE_ONBOARDING_URL,
    icon: CreditCard,
  },
  {
    id: "sole-pay",
    name: "SolePay",
    summary:
      "Accept card, PayTo, bank transfer, and direct payments from invoices.",
    features: [
      "Cards, Direct Debit, and PayTo",
      "Send one-off or recurring invoices",
      "Real-time payment insights and reporting",
      "PCI DSS Level 1 compliant",
    ],
    pricing: "0.9% per transaction, capped at $3",
    // Sole pay is ours: this screen is its dashboard, so there's nowhere else
    // to send anyone.
    availability: "available",
    status: "not-started",
    logoSrc: SOLE_PAY_LOGO_SRC,
    icon: Wallet,
  },
  {
    id: "nexttap",
    name: "NextTap",
    summary: "Take contactless payments on your phone, no terminal.",
    features: [
      "Tap to pay on Android and iPhone",
      "Receipts by SMS",
      "Works offline and syncs later",
    ],
    pricing: "1.5% per tap",
    availability: "available",
    /*
     * The baseline before the service has answered. The real state comes from
     * `fetchNexxtapStatus()` on the Payments screen and wins over this — see
     * `nexxtapCardState`.
     */
    status: "not-started",
    icon: Nfc,
  },
];

/* ------------------------------------------------------------------ *
 * Payments
 * ------------------------------------------------------------------ */

export const PAYMENT_STATUSES = [
  "Settled",
  "Processing",
  "Refunded",
  "Failed",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type PaymentType = "Card" | "Bank transfer" | "Tap to pay" | "credit" | "debit" | string;

export type Payment = {
  id: string;
  date: string;
  category: string;
  categoryType?: string;
  invoiceNo: string;
  /** Backwards compatibility alias for invoiceNo */
  invoiceNumber?: string | null;
  description: string;
  type: PaymentType;
  /** What the customer paid. */
  amount: number;
  /** Processing fee deducted by provider */
  processingFee: number;
  /** Backwards compatibility alias for processingFee */
  fee: number;
  /** Net amount received / settled */
  netAmount: number;
  status: PaymentStatus | string;
  currency?: string;
  feeCurrency?: string;
  settlementAmount?: number;
  settlementCurrency?: string;
  transactionId?: string;
  originalAmount?: number;
  gatewayId?: string;
};

/**
 * Format a date for display matching sole-webapp's `DD Month, YYYY` (e.g. "31 August, 2026").
 */
export function formatPaymentDate(dateStr?: string | number | null): string {
  if (!dateStr) return "—";
  try {
    if (typeof dateStr === "number") {
      const ms = dateStr > 1e11 ? dateStr : dateStr * 1000;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) {
        const ye = new Intl.DateTimeFormat("en", { year: "numeric" }).format(d);
        const mo = new Intl.DateTimeFormat("en", { month: "long" }).format(d);
        const da = new Intl.DateTimeFormat("en", { day: "2-digit" }).format(d);
        return `${da} ${mo}, ${ye}`;
      }
    }

    const str = String(dateStr).trim();
    if (/^\d{1,2}\s+[A-Za-z]+,\s+\d{4}$/.test(str)) {
      return str;
    }

    const datePart = str.split(" ")[0] || str;
    const parts = datePart.split("-").map(Number);
    if (parts.length === 3 && parts[0] > 1000) {
      const [year, month, day] = parts;
      const d = new Date(year, month - 1, day);
      if (!isNaN(d.getTime())) {
        const da = String(day).padStart(2, "0");
        const mo = new Intl.DateTimeFormat("en", { month: "long" }).format(d);
        return `${da} ${mo}, ${year}`;
      }
    }

    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      const ye = new Intl.DateTimeFormat("en", { year: "numeric" }).format(parsed);
      const mo = new Intl.DateTimeFormat("en", { month: "long" }).format(parsed);
      const da = new Intl.DateTimeFormat("en", { day: "2-digit" }).format(parsed);
      return `${da} ${mo}, ${ye}`;
    }

    return str;
  } catch {
    return String(dateStr);
  }
}

/**
 * Format money displaying $0.00 when 0 instead of - or —, matching sole-webapp.
 * In the payment's own currency: the business's symbol for its own ("$", "R"),
 * a labelled one ("US$", "A$") for anything else.
 */
export function formatPaymentMoney(
  amount?: number | null,
  currency?: string | null,
): string {
  const val = Number(amount || 0);
  const formatted = activeAmountDigits(Math.abs(val), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency ? currencySymbol(currency.toUpperCase()) : activeCurrencySymbol()}${formatted}`;
}

/** What lands in the bank: netAmount if present, else amount less fee. */
export function netAmount(payment: Payment): number {
  if (typeof payment.netAmount === "number" && !isNaN(payment.netAmount)) {
    return payment.netAmount;
  }
  return payment.amount - (payment.processingFee ?? payment.fee ?? 0);
}

/**
 * A refund reverses the money and a failure never took it, so neither belongs
 * in a total that answers "what have I taken". Processing does — it's taken,
 * just not settled.
 */
function counts(payment: Payment): boolean {
  return payment.status === "Settled" || payment.status === "Processing";
}

export type PaymentStats = {
  total: number;
  fees: number;
  count: number;
  net: number;
};

export function paymentStats(payments: Payment[]): PaymentStats {
  const counted = payments.filter(counts);
  const total = counted.reduce((sum, payment) => sum + payment.amount, 0);
  const fees = counted.reduce(
    (sum, payment) => sum + (payment.processingFee ?? payment.fee ?? 0),
    0,
  );
  const net = counted.reduce((sum, payment) => sum + netAmount(payment), 0);
  return { total, fees, count: counted.length, net };
}

/** Fees as a share of what came in, for the fee card's supporting line. */
export function feeRate(stats: PaymentStats): string {
  if (stats.total <= 0) return "No payments yet";
  return `${((stats.fees / stats.total) * 100).toFixed(1)}% of takings`;
}

/**
 * The connected providers that keep a dashboard of their own.
 *
 * Connection order, so the first one is the one they set up first — and the
 * one a single button names. A provider with nothing to link to is left out
 * rather than given a dead button.
 */
export function manageableGateways(connectedIds: string[]): Gateway[] {
  return connectedIds.flatMap((id) => {
    const gateway = GATEWAYS.find((candidate) => candidate.id === id);
    return gateway?.dashboardUrl ? [gateway] : [];
  });
}

/**
 * Whether the screen has its payments yet.
 *
 * Payments come from a provider's API rather than from the browser, so there's
 * a moment where the screen doesn't know and a case where the provider didn't
 * answer. Both are states the UI has to be built for, so they're modelled
 * rather than papered over with an empty list.
 */
export type LoadStatus = "idle" | "loading" | "ready" | "error";

/** What a mocked round trip returns, until the provider API is wired up. */
export const SEED_PAYMENTS: Payment[] = [
  {
    id: "pay-1",
    date: "2026-08-19",
    category: "Payment Received",
    categoryType: "income",
    invoiceNo: "INV-0023",
    invoiceNumber: "INV-0023",
    description: "Williams Health Services - Amount: USD 1650.00",
    type: "credit",
    amount: 1650,
    processingFee: 28.35,
    fee: 28.35,
    netAmount: 1621.65,
    status: "Settled",
    currency: "USD",
    gatewayId: "stripe",
  },
  {
    id: "pay-2",
    date: "2026-08-18",
    category: "Payment Received",
    categoryType: "income",
    invoiceNo: "INV-0022",
    invoiceNumber: "INV-0022",
    description: "Johnson Logistics Group - Amount: AUD 680.00",
    type: "credit",
    amount: 680,
    processingFee: 3,
    fee: 3,
    netAmount: 680,
    status: "Settled",
    currency: "AUD",
    gatewayId: "sole-pay",
  },
  {
    id: "pay-3",
    date: "2026-08-17",
    category: "Payment Processing",
    categoryType: "income",
    invoiceNo: "INV-0024",
    invoiceNumber: "INV-0024",
    description: "Nomad Studio - Amount: USD 472.50",
    type: "credit",
    amount: 472.5,
    processingFee: 8.33,
    fee: 8.33,
    netAmount: 464.17,
    status: "Processing",
    currency: "USD",
    gatewayId: "stripe",
  },
  {
    id: "pay-4",
    date: "2026-08-14",
    category: "Payment Received",
    categoryType: "income",
    invoiceNo: "INV-0021",
    invoiceNumber: "INV-0021",
    description: "Turner Consulting - Amount: AUD 2200.00",
    type: "credit",
    amount: 2200,
    processingFee: 3,
    fee: 3,
    netAmount: 2200,
    status: "Settled",
    currency: "AUD",
    gatewayId: "sole-pay",
  },
  {
    id: "pay-5",
    date: "2026-08-11",
    category: "Payment Received",
    categoryType: "income",
    invoiceNo: "INV-0019",
    invoiceNumber: "INV-0019",
    description: "Refunded - Amount: USD 240.00",
    type: "credit",
    amount: 240,
    processingFee: 0,
    fee: 0,
    netAmount: 240,
    status: "Refunded",
    currency: "USD",
    gatewayId: "stripe",
  },
  {
    id: "pay-6",
    date: "2026-08-08",
    category: "Payment Processing",
    categoryType: "income",
    invoiceNo: "N/A",
    invoiceNumber: null,
    description: "Card declined - Amount: USD 180.00",
    type: "credit",
    amount: 180,
    processingFee: 0,
    fee: 0,
    netAmount: 180,
    status: "Failed",
    currency: "USD",
    gatewayId: "stripe",
  },
];

export function paymentStatusVariant(
  status: PaymentStatus,
): "success" | "warning" | "secondary" | "danger" {
  switch (status) {
    case "Settled":
      return "success";
    case "Processing":
      return "warning";
    case "Refunded":
      return "secondary";
    case "Failed":
      return "danger";
  }
}

/* ------------------------------------------------------------------ *
 * API — raw response shapes
 * ------------------------------------------------------------------ */

/** Raw transaction row from `/v1/payrix/reports` */
type PayrixApiTransaction = {
  id: string | number;
  created_at?: string | null;
  status_description?: string | null;
  invoice_no?: string | null;
  type_description?: string | null;
  amount?: string | number | null;
  amount_settled?: string | number | null;
  fees_deducted?: string | number | null;
  transaction_id?: string | null;
  currency?: string | null;
  category?: string | null;
  categoryType?: string | null;
  type?: string | null;
  description?: string | null;
  net_amount?: string | number | null;
};

/** Raw transaction row from `/stripe-connect/transactions` */
type StripeApiTransaction = {
  id: string | number;
  /** ISO date string, date string or UNIX timestamp */
  date?: string | number | null;
  created?: string | number | null;
  created_at?: string | number | null;
  category?: string | null;
  categoryType?: string | null;
  invoice_no?: string | null;
  invoiceNo?: string | null;
  description?: string | null;
  type?: string | null;
  type_description?: string | null;
  amount?: string | number | null;
  fee?: string | number | null;
  processing_fee?: string | number | null;
  fees_deducted?: string | number | null;
  net_amount?: string | number | null;
  status?: string | null;
  currency?: string | null;
  /** Normalised status from Stripe — 'succeeded' means Settled */
  payment_status?: string | null;
};

/** Raw capture row from `/payments/nexxtap/transactions` */
type NexxtapApiTransaction = {
  id: string | number;
  date?: string | null;
  invoice_no?: string | null;
  module_id?: string | null;
  transaction_id?: string | null;
  display_message?: string | null;
  card_label?: string | null;
  currency?: string | null;
  /** The base sale, before the card surcharge and any tip. */
  amount?: string | number | null;
  surcharge?: string | number | null;
  gratuity?: string | number | null;
  /** What the terminal actually charged the card. */
  total?: string | number | null;
  status?: string | null;
  settled?: boolean | null;
};

/** Pagination envelope shared by both endpoints */
export type ApiPagination = {
  current_page: number;
  total_pages: number;
  per_page: number;
  total: number;
};

export type PaymentsPage = {
  payments: Payment[];
  pagination: GatewayPagination;
};

/* ------------------------------------------------------------------ *
 * Transformers — raw API → shared Payment type
 * ------------------------------------------------------------------ */

function normaliseStripeStatus(raw?: string | null): PaymentStatus {
  const s = (raw ?? "").toLowerCase();
  if (s === "succeeded" || s === "paid" || s === "pending") return "Settled";
  if (s === "processing" || s === "complete") return "Processing";
  if (s === "failed") return "Failed";
  if (s === "refunded" || s === "canceled" || s === "cancelled")
    return "Refunded";
  return "Settled";
}

function mapPayrixTransaction(t: PayrixApiTransaction): Payment {
  const amount = parseFloat(String(t.amount_settled || t.amount || 0));
  const processingFee = Math.abs(parseFloat(String(t.fees_deducted || 0)));
  const netAmount = parseFloat(
    String(t.net_amount || t.amount_settled || t.amount || 0),
  );
  const statusDesc = t.status_description || "Settled";
  const category =
    t.category ||
    (statusDesc === "Settled" ? "Payment Received" : "Payment Processing");
  const invoiceNo = t.invoice_no || "N/A";
  const currency = t.currency || activeBaseCurrency();
  const description =
    t.description ||
    `${t.type_description || "Transaction"} - Amount: ${currency} ${t.amount || amount}`;
  const dateStr = t.created_at?.split(" ")[0] || t.created_at || "";

  return {
    id: String(t.id),
    date: dateStr,
    category,
    categoryType: t.categoryType || "income",
    invoiceNo,
    invoiceNumber: invoiceNo !== "N/A" ? invoiceNo : null,
    description,
    type: t.type || "credit",
    amount,
    processingFee,
    fee: processingFee,
    netAmount,
    status: statusDesc,
    currency,
    transactionId: t.transaction_id || undefined,
    originalAmount: parseFloat(String(t.amount || 0)),
    gatewayId: "sole-pay",
  };
}

function mapStripeTransaction(t: StripeApiTransaction): Payment {
  const amount = parseFloat(String(t.amount || 0));
  const processingFee = Math.abs(
    parseFloat(String(t.fee ?? t.processing_fee ?? t.fees_deducted ?? 0)),
  );
  const netAmount = parseFloat(
    String(
      t.net_amount ??
        (amount > 0 && processingFee > 0 ? amount - processingFee : amount),
    ),
  );
  const status = normaliseStripeStatus(t.payment_status ?? t.status);
  const invoiceNo = t.invoice_no || t.invoiceNo || "N/A";
  const currency = t.currency || activeBaseCurrency();
  const description =
    t.description ||
    `${t.type_description || "Card Payment"} - Amount: ${currency} ${amount}`;
  const dateStr =
    typeof t.date === "string"
      ? t.date.split(" ")[0]
      : typeof t.created_at === "string"
        ? t.created_at.split(" ")[0]
        : typeof t.created === "number"
          ? new Date(t.created * 1000).toISOString().split("T")[0]
          : "";

  return {
    id: String(t.id),
    date: dateStr,
    category: t.category || "Payment Received",
    categoryType: t.categoryType || "income",
    invoiceNo,
    invoiceNumber: invoiceNo !== "N/A" ? invoiceNo : null,
    description,
    type: t.type || "credit",
    amount,
    processingFee,
    fee: processingFee,
    netAmount,
    status,
    currency,
    gatewayId: "stripe",
  };
}

/** `approved` → `Approved`, `not_found` → `Not Found`. */
function titleCaseStatus(raw?: string | null): string {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "N/A";
  return s
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Mirrors sole-webapp's `fetchNexxtapTransactions` row reshape. NextTap
 * surcharges the cardholder rather than deducting a fee, so the fee column is
 * what the customer paid on top of the sale. The net is the charge less that
 * surcharge (sale plus any tip) — the same sum sole-ocr's summary uses, so the
 * rows add up to the Net amount card.
 */
function mapNexxtapTransaction(t: NexxtapApiTransaction): Payment {
  const settled = Boolean(t.settled);
  const amount = Number(t.amount || 0);
  const surcharge = Number(t.surcharge || 0);
  const total = Number(t.total || 0) || amount + surcharge + Number(t.gratuity || 0);
  const invoiceNo = t.invoice_no || "N/A";
  const description =
    [t.card_label, t.display_message].filter(Boolean).join(" — ") ||
    `Tap to pay${t.module_id ? ` · ${t.module_id}` : ""}`;

  return {
    id: String(t.id),
    date: t.date || "",
    category: settled ? "Payment Received" : "Payment Declined",
    categoryType: settled ? "income" : "expense",
    invoiceNo,
    invoiceNumber: invoiceNo !== "N/A" ? invoiceNo : null,
    description,
    type: "credit",
    amount: total,
    processingFee: surcharge,
    fee: surcharge,
    netAmount: total - surcharge,
    status: titleCaseStatus(t.status),
    // sole-ocr labels every capture AUD — the terminal settles in AUD only.
    currency: t.currency || "AUD",
    transactionId: t.transaction_id || undefined,
    originalAmount: amount,
    gatewayId: "nexttap",
  };
}

/* ------------------------------------------------------------------ *
 * Fetch functions
 * ------------------------------------------------------------------ */

/**
 * Fetches one page of SolePay (Payrix) transactions.
 *
 * Mirrors sole-webapp's `fetchPayrixTransactions` in Payments/index.js:
 * uses `GET /v1/payrix/reports?page=N&per_page=N`, checks `response.status`
 * and `response.data`, then maps each raw row through `mapPayrixTransaction`.
 */
export async function fetchWorldpayTransactions(
  page = 1,
  perPage = 15,
): Promise<PaymentsPage> {
  const response = await api.get<{
    status?: boolean;
    data?: PayrixApiTransaction[];
    pagination?: ApiPagination;
  }>(apiRoutes.payrix.report, {
    params: { page, per_page: perPage },
  });

  const raw = response.data;

  if (raw?.status && raw?.data) {
    return {
      payments: raw.data.map(mapPayrixTransaction),
      pagination: raw.pagination ?? {
        current_page: page,
        total_pages: 1,
        per_page: perPage,
        total: raw.data.length,
      },
    };
  }

  return {
    payments: [],
    pagination: {
      current_page: page,
      total_pages: 1,
      per_page: perPage,
      total: 0,
    },
  };
}

/**
 * Fetches one page of Stripe transactions.
 *
 * Mirrors sole-webapp's `fetchStripeTransactions` in Payments/index.js:
 * uses `GET /stripe-connect/transactions?page=N&per_page=N`, checks
 * `response.success` and `response.data`, maps through `mapStripeTransaction`.
 */
export async function fetchStripeTransactions(
  page = 1,
  perPage = 15,
): Promise<PaymentsPage> {
  const response = await api.get<{
    success?: boolean;
    data?: {
      transactions?: StripeApiTransaction[];
      pagination?: ApiPagination;
    };
  }>(apiRoutes.stripeConnect.transactions, {
    params: { page, per_page: perPage },
  });

  const raw = response.data;

  if (raw?.success && raw?.data) {
    const rows = raw.data.transactions ?? [];
    return {
      payments: rows.map(mapStripeTransaction),
      pagination: raw.data.pagination ?? {
        current_page: page,
        total_pages: 1,
        per_page: perPage,
        total: rows.length,
      },
    };
  }

  return {
    payments: [],
    pagination: {
      current_page: page,
      total_pages: 1,
      per_page: perPage,
      total: 0,
    },
  };
}

/**
 * Summary returned by `GET /stripe-connect/transactions/stats`.
 *
 * Field names match sole-webapp's PaymentTransactionTable.js usage exactly:
 * `net_amount`, `total_credits`, `processing_fees`, `transactions_count`.
 * The `*_by_currency` maps are also passed through so multi-currency accounts
 * show the right figures.
 */
export type StripeStats = {
  net_amount?: number | null;
  total_credits?: number | null;
  processing_fees?: number | null;
  transactions_count?: number | null;
  amount_currency?: string | null;
  settlement_currency?: string | null;
  currency?: string | null;
  total_credits_by_currency?: Record<string, number> | null;
  processing_fees_by_currency?: Record<string, number> | null;
  net_amount_by_currency?: Record<string, number> | null;
};

/**
 * Fetches account-level totals for Stripe payments.
 *
 * Mirrors sole-webapp's `fetchStripeStats`: calls
 * `GET /stripe-connect/transactions/stats` and returns the raw data object.
 * The stats cover ALL transactions, not just the current page — which is why
 * they're fetched separately from the paginated list.
 */
export async function fetchStripeStats(): Promise<StripeStats | null> {
  try {
    const response = await api.get<{
      success?: boolean;
      data?: StripeStats;
    }>(apiRoutes.stripeConnect.transactionStats);

    if (response.data?.success && response.data?.data) {
      return response.data.data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Totals returned alongside `/payments/nexxtap/transactions`. They cover every
 * capture, not just the page on screen, and exclude declined ones. Shares the
 * Stripe stats field names (`total_credits`, `processing_fees`, `net_amount`)
 * because sole-ocr shaped it for the same table.
 */
export type NexxtapSummary = StripeStats & {
  /** Every capture, declined included. */
  count?: number | null;
  settled_count?: number | null;
  gratuity?: number | null;
};

export type NexxtapPaymentsPage = PaymentsPage & {
  summary: NexxtapSummary | null;
};

/**
 * Fetches one page of NextTap tap-to-pay captures.
 *
 * Mirrors sole-webapp's `fetchNexxtapTransactions`: calls
 * `GET /payments/nexxtap/transactions?page=N&per_page=N`, checks
 * `response.success` and `response.data`, maps through `mapNexxtapTransaction`.
 */
export async function fetchNexxtapTransactions(
  page = 1,
  perPage = 15,
): Promise<NexxtapPaymentsPage> {
  const response = await api.get<{
    success?: boolean;
    data?: {
      payments?: NexxtapApiTransaction[];
      summary?: NexxtapSummary;
      pagination?: ApiPagination;
    };
  }>(apiRoutes.payments.nexxtapTransactions, {
    params: { page, per_page: perPage },
  });

  const raw = response.data;

  if (raw?.success && raw?.data) {
    const rows = raw.data.payments ?? [];
    return {
      payments: rows.map(mapNexxtapTransaction),
      summary: raw.data.summary ?? null,
      pagination: raw.data.pagination ?? {
        current_page: page,
        total_pages: 1,
        per_page: perPage,
        total: rows.length,
      },
    };
  }

  return {
    payments: [],
    summary: null,
    pagination: {
      current_page: page,
      total_pages: 1,
      per_page: perPage,
      total: 0,
    },
  };
}

/**
 * Whether the current business has a NextTap Merchant ID linked, and which.
 * Mirrors sole-webapp's GET to apiRoutes.payments.nexxtapMerchant — a business
 * counts as on NextTap once a Merchant ID has been verified against it.
 */
export async function checkNexxtapConnection(): Promise<{
  connected: boolean;
  merchantId: string | null;
}> {
  try {
    const response = await api.get<{
      success?: boolean;
      data?: { using_nexxtap?: boolean; nexxtap_mid?: string | null };
    }>(apiRoutes.payments.nexxtapMerchant);
    const connected =
      response.data?.success === true &&
      Boolean(response.data?.data?.using_nexxtap);
    return {
      connected,
      merchantId: connected ? (response.data?.data?.nexxtap_mid ?? null) : null,
    };
  } catch {
    return { connected: false, merchantId: null };
  }
}

/**
 * Checks whether the account has a completed SolePay merchant account.
 * Mirrors sole-webapp's POST to apiRoutes.payrix.getMerchantAccount.
 */
export async function checkWorldpayConnection(
  userId: string | number,
): Promise<boolean> {
  try {
    const response = await api.post<{
      success?: boolean;
      data?: { merchant_status?: string };
    }>(apiRoutes.payrix.getMerchantAccount, { user_id: userId });
    return (
      response.data?.success === true &&
      response.data?.data?.merchant_status === "completed"
    );
  } catch {
    return false;
  }
}

/**
 * Checks whether the account has completed Stripe onboarding.
 * Mirrors sole-webapp's GET to apiRoutes.stripeConnect.account.
 */
export async function checkStripeConnection(): Promise<boolean> {
  try {
    const response = await api.get<{
      success?: boolean;
      data?: { account?: { onboarding_complete?: boolean } };
    }>(apiRoutes.stripeConnect.account);
    return (
      response.data?.success === true &&
      Boolean(response.data?.data?.account?.onboarding_complete)
    );
  } catch {
    return false;
  }
}
