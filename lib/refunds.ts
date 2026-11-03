/**
 * Client refunds domain: money going back to a client, either paid out as a
 * refund or issued as a credit note against their account.
 *
 * Amounts are held as typed text rather than numbers, the same as invoice line
 * items — the platform rule is that numeric fields accept whatever is typed and
 * surface a live error, so swallowing the input into a number would lose it.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { accountNumberError, bsbError } from "@/lib/settings";
import {
  BANK_ACCOUNT_KEY,
  bankAccountField,
  bankBranchField,
  bankFieldError,
  bankFieldHelp,
  type CountryContext,
} from "@/lib/country-context";
import type { DocumentNumbering } from "@/lib/sales-settings";
import {
  formatInvoiceDate,
  invoiceAmount,
  invoiceMoney,
  type Invoice,
} from "@/lib/invoices";

export const REFUND_TYPES = ["Client refund", "Credit note"] as const;
export type RefundType = (typeof REFUND_TYPES)[number];

export const REFUND_STATUSES = ["Issued", "Refunded"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_REASONS = [
  "Returned goods",
  "Overpayment",
  "Billing adjustment",
  "Other",
] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

/** Filter options. The "All" entries aren't statuses — they clear the filter. */

export const REFUND_STATUS_FILTERS = [
  "All status",
  ...REFUND_STATUSES,
] as const;
export type RefundStatusFilter = (typeof REFUND_STATUS_FILTERS)[number];

/** Where a refund is actually paid. Null on a credit note, which isn't paid out. */
export type RefundBankInfo = {
  accountName: string;
  bsb: string;
  accountNumber: string;
};

export type Refund = {
  id: string;
  /** Null once the contact is deleted; `clientName` is then the only record. */
  clientId: string | null;
  /** Snapshot at issue time, so deleting a contact can't blank the row. */
  clientName: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  reference: string;
  type: RefundType;
  /** As typed. Use `refundAmount` / `refundGst` for the figures. */
  amount: string;
  gstAmount: string;
  /**
   * True once the GST figure has been typed over. Without this, the
   * auto-calc would keep clobbering a hand-entered figure on the next keystroke.
   */
  gstManual: boolean;
  reason: RefundReason;
  /** Only meaningful when `reason` is "Other". */
  reasonOther: string;
  notes: string;
  /** The invoice this refund relates to, where it maps to one. */
  invoiceId: string | null;
  bank: RefundBankInfo | null;
  status: RefundStatus;
};

export type RefundDraft = Omit<Refund, "id" | "status">;

/* ------------------------------------------------------------------ *
 * Figures
 * ------------------------------------------------------------------ */

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The credit note raised against an invoice, if there is one.
 *
 * A credit note and a client refund are both money going back, but only the
 * note stays attached to the invoice as a reduction of what's owed — so the
 * list wants that one specifically, not whichever refund mentions the invoice.
 */
export function creditNoteFor(
  invoiceId: string,
  refunds: Refund[],
): Refund | undefined {
  return refunds.find(
    (refund) => refund.invoiceId === invoiceId && refund.type === "Credit note",
  );
}

export function refundAmount(refund: Pick<Refund, "amount">): number {
  return toNumber(refund.amount);
}

export function refundGst(refund: Pick<Refund, "gstAmount">): number {
  return toNumber(refund.gstAmount);
}

/**
 * A GST-inclusive figure divided by 11 gives the GST already inside it — the
 * standard ATO calculation at 10%.
 */
export const GST_INCLUSIVE_DIVISOR = 11;

/**
 * What a tax-inclusive figure is divided by to get the tax inside it:
 * (100 + rate) ÷ rate — exactly 11 at 10%, 23/3 at 15%. Kept as a divisor
 * rather than `amount × rate ÷ (100 + rate)` so 10% is still `amount ÷ 11` to
 * the last bit.
 */
export function inclusiveTaxDivisor(ratePercent: number): number {
  return (100 + ratePercent) / ratePercent;
}

/**
 * The GST already contained in the refund amount, to two decimals.
 *
 * A refund returns what the client actually paid, and they paid GST-inclusive —
 * so the GST component is amount ÷ 11 at 10% (amount × rate ÷ (100 + rate) in
 * general), not amount × 10%. On a $450 refund that's $40.91.
 *
 * This is deliberately not what the invoice editor does. There, a line's price is
 * GST-exclusive and GST is added on top (`lineTotals` returns `net + gst`), so
 * multiplying by the rate is correct. Same tax, opposite direction — the two are
 * meant to differ.
 */
export function autoGst(amount: string, ratePercent: number = 10): string {
  if (!(ratePercent > 0)) return "";
  const value = toNumber(amount) / inclusiveTaxDivisor(ratePercent);
  return value > 0 ? value.toFixed(2) : "";
}

export function formatRefundDate(iso: string): string {
  return formatInvoiceDate(iso);
}

export function formatRefundAmount(refund: Pick<Refund, "amount">): string {
  return invoiceMoney(refundAmount(refund));
}

export function formatRefundGst(refund: Pick<Refund, "gstAmount">): string {
  return invoiceMoney(refundGst(refund));
}

/** Semantic only: refunded is settled, issued is still outstanding. */
export function refundStatusVariant(
  status: RefundStatus,
): "success" | "warning" {
  return status === "Refunded" ? "success" : "warning";
}

/** What the row shows in the Reason column. */
export function refundReasonLabel(
  refund: Pick<Refund, "reason" | "reasonOther">,
): string {
  return refund.reason === "Other" && refund.reasonOther.trim()
    ? refund.reasonOther.trim()
    : refund.reason;
}

/** Account, masked the way the bank feed presents one. */
export function refundBankLabel(refund: Pick<Refund, "bank">): string | null {
  if (!refund.bank) return null;
  const digits = refund.bank.accountNumber.replace(/\D/g, "");
  const tail = digits.slice(-4);
  return tail
    ? `${refund.bank.accountName} ···· ${tail}`
    : refund.bank.accountName;
}

export const DEFAULT_REFUND_NUMBERING: DocumentNumbering = {
  prefix: "CRN",
  next: "1",
};

/**
 * Next in the `CRN-0000` sequence, with prefix and start read from Sales
 * settings. Only references matching the configured prefix count toward the
 * sequence — one borrowed from an invoice must not shunt the counter along.
 */
export function nextRefundReference(
  refunds: Refund[],
  numbering: DocumentNumbering = DEFAULT_REFUND_NUMBERING,
): string {
  const prefix = numbering.prefix.trim() || "CRN";
  const pattern = new RegExp(`^${prefix}-(\\d+)$`, "i");
  const highest = refunds.reduce((max, refund) => {
    const match = refund.reference.trim().match(pattern);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const configured = Number(numbering.next.replace(/\D/g, "")) || 0;
  const value = Math.max(highest + 1, configured);
  return `${prefix}-${String(value).padStart(4, "0")}`;
}

/* ------------------------------------------------------------------ *
 * Filtering
 * ------------------------------------------------------------------ */

export function filterRefunds(
  refunds: Refund[],
  {
    query,
    status,
  }: { query: string; status: RefundStatusFilter },
): Refund[] {
  const needle = query.trim().toLowerCase();

  return refunds.filter((refund) => {
    if (status !== "All status" && refund.status !== status) return false;
    if (!needle) return true;

    return [
      refund.clientName,
      refund.reference,
      refund.type,
      refundReasonLabel(refund),
      refund.notes,
    ].some((field) => field.toLowerCase().includes(needle));
  });
}

/**
 * Whether anything is narrowing the list — drives the no-results copy.
 *
 * No type filter: a client refund and a credit note are the same record on the
 * server (a client credit note), told apart only by whether it carries bank
 * details, so filtering between them split one list in two for nothing.
 */
export function refundsNarrowed({
  query,
  status,
}: {
  query: string;
  status: RefundStatusFilter;
}): boolean {
  return !!query.trim() || status !== "All status";
}

/* ------------------------------------------------------------------ *
 * Validation — live, never blocking keystrokes
 * ------------------------------------------------------------------ */

/** Shared shape with the rest of the app's editors. */
export type RefundIssue = { key: string; message: string };

/** Positive money, to at most two decimals. */
export function refundAmountError(value: string): string | undefined {
  if (!value.trim()) return undefined;
  return /^\d+(\.\d{1,2})?$/.test(value.trim()) && Number(value) > 0
    ? undefined
    : "Enter a valid amount — no letters or negatives.";
}

/**
 * GST may legitimately be zero, so this is laxer than the amount rule. `word` is
 * the country's name for the tax ("GST", "VAT").
 */
export function refundGstError(
  value: string,
  word: string = "GST",
): string | undefined {
  if (!value.trim()) return undefined;
  return /^\d+(\.\d{1,2})?$/.test(value.trim())
    ? undefined
    : `Enter a valid ${word} amount — no letters or negatives.`;
}

/** One bank field on the refund form, as the business's country asks for it. */
export type RefundBankFieldRule = {
  label: string;
  hint: string | undefined;
  placeholder: string | undefined;
  /** Format problem with a non-blank value; blank is reported separately. */
  error: (value: string) => string | undefined;
};

/**
 * The bank fields a client refund is paid into, for the business's country.
 *
 * `branch` is Australia's BSB (South Africa's branch code) and null in New
 * Zealand, whose account number carries the bank and branch inside it. Either
 * way the value lives in the draft's `bsb` — the column name is Australian.
 */
export type RefundBankRules = {
  branch: RefundBankFieldRule | null;
  account: RefundBankFieldRule;
};

/** Australia's rules — exactly what this form asked for before the registry. */
export const AU_REFUND_BANK_RULES: RefundBankRules = {
  branch: {
    label: "BSB",
    hint: "6 digits, usually written 123-456.",
    placeholder: "083-004",
    error: bsbError,
  },
  account: {
    label: "Account number",
    hint: "6 to 10 digits.",
    placeholder: "12345678",
    error: accountNumberError,
  },
};

/**
 * "Enter a BSB", "Enter a branch code", "Enter an account number": an acronym
 * stays as it is, anything else reads lower-case mid-sentence.
 */
function enterPrompt(label: string): string {
  const name = /^[A-Z]{2,6}$/.test(label)
    ? label
    : label.charAt(0).toLowerCase() + label.slice(1);
  return `Enter ${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}.`;
}

/**
 * The refund form's bank rules from the country's `bank_account_schema`.
 *
 * Australia keeps `AU_REFUND_BANK_RULES` as they are (only the label is read
 * from the schema), so its copy and validation don't move. Elsewhere the
 * branch field exists only if the schema has one, and both fields validate
 * against the schema's own pattern.
 */
export function refundBankRules(ctx: CountryContext): RefundBankRules {
  const branch = bankBranchField(ctx);
  if (ctx.iso2 === "AU") {
    return {
      ...AU_REFUND_BANK_RULES,
      branch: AU_REFUND_BANK_RULES.branch && {
        ...AU_REFUND_BANK_RULES.branch,
        label: branch?.label || AU_REFUND_BANK_RULES.branch.label,
      },
    };
  }

  const example = (mask: string | null) =>
    mask ? mask.replace(/9/g, "0") : undefined;
  const account = bankAccountField(ctx);
  const accountHelp = bankFieldHelp(ctx, BANK_ACCOUNT_KEY);
  const branchHelp = branch ? bankFieldHelp(ctx, branch.key) : null;

  return {
    branch: branch
      ? {
          label: branch.label,
          hint: branchHelp
            ? `${branchHelp.charAt(0).toUpperCase()}${branchHelp.slice(1)}.`
            : undefined,
          placeholder: example(branch.mask),
          error: (value) => bankFieldError(ctx, branch.key, value),
        }
      : null,
    account: {
      label: account?.label || "Account number",
      hint: accountHelp
        ? `${accountHelp.charAt(0).toUpperCase()}${accountHelp.slice(1)}.`
        : undefined,
      placeholder: example(account?.mask ?? null) ?? "12345678",
      error: (value) => bankFieldError(ctx, BANK_ACCOUNT_KEY, value),
    },
  };
}

/**
 * Required-field issues, in the order the fields appear on screen. `bank`
 * defaults to Australia's rules; pass `refundBankRules(country)` for others.
 */
export function refundIssues(
  draft: RefundDraft,
  word: string = "GST",
  bank: RefundBankRules = AU_REFUND_BANK_RULES,
): RefundIssue[] {
  const issues: RefundIssue[] = [];

  if (!draft.clientId && !draft.clientName.trim()) {
    issues.push({ key: "client", message: "Select a client for this refund." });
  }

  if (!draft.reference.trim()) {
    issues.push({ key: "reference", message: "Enter a reference number." });
  }

  if (!draft.date) {
    issues.push({ key: "date", message: "Choose a refund date." });
  }

  const amount = refundAmountError(draft.amount);
  if (amount) {
    issues.push({ key: "amount", message: amount });
  } else if (!draft.amount.trim() || refundAmount(draft) <= 0) {
    issues.push({ key: "amount", message: "Enter a refund amount." });
  }

  const gst = refundGstError(draft.gstAmount, word);
  if (gst) {
    issues.push({ key: "gstAmount", message: gst });
  } else if (
    refundGst(draft) > refundAmount(draft) &&
    refundAmount(draft) > 0
  ) {
    issues.push({
      key: "gstAmount",
      message: `${word} can't be more than the refund itself.`,
    });
  }

  if (draft.reason === "Other" && !draft.reasonOther.trim()) {
    issues.push({ key: "reasonOther", message: "Describe the reason." });
  }

  // A credit note isn't paid out, so it carries no account to validate.
  if (draft.type === "Client refund" && draft.bank) {
    if (!draft.bank.accountName.trim()) {
      issues.push({ key: "accountName", message: "Enter the account name." });
    }
    // No branch field at all in New Zealand: the account number holds it.
    if (bank.branch) {
      if (!draft.bank.bsb.trim()) {
        issues.push({ key: "bsb", message: enterPrompt(bank.branch.label) });
      } else {
        const bsb = bank.branch.error(draft.bank.bsb);
        if (bsb) issues.push({ key: "bsb", message: bsb });
      }
    }
    if (!draft.bank.accountNumber.trim()) {
      issues.push({
        key: "accountNumber",
        message: enterPrompt(bank.account.label),
      });
    } else {
      const account = bank.account.error(draft.bank.accountNumber);
      if (account) issues.push({ key: "accountNumber", message: account });
    }
  }

  return issues;
}

/* ------------------------------------------------------------------ *
 * Drafts
 * ------------------------------------------------------------------ */

export function emptyBankInfo(): RefundBankInfo {
  return { accountName: "", bsb: "", accountNumber: "" };
}

export function emptyRefundDraft(
  reference: string,
  today: string,
): RefundDraft {
  return {
    clientId: null,
    clientName: "",
    date: today,
    reference,
    type: "Client refund",
    amount: "",
    gstAmount: "",
    gstManual: false,
    reason: "Returned goods",
    reasonOther: "",
    notes: "",
    invoiceId: null,
    bank: emptyBankInfo(),
  };
}

/**
 * What linking an invoice fills in: its full amount and its number as the
 * reference. Both stay editable — a refund is often only part of an invoice.
 */
export function prefillFromInvoice(
  invoice: Invoice,
): Pick<RefundDraft, "invoiceId" | "amount" | "reference"> {
  return {
    invoiceId: invoice.id,
    amount: invoiceAmount(invoice).toFixed(2),
    reference: invoice.number,
  };
}

/**
 * A copy of a refund, ready to issue again — the same client, type and reason on
 * today's date. The reference is a fresh one and the invoice link is dropped: a
 * second refund isn't the same document, and it isn't automatically against the
 * same invoice either.
 */
export function duplicateRefundDraft(
  refund: Refund,
  reference: string,
  today: string,
): RefundDraft {
  return {
    ...draftFromRefund(refund),
    reference,
    date: today,
    invoiceId: null,
  };
}

export function draftFromRefund(refund: Refund): RefundDraft {
  return {
    clientId: refund.clientId,
    clientName: refund.clientName,
    date: refund.date,
    reference: refund.reference,
    type: refund.type,
    amount: refund.amount,
    gstAmount: refund.gstAmount,
    gstManual: refund.gstManual,
    reason: refund.reason,
    reasonOther: refund.reasonOther,
    notes: refund.notes,
    invoiceId: refund.invoiceId,
    bank: refund.bank ? { ...refund.bank } : null,
  };
}

/* ------------------------------------------------------------------ *
 * Derived summaries
 * ------------------------------------------------------------------ */

export function refundSummary(refunds: Refund[]) {
  // The amount is what leaves the account; its GST is already inside it, so
  // adding the two would double-count the tax.
  const sumOf = (list: Refund[]) =>
    list.reduce((sum, refund) => sum + refundAmount(refund), 0);

  const refunded = refunds.filter((refund) => refund.status === "Refunded");
  const issued = refunds.filter((refund) => refund.status === "Issued");

  return {
    total: sumOf(refunds),
    totalCount: refunds.length,
    refunded: sumOf(refunded),
    refundedCount: refunded.length,
    issued: sumOf(issued),
    issuedCount: issued.length,
  };
}

/** The compact strip above the table. */
export function refundStats(refunds: Refund[]): {
  label: string;
  value: string;
  hint?: string;
}[] {
  const summary = refundSummary(refunds);
  return [
    {
      label: "Total refunded",
      value: invoiceMoney(summary.total),
      hint: `${summary.totalCount} ${summary.totalCount === 1 ? "refund" : "refunds"}`,
    },
    {
      label: "Paid out",
      value: invoiceMoney(summary.refunded),
      hint: `${summary.refundedCount} settled`,
    },
    {
      label: "Awaiting payment",
      value: invoiceMoney(summary.issued),
      hint:
        summary.issuedCount > 0
          ? `${summary.issuedCount} to pay`
          : "nothing outstanding",
    },
  ];
}

/* ------------------------------------------------------------------ *
 * API — GET /credit-note, the client side of sole-webapp's shared
 * CreditNotes component (components/credit-notes.js, used there with
 * `type="client"`; `type="vendor"` is lib/vendor-refunds.ts here).
 * ------------------------------------------------------------------ */

/**
 * The server's status values — "issued" is what this app calls "Issued",
 * plus "draft"/"cancelled" which exist in the reference's own type but are
 * commented out of its UI. Anything other than "refunded" reads as
 * `"Issued"` here, same fail-open reasoning as the vendor side.
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
  /** Whether there's a full bank account this was paid out to. */
  has_complete_bank_info: boolean;
  /**
   * The linked invoice, nested — the server excludes the bare
   * `related_invoice_id` column from every row it returns, so this object's
   * own `id` is the only way to read it back.
   */
  invoice?: { id?: string | number; invoice_no?: string } | null;
  client?: ApiCreditNoteParty | null;
};

function matchedReason(raw: string): Pick<Refund, "reason" | "reasonOther"> {
  const known = (REFUND_REASONS as readonly string[]).find(
    (reason) => reason.toLowerCase() === raw.trim().toLowerCase(),
  );
  return known
    ? { reason: known as RefundReason, reasonOther: "" }
    : { reason: "Other", reasonOther: raw };
}

function mapApiCreditNote(raw: ApiCreditNote): Refund {
  const client = raw.client;
  const { reason, reasonOther } = matchedReason(raw.reason ?? "");

  return {
    id: String(raw.id),
    // The server does send the client's contact id (`client.id`) — matching
    // on it lets the table prefer a live, current Contacts entry over this
    // snapshot when the contact still exists.
    clientId: client?.id != null ? String(client.id) : null,
    clientName: client?.business_name || client?.name || "",
    date: raw.credit_note_date,
    reference: raw.credit_note_no,
    // Not the server's own `type` (that's "client" for every row on this
    // page). Whether it was actually paid into a bank account is what this
    // app calls "Client refund" versus held as a "Credit note".
    type: raw.has_complete_bank_info ? "Client refund" : "Credit note",
    amount: String(raw.total ?? 0),
    gstAmount: String(raw.gst_amount ?? 0),
    // Loaded, not typed — treated as the figure of record rather than one
    // the auto-calc should feel free to overwrite.
    gstManual: true,
    reason,
    reasonOther,
    notes: "",
    invoiceId: raw.invoice?.id != null ? String(raw.invoice.id) : null,
    bank: raw.has_complete_bank_info
      ? {
          accountName: client?.account_holder ?? "",
          bsb: client?.bsb ?? "",
          accountNumber: client?.account_number ?? "",
        }
      : null,
    status: raw.status === "refunded" ? "Refunded" : "Issued",
  };
}

/**
 * Large enough to cover the whole list in one request — there's no
 * pagination UI on this screen (search, type and status are all filtered
 * client-side, matching the reference), so this asks for everything rather
 * than a page of it.
 */
const CLIENT_REFUNDS_PAGE_SIZE = 500;

/** Every client refund and credit note on the account. */
export async function fetchClientRefunds(
  userId: string | number,
): Promise<Refund[]> {
  const response = await api.get<{
    success: boolean;
    data?: ApiCreditNote[];
  }>(apiRoutes.creditNote.list, {
    params: {
      user_id: String(userId),
      type: "client",
      page: "1",
      limit: String(CLIENT_REFUNDS_PAGE_SIZE),
    },
  });

  return (response.data?.data ?? []).map(mapApiCreditNote);
}

/* ------------------------------------------------------------------ *
 * Writes — POST/PATCH/DELETE /credit-note. Every non-GET body here is
 * AES-encrypted via `buildEncryptedRequestBody`, matching every other write
 * in this app; the server decrypts it the same way.
 *
 * The server only ever derives the client from a linked, paid invoice —
 * there's no column on the credit note itself to name a client directly, and
 * deliberately no plan to add one. So a refund issued with no invoice link
 * will fail server-side with "Either invoice or expense reference is
 * required": this module doesn't invent a client to paper over that, and the
 * "Link to an invoice" field is effectively required for a client refund to
 * actually save, even though the field itself reads as optional.
 * ------------------------------------------------------------------ */

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

/**
 * The server's own wording talks about "invoice or expense" — the expense
 * half is the vendor side of the shared endpoint and means nothing on this
 * screen, so it's translated into the one thing that's actually true here.
 */
function refundApiErrorMessage(message: string | undefined, fallback: string): string {
  if (message === "Either invoice or expense reference is required") {
    return "Select an invoice to link this refund to — a client refund can't be saved without one.";
  }
  return message || fallback;
}

/** The fields both create and update share; each names the reference field differently (see below). */
function refundCommonFields(draft: RefundDraft): Record<string, unknown> {
  return {
    related_invoice_id: draft.invoiceId,
    reason: draft.reason === "Other" ? draft.reasonOther.trim() : draft.reason,
    gst_amount: refundGst(draft),
    total: refundAmount(draft),
    credit_note_date: draft.date,
  };
}

/** Issues a new client refund or credit note. */
export async function createClientRefundApi(
  draft: RefundDraft,
  userId: string | number,
): Promise<void> {
  const response = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.creditNote.add,
    buildEncryptedRequestBody({
      ...refundCommonFields(draft),
      user_id: String(userId),
      type: "client",
      status: "issued",
      // The create endpoint's own field name for the reference — the update
      // endpoint below expects the model's actual column name instead.
      credit_note_number: draft.reference.trim(),
    }),
  );
  if (!response.data?.success) {
    throw new Error(
      refundApiErrorMessage(response.data?.message, "Failed to issue refund."),
    );
  }
  // Refunds were not tracked at all in the old app. The value matters more
  // here than the count: one large refund and twenty small ones are different
  // stories about the same number of events.
  track(EVENTS.CLIENT_REFUND_RECORDED, {
    amount: refundAmount(draft),
    against_invoice: Boolean(draft.invoiceId),
  });
}

/**
 * Only `reason`, `status`, `credit_note_date`, `credit_note_no`, `total`,
 * `gst_amount` and `related_invoice_id` are ever applied by the server on
 * update — anything else in the body is silently dropped.
 */
export async function updateClientRefundApi(
  id: string,
  draft: RefundDraft,
  status: RefundStatus,
  userId: string | number,
): Promise<void> {
  const response = await api.patch<ApiEnvelope<unknown>>(
    `${apiRoutes.creditNote.update}/${id}/${userId}`,
    buildEncryptedRequestBody({
      ...refundCommonFields(draft),
      credit_note_no: draft.reference.trim(),
      status: status === "Refunded" ? "refunded" : "issued",
    }),
  );
  if (!response.data?.success) {
    throw new Error(
      refundApiErrorMessage(response.data?.message, "Failed to update refund."),
    );
  }
}

/** Marks an issued refund as paid out, without touching anything else about it. */
export async function markClientRefundedApi(
  id: string,
  userId: string | number,
): Promise<void> {
  const response = await api.patch<ApiEnvelope<unknown>>(
    `${apiRoutes.creditNote.update}/${id}/${userId}`,
    buildEncryptedRequestBody({ status: "refunded" }),
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to mark as refunded.");
  }
}

export async function deleteClientRefundApi(id: string): Promise<void> {
  const response = await api.delete<ApiEnvelope<unknown>>(
    `${apiRoutes.creditNote.update}/${id}`,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to delete refund.");
  }
}

/**
 * The next reference in the account's own credit-note sequence (`CR-<n>`,
 * shared across client and vendor refunds alike — the server doesn't scope
 * it by type). Falls back to a locally-generated one on failure, same as
 * the reference: the form stays usable even if this call fails.
 */
export async function generateClientRefundNumberApi(
  userId: string | number,
): Promise<string> {
  const response = await api.post<ApiEnvelope<string>>(
    apiRoutes.creditNote.generate,
    buildEncryptedRequestBody({ user_id: String(userId) }),
  );
  if (!response.data?.success || !response.data.data) {
    throw new Error(
      response.data?.message || "Failed to generate a reference number.",
    );
  }
  return response.data.data;
}
