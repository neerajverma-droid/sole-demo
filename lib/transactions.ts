/**
 * Transactions domain. Amounts are stored positive with the direction carried
 * by `type`, so a Credit and a Debit of the same size compare cleanly and the
 * sign is a display concern.
 */
import {
  AU_FISCAL_YEAR_START,
  fiscalYearOfIso,
  type FiscalYearStart,
} from "@/lib/fiscal-year";
import { formatDateLabel, invoiceMoney } from "@/lib/invoices";

/**
 * The list's filters. Unmatched ("Review") and Matched are the two piles, as
 * in sole-webapp's two tabs — there is no combined view — then the two
 * classifications: a personal expense and an internal transfer are the two
 * things that look like business activity in a bank feed and aren't.
 */
export const TRANSACTION_FILTERS = [
  "Review",
  "Matched",
  "Personal",
  "Transfer",
] as const;
export type TransactionFilter = (typeof TRANSACTION_FILTERS)[number];

export type TransactionStatus = "Matched" | "Review";

/**
 * Where a transaction came from.
 *
 * Worth a column because it's what decides how much to trust the row: a bank
 * feed line is the bank's word for it, a cash payment and a hand-entered one are
 * someone's. Muted rather than semantic — none of the three is good or bad news.
 */
export const TRANSACTION_SOURCES = [
  "Bank Feed",
  "Cash Payment",
  "Manual",
] as const;

/** "Unknown" is a feed row naming no source — never offered as a choice. */
export type TransactionSource =
  | (typeof TRANSACTION_SOURCES)[number]
  | "Unknown";

/**
 * A category the matcher thinks fits, and how sure it is.
 *
 * Held separately from `category` rather than written into it, which is the
 * whole point: an unapproved guess and a coding someone stands behind are
 * different facts, and a report built on the second shouldn't quietly include
 * the first. Approving is what moves it across.
 */
export type CategorySuggestion = {
  category: string;
  /** Whole percent, 0–100. */
  confidence: number;
};
export type TransactionType = "Credit" | "Debit";

/**
 * One line of a split transaction.
 *
 * A bank feed hands over a single debit; the business behind it can be several
 * things at once — a hardware run that was half tools, half consumables. A
 * split says what the one payment actually paid for, and the lines have to add
 * up to the transaction or the books don't.
 */
export type TransactionSplit = {
  id: string;
  /** ISO `YYYY-MM-DD`. Usually the parent's, but a line can be dated apart. */
  date: string;
  category: string;
  reference: string;
  /** What the reference points at — an invoice, a bill, a receipt. */
  referenceType: string;
  clientName: string;
  /** Always positive; the parent's `type` carries the direction. */
  amount: number;
};

export type Transaction = {
  id: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  description: string;
  category: string;
  type: TransactionType;
  /** Always positive — `type` carries the direction. */
  amount: number;
  status: TransactionStatus;
  /** The bank account it landed in. */
  account: string;
  source: TransactionSource;
  /** Null once approved, or where the matcher had no opinion. */
  suggestedCategory: CategorySuggestion | null;
  /** Empty until one is assigned — not every line has a supplier. */
  supplier: string;
  /** Whether the amount includes GST. */
  gst: boolean;
  reference: string;
  /**
   * What Sole thinks this pairs with, shown while it needs reconciling. Static
   * seed data for now; a real feed would derive this from invoices and bills.
   */
  suggestedMatch: string;
  /**
   * How the amount breaks down. Empty for the overwhelming majority — a
   * transaction is one thing until someone says otherwise.
   */
  splits: TransactionSplit[];
  /**
   * The owner's own spending, on a business account.
   *
   * Kept rather than deleted: the money did leave the account, so the bank
   * balance depends on it. What it's excluded from is the business's numbers,
   * which is a different question from whether it happened.
   */
  personal: boolean;
  /** Money moved between the owner's own accounts, so neither side is income. */
  transfer: TransactionTransfer | null;
  /**
   * The journal entry a single-line match was posted as — what undoing that
   * one match points at. Null on multi-line matches (each line has its own,
   * as its split id) and on anything unmatched.
   */
  entryId?: string | null;
  /** The matched record's number, e.g. an invoice's — sole-webapp's "Reference Number". */
  matchReference?: string;
  /** The connected account (`/bank/accounts` id) a bank-feed line came in through. */
  bankAccountId?: string | null;
  /** The suggested category's account id, where the feed gave one. */
  suggestedCategoryId?: string | null;
  /**
   * The model's full answer, for the category dropdown: its top pick, the
   * alternatives it weighed, and why — sole-webapp's "AI Model Suggestions".
   */
  aiSuggestions?: AiSuggestions | null;
  /**
   * How much the server says is already matched — the sum of the match lines
   * on a matched row, amount less what's still available on an unmatched one.
   * Absent on locally made rows, which work it out from their splits.
   */
  matchedTotal?: number;
  /**
   * Whether Delete is offered — sole-webapp's rule: an unmatched row that
   * didn't come from the bank feed. Absent means locally made.
   */
  deletable?: boolean;
};

/** One category the model proposed, with its confidence as a whole percent. */
export type AiCategoryOption = {
  id: string;
  name: string;
  /** Null where the model gave none. */
  confidence: number | null;
};

export type AiSuggestions = {
  primary: AiCategoryOption;
  alternatives: AiCategoryOption[];
  /** "Matched on …", without that prefix. */
  reason: string | null;
};

export type TransactionTransfer = {
  /** The account on the other side, as the feed names it. */
  counterAccount: string;
  /**
   * The transaction this one pairs with, where the other side was found.
   *
   * Null when it wasn't: a transfer whose other leg hasn't imported yet is
   * still a transfer, and saying so is more useful than refusing the label
   * until both halves arrive.
   */
  pairedId: string | null;
};

/**
 * Whether this counts towards the business's figures.
 *
 * The one rule, used by every total: personal spending isn't the business's,
 * and both legs of a transfer would otherwise appear as income and an expense
 * for money that never left the owner.
 */
export function isBusinessActivity(transaction: Transaction): boolean {
  return !transaction.personal && !transaction.transfer;
}

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

/**
 * The five things a transaction can be, and what sits under each.
 *
 * A tree rather than a flat list because the top level is the accounting
 * question — is this income, spending, something owned, something owed, or
 * money the owner put in — and the sub-category is only meaningful once that's
 * answered. The pill in the table colours by the top level for the same reason.
 */
export const TRANSACTION_CATEGORY_TREE = [
  {
    type: "Income",
    categories: [
      "Sales",
      "Services",
      "Interest received",
      "Grants",
      "Other income",
    ],
  },
  {
    type: "Expense",
    categories: [
      "Advertising",
      "Bank fees",
      "Contractors",
      "Insurance",
      "Motor vehicle",
      "Office supplies",
      "Rent",
      "Software",
      "Travel",
      "Utilities",
    ],
  },
  {
    type: "Asset",
    categories: [
      "Equipment",
      "Motor vehicles",
      "GST Receivable",
      "Accounts receivable",
      "Inventory",
    ],
  },
  {
    type: "Capital",
    categories: ["Owner contribution", "Owner drawings", "Retained earnings"],
  },
  {
    type: "Liabilities",
    categories: [
      "Accounts payable",
      "GST Payable",
      "PAYG withholding",
      "Loans",
      "Credit card",
    ],
  },
] as const;

export type TransactionCategoryType =
  (typeof TRANSACTION_CATEGORY_TREE)[number]["type"];

/** Every category, flat, for the pickers. */
export const TRANSACTION_CATEGORIES: string[] =
  TRANSACTION_CATEGORY_TREE.flatMap((group) => [...group.categories]);

/** Which of the five a category belongs to, or null for anything unrecognised. */
export function categoryType(category: string): TransactionCategoryType | null {
  const group = TRANSACTION_CATEGORY_TREE.find((entry) =>
    (entry.categories as readonly string[]).includes(category),
  );
  return group?.type ?? null;
}

/**
 * The pill tone per top-level type. Income green and Liabilities red follow the
 * platform's semantics; the other three are neutral-to-brand, because "asset"
 * is neither good news nor bad.
 */
export function categoryTone(category: string): string {
  return categoryTypeTone(categoryType(category));
}

/**
 * The tone for a top-level type, so anything that knows its parent — a rule's
 * account category, say — can colour it the same way the transactions table
 * colours the category itself.
 */
export function categoryTypeTone(type: TransactionCategoryType | null): string {
  switch (type) {
    case "Income":
      return "border-success/20 bg-success/10 text-success";
    case "Expense":
      return "border-warning/20 bg-warning/10 text-warning";
    case "Asset":
      return "border-primary/20 bg-primary/10 text-primary";
    case "Capital":
      return "border-teal-600/20 bg-teal-600/10 text-teal-700 dark:border-teal-400/20 dark:bg-teal-400/10 dark:text-teal-400";
    case "Liabilities":
      return "border-destructive/20 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

/* ------------------------------------------------------------------ *
 * What a matched row landed in
 * ------------------------------------------------------------------ */

/**
 * The tag a matched row (or one of its split lines) wears.
 *
 * Five values across two vocabularies, which is why this is derived rather
 * than stored. Asset, Expense and Income are what the *category* says the
 * money became; Invoice and Refund are what the *reference* says it was
 * settled against. A line can be both — an invoice payment is income — and
 * where it is, the document wins, because "Invoice" is the more specific and
 * more useful of the two answers.
 */
export type MatchedType =
  | "Asset"
  | "Expense"
  | "Income"
  | "Invoice"
  | "Refund";

/**
 * The reference types that name a document rather than a receipt.
 *
 * Matched case-insensitively and by prefix, because `referenceType` is free
 * text from the feed: "Invoice", "Tax invoice" and "invoice" are one thing, and
 * a map keyed on exact strings would silently fall through to the category for
 * two of the three.
 */
const DOCUMENT_REFERENCE_TYPES: { match: string; type: MatchedType }[] = [
  { match: "invoice", type: "Invoice" },
  { match: "credit note", type: "Refund" },
  { match: "refund", type: "Refund" },
];

/**
 * What to tag a matched line with.
 *
 * Reference type first where it names a document, then the category's own
 * top-level type, then the direction — which is the last resort and still
 * right: money in with an unrecognised category is income, money out is a cost.
 *
 * Display only. Nothing here decides what a row *is*; it decides what the tag
 * beside it reads, from fields that were already set when the row was matched.
 */
export function matchedTypeOf(
  category: string,
  direction: TransactionType,
  referenceType?: string,
): MatchedType {
  const reference = referenceType?.trim().toLowerCase() ?? "";
  const document = DOCUMENT_REFERENCE_TYPES.find((entry) =>
    reference.includes(entry.match),
  );
  if (document) return document.type;

  switch (categoryType(category)) {
    case "Asset":
      return "Asset";
    case "Income":
      return "Income";
    case "Expense":
      return "Expense";
    default:
      return direction === "Credit" ? "Income" : "Expense";
  }
}

/**
 * The tone for a matched type, borrowing the category palette it overlaps with.
 *
 * Invoice and Refund have no entry in `TRANSACTION_CATEGORY_TREE`, so they map
 * onto the two types they behave like — an invoice is income arriving, a refund
 * is money reversing — rather than introducing a sixth colour nobody has seen
 * anywhere else in the product.
 */
export function matchedTypeTone(type: MatchedType): string {
  switch (type) {
    case "Asset":
      return categoryTypeTone("Asset");
    case "Income":
    case "Invoice":
      return categoryTypeTone("Income");
    case "Refund":
      return categoryTypeTone("Capital");
    default:
      return categoryTypeTone("Expense");
  }
}

/**
 * Whether the tag is worth showing beside the category, or just says it twice.
 *
 * The tag marks the exception, never the rule. On a debit the category is an
 * expense unless something says otherwise, and on a credit it's income — so a
 * chip repeating that is a chip carrying no information, which is how
 * "Sales" ends up sitting next to "Income" and teaching the reader nothing.
 *
 * What survives is what the category name can't tell you on its own:
 *
 * - Invoice and Refund, which name a document rather than a kind of money.
 *   Nothing in a category name implies either.
 * - Asset on money out. "Equipment", "Inventory" and "Motor vehicles" all read
 *   like costs, and the difference between a cost and a thing you now own is
 *   exactly the fact worth surfacing.
 * - Anything else that contradicts the direction — income on a debit, an
 *   expense on a credit — which is rare and, when it happens, the most
 *   interesting thing on the row.
 *
 * Absence becomes meaningful once the rule is consistent: no tag means the
 * money did the ordinary thing for its direction.
 */
export function matchedTypeAddsInfo(
  type: MatchedType,
  category: string,
  direction: TransactionType,
): boolean {
  if (type === "Invoice" || type === "Refund") return true;
  // "Other income" tagged Income is the same word printed twice.
  if (category.toLowerCase().includes(type.toLowerCase())) return false;
  return type !== (direction === "Credit" ? "Income" : "Expense");
}

/* ------------------------------------------------------------------ *
 * Splits and matching
 * ------------------------------------------------------------------ */

/** What the split lines add up to. */
/**
 * The account's balance as at the latest transaction on it.
 *
 * Derived rather than stored: a balance is the sum of what moved, and a stored
 * one is a second answer that drifts the first time a row is edited. Everything
 * on the account counts, personal and transfers included — the bank's balance
 * doesn't care whose money it was.
 */
export function accountBalance(
  transactions: Transaction[],
  account: string,
): number {
  return transactions
    .filter((transaction) => transaction.account === account)
    .reduce(
      (balance, transaction) =>
        transaction.type === "Credit"
          ? balance + transaction.amount
          : balance - transaction.amount,
      0,
    );
}

/**
 * Categories that carry no GST in Australia.
 *
 * Bank fees and interest are GST-free, and wages, PAYG and the GST accounts
 * themselves aren't supplies at all. The toggle is hidden rather than merely
 * unchecked on these: an off switch invites someone to try it, and a switch that
 * shouldn't be flipped is better not offered.
 */
const GST_FREE_CATEGORIES = new Set([
  "Bank fees",
  "Interest received",
  "GST Receivable",
  "GST Payable",
  "PAYG withholding",
  "Owner contribution",
  "Owner drawings",
  "Retained earnings",
]);

/**
 * Whether GST is a question worth asking about this row.
 *
 * Personal spending and transfers are out for the same reason they're out of
 * every other figure — see `isBusinessActivity`: one isn't the business's and
 * the other never left the owner, so neither is a supply.
 */
export function gstApplies(transaction: Transaction): boolean {
  if (!isBusinessActivity(transaction)) return false;
  // The tax accounts are named in the country's word ("VAT Payable" in South Africa).
  return !GST_FREE_CATEGORIES.has(transaction.category.replace(/\bVAT\b/g, "GST"));
}

/** Whether the row is showing a guess rather than a coding someone confirmed. */
export function hasSuggestion(transaction: Transaction): boolean {
  return transaction.suggestedCategory !== null;
}

/**
 * Every row still waiting on a decision about its suggested category.
 *
 * One function so the banner's count and the review dialog's rows can't
 * disagree: a banner reading "2 suggestions" over a modal listing three is the
 * sort of mismatch nobody reports as a bug and everybody stops trusting. The
 * banner derives this once and hands the array to the dialog, so they're not
 * merely computing the same thing — they're looking at the same array.
 */
export function pendingSuggestions(transactions: Transaction[]): Transaction[] {
  return transactions.filter(hasSuggestion);
}

export function splitTotal(transaction: Transaction): number {
  return transaction.splits.reduce((sum, split) => sum + split.amount, 0);
}

/**
 * How much of the transaction is accounted for.
 *
 * A matched transaction is matched in full; an unmatched one is matched to
 * whatever its split lines cover, which is nothing until someone splits it.
 * Either way the column answers "how much of this is done".
 */
export function matchedAmount(transaction: Transaction): number {
  if (transaction.matchedTotal !== undefined) return transaction.matchedTotal;
  if (transaction.status === "Matched") return transaction.amount;
  return Math.min(splitTotal(transaction), transaction.amount);
}

/** Whether the splits account for the whole amount, to the cent. */
export function splitsBalance(transaction: Transaction): boolean {
  return Math.abs(splitTotal(transaction) - transaction.amount) < 0.005;
}

/* ------------------------------------------------------------------ *
 * Financial year
 * ------------------------------------------------------------------ */

/**
 * The financial year (by its end year) an ISO date falls in. Australian years
 * run 1 July to 30 June, and that's the default — the tax estimator relies on
 * it; the Transactions list passes the business's own `start`.
 */
export function financialYearOf(
  iso: string,
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): number {
  return fiscalYearOfIso(iso, start) + 1;
}

export function financialYearLabel(fy: number): string {
  return `FY ${String(fy - 1).slice(2)}/${String(fy).slice(2)}`;
}

export const ALL_PERIODS = "All periods";

/** The financial years present in the data, newest first, plus "All periods". */
export function financialYearOptions(
  transactions: Transaction[],
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): string[] {
  const years = [
    ...new Set(transactions.map((entry) => financialYearOf(entry.date, start))),
  ].sort((a, b) => b - a);
  return [ALL_PERIODS, ...years.map(financialYearLabel)];
}

/** Credit in green, Debit neutral — money in is the only coloured figure. */
export function amountClass(transaction: Transaction): string {
  return transaction.type === "Credit" ? "text-success" : "";
}

export function signedAmount(transaction: Transaction): string {
  const sign = transaction.type === "Credit" ? "+" : "−";
  return `${sign}${invoiceMoney(transaction.amount)}`;
}

export function formatTransactionDate(iso: string): string {
  return formatDateLabel(iso);
}

export function transactionStatusVariant(
  status: TransactionStatus,
): "success" | "warning" {
  return status === "Matched" ? "success" : "warning";
}

/** The three stat cards. Derived, never stored. */
export function transactionSummary(transactions: Transaction[]) {
  // Personal spending and transfers are out of every figure here: this is what
  // the business earned and spent, and neither of those is either.
  const business = transactions.filter(isBusinessActivity);

  const sumOf = (type: TransactionType) =>
    business
      .filter((transaction) => transaction.type === type)
      .reduce((sum, transaction) => sum + transaction.amount, 0);

  return {
    moneyIn: sumOf("Credit"),
    moneyOut: sumOf("Debit"),
    // Classifying something as personal or a transfer *is* reconciling it, so
    // it stops counting as work outstanding.
    toReconcile: business.filter(
      (transaction) => transaction.status === "Review",
    ).length,
  };
}

/** Filter plus search, matching description, category and reference. */
/** What the Unmatched / Matched toggle shows on each side. */
/**
 * The bank transaction that pairs with an invoice, if one is in the feed.
 *
 * Matched by the suggestion the feed carries — `"INV-0021 · Turner
 * Consulting"` — because that's where the pairing is recorded. Takes the
 * number rather than the invoice so this module keeps knowing nothing about
 * documents.
 *
 * `matched` separates the two cases that matter on a list: reconciled and
 * done with, versus a suggestion sitting there waiting to be accepted.
 */
export function matchForInvoice(
  invoiceNumber: string,
  transactions: Transaction[],
): { transaction: Transaction; matched: boolean } | null {
  const hit = transactions.find(
    (transaction) =>
      transaction.suggestedMatch.startsWith(`${invoiceNumber} `) ||
      transaction.suggestedMatch === invoiceNumber,
  );
  return hit ? { transaction: hit, matched: hit.status === "Matched" } : null;
}

/**
 * Everything that could plausibly be the payment for an invoice.
 *
 * The feed's own suggestion first, then any unreconciled transaction in the
 * right direction whose amount matches exactly — a coincidence worth showing,
 * since that's how a payment arrives when nobody quotes the reference. Only
 * these two rules: a list of maybes long enough to scroll is a search, and
 * there's a search for that.
 */
export function matchCandidates(
  reference: string,
  total: number,
  transactions: Transaction[],
  /**
   * Which direction the payment would have come from. Money owed to you
   * arrives as a credit; money you owe leaves as a debit, and offering the
   * wrong half of the feed is worse than offering none of it.
   */
  direction: TransactionType = "Credit",
): Transaction[] {
  const open = transactions.filter(
    (transaction) =>
      transaction.status !== "Matched" &&
      !transaction.personal &&
      !transaction.transfer,
  );
  const named = open.filter(
    (transaction) =>
      transaction.suggestedMatch.startsWith(`${reference} `) ||
      transaction.suggestedMatch === reference,
  );
  const sameAmount = open.filter(
    (transaction) =>
      transaction.type === direction &&
      Math.abs(transaction.amount - total) < 0.005 &&
      !named.includes(transaction),
  );
  return [...named, ...sameAmount];
}

/**
 * The transaction an invoice is reconciled against, however that came about.
 *
 * Two ways in: a match someone confirmed, recorded on the invoice, or a feed
 * suggestion that's already been reconciled from the transactions side. Both
 * mean the same thing to a list — this invoice is settled against the bank —
 * and both have to be undoable, so both resolve through here.
 *
 * Takes the shape it needs rather than an Invoice, so this module goes on
 * knowing nothing about documents.
 */
export function linkedTransaction(
  invoice: { number: string; matchedTransactionId?: string | null },
  transactions: Transaction[],
): Transaction | null {
  if (invoice.matchedTransactionId) {
    return (
      transactions.find(
        (transaction) => transaction.id === invoice.matchedTransactionId,
      ) ?? null
    );
  }
  const suggested = matchForInvoice(invoice.number, transactions);
  return suggested?.matched ? suggested.transaction : null;
}

/**
 * What a reconciled transaction is reconciled *against*.
 *
 * Three ways a transaction ends up Matched, and undoing it has to write back to
 * a different place in each: an invoice that recorded this transaction, an
 * expense that took its reference, or a feed suggestion someone confirmed —
 * which wrote nothing but the status, so there's nothing to unlink.
 *
 * Structural parameters, so this module still knows nothing about invoices or
 * expenses beyond the two fields that carry the link.
 */
export type MatchedTo =
  | { kind: "invoice"; id: string; label: string }
  | { kind: "expense"; id: string; label: string }
  | { kind: "suggestion"; label: string };

export function transactionMatchedTo(
  transaction: Transaction,
  invoices: {
    id: string;
    number: string;
    matchedTransactionId?: string | null;
  }[],
  expenses: {
    id: string;
    description: string;
    transactionRef: string | null;
  }[],
): MatchedTo | null {
  if (transaction.status !== "Matched") return null;

  const invoice = invoices.find(
    (entry) => entry.matchedTransactionId === transaction.id,
  );
  if (invoice) {
    return { kind: "invoice", id: invoice.id, label: invoice.number };
  }

  const expense = expenses.find(
    (entry) => entry.transactionRef === transaction.reference,
  );
  if (expense) {
    return { kind: "expense", id: expense.id, label: expense.description };
  }

  /*
   * The feed writes its suggestion as "INV-0021 · Turner Consulting". Only the
   * first part identifies the thing — the rest is who it's with, which a
   * sentence like "unmatch this from …?" doesn't need.
   */
  const suggestion = transaction.suggestedMatch.split(" · ")[0]?.trim();
  return suggestion ? { kind: "suggestion", label: suggestion } : null;
}

/** How many transactions sit in each pile, and how much they come to. */
export function matchTotals(transactions: Transaction[]): {
  unmatched: { count: number; total: number };
  matched: { count: number; total: number };
} {
  const tally = (rows: Transaction[]) => ({
    count: rows.length,
    total: rows.reduce((sum, entry) => sum + entry.amount, 0),
  });
  const withStatus = (status: TransactionStatus) =>
    tally(transactions.filter((entry) => entry.status === status));

  return {
    unmatched: withStatus("Review"),
    matched: withStatus("Matched"),
  };
}

export function filterTransactions(
  transactions: Transaction[],
  filter: TransactionFilter,
  query: string,
  period: string = ALL_PERIODS,
  start: FiscalYearStart = AU_FISCAL_YEAR_START,
): Transaction[] {
  const needle = query.trim().toLowerCase();

  return transactions.filter((transaction) => {
    if (filter === "Personal" && !transaction.personal) return false;
    if (filter === "Transfer" && !transaction.transfer) return false;
    if (
      filter !== "Personal" &&
      filter !== "Transfer" &&
      transaction.status !== filter
    ) {
      return false;
    }
    if (
      period !== ALL_PERIODS &&
      financialYearLabel(financialYearOf(transaction.date, start)) !== period
    ) {
      return false;
    }
    if (!needle) return true;
    // The id is searchable because the search says it is — someone pasting a
    // TXN reference from an email is the case it's there for.
    if (transaction.id.toLowerCase().includes(needle)) return true;
    if (String(transaction.amount).includes(needle)) return true;
    return (
      transaction.description.toLowerCase().includes(needle) ||
      transaction.category.toLowerCase().includes(needle) ||
      transaction.reference.toLowerCase().includes(needle)
    );
  });
}

/**
 * Unmatched transactions matching a free-text query.
 *
 * Used by the expense match dialog's search box: personal and transfer rows
 * are excluded because they can't be matched, and the query is matched against
 * description, category, reference, amount and id — same fields as
 * `filterTransactions` uses for text search.
 *
 * Returns an empty array for an empty query so the call-site can fall back to
 * the unfiltered open list rather than showing nothing when no query is typed.
 */
export function searchOpenTransactions(
  query: string,
  transactions: Transaction[],
): Transaction[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  return transactions.filter((transaction) => {
    if (transaction.status === "Matched") return false;
    if (transaction.personal) return false;
    if (transaction.transfer) return false;

    if (transaction.id.toLowerCase().includes(needle)) return true;
    if (String(transaction.amount).includes(needle)) return true;
    return (
      transaction.description.toLowerCase().includes(needle) ||
      transaction.category.toLowerCase().includes(needle) ||
      transaction.reference.toLowerCase().includes(needle)
    );
  });
}
