/**
 * Vendor refunds domain: money coming back from a supplier, either received as
 * a refund or held as a credit note against your account with them.
 *
 * The mirror of `lib/refunds.ts`, and deliberately its own module rather than a
 * shared one parameterised by side. The two differ in more than wording — this
 * one links to an expense rather than an invoice, the bank account is yours
 * rather than the other party's, and the GST moves the opposite way — and the
 * codebase already keeps near-twin documents apart this way (quotes and
 * invoices each have their own editor and table).
 *
 * Amounts are held as typed text rather than numbers, the same as everywhere
 * else: numeric fields accept whatever is typed and surface a live error, so
 * swallowing the input into a number would lose it.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { formatInvoiceDate, invoiceMoney } from "@/lib/invoices";

export const VENDOR_REFUND_TYPES = ["Vendor refund", "Credit note"] as const;
export type VendorRefundType = (typeof VENDOR_REFUND_TYPES)[number];

/**
 * "Awaiting" until the money is actually back, then "Refunded".
 *
 * Not the client screen's "Issued": you don't issue a vendor refund, the
 * supplier does. What you're recording is that one is owed to you.
 */
export const VENDOR_REFUND_STATUSES = ["Awaiting", "Refunded"] as const;
export type VendorRefundStatus = (typeof VENDOR_REFUND_STATUSES)[number];

/** Supplier-side reasons — why money is coming back to you. */
export const VENDOR_REFUND_REASONS = [
  "Returned stock",
  "Supplier overpayment",
  "Billing adjustment",
  "Damaged/faulty goods",
  "Cancelled order",
  "Other",
] as const;
export type VendorRefundReason = (typeof VENDOR_REFUND_REASONS)[number];

/** The period tabs above the strip, matching Expenses. */
export const VENDOR_REFUND_PERIODS = ["This year", "This month"] as const;
export type VendorRefundPeriod = (typeof VENDOR_REFUND_PERIODS)[number];

/** Filter options. The "All" entry isn't a value — it clears the filter. */
export const VENDOR_REFUND_STATUS_FILTERS = [
  "All status",
  ...VENDOR_REFUND_STATUSES,
] as const;
export type VendorRefundStatusFilter =
  (typeof VENDOR_REFUND_STATUS_FILTERS)[number];

/**
 * Where the money lands. Yours, not the supplier's — this is the account the
 * refund is paid into. Null on a credit note, which is never paid out.
 */
export type VendorRefundBankInfo = {
  accountName: string;
  bsb: string;
  accountNumber: string;
};

export type VendorRefund = {
  id: string;
  /** Null once the contact is deleted; `supplierName` is then the only record. */
  supplierId: string | null;
  /** Snapshot at record time, so deleting a contact can't blank the row. */
  supplierName: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  reference: string;
  type: VendorRefundType;
  /** As typed. Use `vendorRefundAmount` / `vendorRefundGst` for the figures. */
  amount: string;
  gstAmount: string;
  /**
   * True once the GST figure has been typed over. Without this, the auto-calc
   * would keep clobbering a hand-entered figure on the next keystroke.
   */
  gstManual: boolean;
  reason: VendorRefundReason;
  /** Only meaningful when `reason` is "Other". */
  reasonOther: string;
  notes: string;
  /** The expense this refund relates to, where it maps to one. */
  expenseId: string | null;
  bank: VendorRefundBankInfo | null;
  status: VendorRefundStatus;
};

/* ------------------------------------------------------------------ *
 * Figures
 * ------------------------------------------------------------------ */

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function vendorRefundAmount(
  refund: Pick<VendorRefund, "amount">,
): number {
  return toNumber(refund.amount);
}

export function vendorRefundGst(
  refund: Pick<VendorRefund, "gstAmount">,
): number {
  return toNumber(refund.gstAmount);
}

export function formatVendorRefundDate(iso: string): string {
  return formatInvoiceDate(iso);
}

export function formatVendorRefundAmount(
  refund: Pick<VendorRefund, "amount">,
): string {
  return invoiceMoney(vendorRefundAmount(refund));
}

export function formatVendorRefundGst(
  refund: Pick<VendorRefund, "gstAmount">,
): string {
  return invoiceMoney(vendorRefundGst(refund));
}

/** Semantic only: refunded is settled, awaiting is still outstanding. */
export function vendorRefundStatusVariant(
  status: VendorRefundStatus,
): "success" | "warning" {
  return status === "Refunded" ? "success" : "warning";
}

/** What the row shows in the Reason column. */
export function vendorRefundReasonLabel(
  refund: Pick<VendorRefund, "reason" | "reasonOther">,
): string {
  return refund.reason === "Other" && refund.reasonOther.trim()
    ? refund.reasonOther.trim()
    : refund.reason;
}

/** Account, masked the way the bank feed presents one. */
export function vendorRefundBankLabel(
  refund: Pick<VendorRefund, "bank">,
): string | null {
  if (!refund.bank) return null;
  const digits = refund.bank.accountNumber.replace(/\D/g, "");
  const tail = digits.slice(-4);
  return tail
    ? `${refund.bank.accountName} ···· ${tail}`
    : refund.bank.accountName;
}

/* ------------------------------------------------------------------ *
 * Filtering
 * ------------------------------------------------------------------ */

/**
 * The calendar bounds of the selected period, as plain `from`/`to` dates —
 * a full month or year, not clipped to today. Sent to the server as
 * `from_date`/`to_date`, which it compares inclusively against
 * `credit_note_date`, so this scopes both the table and the stat strip
 * without either drifting out of sync with the other.
 */
export function vendorRefundPeriodRange(
  period: VendorRefundPeriod,
  todayIso: string,
): { from: string; to: string } {
  const [year, month] = todayIso.split("-").map(Number);
  const pad = (value: number) => String(value).padStart(2, "0");

  if (period === "This month") {
    const lastDay = new Date(year, month, 0).getDate();
    return {
      from: `${year}-${pad(month)}-01`,
      to: `${year}-${pad(month)}-${pad(lastDay)}`,
    };
  }
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** Whether anything is narrowing the list — drives the no-results copy. */
export function vendorRefundsNarrowed({
  query,
  status,
}: {
  query: string;
  status: VendorRefundStatusFilter;
}): boolean {
  return !!query.trim() || status !== "All status";
}

/* ------------------------------------------------------------------ *
 * Derived summaries
 * ------------------------------------------------------------------ */

export function vendorRefundSummary(refunds: VendorRefund[]) {
  // The amount is what comes back; its GST is already inside it, so adding the
  // two would double-count the tax.
  const sumOf = (list: VendorRefund[]) =>
    list.reduce((sum, refund) => sum + vendorRefundAmount(refund), 0);

  const refunded = refunds.filter((refund) => refund.status === "Refunded");
  const awaiting = refunds.filter((refund) => refund.status === "Awaiting");

  return {
    total: sumOf(refunds),
    totalCount: refunds.length,
    refunded: sumOf(refunded),
    refundedCount: refunded.length,
    awaiting: sumOf(awaiting),
    awaitingCount: awaiting.length,
  };
}

/** The compact strip above the table. */
export function vendorRefundStats(refunds: VendorRefund[]): {
  label: string;
  value: string;
  hint?: string;
}[] {
  const summary = vendorRefundSummary(refunds);
  return [
    {
      label: "Total refunded",
      value: invoiceMoney(summary.total),
      hint: `${summary.totalCount} ${summary.totalCount === 1 ? "refund" : "refunds"}`,
    },
    {
      label: "Received",
      value: invoiceMoney(summary.refunded),
      hint: `${summary.refundedCount} settled`,
    },
    {
      label: "Awaiting refund",
      value: invoiceMoney(summary.awaiting),
      hint:
        summary.awaitingCount > 0
          ? `${summary.awaitingCount} outstanding`
          : "nothing outstanding",
    },
  ];
}

/* ------------------------------------------------------------------ *
 * API — GET /credit-note, the vendor side of sole-webapp's shared
 * CreditNotes component (components/credit-notes.js, used with
 * `type="vendor"` here and `type="client"` for Client refunds).
 * ------------------------------------------------------------------ */

/**
 * The server's status values — "issued" is what this app calls "Awaiting",
 * plus "draft"/"cancelled" which exist in the reference's own type but are
 * commented out of its UI. Anything other than "refunded" reads as
 * `"Awaiting"` here, same fail-open reasoning.
 */
type ApiCreditNoteStatus = "draft" | "issued" | "refunded" | "cancelled";

type ApiCreditNoteParty = {
  id?: string | number;
  name?: string;
  business_name?: string;
  bank_name?: string;
  account_holder?: string;
  bsb?: string;
  account_number?: string;
};

type ApiCreditNote = {
  id: string | number;
  credit_note_no: string;
  credit_note_date: string;
  type: "vendor" | "client";
  total: number;
  gst_amount: number;
  reason: string;
  status: ApiCreditNoteStatus;
  /** Whether there's a full bank account to pay this out to. */
  has_complete_bank_info: boolean;
  related_expense_id?: string | number | null;
  expense?: { expense_no?: string; name?: string } | null;
  /**
   * Named for the shared component's other half (client refunds) — on the
   * vendor side this is the supplier's own details, not a client's.
   */
  client?: ApiCreditNoteParty | null;
};

function matchedReason(raw: string): Pick<VendorRefund, "reason" | "reasonOther"> {
  const known = (VENDOR_REFUND_REASONS as readonly string[]).find(
    (reason) => reason.toLowerCase() === raw.trim().toLowerCase(),
  );
  return known
    ? { reason: known as VendorRefundReason, reasonOther: "" }
    : { reason: "Other", reasonOther: raw };
}

function mapApiCreditNote(raw: ApiCreditNote): VendorRefund {
  const supplier = raw.client;
  const { reason, reasonOther } = matchedReason(raw.reason ?? "");

  return {
    id: String(raw.id),
    // The server does send the supplier's contact id (`client.id`) — matching
    // on it lets the table prefer a live, current Contacts entry over this
    // snapshot when the contact still exists.
    supplierId: supplier?.id != null ? String(supplier.id) : null,
    supplierName: supplier?.business_name || supplier?.name || "",
    date: raw.credit_note_date,
    reference: raw.credit_note_no,
    // Not the server's own `type` (that's "vendor" for every row on this
    // page — it's which *side* the credit note is for, not this). Whether
    // it was actually paid into a bank account is what this app calls
    // "Vendor refund" versus held as a "Credit note".
    type: raw.has_complete_bank_info ? "Vendor refund" : "Credit note",
    amount: String(raw.total ?? 0),
    gstAmount: String(raw.gst_amount ?? 0),
    // Loaded, not typed — treated as the figure of record rather than one
    // the auto-calc should feel free to overwrite.
    gstManual: true,
    reason,
    reasonOther,
    notes: "",
    expenseId: raw.related_expense_id != null ? String(raw.related_expense_id) : null,
    bank: raw.has_complete_bank_info
      ? {
          accountName: supplier?.account_holder ?? "",
          bsb: supplier?.bsb ?? "",
          accountNumber: supplier?.account_number ?? "",
        }
      : null,
    status: raw.status === "refunded" ? "Refunded" : "Awaiting",
  };
}

/**
 * `status` is the one filter the server actually understands as a narrowing
 * param — sent only when narrowed, matching the reference (an "all status"
 * request omits the param rather than sending `status=all`). `type` always
 * goes as `"vendor"`: that's what makes this the vendor side of the shared
 * endpoint. `search` matches the reference number or the reason, server-side.
 * `from_date`/`to_date` are the period's calendar bounds — the server compares
 * them inclusively against `credit_note_date`.
 */
function vendorRefundParams(
  status: VendorRefundStatusFilter,
  userId: string | number,
  search: string | undefined,
  period: VendorRefundPeriod,
  todayIso: string,
): Record<string, string> {
  const params: Record<string, string> = {
    user_id: String(userId),
    type: "vendor",
  };
  if (status === "Refunded") params.status = "refunded";
  else if (status === "Awaiting") params.status = "issued";
  if (search?.trim()) params.search = search.trim();

  const { from, to } = vendorRefundPeriodRange(period, todayIso);
  params.from_date = from;
  params.to_date = to;

  return params;
}

async function requestVendorRefunds(
  params: Record<string, string>,
): Promise<VendorRefundsPage> {
  const response = await api.get<{
    success: boolean;
    data?: ApiCreditNote[];
    pagination?: { total?: number };
  }>(apiRoutes.creditNote.list, { params });

  const refunds = (response.data?.data ?? []).map(mapApiCreditNote);
  return { refunds, total: response.data?.pagination?.total ?? refunds.length };
}

export type VendorRefundsPage = { refunds: VendorRefund[]; total: number };

/** One page of the vendor's refunds/credit notes, scoped to the selected filters. */
export async function fetchVendorRefundsPage(
  page: number,
  pageSize: number,
  status: VendorRefundStatusFilter,
  userId: string | number,
  search: string | undefined,
  period: VendorRefundPeriod,
  todayIso: string,
): Promise<VendorRefundsPage> {
  const params = vendorRefundParams(status, userId, search, period, todayIso);
  params.page = String(page);
  params.limit = String(pageSize);
  return requestVendorRefunds(params);
}

/**
 * How many vendor refunds the account has at all — no status, search or
 * period, and a one-row page, since only the response's total is wanted. It's
 * what tells a genuinely empty account apart from a period that just has
 * nothing in it.
 */
export async function fetchVendorRefundsCount(
  userId: string | number,
): Promise<number> {
  const { total } = await requestVendorRefunds({
    user_id: String(userId),
    type: "vendor",
    page: "1",
    limit: "1",
  });
  return total;
}

/**
 * Large enough to cover the stat strip without a real "everything" endpoint —
 * there's no separate summary/statistics route for credit notes (unlike
 * invoices/expenses), so the strip asks for a generously large page of the
 * same filtered results instead of the one page the table actually shows.
 */
const SUMMARY_PAGE_SIZE = 500;

/** Every refund in the selected period/status/search, for the stat strip. */
export async function fetchVendorRefundsSummary(
  status: VendorRefundStatusFilter,
  userId: string | number,
  search: string | undefined,
  period: VendorRefundPeriod,
  todayIso: string,
): Promise<VendorRefund[]> {
  const params = vendorRefundParams(status, userId, search, period, todayIso);
  params.page = "1";
  params.limit = String(SUMMARY_PAGE_SIZE);
  const { refunds } = await requestVendorRefunds(params);
  return refunds;
}
