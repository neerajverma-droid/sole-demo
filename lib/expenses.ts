/**
 * Expenses domain. Amounts and dates reuse the invoice formatters so every
 * money column on the platform reads the same.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import {
  formatInvoiceDate,
  invoiceMoney,
  newLineItem,
  type InvoiceDraft,
  type InvoiceLineItem,
} from "@/lib/invoices";

export const EXPENSE_FILTERS = ["All", "Matched", "Pending"] as const;
export type ExpenseFilter = (typeof EXPENSE_FILTERS)[number];

export type ExpenseStatus = "Matched" | "Pending";

export const PAYMENT_METHODS = [
  "Cash",
  "Card",
  "Bank transfer",
  "Direct debit",
  "Other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const EXPENSE_SORTS = [
  "Date, newest",
  "Date, oldest",
  "Price, highest",
  "Price, lowest",
  "Supplier A–Z",
] as const;
export type ExpenseSort = (typeof EXPENSE_SORTS)[number];

/** The period tabs above the stat cards. */
export const EXPENSE_PERIODS = ["This year", "This month"] as const;
export type ExpensePeriod = (typeof EXPENSE_PERIODS)[number];

/**
 * The account categories from the handoff, in its order — alphabetical, with
 * Client Refund held back to the end as the prototype has it.
 *
 * The full list, matching the prototype's CATS exactly. Nine of these were
 * missing from the first transcription (Credit Note through Transfer of funds,
 * and Client Refund), which left them unpickable on the expense form as well as
 * absent from the budget category checklist.
 */
export const EXPENSE_CATEGORIES = [
  "Accountancy Expenses",
  "Advertising",
  "Bank Fees",
  "Business Related Memberships",
  "Cleaning Supplies",
  "Consulting, Tax & Accounting",
  "Consumables",
  "Contractors and Sub Contractors Costs",
  "Cost Incurred on a Job (COGS)",
  "Credit Note",
  "Depreciation",
  "Donations",
  "Freight & Courier",
  "General Expenses",
  "Gift Hampers",
  "GST Expense",
  "Income Tax Expense",
  "Insurance",
  "Interest Expense",
  "Land Tax",
  "Linen and Homewares",
  "Marketing Expense",
  "Meals and Entertainment",
  "Motor Vehicle Expenses",
  "Office Expenses",
  "Parking and Tolls",
  "Postage and Shipping",
  "Property Expense",
  "Reimbursable Expenses",
  "Rent",
  "Repairs and Maintenance",
  "Subscriptions",
  "Tax Refund",
  "Telephone & Internet",
  "Tools & Workshop Supplies",
  "Training and Education",
  "Transfer of funds between accounts",
  "Travel",
  "Utilities",
  "Wages and Salaries",
  "Website Costs",
  "Client Refund",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type Expense = {
  id: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  description: string;
  /** Null once the contact is deleted; `supplierName` is then the record. */
  supplierId: string | null;
  supplierName: string;
  /**
   * The specific contact (person) picked at the supplier — a different id
   * space than `supplierId` (the company/client). Real and validated
   * server-side: sending one that doesn't belong to `supplierId` is
   * rejected outright, so it's only ever set via a real contact picker,
   * never guessed.
   */
  contactId: string | null;
  contactName: string;
  category: string;
  /**
   * `account_subcategory_id` — what's actually posted to the API. Blank for
   * an expense whose category came from somewhere that never resolved a real
   * id (there isn't one today, but keeps the type honest for wherever one
   * might come from later).
   */
  categoryId: string;
  /**
   * What was actually paid, GST included. You enter the figure on the receipt, so
   * GST is a component of it rather than something added on top — the same basis
   * as a client refund, and the reverse of an invoice line where the price is
   * GST-exclusive.
   */
  amount: number;
  /** Whether the amount contains GST at all. */
  gst: boolean;
  /**
   * The rate the expense was recorded at, in percentage points (10 AU, 15 NZ, or
   * the business's custom rate). Null for an expense from before the rate was
   * stored, or one not saved yet — those use the business's current rate.
   */
  gstPercent?: number | null;
  paymentMethod: PaymentMethod;
  /** Paid so far. Equal to `amount` once settled; less while part-paid. */
  paidAmount: number;
  status: ExpenseStatus;
  /** A client invoice this was on-charged to, if any. */
  invoiceId: string | null;
  /**
   * That invoice's own reference (e.g. "invoice12"), for display — the
   * database id above is never what sole-webapp shows in this column.
   */
  invoiceNo: string | null;
  /** The bank transaction it reconciles against, once matched. */
  transactionRef: string | null;
  /** The journal entry behind that match — what undoing it actually targets. */
  journalEntryId: string | null;
  /**
   * How the bank described it, and the card it was paid on.
   *
   * Only present on an expense that arrived from a feed. Worth keeping beside
   * the description someone typed rather than instead of it: "Coffee with
   * client" is what it was for, "MERIVALE PTY LTD" is what you'll be looking
   * for on the statement.
   */
  bankDescription?: string;
  /** Last four digits, without the card number it came from. */
  cardLast4?: string;
  /** Anything the supplier needs to see, or a note about them. */
  vendorNote: string;
  /** The most recently attached receipt, if any — for the Attach/Replace dialog. */
  receipt: ExpenseReceipt | null;
  /**
   * Every file attached to this expense — only ever populated from the
   * detail response (`documents[]`), same as `receipt`. What the View
   * dialog's "Attachments" thumbnails render, same as sole-webapp's own.
   */
  attachments: ExpenseAttachment[];
  /** A bank transaction the backend thinks fits — drives an "AI Match" affordance. */
  possibleMatch: number;
  /**
   * The credit note (vendor refund) raised against this expense, if any —
   * what the real "Vendor note" column actually shows in sole-webapp's own
   * list (its own reference number, e.g. "CR-1"), not free text.
   */
  creditNoteId: string | null;
  creditNoteNo: string | null;
  /**
   * Split between business and personal use — `amount` is already just the
   * business portion (what actually matters for matching/GST), so this is
   * only here to show the real original total alongside it, same as
   * sole-webapp's own list.
   */
  isSplit: boolean;
  /** The full original amount, before the personal portion was split out. */
  totalAmount: number;
};

/**
 * A receipt carries its name and size, not just the bytes — a PDF preview has
 * nothing to show but its filename, so storing only the data URL would leave the
 * user looking at a generic icon with no way to tell which file it is.
 */
export type ExpenseReceipt = {
  /**
   * A data URL for a file just picked locally, or the real (already-absolute)
   * S3 URL once it's been synced from the server — either way, something
   * directly usable as an `<img src>`/link href.
   */
  dataUrl: string;
  name: string;
  /** Unknown for a receipt read back from the server — the row doesn't carry it. */
  size: number;
  /** The real attachment's id, once synced — what a delete actually targets. */
  documentId?: string | null;
};

export function isImageReceipt(receipt: ExpenseReceipt): boolean {
  if (receipt.dataUrl.startsWith("data:image")) return true;
  return /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(receipt.dataUrl);
}

/** One file attached to an expense — a thumbnail in the View dialog. */
export type ExpenseAttachment = {
  documentId: string;
  name: string;
  /** Always a real, directly-usable URL — only ever comes from the server. */
  url: string;
};

export function isImageAttachment(attachment: ExpenseAttachment): boolean {
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(attachment.url);
}

/** 1.2 MB rather than 1258291 bytes. Blank when the size isn't known at all. */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type ExpenseDraft = Omit<
  Expense,
  | "id"
  | "status"
  | "possibleMatch"
  | "creditNoteId"
  | "creditNoteNo"
  | "isSplit"
  | "totalAmount"
  | "invoiceNo"
  | "attachments"
> & {
  /**
   * sole-webapp's own "Split Amount" toggle — carves `amount` (the total
   * price) into a business and a personal portion. Off by default: most
   * expenses are entirely for the business.
   */
  splitEnabled: boolean;
  /** The business portion of `amount`, once split is on. Ignored otherwise. */
  businessAmount: number;
};

/**
 * Australia's rate, for a caller with no rate to hand. The real one is the
 * expense's own recorded rate, else the business's (`documentTax` in
 * lib/country-context: its custom rate or its country's).
 */
export const DEFAULT_GST_PERCENT = 10;
export const GST_RATE = DEFAULT_GST_PERCENT / 100;
/** At 10%, a GST-inclusive figure divided by 11 is the GST inside it. */
export const GST_INCLUSIVE_DIVISOR = 11;

/**
 * The tax inside a tax-inclusive amount: rate/(100+rate) of it — 1/11 at 10%, 3/23
 * at 15%. Divided by (100+rate)/rate rather than multiplied out, so at 10% it is
 * `amount / 11` to the last bit and Australian figures round exactly as before.
 */
export function taxInsideAmount(amount: number, ratePercent: number): number {
  return ratePercent > 0 ? amount / ((100 + ratePercent) / ratePercent) : 0;
}

/**
 * What the expense cost. The amount is already GST-inclusive, so this is just the
 * amount — kept as a function because every caller reads it as "the total".
 */
export function expenseTotal(expense: Pick<Expense, "amount">): number {
  return expense.amount;
}

type ExpenseTaxFields = Pick<Expense, "amount" | "gst"> & { gstPercent?: number | null };

/**
 * The GST inside the amount. A receipt shows what you paid, and that figure
 * included GST, so the component is rate/(100+rate) of it — amount ÷ 11 at 10% —
 * not amount × rate, which would be right only if the amount excluded it.
 *
 * At the expense's recorded rate, else `fallbackRate`: the business's rate.
 */
export function expenseGst(expense: ExpenseTaxFields, fallbackRate: number = DEFAULT_GST_PERCENT): number {
  if (!expense.gst) return 0;
  const rate = expense.gstPercent != null && expense.gstPercent > 0 ? expense.gstPercent : fallbackRate;
  return taxInsideAmount(expense.amount, rate);
}

/** What the expense cost before GST. */
export function expenseExGst(expense: ExpenseTaxFields, fallbackRate: number = DEFAULT_GST_PERCENT): number {
  return expense.amount - expenseGst(expense, fallbackRate);
}

/** Still to pay. Zero once settled. */
export function expenseRemaining(
  expense: Pick<Expense, "amount" | "paidAmount">,
): number {
  return Math.max(0, expense.amount - expense.paidAmount);
}

export function expenseStatusVariant(
  status: ExpenseStatus,
): "success" | "warning" {
  return status === "Matched" ? "success" : "warning";
}

export function formatExpenseDate(iso: string): string {
  return formatInvoiceDate(iso);
}

export function formatExpenseAmount(expense: Pick<Expense, "amount">): string {
  return invoiceMoney(expenseTotal(expense));
}

export function formatExpenseRemaining(
  expense: Pick<Expense, "amount" | "paidAmount">,
): string {
  return invoiceMoney(expenseRemaining(expense));
}

/* ------------------------------------------------------------------ *
 * Period summary — the stat cards and their comparison lines
 * ------------------------------------------------------------------ */

function periodBounds(period: ExpensePeriod, todayIso: string) {
  const [year, month] = todayIso.split("-").map(Number);
  if (period === "This month") {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    return {
      current: (iso: string) =>
        iso.startsWith(`${year}-${String(month).padStart(2, "0")}`),
      prior: (iso: string) =>
        iso.startsWith(`${prevYear}-${String(prevMonth).padStart(2, "0")}`),
      priorLabel: "last month",
    };
  }
  return {
    current: (iso: string) => iso.startsWith(String(year)),
    prior: (iso: string) => iso.startsWith(String(year - 1)),
    priorLabel: "last year",
  };
}

export type ExpenseComparison = {
  /** Null when there's nothing in the prior period to compare against. */
  percent: number | null;
  up: boolean;
  label: string;
};

/**
 * Percentage change against the previous period. Null when the prior period is
 * empty — a change "from zero" is infinite, and reporting it as a number would be
 * a lie dressed as a statistic.
 */
function compare(
  current: number,
  prior: number,
  priorLabel: string,
): ExpenseComparison {
  if (prior <= 0) {
    return { percent: null, up: false, label: `No comparison for this period` };
  }
  const percent = Math.round(((current - prior) / prior) * 100);
  return {
    percent: Math.abs(percent),
    up: percent >= 0,
    label: `${Math.abs(percent)}% vs ${priorLabel}`,
  };
}

export function expensePeriodSummary(
  expenses: Expense[],
  period: ExpensePeriod,
  todayIso: string,
) {
  const bounds = periodBounds(period, todayIso);
  const inPeriod = expenses.filter((expense) => bounds.current(expense.date));
  const inPrior = expenses.filter((expense) => bounds.prior(expense.date));
  const sumOf = (list: Expense[]) =>
    list.reduce((sum, expense) => sum + expenseTotal(expense), 0);
  const byStatus = (list: Expense[], status: ExpenseStatus) =>
    list.filter((expense) => expense.status === status);

  const noPrior = `No comparison for ${period.toLowerCase()}`;
  const withFallback = (c: ExpenseComparison): ExpenseComparison =>
    c.percent === null ? { ...c, label: noPrior } : c;

  return {
    expenses: inPeriod,
    total: sumOf(inPeriod),
    totalCount: inPeriod.length,
    totalChange: withFallback(
      compare(sumOf(inPeriod), sumOf(inPrior), bounds.priorLabel),
    ),
    matched: sumOf(byStatus(inPeriod, "Matched")),
    matchedCount: byStatus(inPeriod, "Matched").length,
    matchedChange: withFallback(
      compare(
        sumOf(byStatus(inPeriod, "Matched")),
        sumOf(byStatus(inPrior, "Matched")),
        bounds.priorLabel,
      ),
    ),
    pending: sumOf(byStatus(inPeriod, "Pending")),
    pendingCount: byStatus(inPeriod, "Pending").length,
    pendingChange: withFallback(
      compare(
        sumOf(byStatus(inPeriod, "Pending")),
        sumOf(byStatus(inPrior, "Pending")),
        bounds.priorLabel,
      ),
    ),
  };
}

export function sortExpenses(
  expenses: Expense[],
  sort: ExpenseSort,
): Expense[] {
  const rows = [...expenses];
  switch (sort) {
    case "Date, oldest":
      return rows.sort((a, b) => a.date.localeCompare(b.date));
    case "Price, highest":
      return rows.sort((a, b) => expenseTotal(b) - expenseTotal(a));
    case "Price, lowest":
      return rows.sort((a, b) => expenseTotal(a) - expenseTotal(b));
    case "Supplier A–Z":
      return rows.sort((a, b) => a.supplierName.localeCompare(b.supplierName));
    default:
      return rows.sort((a, b) => b.date.localeCompare(a.date));
  }
}

export function expenseCategoriesInUse(expenses: Expense[]): string[] {
  return [...new Set(expenses.map((expense) => expense.category))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Status pill, free-text search, and the category / supplier sets chosen in
 * the filter modal. An empty set means "no restriction".
 */
export function filterExpenses(
  expenses: Expense[],
  options: {
    filter: ExpenseFilter;
    query: string;
    categories: string[];
    suppliers: string[];
    /** ISO `YYYY-MM-DD`, inclusive. */
    dateFrom?: string;
    dateTo?: string;
    minPrice?: number;
    maxPrice?: number;
    paidWithCash?: boolean;
  },
): Expense[] {
  const needle = options.query.trim().toLowerCase();

  return expenses.filter((expense) => {
    if (options.filter !== "All" && expense.status !== options.filter) {
      return false;
    }
    if (
      options.categories.length > 0 &&
      !options.categories.includes(expense.category)
    ) {
      return false;
    }
    if (
      options.suppliers.length > 0 &&
      !options.suppliers.includes(expense.supplierName)
    ) {
      return false;
    }
    if (options.dateFrom && expense.date < options.dateFrom) return false;
    if (options.dateTo && expense.date > options.dateTo) return false;
    if (options.minPrice != null && expenseTotal(expense) < options.minPrice) {
      return false;
    }
    if (options.maxPrice != null && expenseTotal(expense) > options.maxPrice) {
      return false;
    }
    if (options.paidWithCash && expense.paymentMethod !== "Cash") return false;
    if (!needle) return true;
    return (
      expense.description.toLowerCase().includes(needle) ||
      expense.supplierName.toLowerCase().includes(needle) ||
      expense.category.toLowerCase().includes(needle)
    );
  });
}

/* ------------------------------------------------------------------ *
 * Validation — live inline errors, keystrokes never blocked
 * ------------------------------------------------------------------ */

export function amountError(value: string): string | undefined {
  if (!value.trim()) return undefined;
  return /^\d+(\.\d{1,2})?$/.test(value.trim()) && Number(value) > 0
    ? undefined
    : "Enter a valid amount — no letters or negatives.";
}

export type ExpenseIssue = { key: string; message: string };

/** Required-field issues in on-screen order. */
export function expenseIssues(
  draft: ExpenseDraft,
  amountInput: string,
): ExpenseIssue[] {
  const issues: ExpenseIssue[] = [];

  if (draft.description.trim().length < 2) {
    issues.push({ key: "description", message: "Enter a description." });
  }

  const amount = amountError(amountInput);
  if (amount) {
    issues.push({ key: "amount", message: amount });
  } else if (!amountInput.trim() || Number(amountInput) <= 0) {
    issues.push({ key: "amount", message: "Enter a valid amount." });
  }

  if (!draft.date) {
    issues.push({ key: "date", message: "Choose a date." });
  }
  if (!draft.supplierId && !draft.supplierName.trim()) {
    issues.push({ key: "supplier", message: "Select a supplier." });
  }
  if (!draft.category) {
    issues.push({ key: "category", message: "Choose a category." });
  }

  if (draft.splitEnabled) {
    const total = Number(amountInput) || 0;
    if (!draft.businessAmount || draft.businessAmount <= 0) {
      issues.push({
        key: "businessAmount",
        message: "Enter the business portion.",
      });
    } else if (draft.businessAmount > total) {
      issues.push({
        key: "businessAmount",
        message: "Business amount can't exceed the price.",
      });
    }
  }

  return issues;
}

export function emptyExpenseDraft(today: string): ExpenseDraft {
  return {
    date: today,
    description: "",
    supplierId: null,
    supplierName: "",
    contactId: null,
    contactName: "",
    category: "",
    categoryId: "",
    amount: 0,
    gst: true,
    paymentMethod: "Card",
    paidAmount: 0,
    invoiceId: null,
    transactionRef: null,
    journalEntryId: null,
    vendorNote: "",
    receipt: null,
    splitEnabled: false,
    businessAmount: 0,
  };
}

/**
 * What of an expense can actually be on-charged.
 *
 * `amount` is already the business portion of a split expense (the list
 * projection puts `business_amount` there) and the whole figure otherwise, so
 * this is the same number sole-webapp's own `getExpenseInvoiceableAmount`
 * arrives at — clamped at zero, since a negative or unparseable amount has
 * nothing to bill.
 */
export function expenseInvoiceableAmount(
  expense: Pick<Expense, "amount">,
): number {
  const amount = Number(expense.amount);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

/** Whether this expense has already been on-charged to an invoice. */
export function isExpenseInvoiced(
  expense: Pick<Expense, "invoiceId">,
): boolean {
  return Boolean(expense.invoiceId);
}

/**
 * On-charging an expense to a client, as one invoice line.
 *
 * The figure billed is the invoiceable amount exactly as it stands, with GST
 * off — the same line sole-webapp's own "Convert to Invoice" builds. The
 * expense amount already includes whatever GST was paid, so re-declaring the
 * line as taxable would add it a second time; billing the amount flat bills
 * the client precisely what the business spent.
 */
export function lineItemFromExpense(expense: Expense): InvoiceLineItem {
  const amount = expenseInvoiceableAmount(expense).toFixed(2);
  return {
    ...newLineItem(),
    description: expense.description || "Expense",
    quantity: "1",
    price: amount,
    gst: false,
  };
}

/**
 * A new invoice opened from Expenses → Convert to invoice, carrying the same
 * payload sole-webapp hands `AddInvoiceNew` from its own expenses list: no
 * client yet, today's date, seven-day terms (already the blank's default),
 * and the expense as the single line. Everything else — notes, follow-ups,
 * repeats, deposit — stays as a blank invoice, which is what sole-webapp's
 * own `buildExpenseInvoiceData` leaves empty too.
 *
 * Returns null when there is nothing to bill, so the caller can say so rather
 * than opening an invoice for $0.00.
 */
export function invoiceDraftFromExpense(
  expense: Expense,
  blank: InvoiceDraft,
): InvoiceDraft | null {
  if (expenseInvoiceableAmount(expense) <= 0) return null;
  return {
    ...blank,
    clientId: null,
    clientName: "",
    recipients: [],
    description: expense.description || "Expense",
    items: [lineItemFromExpense(expense)],
    notes: "",
  };
}

/**
 * A copy of an expense for the new-expense form. The date resets to today and
 * the receipt is cleared — the copy is a fresh purchase, and last month's
 * receipt is not evidence for it.
 */
export function duplicateExpenseDraft(
  expense: Expense,
  today: string,
): ExpenseDraft {
  return {
    ...draftFromExpense(expense),
    date: today,
    receipt: null,
    // A duplicate hasn't been paid or reconciled yet.
    paidAmount: 0,
    invoiceId: null,
    transactionRef: null,
    journalEntryId: null,
  };
}

export function draftFromExpense(expense: Expense): ExpenseDraft {
  return {
    date: expense.date,
    description: expense.description,
    supplierId: expense.supplierId,
    supplierName: expense.supplierName,
    contactId: expense.contactId,
    contactName: expense.contactName,
    category: expense.category,
    categoryId: expense.categoryId,
    // The total, not the business-only figure `expense.amount` holds — the
    // Price field is always the total, split or not (see `draftToApiFields`).
    amount: expense.totalAmount,
    gst: expense.gst,
    paymentMethod: expense.paymentMethod,
    paidAmount: expense.paidAmount,
    invoiceId: expense.invoiceId,
    transactionRef: expense.transactionRef,
    journalEntryId: expense.journalEntryId,
    vendorNote: expense.vendorNote,
    receipt: expense.receipt,
    splitEnabled: expense.isSplit,
    businessAmount: expense.amount,
  };
}

/** From the handoff's External Links table. */
export const SHIFT_FINANCE_URL =
  "https://www.shiftpayments.com.au/sign-me-up?referrer_account=82d47b7b6b09e5033a831c7cbc3ce708041e110ef59e8d43ce01d27fc5fe2553&product=SP&term=0&termPeriod=days";

/* ------------------------------------------------------------------ *
 * Backend wiring — sole-ocr's expense resource
 *
 * Two different reads of the same list, for two different purposes:
 *
 *  - `fetchExpenses` (below) still fetches one generously large page rather
 *    than a real one — this feeds `useExpensesStore`, read as a *complete*
 *    list by a dozen other screens (dashboard, planner, transactions,
 *    invoices, vendor refunds, the sidebar), none of which expect only a
 *    page of it.
 *  - `fetchExpensesPage` is the listing screen's own real, server-paginated
 *    read — `page`/`page_size` against the same endpoint, so the default
 *    view stops pulling hundreds of rows just to show 25 of them.
 *
 * Only the listing, the stat cards and creating/editing a plain expense are
 * wired here — deleting, matching, unmatching and attaching a receipt still
 * mutate the local store only, and still need their own real endpoints
 * wired up next.
 * ------------------------------------------------------------------ */

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

type ApiExpenseParty = {
  client_id?: number | string | null;
  name?: string | null;
};

type ApiExpenseCategory = {
  account_subcategory_id?: number | string | null;
  name?: string | null;
};

type ApiExpenseInvoice = {
  id?: number | string | null;
  invoice_no?: string | null;
};

/** Only present on the detail response — the list row never carries this. */
type ApiExpenseDocument = {
  document_id?: number | string | null;
  file_name?: string | null;
  file_path?: string | null;
};

/** The shape common to both the list row and the detail response. */
type ApiExpenseRow = {
  expense_id: number | string;
  name?: string | null;
  price?: number | string | null;
  total_price?: number | string | null;
  is_split?: number | boolean | null;
  date: string;
  gst?: number | boolean | null;
  gst_percentage?: number | string | null;
  paid_with_cash?: number | boolean | null;
  is_reconciled?: number | boolean | null;
  remainingAmount?: number | string | null;
  possible_match?: number | string | null;
  invoice_id?: number | string | null;
  invoice_no?: string | null;
  invoice?: ApiExpenseInvoice | null;
  bank_transaction_id?: number | string | null;
  journal_entry_id?: number | string | null;
  credit_note_id?: number | string | null;
  credit_note_no?: string | null;
  account_subcategory?: ApiExpenseCategory | null;
  client?: ApiExpenseParty | null;
  documents?: ApiExpenseDocument[] | null;
  /** The bare FK — present on both list and detail rows. */
  contact_id?: number | string | null;
  /** The name behind it — detail rows only, same as `documents`. */
  contact?: { contact_id?: number | string | null; name?: string | null } | null;
};

/**
 * The backend only ever persists cash vs. not-cash — a specific method like
 * "Bank transfer" or "Direct debit" has no column to round-trip through, so
 * anything that isn't cash reads back as this generic default rather than a
 * guess at which one it really was.
 */
function mapApiExpense(raw: ApiExpenseRow): Expense {
  const amount = Number(raw.price) || 0;
  const remaining = Math.max(0, Number(raw.remainingAmount) || 0);
  const reconciled = Boolean(Number(raw.is_reconciled)) || (amount > 0 && remaining <= 0);

  // Only ever present on the detail response — a list row's receipt and
  // attachments stay empty, same as before, since there's nothing here to
  // build them from.
  const attachments: ExpenseAttachment[] = (raw.documents ?? [])
    .filter((document) => document.file_path)
    .map((document) => ({
      documentId: String(document.document_id ?? ""),
      name: document.file_name?.trim() || "Attachment",
      url: document.file_path as string,
    }));
  const lastAttachment = attachments.length
    ? attachments[attachments.length - 1]
    : null;
  const receipt: ExpenseReceipt | null = lastAttachment
    ? {
        dataUrl: lastAttachment.url,
        name: lastAttachment.name,
        size: 0,
        documentId: lastAttachment.documentId || null,
      }
    : null;

  return {
    id: String(raw.expense_id),
    date: raw.date,
    description: raw.name?.trim() || "",
    supplierId:
      raw.client?.client_id != null ? String(raw.client.client_id) : null,
    supplierName: raw.client?.name?.trim() || "",
    contactId: raw.contact_id != null ? String(raw.contact_id) : null,
    contactName: raw.contact?.name?.trim() || "",
    category: raw.account_subcategory?.name?.trim() || "",
    categoryId:
      raw.account_subcategory?.account_subcategory_id != null
        ? String(raw.account_subcategory.account_subcategory_id)
        : "",
    amount,
    gst: Boolean(Number(raw.gst)),
    gstPercent: raw.gst_percentage != null && Number.isFinite(Number(raw.gst_percentage)) ? Number(raw.gst_percentage) : null,
    paymentMethod: Number(raw.paid_with_cash) === 1 ? "Cash" : "Card",
    paidAmount: Math.max(0, amount - remaining),
    status: reconciled ? "Matched" : "Pending",
    invoiceId: raw.invoice_id != null ? String(raw.invoice_id) : null,
    invoiceNo: raw.invoice_no?.trim() || raw.invoice?.invoice_no?.trim() || null,
    transactionRef:
      raw.bank_transaction_id != null ? String(raw.bank_transaction_id) : null,
    journalEntryId:
      raw.journal_entry_id != null ? String(raw.journal_entry_id) : null,
    vendorNote: "",
    receipt,
    attachments,
    possibleMatch: Number(raw.possible_match) || 0,
    creditNoteId: raw.credit_note_id != null ? String(raw.credit_note_id) : null,
    creditNoteNo: raw.credit_note_no?.trim() || null,
    isSplit: Boolean(Number(raw.is_split)),
    totalAmount: Number(raw.total_price) || amount,
  };
}

/**
 * Large enough to cover every expense a real account has without a real
 * "load more" — see the note above on why `useExpensesStore` fetches
 * (essentially) everything rather than one page.
 */
const FETCH_ALL_LIMIT = 500;

export async function fetchExpenses(): Promise<Expense[]> {
  const response = await api.get<
    ApiEnvelope<{ expense_details: ApiExpenseRow[] }>
  >(apiRoutes.expense.listOcr, {
    params: { page: 1, page_size: FETCH_ALL_LIMIT },
  });
  const rows = response.data?.data?.expense_details ?? [];
  return rows.map(mapApiExpense);
}

/**
 * Everything `GET /expense/list` genuinely supports server-side, confirmed
 * against sole-ocr's own controller — `filter_by[name]` (free-text search),
 * `filter_by[matched]` (the status pill) and `sort_by[<field>]` for a date or
 * price sort. The category and supplier filters and the "Supplier A–Z" sort
 * deliberately aren't here: `filter_by[account_subcategory_id]`/
 * `filter_by[client_id]` only work as a single scalar server-side (an array
 * is silently mishandled), this screen's own filters are multi-select and
 * matched by name rather than a real id in the first place, and there's no
 * real column to sort alphabetically by supplier name against. The listing
 * screen falls back to `fetchExpenses` (the complete list) and narrows
 * client-side whenever one of those is in play — see `ExpensesScreen`.
 */
export type ExpenseListFilters = {
  search?: string;
  /** Omit for "All". */
  status?: "Matched" | "Pending";
  sort?: ExpenseSort;
  /** ISO `YYYY-MM-DD`, inclusive — sole-webapp's own `SmartFilter` date range. */
  dateFrom?: string;
  dateTo?: string;
  minPrice?: number;
  maxPrice?: number;
  /** sole-webapp's own "Paid with cash" switch in that same panel. */
  paidWithCash?: boolean;
};

const EXPENSE_SORT_PARAM: Partial<
  Record<ExpenseSort, { field: string; direction: "asc" | "desc" }>
> = {
  "Date, newest": { field: "date", direction: "desc" },
  "Date, oldest": { field: "date", direction: "asc" },
  "Price, highest": { field: "price", direction: "desc" },
  "Price, lowest": { field: "price", direction: "asc" },
};

export type ExpensesPage = { expenses: Expense[]; total: number };

/** The listing screen's own real page — separate from `fetchExpenses` above. */
export async function fetchExpensesPage(
  page: number,
  pageSize: number,
  filters: ExpenseListFilters = {},
): Promise<ExpensesPage> {
  const params: Record<string, string | number> = {
    page,
    page_size: pageSize,
  };
  if (filters.search?.trim()) {
    params["filter_by[name]"] = filters.search.trim();
  }
  if (filters.status) {
    params["filter_by[matched]"] = filters.status === "Matched" ? 1 : 0;
  }
  if (filters.dateFrom) params["filter_by[start_date]"] = filters.dateFrom;
  if (filters.dateTo) params["filter_by[end_date]"] = filters.dateTo;
  if (filters.minPrice != null) params["filter_by[min_price]"] = filters.minPrice;
  if (filters.maxPrice != null) params["filter_by[max_price]"] = filters.maxPrice;
  if (filters.paidWithCash) params["filter_by[paid_with_cash]"] = 1;
  const sortParam = filters.sort ? EXPENSE_SORT_PARAM[filters.sort] : undefined;
  if (sortParam) {
    params[`sort_by[${sortParam.field}]`] = sortParam.direction;
  }

  const response = await api.get<
    ApiEnvelope<{ expense_details: ApiExpenseRow[]; total?: number }>
  >(apiRoutes.expense.listOcr, { params });

  const data = response.data?.data;
  const rows = data?.expense_details ?? [];
  return {
    expenses: rows.map(mapApiExpense),
    total: data?.total ?? rows.length,
  };
}

/**
 * One expense's full detail — used by the edit/duplicate form instead of
 * relying on the list already being in the store (a direct link to
 * `/expenses/:id` may load before anything else has fetched).
 */
export async function fetchExpenseDetail(id: string): Promise<Expense> {
  const response = await api.get<ApiEnvelope<ApiExpenseRow>>(
    `${apiRoutes.expense.info}${id}`,
  );
  const row = response.data?.data;
  if (!response.data?.success || !row) {
    throw new Error(response.data?.message || "Expense not found.");
  }
  return mapApiExpense(row);
}

/* ------------------------------------------------------------------ *
 * Real analytics — the summary cards' totals and period-over-period change.
 * The local `expensePeriodSummary` still supplies the counts (the backend
 * summary doesn't return any) and stands in as the fallback until this
 * lands.
 * ------------------------------------------------------------------ */

export type ExpenseSummaryFigures = {
  total: { amount: number; change: ExpenseComparison };
  matched: { amount: number; change: ExpenseComparison };
  pending: { amount: number; change: ExpenseComparison };
};

type ApiExpenseSummaryBucket = {
  total_amount?: number | string;
  total_pending_amount?: number | string;
  percentage_change?: number | string;
};

type ApiExpenseSummary = {
  has_previous_data?: boolean;
  total_expenses?: ApiExpenseSummaryBucket;
  // Real backend field name, on both the pending *and* the reconciled/matched
  // bucket — a naming leftover, not a sign the matched figure is wrong.
  reconciled_expenses?: ApiExpenseSummaryBucket;
  pending_expenses?: ApiExpenseSummaryBucket;
};

function summaryBucketAmount(bucket: ApiExpenseSummaryBucket | undefined): number {
  return Number(bucket?.total_amount ?? bucket?.total_pending_amount) || 0;
}

function summaryBucketChange(
  bucket: ApiExpenseSummaryBucket | undefined,
  hasPreviousData: boolean,
  priorLabel: string,
): ExpenseComparison {
  if (!hasPreviousData) {
    return { percent: null, up: false, label: "No comparison for this period" };
  }
  const percent = Math.round(Number(bucket?.percentage_change) || 0);
  return {
    percent: Math.abs(percent),
    up: percent >= 0,
    label: `${Math.abs(percent)}% vs ${priorLabel}`,
  };
}

export async function fetchExpenseSummary(
  period: ExpensePeriod,
): Promise<ExpenseSummaryFigures> {
  const response = await api.get<ApiEnvelope<ApiExpenseSummary>>(
    apiRoutes.expense.summary,
    { params: { period: period === "This month" ? "month" : "year" } },
  );
  const data = response.data?.data ?? {};
  const hasPreviousData = Boolean(data.has_previous_data);
  const priorLabel = period === "This month" ? "last month" : "last year";

  return {
    total: {
      amount: summaryBucketAmount(data.total_expenses),
      change: summaryBucketChange(data.total_expenses, hasPreviousData, priorLabel),
    },
    matched: {
      amount: summaryBucketAmount(data.reconciled_expenses),
      change: summaryBucketChange(
        data.reconciled_expenses,
        hasPreviousData,
        priorLabel,
      ),
    },
    pending: {
      amount: summaryBucketAmount(data.pending_expenses),
      change: summaryBucketChange(data.pending_expenses, hasPreviousData, priorLabel),
    },
  };
}

function draftToApiFields(draft: ExpenseDraft): Record<string, unknown> {
  // `price` is always the total — the business/personal split is carved out
  // of it via these two, same as sole-webapp's own create/edit form. Sent
  // even when split is off, so an edit that turns it off clears any prior
  // split cleanly instead of leaving stale amounts behind.
  const businessAmount = draft.splitEnabled ? draft.businessAmount : draft.amount;
  const personalAmount = Math.max(0, draft.amount - businessAmount);

  return {
    name: draft.description.trim(),
    price: draft.amount,
    date: draft.date,
    account_subcategory_id: draft.categoryId || undefined,
    client_id: draft.supplierId ?? undefined,
    contact_id: draft.contactId ?? undefined,
    gst: draft.gst ? 1 : 0,
    paid_with_cash: draft.paymentMethod === "Cash" ? 1 : 0,
    is_split: draft.splitEnabled ? 1 : 0,
    business_amount: businessAmount.toFixed(2),
    personal_amount: personalAmount.toFixed(2),
    // The rest of sole-webapp's own field set, for payload parity — real
    // and stored server-side (unlike the two below), but there's no project
    // picker on this form to source a real id from.
    project_id: null,
    // Confirmed inert in sole-ocr's createExpense/updateExpense — read
    // nowhere (is_asset) or read but never persisted (transaction_date).
    // Sent anyway only because the reference does; neither changes anything
    // if dropped.
    transaction_date: draft.date,
    is_asset: "no",
  };
}

export async function createExpenseApi(
  draft: ExpenseDraft,
  files?: File[],
): Promise<{ id: string }> {
  const response = await api.post<ApiEnvelope<{ id: number | string }>>(
    apiRoutes.expense.addV2,
    buildEncryptedRequestBody(draftToApiFields(draft), files ?? []),
  );
  if (!response.data?.success || response.data.data?.id == null) {
    throw new Error(response.data?.message || "Failed to save expense.");
  }

  /*
   * `amount` is required, not optional: "how much are people expensing" is
   * the question this answers, and a count of expenses answers none of it.
   *
   * `has_receipt` is here because it is the one thing about an expense that
   * can only be known at the moment it is created — whether a file came with
   * it. Reading it back later from the record cannot distinguish a receipt
   * attached at creation from one added a week afterwards.
   */
  track(EVENTS.EXPENSE_LOGGED, {
    amount: draft.amount,
    has_receipt: !!files?.length,
    has_gst: Boolean(draft.gst),
    payment_method: draft.paymentMethod ?? null,
    is_split: Boolean(draft.splitEnabled),
  });

  return { id: String(response.data.data.id) };
}

/** `id` travels in the encrypted body, not the URL — the route is fixed for every edit. */
export async function updateExpenseApi(
  id: string,
  draft: ExpenseDraft,
): Promise<void> {
  const response = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.expense.updateV2,
    buildEncryptedRequestBody({ id, ...draftToApiFields(draft) }),
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to update expense.");
  }
}

/**
 * The real bulk action bar's own Delete — `POST /v2/expense/bulk-delete`,
 * same endpoint and `expenses[]` field sole-webapp's own selected-rows bar
 * sends (encrypted, like create/edit). Works for a single row too, so the
 * row menu's own Delete goes through this same function.
 *
 * The backend protects a reconciled expense from deletion — on a mixed
 * selection it still returns `success: true`, having quietly skipped those
 * rows, with a message that says so (`"3 expense(s) deleted. 1 reconciled
 * expense(s) skipped."`); that message is what's surfaced here rather than a
 * generic "N deleted", since it's the only place that distinction survives —
 * the response carries no ids back to know which rows were actually
 * removed. A selection that's *entirely* reconciled fails outright instead
 * (a real 400, not `success: false`), which is why this throws on either
 * shape rather than checking a status code.
 */
export async function bulkDeleteExpensesApi(
  ids: string[],
): Promise<{ message: string }> {
  const response = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.expense.delete,
    buildEncryptedRequestBody({ expenses: ids }),
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to delete expenses.");
  }
  return { message: response.data.message || "Expenses deleted." };
}

/**
 * The bulk action bar's own Download — not a CSV of the rows, but a real
 * `POST /v2/expense/download` fetching the selected expenses' own attached
 * receipts as a zip, same as sole-webapp's own bulk Download. The backend
 * always answers `200` here, even on failure (no receipts found, nothing
 * selected), with `success: false` and a message rather than an HTTP error —
 * so this throws on that flag itself, not a response status.
 */
export async function fetchExpenseAttachmentsZip(
  ids: string[],
): Promise<string> {
  const response = await api.post<ApiEnvelope<{ zip?: string }>>(
    apiRoutes.expense.download,
    buildEncryptedRequestBody({ expenses: ids }),
  );
  const zip = response.data?.data?.zip;
  if (!response.data?.success || !zip) {
    throw new Error(
      response.data?.message ||
        "No receipts found for the selected expenses.",
    );
  }
  return zip;
}

/**
 * Records that an expense has been on-charged — `POST /expense/mark-invoiced`,
 * the same endpoint sole-webapp calls once its own "Convert to Invoice" drawer
 * reports a saved invoice. The server sets `invoice_id` and `is_invoiced` on
 * the expense, which is what stops the row offering to convert a second time.
 *
 * `invoice_no` travels with it for parity with sole-webapp's own call even
 * though the controller only needs the two ids.
 */
export async function markExpenseInvoicedApi(
  expenseId: string,
  invoiceId: string,
  invoiceNo: string,
): Promise<void> {
  const response = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.expense.markInvoiced,
    buildEncryptedRequestBody({
      expense_id: expenseId,
      invoice_id: invoiceId,
      invoice_no: invoiceNo,
    }),
  );
  if (!response.data?.success) {
    throw new Error(
      response.data?.message || "Couldn't link that invoice to the expense.",
    );
  }
}

/* ------------------------------------------------------------------ *
 * Attachments — sole-webapp's own "Add/Replace Attachment" dialog, wired to
 * the real `POST /v2/expense/attachments` and `DELETE
 * /v2/expense/attachments/:id`. Both plain (unencrypted) multipart calls —
 * this pair of routes is the one write path on the expense resource that
 * genuinely doesn't need `buildEncryptedRequestBody`.
 * ------------------------------------------------------------------ */

type ApiAttachmentUploadData = {
  document_id?: number | string | null;
  document_ids?: (number | string)[] | null;
};

/**
 * `expense_id` as a plain form field, one file per call — sole-webapp queues
 * several locally but still uploads them one at a time, so this doesn't need
 * to accept more than one file either.
 */
export async function uploadExpenseAttachment(
  expenseId: string,
  file: File,
): Promise<{ documentId: string }> {
  const formData = new FormData();
  formData.append("expense_id", expenseId);
  formData.append("files[]", file);

  const response = await api.post<ApiEnvelope<ApiAttachmentUploadData>>(
    apiRoutes.expense.uploadAttachment,
    formData,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to upload that file.");
  }
  const data = response.data.data;
  const documentId =
    data?.document_id ?? data?.document_ids?.[data.document_ids.length - 1];
  if (documentId == null) {
    throw new Error("Upload succeeded but no attachment id came back.");
  }
  return { documentId: String(documentId) };
}

/**
 * sole-webapp's own delete sends the id only as a URL path segment
 * (`DELETE .../attachments/:id`) — the real backend controller never reads
 * `req.params` for this route, so that call silently no-ops server-side. The
 * id is sent as a query param here instead, which the same controller's
 * `req.query` fallback does pick up.
 */
export async function deleteExpenseAttachment(documentId: string): Promise<void> {
  const response = await api.delete<ApiEnvelope<unknown>>(
    `${apiRoutes.expense.deleteAttachment}/${documentId}`,
    { params: { document_id: documentId } },
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to remove that attachment.");
  }
}

/* ------------------------------------------------------------------ *
 * Account categories — for the expense form's category picker. Expenses
 * only ever assign into the "Expenses" branch of the chart of accounts, not
 * the Income/Assets/Liabilities/Capital split a matching rule can choose
 * between, so this reads a single fixed branch rather than taking a type.
 * ------------------------------------------------------------------ */

export type ExpenseCategoryOption = { id: string; name: string };

type ApiAccountSubcategoryOption = {
  account_subcategory_id: number | string;
  name: string;
};

type ApiAccountCategoryOption = {
  account_category_id: number | string;
  name: string;
  account_subcategories?: ApiAccountSubcategoryOption[];
};

/**
 * Super Contribution's own subcategory — id 140, a fixed constant across
 * sole-webapp (`SUPER_CONTRIBUTION_SUBCATEGORY_ID`). Its own module posts
 * into this same subcategory server-side, but it isn't something to hand-pick
 * from a plain expense's category list — sole-webapp's real Add Expense form
 * excludes exactly this one id and nothing else.
 */
const SUPER_CONTRIBUTION_SUBCATEGORY_ID = "140";

export async function fetchExpenseCategories(): Promise<ExpenseCategoryOption[]> {
  const response = await api.get<
    ApiEnvelope<{ account_categories: ApiAccountCategoryOption[] }>
  >(apiRoutes.accountCategory.list);

  const categories = response.data?.data?.account_categories ?? [];
  const expenseCategory = categories.find(
    (category) => category.name?.trim().toLowerCase() === "expenses",
  );

  return (expenseCategory?.account_subcategories ?? [])
    .filter(
      (sub) => String(sub.account_subcategory_id) !== SUPER_CONTRIBUTION_SUBCATEGORY_ID,
    )
    .map((sub) => ({
      id: String(sub.account_subcategory_id),
      name: sub.name,
    }));
}

/**
 * Whether an expense's amount is fixed because it is matched.
 *
 * The Expenses list takes Edit away from every matched expense — cash and "paid
 * with cash" ones included, since those read "Matched" too — because the price
 * it was matched against shouldn't move without an unmatch first. A link
 * straight to the form (from the BAS review, say) goes round that menu, so the
 * form holds the same line for the one thing that matters: the amount.
 *
 * Only *matched*: an expense merely created from a bank transaction and not yet
 * reconciled (about a third of them) is still being worked on.
 */
export function isAmountLocked(expense: Pick<Expense, "status">): boolean {
  return expense.status === "Matched";
}
