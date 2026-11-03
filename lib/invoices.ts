/**
 * Invoice domain: statuses, money and date formatting, line-item maths and
 * validation. The maths mirrors the design reference exactly — discount is a
 * per-line percentage, GST is 10% of the discounted line.
 */
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import {
  AU_FISCAL_YEAR_START,
  fiscalYearOf,
  fiscalYearRange,
  type FiscalYearStart,
} from "@/lib/fiscal-year";
import { activeAmountDigits, activeBaseCurrency, activeCurrencySymbol } from "@/lib/country-context";
import type { DocumentNumbering } from "@/lib/sales-settings";
import { isTaxedRate } from "@/lib/product-tax";
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";

export const INVOICE_STATUSES = [
  "Draft",
  "Outstanding",
  "Overdue",
  "Partially paid",
  "Paid",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_TABS = ["All", ...INVOICE_STATUSES] as const;
export type InvoiceTab = (typeof INVOICE_TABS)[number];

/** Statuses that count as money still owed to you. */
export const OUTSTANDING_STATUSES: InvoiceStatus[] = [
  "Outstanding",
  "Overdue",
  "Partially paid",
];

export type InvoiceLineItem = {
  id: string;
  description: string;
  /**
   * Numeric fields hold whatever was typed, per the platform rule that they
   * accept any input and surface a live error rather than blocking keystrokes.
   */
  quantity: string;
  price: string;
  /**
   * The discount, as typed — a percentage of the line's gross when
   * `discountType` is "percent" (the default), or a flat dollar amount off
   * the line when it's "amount". One field for both, matching sole-webapp's
   * own `disc` + `disc_criteria` pair: the type says how to read the value,
   * so switching types doesn't lose what was typed under the other one.
   */
  discountPercent: string;
  /** Absent means "percent" — the only kind a line could carry before. */
  discountType?: DiscountType;
  gst: boolean;
  /**
   * The rate a saved line was charged at, in percentage points. Absent on a new
   * line, which takes the document's rate (the business's rate on the issue
   * date); kept on a saved one so editing an invoice never re-prices the lines
   * it already had when the business's or the country's rate later changes.
   */
  gstPercent?: number;

  /** What the quantity counts — items, hours, days or km. */
  qtyType?: QtyType;
  /**
   * The saved product this line came from, when it was picked from the
   * lookup rather than typed. Carried through so the server can tie the sale
   * back to the catalogue entry (and to inventory, where it tracks stock).
   */
  productId?: string;
  /**
   * Price guidance from the lookup — the NDIS catalogue publishes regional
   * price limits rather than a price, so this is shown alongside the field
   * and never treated as a figure.
   */
  priceHint?: string;

  /**
   * NDIS supports only. Their presence is what marks a line as an NDIS claim
   * line, which also relaxes the whole-number quantity rule — supports are
   * claimed in hours. On these lines `description` holds the support item name.
   */
  supportItemNumber?: string;
  claimType?: NdisClaimType;
  /** NDIS supports only — the date the support was delivered. ISO `YYYY-MM-DD`. */
  date?: string;
};

/**
 * How a line's discount is measured — percentage points off the line, or a
 * flat amount. Sent as `disc_criteria`, matching sole-webapp's own two
 * options for the field.
 */
export const DISCOUNT_TYPES = [
  { value: "percent", label: "%" },
  { value: "amount", label: "$" },
] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number]["value"];

export const DEFAULT_DISCOUNT_TYPE: DiscountType = "percent";

/** Either of the two the server understands; anything else falls back to percent. */
export function toDiscountType(value: string | undefined): DiscountType {
  return (
    DISCOUNT_TYPES.find((entry) => entry.value === value)?.value ??
    DEFAULT_DISCOUNT_TYPE
  );
}

/** What a line's quantity counts. Sent as `qty_type`. */
export const QTY_TYPES = [
  { value: "items", label: "Items" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
  { value: "km", label: "Km" },
] as const;
export type QtyType = (typeof QTY_TYPES)[number]["value"];

export const DEFAULT_QTY_TYPE: QtyType = "items";

/** Only the four the server understands; anything else falls back to items. */
export function toQtyType(value: string | undefined): QtyType {
  return (
    QTY_TYPES.find((entry) => entry.value === value)?.value ?? DEFAULT_QTY_TYPE
  );
}

/** An NDIS claim line, as opposed to an ordinary billable line. */
export function isNdisLineItem(item: InvoiceLineItem): boolean {
  return item.claimType !== undefined;
}

/**
 * The schedule a repeating invoice runs on. "Once off" is a real option
 * rather than a contradiction: it raises the copy a single time on the start
 * date, which is how a deferred invoice is scheduled.
 */
export const REPEAT_FREQUENCIES = [
  "Once off",
  "Weekly",
  "Fortnightly",
  "Monthly",
  "Quarterly",
  "Half yearly",
  "Yearly",
] as const;
export type RepeatFrequency = (typeof REPEAT_FREQUENCIES)[number];

/** The ids the server stores, keyed by the label the editor shows. */
export const REPEAT_FREQUENCY_IDS: Record<RepeatFrequency, string> = {
  "Once off": "day",
  Weekly: "weekly",
  Fortnightly: "fortnightly",
  Monthly: "monthly",
  Quarterly: "quarterly",
  "Half yearly": "halfyearly",
  Yearly: "yearly",
};

/** Reads a stored id back to its label, for an invoice being edited. */
export function repeatFrequencyFromId(id: string | undefined): RepeatFrequency {
  const match = REPEAT_FREQUENCIES.find(
    (label) => REPEAT_FREQUENCY_IDS[label] === id,
  );
  return match ?? "Monthly";
}

export type InvoiceDeposit = {
  /**
   * `items` asks for the value of chosen line items rather than a figure —
   * the natural ask when the deposit is "pay for the materials up front".
   */
  mode: "percent" | "amount" | "items";
  /** Percentage points or dollars, as typed. Unused in `items` mode. */
  value: string;
  /** `items` mode only — indexes into the invoice's line items. */
  selectedItems?: number[];
  /** When the deposit itself falls due, if it's earlier than the invoice. ISO `YYYY-MM-DD`. */
  dueDate?: string;
};

export type InvoiceAttachment = {
  id: string;
  name: string;
  size: number;
  /**
   * Where the stored file actually lives, for one already on the server.
   * Absent for a file picked a moment ago and not yet uploaded — there is
   * nothing to open until it has been.
   */
  url?: string;
};

/**
 * One person the invoice is addressed to — a contact at the client, not the
 * client itself. Sent as `selected_contact`, which is what decides who the
 * emailed copy reaches.
 */
/**
 * Work raised as an invoice from another module — KM Tracker's Convert to
 * invoice. The lines to bill, and the client when the source already knows
 * who pays (a trip carries its client; its primary contact becomes the
 * recipient once the contact list lands).
 */
export type InvoiceSeed = {
  description: string;
  items: InvoiceLineItem[];
  clientId: string | null;
  clientName: string;
  /**
   * The project the invoice is raised against — a job's time entries or a
   * project expense. Saved as the invoice's `project_id`, which is how the
   * project's Invoices tab finds it again.
   */
  projectId?: string | null;
  /**
   * Files to attach, as if picked in the form — Time Tracker's timesheet PDF,
   * which sole-webapp attached to every invoice raised from time entries.
   */
  files?: File[];
};

export type InvoiceRecipient = {
  /** The contact's id on the client record. */
  id: string;
  name: string;
  email: string;
};

let attachmentSeq = 0;
/** Unique per attachment, so re-adding the same file can't collide. */
export function newAttachmentId(): string {
  attachmentSeq += 1;
  return `attachment-${attachmentSeq}`;
}

/**
 * What the deposit actually asks for. Clamped to the invoice total — the
 * dialog validates, but persisted or imported data might not.
 */
export function depositAmount(
  deposit: InvoiceDeposit | null,
  total: number,
  /** Required only for `items` mode, which sums the chosen lines. */
  items?: InvoiceLineItem[],
  gstPercent = GST_PERCENT,
): number | null {
  if (!deposit) return null;

  if (deposit.mode === "items") {
    const chosen = deposit.selectedItems ?? [];
    const sum = (items ?? []).reduce(
      (running, item, index) =>
        chosen.includes(index)
          ? running + lineTotals(item, gstPercent).amount
          : running,
      0,
    );
    return Math.min(Math.max(sum, 0), total);
  }

  const value = Number(deposit.value) || 0;
  const raw = deposit.mode === "percent" ? (total * value) / 100 : value;
  return Math.min(Math.max(raw, 0), total);
}

/* ------------------------------------------------------------------ *
 * NDIS
 * ------------------------------------------------------------------ */

/**
 * How a line is being claimed. The NDIS price guide bills these differently —
 * cancellations and travel have their own rules — so it belongs on the line
 * rather than being inferred from the support item.
 *
 * These strings are sent verbatim as `claim_type` and are stored as free
 * text, so they match the reference product's list exactly, en dashes and
 * bracketed abbreviations included. A claim lodged with different wording
 * than the rest of the account's history reconciles badly.
 */
export const NDIS_CLAIM_TYPES = [
  "Standard Service",
  "Travel – Time",
  "Travel – Non-Labour Costs",
  "Cancellation",
  "Non-Face-to-Face (NF2F)",
  "Report Writing",
  "Irregular SIL (Supported Independent Living)",
  "NDIA Requested Reports",
] as const;
export type NdisClaimType = (typeof NDIS_CLAIM_TYPES)[number];

export const DEFAULT_NDIS_CLAIM_TYPE: NdisClaimType = "Standard Service";

/**
 * Reads a stored claim type back to one of the list above. Matched on the
 * letters and digits alone, so an older record that spelled it differently
 * still lands on the right option instead of silently resetting.
 */
export function toNdisClaimType(value: string | undefined): NdisClaimType {
  const key = (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!key) return DEFAULT_NDIS_CLAIM_TYPE;
  return (
    NDIS_CLAIM_TYPES.find(
      (type) => type.toLowerCase().replace(/[^a-z0-9]/g, "") === key,
    ) ?? DEFAULT_NDIS_CLAIM_TYPE
  );
}

export type Invoice = {
  id: string;
  number: string;
  /** Null once the contact is deleted; `clientName` is then the only record. */
  clientId: string | null;
  /** Snapshot of the name at issue time, so deleting a contact can't blank it. */
  clientName: string;
  /** ISO `YYYY-MM-DD`. */
  issued: string;
  due: string;
  status: InvoiceStatus;
  description: string;
  items: InvoiceLineItem[];
  /** A whole-invoice discount in dollars, on top of the per-line percentages. */
  extraDiscount: string;
  notes: string;

  /* Invoice-level settings, saved with the document. */
  followUpReminder: boolean;
  overdueReminder: boolean;
  repeating: boolean;
  repeatFrequency: RepeatFrequency;
  /** Only meaningful while `repeating` is on. */
  reviewBeforeSending: boolean;
  deposit: InvoiceDeposit | null;
  attachments: InvoiceAttachment[];

  /*
   * The rest of what an invoice carries when it's actually raised. Optional
   * because an invoice mapped from the list endpoint has none of it — that
   * response only returns totals and status — while the editor always fills
   * them in. Read them with a fallback rather than assuming they're set.
   */

  /**
   * Who the invoice is addressed to: one or more contacts at the client.
   * The client is billed; these people receive it.
   */
  recipients?: InvoiceRecipient[];
  /** The address the invoice is sent from and copied to. */
  invoiceEmail?: string;
  /**
   * Whether the client's own currency is being used rather than AUD. Off even
   * for a foreign client until the person says to convert, since a client
   * recorded in USD may still be billed in dollars.
   */
  convertCurrency?: boolean;
  /** Units of `currency` per one AUD, as at the invoice date. */
  exchangeRate?: number | null;
  /** True once the published rate has been overridden by hand. */
  rateEdited?: boolean;

  /** Days before the due date the follow-up fires. Blank means unset. */
  followUpDays?: string;
  /** What the follow-up says — the work that may need checking on. */
  followUpNote?: string;
  /** Whether the client is chased too, or only the business is reminded. */
  followUpNotifyClient?: boolean;

  /** ISO `YYYY-MM-DD` — when the first repeat is raised. */
  repeatStart?: string;
  /** How many copies to raise in total; blank means indefinitely. */
  repeatOccurrences?: string;
  /** A label carried onto each copy, e.g. "Monthly retainer". */
  repeatTagLine?: string;

  /** Whether the saved bank details are printed on the invoice. */
  showBankDetails?: boolean;
  /**
   * The two online payment rails, each switched on per invoice as in
   * sole-webapp. Stripe: "Enable Stripe?" for this invoice. SolePay
   * (Payrix/Worldpay): "Automate payments?" — unset on a new invoice means
   * "follow the account's own setting", which is what the old editor showed.
   */
  stripeEnabled?: boolean;
  solePayEnabled?: boolean;

  /** Absent means the invoice is in the business's own currency. */
  currency?: DocumentCurrency;
  /**
   * The business currency the base totals are in, as recorded when the invoice
   * was saved. Absent on invoices from before it was recorded: those are AUD.
   */
  baseCurrency?: DocumentCurrency;
  /**
   * The total in `currency` — what the client was actually billed. Absent for
   * a plain AUD invoice, where that figure and the AUD one are the same thing.
   *
   * This is the server's own `exchange_total`, read as-is rather than derived
   * by multiplying the AUD total by a rate: the two totals are computed
   * independently at creation time (rounding per line before summing, on
   * whichever side the prices were entered), so recomputing one from the
   * other by a single multiplication doesn't reproduce it exactly, and for a
   * hand-edited rate wouldn't even agree with what the client was actually
   * charged.
   */
  exchangeTotal?: number;

  /**
   * Received so far. Recorded from the list rather than typed in the editor —
   * what a client has paid isn't part of the document you send them, which is
   * also why it's outside `InvoiceDraft`.
   */
  paidAmount: number;

  /**
   * When it went to the client, or null if it hasn't.
   *
   * Sending is something that happens *to* a finished invoice, not part of the
   * document — the same reason `paidAmount` sits out here. An invoice can be
   * finalised and outstanding on your books while the client has never seen
   * it, and that's exactly the case worth surfacing.
   */
  sentAt: string | null;
  /**
   * When it was finalised with Save (PDF only, nothing emailed), or null.
   *
   * The server clears `sent_at` on a save and keeps `saved_at` through a later
   * send, so `sentAt` wins wherever both are set.
   */
  savedAt?: string | null;

  /**
   * The bank transaction it was reconciled against, once someone has said so.
   *
   * The feed carries its own guess at the pairing, but a match the person made
   * by hand has nowhere else to live — and without it the list would go on
   * offering to match an invoice that has just been matched.
   */
  matchedTransactionId?: string | null;

  /**
   * How many bank-feed candidates the server has already found for this
   * invoice, before anyone opens the matching dialog. Zero for an invoice
   * created or edited locally, since nothing has scored it yet — only a
   * fetched invoice carries a real count. This is what picks "AI Match" over
   * a plain "Match" on the list, the same signal sole-webapp's `possible_match`
   * drives.
   */
  possibleMatch: number;

  /**
   * Which visual/PDF layout this invoice was raised on — the server's own id,
   * needed to ask it for a real PDF. Absent for a document that only exists
   * locally, since nothing has assigned it one yet.
   */
  templateId?: string;

  /** Whether this invoice raises copies of itself on a schedule. */
  isRecurring: boolean;

  /**
   * Settled by recording a cash payment rather than a bank match. This is
   * what decides between "Mark as paid" and "Undo paid" on a settled
   * invoice — one paid by a matched bank transaction has nothing to undo
   * here, since undoing that is unmatching, a separate action.
   */
  paidWithCash: boolean;

  /**
   * Whether this is an NDIS claim rather than an ordinary invoice.
   *
   * It's the only NDIS-specific thing a document carries, and it isn't
   * persisted as a field: the invoice record has no such column, so this is
   * read back from whether any line has a support item number. All it changes
   * is which line-item table the editor shows and which PDF layout renders it.
   *
   * A claim's participant details — their name, NDIS number and plan manager —
   * are properties of the *client*, not the invoice. They live on the client's
   * primary contact, and the NDIS PDF layout composes the claim header from
   * there when it renders.
   */
  ndis: boolean;
};

/**
 * Everything the editor owns; an Invoice minus its identity, its status and the
 * payments recorded against it.
 */
export type InvoiceDraft = Omit<
  Invoice,
  | "id"
  | "status"
  | "paidAmount"
  | "sentAt"
  | "matchedTransactionId"
  | "possibleMatch"
  // Both are facts about a persisted invoice's payment/schedule history, not
  // something the editor sets — `repeating` is what actually configures a
  // repeat, and cash payments aren't recorded here at all.
  | "isRecurring"
  | "paidWithCash"
>;

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

/**
 * Invoices always show cents, unlike the dashboard's rounded figures. In the
 * open business's own currency: "$" in Australia and New Zealand, "R" in South
 * Africa.
 */
export function invoiceMoney(value: number): string {
  return `${activeCurrencySymbol()}${activeAmountDigits(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * The currency a document is written in, as an ISO 4217 code.
 *
 * Any code, not a fixed set: the books are in AUD, but a client can be
 * recorded against any currency the rates feed publishes — around 160 of
 * them — and narrowing this to a handful silently dropped the currency of
 * every client outside that handful, which then lost the option to be billed
 * in their own money at all.
 */
export type DocumentCurrency = string;

/**
 * What the books are kept in when no business is open yet. The open business's
 * own is `activeBaseCurrency()`, and that is what every default below uses.
 */
export const BASE_CURRENCY = "AUD";

/**
 * The currencies offered where one has to be picked from a list. Not a limit
 * on what a document can hold — just the ones common enough to put up front.
 */
export const COMMON_CURRENCIES = [
  "AUD",
  "USD",
  "NZD",
  "GBP",
  "EUR",
  "SGD",
  "INR",
  "CAD",
  "JPY",
] as const;

/** A code, uppercased, or null if it isn't one. */
export function normaliseCurrency(
  value: string | null | undefined,
): DocumentCurrency | null {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z]{3}$/.test(code) ? code : null;
}

/**
 * Written so a figure can't be mistaken for the wrong dollar. The business's own
 * currency gets its local symbol ("$" in AU and NZ, "R" in ZA) and nothing else
 * does — every other one says whose money it is, AUD included outside Australia.
 *
 * Only the currencies with a glyph that's both well known and unambiguous get
 * one; everything else falls through to `Intl`, which in en-AU prints the ISO
 * code. That's deliberately plainer than a symbol: "¥" would be either yen or
 * yuan, and a bare "$" on a Singapore invoice reads as dollars.
 */
const CURRENCY_PREFIX: Record<string, string> = {
  AUD: "A$",
  USD: "US$",
  NZD: "NZ$",
  GBP: "£",
  EUR: "€",
};

function documentPrefix(currency: DocumentCurrency): string | undefined {
  return currency === activeBaseCurrency()
    ? activeCurrencySymbol()
    : CURRENCY_PREFIX[currency];
}

export function formatDocumentMoney(
  value: number,
  currency: DocumentCurrency = activeBaseCurrency(),
): string {
  const amount = activeAmountDigits(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const prefix = documentPrefix(currency);
  if (prefix) return `${prefix}${amount}`;

  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // An unrecognised code still has to render as something readable.
    return `${currency} ${amount}`;
  }
}

/** Just the prefix, for a field that shows the figure itself. */
export function currencySymbol(
  currency: DocumentCurrency = activeBaseCurrency(),
): string {
  const prefix = documentPrefix(currency);
  if (prefix) return prefix;
  try {
    // Formatting zero and stripping the digits leaves whatever Intl uses.
    return new Intl.NumberFormat("en-AU", { style: "currency", currency })
      .format(0)
      .replace(/[\d.,\s]/g, "");
  } catch {
    return currency;
  }
}

/** Whether the figures need saying twice — once billed, once converted. */
export function isForeignCurrency(
  currency?: DocumentCurrency,
  base: DocumentCurrency = activeBaseCurrency(),
): boolean {
  return !!currency && currency !== base;
}

/** ISO date to the list's `DD/MM/YYYY`. */
export function formatInvoiceDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return year && month && day ? `${day}/${month}/${year}` : "—";
}

/** ISO date to the editor's `DD Mon YYYY` trigger label. */
export function formatDateLabel(iso: string): string {
  if (!iso) return "Select date";
  const [year, month, day] = iso.split("-").map(Number);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  if (!year || !month || !day) return "Select date";
  return `${String(day).padStart(2, "0")} ${months[month - 1]} ${year}`;
}

export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseIsoDate(iso: string): Date | undefined {
  if (!iso) return undefined;
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

/** Adds payment terms in days to the issue date. */
export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/**
 * Semantic only, per the brief: paid green, pending amber, overdue red. Draft
 * is none of those — it's not money in play yet — so it stays neutral.
 */
export function statusVariant(
  status: InvoiceStatus,
): "success" | "warning" | "danger" | "secondary" {
  if (status === "Paid") return "success";
  if (status === "Overdue") return "danger";
  if (status === "Draft") return "secondary";
  return "warning";
}

/** The Due column keeps status colour; every other date stays muted. */
export function dueDateClass(status: InvoiceStatus): string {
  if (status === "Overdue") return "text-destructive";
  if (status === "Paid") return "text-muted-foreground";
  if (OUTSTANDING_STATUSES.includes(status)) return "text-warning";
  return "text-muted-foreground";
}

/* ------------------------------------------------------------------ *
 * Line-item maths
 * ------------------------------------------------------------------ */

export const GST_RATE = 0.1;

/**
 * The same rate as `GST_RATE`, in percentage points. The real rate is the
 * business's (`documentTax` in lib/country-context: its custom rate or its
 * country's) and is threaded through the maths below — this is only the
 * fallback for a caller that has none to hand (the list and the dashboard,
 * which read totals the server already computed).
 */
export const GST_PERCENT = 10;

/** The rate a line is charged at: its own saved rate, else the document's. */
export function lineGstPercent(item: InvoiceLineItem, gstPercent = GST_PERCENT): number {
  return item.gstPercent !== undefined && item.gstPercent > 0 ? item.gstPercent : gstPercent;
}

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function lineTotals(item: InvoiceLineItem, gstPercent = GST_PERCENT) {
  const gross = toNumber(item.quantity) * toNumber(item.price);
  const rawDiscount = toNumber(item.discountPercent);
  const discount =
    (item.discountType ?? DEFAULT_DISCOUNT_TYPE) === "amount"
      ? rawDiscount
      : (gross * rawDiscount) / 100;
  const net = gross - discount;
  const gst = item.gst ? (net * lineGstPercent(item, gstPercent)) / 100 : 0;
  return { gross, discount, net, gst, amount: net + gst };
}

export function invoiceTotals(
  items: InvoiceLineItem[],
  extraDiscount: string,
  gstPercent = GST_PERCENT,
) {
  const totals = items.reduce(
    (sum, item) => {
      const line = lineTotals(item, gstPercent);
      return {
        subtotal: sum.subtotal + line.gross,
        discountTotal: sum.discountTotal + line.discount,
        gstTotal: sum.gstTotal + line.gst,
      };
    },
    { subtotal: 0, discountTotal: 0, gstTotal: 0 },
  );

  const extra = toNumber(extraDiscount);
  return {
    ...totals,
    extra,
    total: Math.max(
      0,
      totals.subtotal - totals.discountTotal - extra + totals.gstTotal,
    ),
  };
}

/**
 * The total in AUD, which is what the books are kept in — the figure every
 * cross-invoice sum (the dashboard, the area totals, a refund prefill) has to
 * use, since summing invoices raised in different currencies only means
 * anything once they're all in the same one.
 *
 * For a list-mapped invoice this comes straight from the API's `total`,
 * carried on the single placeholder line `fetchInvoices` builds — see the
 * comment above `ApiInvoice`. That field is AUD unconditionally, multicurrency
 * or not, which is also why this never needs a rate applied to it.
 */
export function invoiceAmount(invoice: Invoice): number {
  return invoiceTotals(invoice.items, invoice.extraDiscount).total;
}

/**
 * The total in the invoice's *own* currency — what the client was actually
 * billed, and the figure that belongs next to `invoice.currency` on screen.
 * The same number as `invoiceAmount` for a plain AUD invoice.
 */
export function invoiceDocumentAmount(invoice: Invoice): number {
  return invoice.exchangeTotal ?? invoiceAmount(invoice);
}

/** What the deposit asks for, in AUD. */
export function invoiceDepositAmount(invoice: Invoice): number | null {
  return depositAmount(invoice.deposit, invoiceAmount(invoice));
}

/** Still owed, in AUD. Zero once the invoice is settled. */
export function invoiceOutstanding(invoice: Invoice): number {
  return Math.max(0, invoiceAmount(invoice) - invoice.paidAmount);
}

/**
 * The balance still owed, in the invoice's own currency. Payments are
 * recorded in AUD with no independent "remaining in NZD" figure to read, so
 * this holds the same *proportion* of the document total that the AUD
 * balance holds of the AUD total — the same approach sole-webapp's own list
 * takes. The same number as `invoiceOutstanding` for a plain AUD invoice.
 */
export function invoiceDocumentOutstanding(invoice: Invoice): number {
  const audTotal = invoiceAmount(invoice);
  if (audTotal <= 0) return 0;
  return (
    (invoiceOutstanding(invoice) / audTotal) * invoiceDocumentAmount(invoice)
  );
}

/**
 * What a payment of `received` leaves the invoice as. A payment that covers the
 * balance settles it; anything less is partial, whatever it was before — so
 * recording a payment can't leave an invoice looking Overdue when money has
 * actually arrived.
 */
export function statusAfterPayment(
  invoice: Invoice,
  received: number,
): InvoiceStatus {
  return received >= invoiceAmount(invoice) - 0.005 ? "Paid" : "Partially paid";
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/** A line item counts once it could actually be billed. */
export function isLineItemFilled(item: InvoiceLineItem): boolean {
  return (
    item.description.trim().length > 0 &&
    toNumber(item.quantity) > 0 &&
    toNumber(item.price) > 0
  );
}

function isBlankOrValid(value: string, whole: boolean): boolean {
  if (!value.trim()) return true;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return false;
  return whole ? Number.isInteger(parsed) : true;
}

/**
 * Live numeric errors — shown the moment a value is invalid, not gated on
 * submit, because silently correcting the field reads as broken.
 */
export function lineItemErrors(item: InvoiceLineItem): {
  quantity?: string;
  price?: string;
  discountPercent?: string;
} {
  const errors: {
    quantity?: string;
    price?: string;
    discountPercent?: string;
  } = {};

  // NDIS supports are claimed in hours, so 1.5 is a legitimate quantity there
  // — and so is any line counted in hours or kilometres (a KM Tracker trip is
  // billed as 12.38 km, never rounded to a whole one).
  const wholeOnly =
    !isNdisLineItem(item) && item.qtyType !== "hours" && item.qtyType !== "km";
  if (!isBlankOrValid(item.quantity, wholeOnly)) {
    errors.quantity = wholeOnly
      ? "Enter a whole number (0 or more)."
      : "Enter a valid quantity — no letters or negatives.";
  }
  if (!isBlankOrValid(item.price, false)) {
    errors.price = "Enter a valid price — no letters or negatives.";
  }
  const amountDiscount =
    (item.discountType ?? DEFAULT_DISCOUNT_TYPE) === "amount";
  if (!isBlankOrValid(item.discountPercent, false)) {
    errors.discountPercent = amountDiscount
      ? "Enter a valid amount — no letters or negatives."
      : "Enter a valid percentage.";
  } else if (!amountDiscount && toNumber(item.discountPercent) > 100) {
    errors.discountPercent = "Discount can't exceed 100%.";
  } else if (amountDiscount) {
    const gross = toNumber(item.quantity) * toNumber(item.price);
    if (gross > 0 && toNumber(item.discountPercent) > gross) {
      errors.discountPercent = "Discount can't exceed the line amount.";
    }
  }

  return errors;
}

export type InvoiceIssue = {
  /** Matches the field's key in the editor's focus map. */
  key: string;
  message: string;
};

/** The parts of a draft that validate identically for invoices and quotes. */
export type DocumentDraft = {
  clientId: string | null;
  clientName: string;
  number: string;
  items: InvoiceLineItem[];
};

/**
 * Required-field issues, in the order the fields appear on screen — so the
 * editor can reveal them all on submit and focus the first. Shared by the
 * invoice and quote editors, which validate the same three things.
 */
export function documentIssues(
  draft: DocumentDraft,
  /** What the document is called in the messages — a quote isn't an invoice. */
  noun: "invoice" | "quote" = "invoice",
): InvoiceIssue[] {
  const issues: InvoiceIssue[] = [];

  // "0" is the backend's "no client" (a template's client_id), never a real one.
  const clientId =
    draft.clientId && draft.clientId !== "0" ? draft.clientId : null;
  if (!clientId && !draft.clientName.trim()) {
    issues.push({
      key: "client",
      message: `Select a client for this ${noun}.`,
    });
  }

  if (!draft.number.trim()) {
    issues.push({ key: "number", message: `Enter a ${noun} number.` });
  }

  if (!draft.items.some(isLineItemFilled)) {
    issues.push({
      key: `item-${draft.items[0]?.id ?? "0"}-description`,
      message:
        "Add at least one line item with a description, quantity and price.",
    });
  }

  for (const item of draft.items) {
    const errors = lineItemErrors(item);
    for (const field of ["quantity", "price", "discountPercent"] as const) {
      const message = errors[field];
      if (message) issues.push({ key: `item-${item.id}-${field}`, message });
    }
  }

  return issues;
}

/**
 * What an NDIS invoice needs on top of the shared required fields. Kept
 * separate from `documentIssues` so quotes and general invoices don't pay for
 * it.
 *
 * The participant's own details aren't validated here because they aren't
 * entered here — see `ndisClientIssue`, which checks the one thing that can
 * block a claim: the participant having an NDIS number on file.
 */
export function ndisIssues(items: InvoiceLineItem[]): InvoiceIssue[] {
  const issues: InvoiceIssue[] = [];

  for (const item of items) {
    // Only lines that would actually be billed — a blank spare row shouldn't
    // demand a support item number.
    if (isLineItemFilled(item) && !item.supportItemNumber?.trim()) {
      issues.push({
        key: `item-${item.id}-supportItemNumber`,
        message: "Every support needs its NDIS support item number.",
      });
    }
  }

  return issues;
}

/* ------------------------------------------------------------------ *
 * Derived summaries — computed, never stored
 * ------------------------------------------------------------------ */

/**
 * Largest-remainder rounding. Rounding each share independently overshoots —
 * five statuses at one sixth each round to 17% and sum to 101%, which
 * overflows the proportion bar.
 *
 * Exported because every proportion bar drawn off these counts needs the same
 * arithmetic, and a second implementation in a card is a bar that disagrees
 * with this one by a point.
 */
export function percentShares(counts: number[]): number[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0) return counts.map(() => 0);

  const exact = counts.map((count) => (count / total) * 100);
  const shares = exact.map(Math.floor);
  let remainder = 100 - shares.reduce((sum, share) => sum + share, 0);

  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    // Never hand a leftover point to a status with nothing in it.
    .filter(({ index }) => counts[index] > 0)
    .sort((a, b) => b.fraction - a.fraction);

  for (const { index } of byFraction) {
    if (remainder <= 0) break;
    shares[index] += 1;
    remainder -= 1;
  }

  return shares;
}

/** Per-status counts and amounts for the Dashboard's invoice card. */
export function invoiceSummary(invoices: Invoice[]) {
  const total = invoices.reduce((sum, inv) => sum + invoiceAmount(inv), 0);

  const matches = INVOICE_STATUSES.map((status) =>
    invoices.filter((invoice) => invoice.status === status),
  );
  /** Share of invoice count, so the bar and its tooltip agree. */
  const shares = percentShares(matches.map((group) => group.length));

  const byStatus = INVOICE_STATUSES.map((status, index) => ({
    status,
    count: matches[index].length,
    amount: matches[index].reduce((sum, inv) => sum + invoiceAmount(inv), 0),
    share: shares[index],
  }));

  return { total, count: invoices.length, byStatus };
}

/** The bounds of a financial year, and what to call it. */
export type FinancialYear = {
  /** Inclusive ISO `YYYY-MM-DD` for the first day — 1 July in Australia. */
  startIso: string;
  /** Inclusive ISO `YYYY-MM-DD` for the last day — 30 June in Australia. */
  endIso: string;
  /** "Financial year 2026" — named for the year it starts in. */
  label: string;
};

/**
 * The financial year `today` falls in — 1 July to 30 June unless `start` says
 * otherwise (New Zealand's is 1 April); callers pass the business's country.
 *
 * One helper for the bounds *and* the label, because they're the same fact and
 * the dashboard was getting them from different places — a card that scopes to
 * one year while its subtitle names another is worse than either being wrong on
 * its own. Every surface that reports a year's figures takes both from here.
 *
 * ISO strings rather than Dates, so a period test is a string comparison
 * against the ISO dates invoices and expenses already carry. That avoids
 * parsing a date to compare it, and with it the timezone class of bug where an
 * invoice issued on 1 July lands in the year before.
 *
 * Distinct from `financialYear`/`fyLabel` in `report-periods`, which are the
 * report engine's own and work from its frozen `REPORT_TODAY`. This one follows
 * the wall clock, because these figures are the live books.
 */
export function currentFinancialYear(
  today: Date = new Date(),
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): FinancialYear {
  const startYear = fiscalYearOf(today, start);
  const range = fiscalYearRange(startYear, start);
  return {
    startIso: range.start,
    endIso: range.end,
    label: `Financial year ${startYear}`,
  };
}

/**
 * What was actually billed in a financial year, and across how many invoices.
 *
 * Drafts are out: a draft is money you haven't asked for, and counting it as
 * revenue is the difference between a figure and a hope. Everything else counts
 * from the moment it's issued rather than when it's paid — this is the revenue
 * line, not the cash position.
 *
 * Shared rather than derived per card, because the revenue goal and the
 * business snapshot both report it and "the same figure" has to mean the same
 * arithmetic. The count comes back with it since an average needs both.
 */
export function financialYearRevenue(
  invoices: Invoice[],
  year: FinancialYear = currentFinancialYear(),
): { amount: number; count: number } {
  const billed = invoices.filter(
    (invoice) =>
      invoice.status !== "Draft" &&
      invoice.issued >= year.startIso &&
      invoice.issued <= year.endIso,
  );

  return {
    amount: billed.reduce((sum, invoice) => sum + invoiceAmount(invoice), 0),
    count: billed.length,
  };
}

/** A figure and how many invoices are behind it. */
export type InvoiceBucket = { amount: number; count: number };

export type InvoiceOverview = {
  draft: InvoiceBucket;
  outstanding: InvoiceBucket;
  partiallyPaid: InvoiceBucket;
  paid: InvoiceBucket;
  /** Everything invoiced, whatever state it's in. */
  total: InvoiceBucket;
  /** One entry per status, in `INVOICE_STATUSES` order. */
  distribution: { status: InvoiceStatus; count: number }[];
};

/** One bucket: the invoices that match, and what they're worth by `of`. */
function invoiceBucket(
  invoices: Invoice[],
  matches: (invoice: Invoice) => boolean,
  of: (invoice: Invoice) => number,
): InvoiceBucket {
  const group = invoices.filter(matches);
  return {
    amount: group.reduce((sum, invoice) => sum + of(invoice), 0),
    count: group.length,
  };
}

/**
 * The invoice book in five figures, plus the spread behind them.
 *
 * Bucketed by what the money is doing rather than by status, which is why this
 * sits alongside `invoiceSummary` rather than replacing it: that one is
 * per-status and answers "how many of each", this one answers "how much is
 * where". Overdue folds into outstanding because both are the same thing to a
 * bank balance — how late it is belongs to the row, not to the total.
 *
 * Which figure each bucket takes is the load-bearing part. Draft and paid take
 * the invoice's own amount, because nothing is owed on a draft and everything
 * has arrived on a paid one. The two that are mid-flight take the balance
 * outstanding, so a $10,000 invoice with $9,000 received contributes $1,000 —
 * the number someone is waiting on, not the number they've already banked.
 * Which also means the four buckets deliberately don't sum to `total`.
 *
 * `distribution` carries counts and not amounts: it feeds a proportion bar
 * about how the book is spread, and a bar weighted by money would be one large
 * invoice wide.
 */
export function invoiceOverview(invoices: Invoice[]): InvoiceOverview {
  return {
    draft: invoiceBucket(
      invoices,
      (invoice) => invoice.status === "Draft",
      invoiceAmount,
    ),
    outstanding: invoiceBucket(
      invoices,
      (invoice) =>
        invoice.status === "Outstanding" || invoice.status === "Overdue",
      invoiceOutstanding,
    ),
    partiallyPaid: invoiceBucket(
      invoices,
      (invoice) => invoice.status === "Partially paid",
      invoiceOutstanding,
    ),
    paid: invoiceBucket(
      invoices,
      (invoice) => invoice.status === "Paid",
      invoiceAmount,
    ),
    total: invoiceBucket(invoices, () => true, invoiceAmount),
    distribution: INVOICE_STATUSES.map((status) => ({
      status,
      count: invoices.filter((invoice) => invoice.status === status).length,
    })),
  };
}

const MS_PER_DAY = 86_400_000;

/** What the Dashboard's "N invoices overdue" row reports. */
export function overdueSummary(invoices: Invoice[], todayIso: string) {
  const overdue = invoices.filter((invoice) => invoice.status === "Overdue");
  const today = parseIsoDate(todayIso);

  const oldestDays = overdue.reduce((worst, invoice) => {
    const due = parseIsoDate(invoice.due);
    if (!due || !today) return worst;
    const days = Math.floor((today.getTime() - due.getTime()) / MS_PER_DAY);
    return Math.max(worst, days);
  }, 0);

  return {
    count: overdue.length,
    amount: overdue.reduce((sum, invoice) => sum + invoiceAmount(invoice), 0),
    oldestDays,
  };
}

/* ------------------------------------------------------------------ *
 * Drafts
 * ------------------------------------------------------------------ */

let lineItemSeq = 0;
export function newLineItem(): InvoiceLineItem {
  lineItemSeq += 1;
  return {
    id: `line-${lineItemSeq}`,
    description: "",
    quantity: "",
    price: "",
    discountPercent: "",
    discountType: DEFAULT_DISCOUNT_TYPE,
    gst: true,
    qtyType: DEFAULT_QTY_TYPE,
  };
}

/**
 * An NDIS support line. GST-free by default — most NDIS supports are — and
 * overridable per line from the table, since some, like consumables bought at
 * retail, do carry GST.
 */
export function newNdisLineItem(): InvoiceLineItem {
  return {
    ...newLineItem(),
    gst: false,
    supportItemNumber: "",
    claimType: DEFAULT_NDIS_CLAIM_TYPE,
    date: "",
  };
}

export const DEFAULT_INVOICE_NUMBERING: DocumentNumbering = {
  prefix: "INV",
  next: "1",
};

/**
 * Next number in the `INV-0000` sequence. Takes its prefix and starting number
 * from Sales settings rather than hardcoding them, so editing those values
 * actually changes what the next invoice is called.
 *
 * The configured start acts as a floor, not an override: whichever is higher, it
 * or the highest number already on file, wins — otherwise setting it backwards
 * would mint a duplicate.
 */
export function nextInvoiceNumber(
  invoices: Invoice[],
  numbering: DocumentNumbering = DEFAULT_INVOICE_NUMBERING,
): string {
  const highest = invoices.reduce((max, invoice) => {
    const digits = invoice.number.match(/(\d+)\s*$/);
    return digits ? Math.max(max, Number(digits[1])) : max;
  }, 0);
  const configured = Number(numbering.next.replace(/\D/g, "")) || 0;
  const value = Math.max(highest + 1, configured);
  const prefix = numbering.prefix.trim() || "INV";
  return `${prefix}-${String(value).padStart(4, "0")}`;
}

export const DEFAULT_PAYMENT_TERMS = 7;

export function emptyInvoiceDraft(number: string, today: string): InvoiceDraft {
  return {
    number,
    clientId: null,
    clientName: "",
    issued: today,
    due: addDays(today, DEFAULT_PAYMENT_TERMS),
    description: "",
    items: [newLineItem()],
    extraDiscount: "",
    notes: "",
    followUpReminder: false,
    overdueReminder: true,
    repeating: false,
    repeatFrequency: "Monthly",
    reviewBeforeSending: true,
    deposit: null,
    attachments: [],
    ndis: false,

    recipients: [],
    invoiceEmail: "",
    convertCurrency: false,
    exchangeRate: null,
    rateEdited: false,
    followUpDays: "",
    followUpNote: "",
    followUpNotifyClient: false,
    // A repeat starts tomorrow at the earliest — raising the first copy today
    // would duplicate the invoice being written right now.
    repeatStart: addDays(today, 1),
    repeatOccurrences: "",
    repeatTagLine: "",
    showBankDetails: true,
    stripeEnabled: false,
  };
}

/** A blank NDIS invoice: the general draft, marked as a claim, with one support. */
export function emptyNdisDraft(number: string, today: string): InvoiceDraft {
  return {
    ...emptyInvoiceDraft(number, today),
    items: [newNdisLineItem()],
    ndis: true,
  };
}

/**
 * One line item, prefilled from a catalogue entry. Quantity starts at 1 — the
 * point of "Add to invoice" is that the description, price and GST arrive filled
 * in, leaving only the quantity to say.
 */
export function lineItemFromCatalogue(item: {
  name: string;
  saleDescription: string;
  salePrice: string;
  saleTax: string;
}): InvoiceLineItem {
  return {
    ...newLineItem(),
    description: item.saleDescription.trim() || item.name,
    quantity: "1",
    price: item.salePrice,
    gst: isTaxedRate(item.saleTax),
  };
}

export function draftFromInvoice(invoice: Invoice): InvoiceDraft {
  return {
    number: invoice.number,
    clientId: invoice.clientId,
    clientName: invoice.clientName,
    issued: invoice.issued,
    due: invoice.due,
    description: invoice.description,
    items: invoice.items.map((item) => ({ ...item })),
    extraDiscount: invoice.extraDiscount,
    notes: invoice.notes,
    followUpReminder: invoice.followUpReminder,
    overdueReminder: invoice.overdueReminder,
    repeating: invoice.repeating,
    repeatFrequency: invoice.repeatFrequency,
    reviewBeforeSending: invoice.reviewBeforeSending,
    deposit: invoice.deposit ? { ...invoice.deposit } : null,
    attachments: invoice.attachments.map((file) => ({ ...file })),
    ndis: invoice.ndis,

    // Everything below is absent on an invoice mapped from the list endpoint,
    // so each falls back to what a blank draft would have carried rather than
    // to undefined — the editor's fields are controlled and can't take one.
    recipients: invoice.recipients?.map((person) => ({ ...person })) ?? [],
    invoiceEmail: invoice.invoiceEmail ?? "",
    currency: invoice.currency,
    convertCurrency: invoice.convertCurrency ?? false,
    exchangeRate: invoice.exchangeRate ?? null,
    rateEdited: invoice.rateEdited ?? false,
    exchangeTotal: invoice.exchangeTotal,
    followUpDays: invoice.followUpDays ?? "",
    followUpNote: invoice.followUpNote ?? "",
    followUpNotifyClient: invoice.followUpNotifyClient ?? false,
    repeatStart: invoice.repeatStart ?? addDays(invoice.issued, 1),
    repeatOccurrences: invoice.repeatOccurrences ?? "",
    repeatTagLine: invoice.repeatTagLine ?? "",
    showBankDetails: invoice.showBankDetails ?? true,
    stripeEnabled: invoice.stripeEnabled ?? false,
    solePayEnabled: invoice.solePayEnabled,
    templateId: invoice.templateId,
  };
}

/* ------------------------------------------------------------------ *
 * API — GET /invoice/invoices, GET /invoice/invoices/:id, and the actions
 * the list and editor take against an invoice that already exists.
 *
 * The list endpoint returns each invoice's totals but not its line items —
 * those only come back from `fetchInvoiceDetail`, the single-invoice call
 * below. Until that's fetched, a list-mapped invoice carries a single
 * placeholder line built from the API's `total`, with no GST or discount
 * applied, so `invoiceAmount()` reproduces that total exactly without the
 * list needing its own copy of the money math.
 * ------------------------------------------------------------------ */

type ApiInvoiceClient = {
  client_id?: string | number;
  name?: string;
  currency?: string | null;
};

type ApiInvoice = {
  invoice_id: string | number;
  invoice_no?: string;
  client_id?: string | number | null;
  client?: ApiInvoiceClient | null;
  invoice_date?: string;
  due_date?: string;
  status?: string;
  mark_as?: string;
  description?: string;
  total?: number | string;
  remainingAmount?: number | string;
  sent_at?: string | null;
  saved_at?: string | null;
  bank_transaction_id?: string | number | null;
  /** A count of bank-feed candidates the server has already scored for this invoice. */
  possible_match?: number;
  is_deposit?: boolean | number;
  payment_structure?: string;
  deposit_type?: string;
  deposit_selection_type?: string | null;
  deposit_selected_items?: number[] | null;
  deposit_value?: number | string;
  deposit_due_date?: string | null;
  currency_code?: string;
  is_multicurrency?: boolean | number;
  exchange_rate?: number | string;
  is_exchange_rate_edited?: boolean | number;
  /** The business currency the base totals are in; absent on invoices saved before it was recorded. */
  base_currency?: string | null;
  /** The total in `currency_code` — what the client was actually billed. */
  exchange_total?: number | string;
  template_id?: string | number | null;
  is_recurring_invoice?: boolean | number;
  paid_with_cash?: boolean | number;
};

export function apiNumber(value: number | string | undefined): number {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

/** `2026-07-08T00:00:00.000Z` and `2026-07-08` both become the plain ISO date. */
export function apiDate(value: string | undefined): string {
  return value ? value.slice(0, 10) : "";
}

/**
 * The list endpoint's `status` already comes pre-resolved as one of draft,
 * due, overdue, paid or partially_paid — the same vocabulary its own filter
 * takes — so this only has to translate spelling, not derive due-vs-overdue
 * itself. The due-date comparison is a fallback for the rare row that omits
 * `status` altogether (or sends `mark_as` instead), not the normal path.
 */
function mapInvoiceStatus(
  raw: ApiInvoice,
  due: string,
  todayIso: string,
): InvoiceStatus {
  const value = (raw.status ?? raw.mark_as ?? "").toLowerCase();
  if (value === "paid") return "Paid";
  if (value === "draft") return "Draft";
  if (value === "partially_paid") return "Partially paid";
  if (value === "overdue") return "Overdue";
  if (value === "due" || value === "sent" || value === "recurring")
    return "Outstanding";
  return due && due < todayIso ? "Overdue" : "Outstanding";
}

/**
 * A deposit for chosen line items is stored as a fixed amount with
 * `deposit_selection_type` recording how that amount was arrived at — so the
 * selection type is what has to be read first, or an items deposit comes back
 * as a bare figure and loses which lines it covered.
 */
function mapInvoiceDeposit(raw: ApiInvoice): InvoiceDeposit | null {
  const requested =
    Boolean(raw.is_deposit) || raw.payment_structure === "deposit_balance";
  if (!requested) return null;

  const mode: InvoiceDeposit["mode"] =
    raw.deposit_selection_type === "select_items"
      ? "items"
      : raw.deposit_type === "percentage"
        ? "percent"
        : "amount";

  return {
    mode,
    value: String(raw.deposit_value ?? "0"),
    selectedItems: Array.isArray(raw.deposit_selected_items)
      ? raw.deposit_selected_items.map(Number).filter(Number.isInteger)
      : undefined,
    dueDate: raw.deposit_due_date ? apiDate(raw.deposit_due_date) : undefined,
  };
}

function mapApiInvoice(raw: ApiInvoice, todayIso: string): Invoice {
  const due = apiDate(raw.due_date);
  const total = apiNumber(raw.total);
  const remaining = apiNumber(raw.remainingAmount);
  const currency = normaliseCurrency(raw.currency_code);

  return {
    id: String(raw.invoice_id),
    number: raw.invoice_no ?? "",
    clientId:
      raw.client_id != null
        ? String(raw.client_id)
        : raw.client?.client_id != null
          ? String(raw.client.client_id)
          : null,
    clientName: raw.client?.name ?? "",
    issued: apiDate(raw.invoice_date),
    due,
    status: mapInvoiceStatus(raw, due, todayIso),
    description: raw.description ?? "",
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
    followUpReminder: false,
    overdueReminder: true,
    repeating: false,
    repeatFrequency: "Monthly",
    reviewBeforeSending: true,
    deposit: mapInvoiceDeposit(raw),
    attachments: [],
    currency: raw.is_multicurrency ? (currency ?? undefined) : undefined,
    // The client-billed figure, read straight from the API rather than
    // derived by multiplying `total` (AUD) by the rate — the two are computed
    // independently server-side, so recomputing one from the other doesn't
    // reproduce it exactly, and disagrees outright once a rate is hand-edited
    // after the fact.
    exchangeTotal: raw.is_multicurrency
      ? apiNumber(raw.exchange_total) || undefined
      : undefined,
    baseCurrency: normaliseCurrency(raw.base_currency) ?? undefined,
    convertCurrency: Boolean(raw.is_multicurrency),
    exchangeRate: raw.is_multicurrency
      ? apiNumber(raw.exchange_rate) || null
      : null,
    rateEdited: Boolean(raw.is_exchange_rate_edited),
    paidAmount: Math.max(0, total - remaining),
    // The API sends a full datetime ("2026-09-02 19:54:18"); the UI only
    // ever shows the date, and `formatInvoiceDate` expects just that.
    sentAt: raw.sent_at ? apiDate(raw.sent_at) : null,
    savedAt: raw.saved_at ? apiDate(raw.saved_at) : null,
    matchedTransactionId:
      raw.bank_transaction_id != null ? String(raw.bank_transaction_id) : null,
    possibleMatch: apiNumber(raw.possible_match),
    templateId: raw.template_id != null ? String(raw.template_id) : undefined,
    isRecurring: Number(raw.is_recurring_invoice) === 1,
    paidWithCash: Number(raw.paid_with_cash) === 1,
    ndis: false,
  };
}

/** The account's invoices, newest first — mirrors sole-webapp's default list order. */
export async function fetchInvoices(): Promise<Invoice[]> {
  const response = await api.get<{
    success: boolean;
    data?: { invoice_details?: ApiInvoice[] };
  }>(apiRoutes.invoice.list, {
    params: {
      page: 1,
      page_size: 200,
      "sort_by[invoice_id]": "desc",
    },
  });

  const raw = response.data?.data?.invoice_details ?? [];
  const todayIso = toIsoDate(new Date());
  return raw.map((item) => mapApiInvoice(item, todayIso));
}

/* ------------------------------------------------------------------ *
 * A filtered, paginated page of the list — GET /invoice/invoices with
 * filter_by/sort_by, the same query sole-webapp's own list screen sends.
 *
 * Separate from `fetchInvoices` above, which the Dashboard and every other
 * screen reading `useInvoicesStore` still use for their own full-book totals
 * — this is only for the list's own rows and pager, and narrowing it to a
 * status or a search term has no business shrinking what the Dashboard adds
 * up.
 * ------------------------------------------------------------------ */

/** The tab a row belongs to, in the vocabulary `filter_by[status]` takes. */
const STATUS_FILTER_VALUE: Record<InvoiceStatus, string> = {
  Draft: "draft",
  Outstanding: "due",
  Overdue: "overdue",
  "Partially paid": "partially_paid",
  Paid: "paid",
};

export type InvoiceListFilters = {
  /** Omit, or "All", to leave the tab unfiltered. */
  status?: InvoiceTab;
  search?: string;
  /** ISO `YYYY-MM-DD`, inclusive. */
  issuedFrom?: string;
  issuedTo?: string;
  minTotal?: number;
  maxTotal?: number;
  balanceMin?: number;
  balanceMax?: number;
  sent?: "sent" | "not_sent";
  matchedOnly?: boolean;
  paidWithCashOnly?: boolean;
  /** Narrows to these clients' invoices — an area filter resolves to this too. */
  clientIds?: string[];
};

export type InvoiceListPage = {
  invoices: Invoice[];
  total: number;
  /** The highest total on any invoice matching every filter but the amount range — what the amount slider should span. */
  maxTotal: number;
  /** Same idea, for the balance-still-owed range. */
  maxBalance: number;
};

/**
 * Flattens the filters into the `filter_by[key]` query params the backend's
 * `parseFilterBy` reconstructs — the same bracket notation sole-webapp sends
 * (and the one this file already uses for `sort_by[invoice_id]`), so no
 * special request serialiser is needed for it to arrive as nested JSON.
 */
function invoiceListParams(
  page: number,
  pageSize: number,
  filters: InvoiceListFilters,
): Record<string, string | number> {
  const params: Record<string, string | number> = {
    page,
    page_size: pageSize,
    "sort_by[invoice_id]": "desc",
  };

  if (filters.status && filters.status !== "All") {
    params["filter_by[status]"] = STATUS_FILTER_VALUE[filters.status];
  }
  if (filters.search?.trim()) {
    params["filter_by[search]"] = filters.search.trim();
  }
  if (filters.issuedFrom) params["filter_by[start_date]"] = filters.issuedFrom;
  if (filters.issuedTo) params["filter_by[end_date]"] = filters.issuedTo;
  if (filters.minTotal != null) params["filter_by[min_price]"] = filters.minTotal;
  if (filters.maxTotal != null) params["filter_by[max_price]"] = filters.maxTotal;
  if (filters.balanceMin != null) {
    params["filter_by[balance_min]"] = filters.balanceMin;
  }
  if (filters.balanceMax != null) {
    params["filter_by[balance_max]"] = filters.balanceMax;
  }
  if (filters.sent) {
    params["filter_by[sent_status]"] = filters.sent === "sent" ? 1 : 0;
  }
  if (filters.matchedOnly) params["filter_by[matched]"] = 1;
  if (filters.paidWithCashOnly) params["filter_by[paid_with_cash]"] = 1;
  filters.clientIds?.forEach((id, index) => {
    // 1-indexed — sole-webapp's own bracket numbering for this field.
    params[`filter_by[client_id][${index + 1}]`] = id;
  });

  return params;
}

export async function fetchInvoicesPage(
  page: number,
  pageSize: number,
  filters: InvoiceListFilters = {},
): Promise<InvoiceListPage> {
  const response = await api.get<{
    success: boolean;
    data?: {
      invoice_details?: ApiInvoice[];
      total?: number;
      max_price?: number;
      max_due_balance?: number;
    };
  }>(apiRoutes.invoice.list, {
    params: invoiceListParams(page, pageSize, filters),
  });

  const data = response.data?.data;
  const raw = data?.invoice_details ?? [];
  const todayIso = toIsoDate(new Date());

  return {
    invoices: raw.map((item) => mapApiInvoice(item, todayIso)),
    total: data?.total ?? raw.length,
    maxTotal: apiNumber(data?.max_price),
    maxBalance: apiNumber(data?.max_due_balance),
  };
}

export type InvoiceStatusCounts = Record<InvoiceTab, number>;

/**
 * Status-tab counts across the whole account — a real server-side aggregate,
 * not a count of whatever page (or 200-row cap) happens to be loaded
 * client-side. Takes the same `filter_by[client_id]` scoping the list's own
 * client picker and area deep-links use, so a tab's count still matches an
 * area-scoped list rather than the whole account.
 */
export async function fetchInvoiceStatusCounts(
  clientIds?: string[],
): Promise<InvoiceStatusCounts> {
  const params: Record<string, string> = {};
  clientIds?.forEach((id, index) => {
    params[`filter_by[client_id][${index + 1}]`] = id;
  });

  const response = await api.get<{
    success: boolean;
    data?: {
      all?: number;
      draft?: number;
      due?: number;
      overdue?: number;
      partially_paid?: number;
      paid?: number;
    };
  }>(apiRoutes.invoice.statusCounts, { params });

  const data = response.data?.data ?? {};
  return {
    All: data.all ?? 0,
    Draft: data.draft ?? 0,
    Outstanding: data.due ?? 0,
    Overdue: data.overdue ?? 0,
    "Partially paid": data.partially_paid ?? 0,
    Paid: data.paid ?? 0,
  };
}

export function assertApiSuccess(
  data: { success?: boolean; message?: string } | undefined,
  fallback: string,
): void {
  // Absent rather than `false` isn't a failure — not every endpoint's
  // response carries the field, and a non-2xx status already throws.
  if (data?.success === false) {
    throw new Error(data.message || fallback);
  }
}

/* ------------------------------------------------------------------ *
 * Detail — GET /invoice/invoices/:id, with real line items and documents
 * ------------------------------------------------------------------ */

type ApiInvoiceItem = {
  description?: string;
  qty?: number | string;
  price?: number | string;
  qty_type?: string;
  product_id?: number | string | null;
  disc_criteria?: string;
  discount_percentage?: number | string;
  discount_amount?: number | string;
  gst?: boolean | number;
  gst_percentage?: number | string | null;
  item_support_no?: string;
  claim_type?: string;
  /** NDIS supports only — the date the support was delivered. */
  date?: string | null;
};

type ApiInvoiceDocument = {
  id: string | number;
  file_name?: string;
  file_path?: string;
};

type ApiInvoiceDetail = ApiInvoice & {
  invoice_item?: ApiInvoiceItem[] | null;
  documents?: ApiInvoiceDocument[] | null;
  notes?: string;
  extra_discount?: number | string;
  payment_term?: number | string | null;
  invoice_email?: string | null;
  show_bank_details?: boolean | number;
  is_payrixpay?: boolean | number;
  is_stripe_enabled?: boolean | number | string;
  due_reminder?: boolean | number;
  /** Who the copy went to, as chips on the client picker. */
  selected_contacts?: Array<{
    id?: string | number;
    contact_id?: string | number;
    name?: string;
    email?: string;
  }> | null;
  is_notify_future_work?: number | boolean;
  notify_future_work?: {
    notify_future_work_date?: string;
    notify_future_work_description?: string;
    /** "only" means the business alone is reminded; anything else includes the client. */
    notify_future_work?: string;
  } | null;
  is_recurring_invoice?: number | boolean;
  invoice_recurring?: {
    frequency?: string;
    on_occurance?: number | string;
    no_of_occurance?: number | string;
    start_date?: string;
    tag_line?: string;
  } | null;
};

/**
 * The percentage a line's discount amounts to, whichever way the API stored
 * it — a flat currency discount is converted to its equivalent percentage of
 * the line's gross, since a line here only ever carries one.
 */
/**
 * The stored column is "currency", not "amount" — the invoice_items table's
 * own enum — so this is the one place that translates the wire spelling to
 * the domain one; `itemPayload` translates back on the way out.
 */
function apiDiscountType(raw: ApiInvoiceItem): DiscountType {
  return raw.disc_criteria === "currency" || raw.disc_criteria === "amount"
    ? "amount"
    : "percent";
}

/**
 * The discount exactly as the server stored it — a percentage or a flat
 * amount, read as whichever `disc_criteria` says it is, with no folding of
 * one into the other. A flat $25 line discount used to come back re-derived
 * as its equivalent percentage of the line's gross, which then tracked
 * quantity and price changes instead of staying at $25.
 */
function apiLineDiscountValue(raw: ApiInvoiceItem): string {
  if (apiDiscountType(raw) === "amount") {
    return raw.discount_amount != null ? String(raw.discount_amount) : "";
  }
  return raw.discount_percentage != null
    ? String(raw.discount_percentage)
    : "";
}

/**
 * `ndis` forces the NDIS fields on even for a line the server stored without a
 * support number — an NDIS invoice being edited must keep its NDIS columns, or
 * the table would silently downgrade a claim line to an ordinary one.
 */
function mapApiInvoiceItem(
  raw: ApiInvoiceItem,
  ndis: boolean,
): InvoiceLineItem {
  const claimLine = ndis || !!raw.item_support_no;

  return {
    ...(claimLine ? newNdisLineItem() : newLineItem()),
    description: raw.description ?? "",
    quantity: raw.qty != null ? String(raw.qty) : "",
    price: raw.price != null ? String(raw.price) : "",
    qtyType: toQtyType(raw.qty_type),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    discountPercent: apiLineDiscountValue(raw),
    discountType: apiDiscountType(raw),
    gst: Boolean(raw.gst),
    // The saved rate stays with the line. A taxed line stored at 0% predates the
    // server filling rates in, so it takes the document's rate like a new line.
    gstPercent: raw.gst && Number(raw.gst_percentage) > 0 ? Number(raw.gst_percentage) : undefined,
    supportItemNumber: claimLine ? (raw.item_support_no ?? "") : undefined,
    claimType: claimLine ? toNdisClaimType(raw.claim_type) : undefined,
    date: claimLine ? apiDate(raw.date ?? undefined) : undefined,
  };
}

function mapApiDocument(doc: ApiInvoiceDocument): InvoiceAttachment {
  return {
    id: String(doc.id),
    name: doc.file_name || doc.file_path?.split("/").pop() || "Attachment",
    // The API doesn't return a stored file's size, only its name/path.
    size: 0,
  };
}

/**
 * The full record — items and attachments included — for View, Edit and
 * Duplicate, none of which can work off the list's single placeholder line.
 */
export async function fetchInvoiceDetail(id: string): Promise<Invoice> {
  const response = await api.get<{ success: boolean; data?: ApiInvoiceDetail }>(
    apiRoutes.invoice.detail(id),
  );
  const raw = response.data?.data;
  if (!raw) throw new Error("Invoice not found");

  const todayIso = toIsoDate(new Date());
  const base = mapApiInvoice(raw, todayIso);

  // Nothing on the invoice record says "this is an NDIS claim" — the payload
  // that created it carried no such field. A line with a support item number
  // is the only evidence, and it's conclusive: an ordinary invoice never has
  // one.
  const ndis = !!raw.invoice_item?.some((item) => !!item.item_support_no);

  const recurring = raw.invoice_recurring;
  const notify = raw.notify_future_work;
  const due = base.due;

  return {
    ...base,
    items: raw.invoice_item?.length
      ? raw.invoice_item.map((item) => mapApiInvoiceItem(item, ndis))
      : base.items,
    extraDiscount:
      raw.extra_discount != null
        ? String(raw.extra_discount)
        : base.extraDiscount,
    notes: raw.notes ?? base.notes,
    attachments: (raw.documents ?? []).map(mapApiDocument),

    ndis,

    recipients: (raw.selected_contacts ?? []).flatMap((contact) => {
      const contactId = contact.contact_id ?? contact.id;
      if (contactId == null) return [];
      return [
        {
          id: String(contactId),
          name: contact.name ?? "",
          email: contact.email ?? "",
        },
      ];
    }),
    invoiceEmail: raw.invoice_email ?? "",
    showBankDetails:
      raw.show_bank_details == null
        ? true
        : Boolean(Number(raw.show_bank_details)),
    // Each rail as the invoice was saved with it.
    stripeEnabled:
      raw.is_stripe_enabled === true || Number(raw.is_stripe_enabled) === 1,
    solePayEnabled: Boolean(Number(raw.is_payrixpay)),
    overdueReminder:
      raw.due_reminder == null
        ? base.overdueReminder
        : Boolean(Number(raw.due_reminder)),

    followUpReminder: Number(raw.is_notify_future_work) === 1 && !!notify,
    // Stored as an absolute date; the field asks for days before the due date.
    followUpDays: notify?.notify_future_work_date
      ? String(
          Math.max(
            1,
            daysBetween(apiDate(notify.notify_future_work_date), due),
          ),
        )
      : "",
    followUpNote: notify?.notify_future_work_description ?? "",
    followUpNotifyClient: !!notify && notify.notify_future_work !== "only",

    repeating: Number(raw.is_recurring_invoice) === 1 && !!recurring,
    repeatFrequency: repeatFrequencyFromId(recurring?.frequency),
    // 1 holds each copy as a draft and alerts you; 2 sends it straight out.
    reviewBeforeSending: Number(recurring?.on_occurance ?? 1) !== 2,
    repeatStart: recurring?.start_date
      ? apiDate(recurring.start_date)
      : addDays(base.issued, 1),
    repeatOccurrences:
      recurring?.no_of_occurance != null
        ? String(recurring.no_of_occurance)
        : "",
    repeatTagLine: recurring?.tag_line ?? "",
  };
}

/** Whole days from `from` to `to`, negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

/* ------------------------------------------------------------------ *
 * Row actions — delete, mark sent, mark paid by cash, send reminder
 * ------------------------------------------------------------------ */

/** Deletes one or more invoices. A paid or partially-paid one is skipped server-side. */
export async function deleteInvoicesApi(ids: string[]): Promise<void> {
  const response = await api.post<{ success: boolean; message?: string }>(
    apiRoutes.invoice.bulkDelete,
    { invoice_ids: ids.map(Number) },
  );
  assertApiSuccess(response.data, "Couldn't delete that invoice.");
}

/** Flags an invoice as sent without emailing it — see the backend route's own comment. */
export async function markInvoiceSentApi(invoiceId: string): Promise<void> {
  const response = await api.post<{ success: boolean; message?: string }>(
    apiRoutes.invoice.markSent(invoiceId),
  );
  assertApiSuccess(response.data, "Couldn't mark that invoice as sent.");
}

/**
 * Settles one invoice's full outstanding balance as a cash payment.
 *
 * `paymentDate` defaults to today, but takes whatever was picked in the
 * dialog — a cash payment often arrives after the fact, and defaulting to
 * today regardless would misdate every invoice paid a few days late.
 */
export async function markInvoicePaidWithCashApi(
  invoiceId: string,
  paymentDate: string = toIsoDate(new Date()),
): Promise<void> {
  const response = await api.post<{ success: boolean; message?: string }>(
    apiRoutes.invoice.paidWithCash,
    { invoice_id: Number(invoiceId), payment_date: paymentDate },
  );
  assertApiSuccess(response.data, "Couldn't mark that invoice as paid.");
}

/**
 * Reverses a cash payment recorded in error. Only meaningful for one settled
 * that way — an invoice paid off by a matched bank transaction is undone by
 * unmatching it instead, a separate action with nothing to do with this one.
 */
export async function undoInvoicePaidWithCashApi(
  invoiceId: string,
): Promise<void> {
  const response = await api.post<{ success: boolean; message?: string }>(
    apiRoutes.invoice.paidWithCash,
    { invoice_id: Number(invoiceId), undo: 1 },
  );
  assertApiSuccess(response.data, "Couldn't undo that payment.");
}

/** Emails the client a payment reminder for one invoice. */
export async function sendInvoiceReminderApi(invoiceId: string): Promise<void> {
  const response = await api.post<{ success: boolean; message?: string }>(
    apiRoutes.communicationPreference.sendReminder,
    { id: Number(invoiceId), type: "invoice" },
  );
  assertApiSuccess(response.data, "Couldn't send the reminder.");
}

/** Emails the client a receipt for an invoice that's already been paid. */
export async function sendInvoicePaidReceiptApi(
  invoiceId: string,
): Promise<void> {
  const response = await api.post<{ success: boolean; message?: string }>(
    apiRoutes.invoice.sendPaidReceipt,
    { invoice_id: Number(invoiceId) },
  );
  assertApiSuccess(response.data, "Couldn't send the paid receipt.");
}

/**
 * Stops a recurring invoice from raising any further copies. One-directional
 * on purpose — turning recurrence back on asks again for a frequency and a
 * start date, which is a create, not an update, so it belongs in the editor.
 */
export async function stopRecurringInvoiceApi(invoiceId: string): Promise<void> {
  const response = await api.post<{ success: boolean; message?: string }>(
    apiRoutes.invoice.updateRecurringStatus,
    buildEncryptedRequestBody({
      id: Number(invoiceId),
      is_recurring_invoice: 0,
    }),
  );
  assertApiSuccess(response.data, "Couldn't stop that recurring invoice.");
}

/* ------------------------------------------------------------------ *
 * Attachments — POST/DELETE /documents
 * ------------------------------------------------------------------ */

export async function uploadInvoiceAttachmentApi(
  invoiceId: string,
  file: File,
): Promise<InvoiceAttachment> {
  const form = new FormData();
  form.append("files", file);
  form.append("source_type", "invoice");
  form.append("source_id", invoiceId);

  const response = await api.post<{ document_id?: string | number }>(
    apiRoutes.fileUpload.document,
    form,
  );

  return {
    id: String(response.data?.document_id ?? newAttachmentId()),
    name: file.name,
    size: file.size,
  };
}

export async function deleteInvoiceAttachmentApi(
  documentId: string,
): Promise<void> {
  await api.delete(`${apiRoutes.fileUpload.document}/${documentId}`);
}

/* ------------------------------------------------------------------ *
 * PDF — GET /template/:templateId/preview?render_type=pdf
 *
 * Mirrors sole-webapp's InvoiceInfo.js exactly: the server renders the real
 * document — real business branding, real client, real line items — as a
 * PDF, and this only ever displays or saves those bytes. Nothing here
 * reconstructs the document from local business/client data.
 * ------------------------------------------------------------------ */

/**
 * The real PDF for one invoice. `receipt` asks for the paid-receipt layout
 * instead of the plain invoice, the same switch sole-webapp makes on
 * whether the invoice is already paid.
 */
export async function fetchInvoicePdfBlob(
  // Only the id and the template are ever read, so a narrow projection — a
  // draft from the drafts endpoint, say — can be previewed without being
  // inflated into a full `Invoice` it has no data for.
  invoice: Pick<Invoice, "id" | "templateId">,
  receipt = false,
): Promise<Blob> {
  if (!invoice.templateId) {
    throw new Error("This invoice has no template to render a PDF from.");
  }

  const response = await api.get(
    apiRoutes.templates.preview(invoice.templateId),
    {
      params: {
        invoiceId: invoice.id,
        useDemo: "false",
        type: receipt ? "invoice-receipt" : "invoice",
        render_type: "pdf",
      },
      responseType: "blob",
    },
  );

  return new Blob([response.data as BlobPart], { type: "application/pdf" });
}

/** Saves a PDF blob to disk under the given filename. */
export function savePdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking in the same tick can cancel the download in Safari and Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
