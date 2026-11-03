/**
 * Everything the owner has to do something about, as one flat list.
 *
 * Derived from the stores, so a row exists only while the work does — there is
 * no "actions" table and nothing to keep in sync. What used to be five separate
 * "you have N of these" figures scattered across the Dashboard is one item per
 * job here, each carrying the button that finishes it.
 *
 * This is the single derivation. `key-actions` ranks it and takes the top five
 * for the Dashboard card; Quick Actions shows all of it, banded by urgency.
 * Two copies of "what counts as overdue" is how the card and the page would end
 * up disagreeing about the same invoice.
 */

import {
  CalendarClock,
  Clock,
  FileText,
  Landmark,
  Receipt,
  Send,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { expenseRemaining, type Expense } from "@/lib/expenses";
import { invoiceAmount, parseIsoDate, type Invoice } from "@/lib/invoices";
import { quoteAmount, type Quote } from "@/lib/quotes";
import { isBusinessActivity, type Transaction } from "@/lib/transactions";

/** The type chips, in the order they're shown. */
export const ACTION_TYPES = [
  "Invoices",
  "Bank feed",
  "Expenses",
  "Time",
  "Quotes",
  "Other",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

/** The urgency chips, and the order the list groups by. */
export const ACTION_URGENCIES = ["Overdue", "This week", "Later"] as const;

export type ActionUrgency = (typeof ACTION_URGENCIES)[number];

export type ActionKind =
  | "invoice-overdue"
  | "invoice-draft"
  | "quote-pending"
  | "bill-unpaid"
  | "bank-review"
  | "bas";

export type ActionItem = {
  id: string;
  kind: ActionKind;
  type: ActionType;
  icon: LucideIcon;
  /** "INV-0003 · Turner Consulting" — the reference and who it's with. */
  title: string;
  /**
   * What to call this kind of item: Invoice, Quote, Bill, Bank feed, BAS.
   *
   * The item's own noun rather than the chip's bucket — "BAS" says more than
   * "Other", and "Bill" more than "Expenses". The badge's colour is what ties a
   * row back to the chip that filters to it; see `type`.
   */
  typeLabel: string;
  /** "Overdue", "Not sent", "Needs coding" — where the item stands. */
  status: string;
  /**
   * The status and the clock, as two fields rather than one line.
   *
   * They used to be pre-joined with the type into "Invoice · Overdue · 12 days
   * late". The type is a badge on the row now, so a string carrying it as well
   * would print it twice — and a surface wanting the plain-text form can join
   * these three itself.
   */
  timing: string;
  urgency: ActionUrgency;
  /** What the item is dated — what "oldest first" sorts on. */
  date: string;
  /** When it should have been dealt with. Decides the urgency band. */
  due: string;
  amount: number;
  cta: string;
  href: string;
  /**
   * Higher is more urgent, on one scale across every type — what the Dashboard's
   * five slots rank by. The bands below are the coarse version of the same idea.
   */
  score: number;
  /** The overflow menu's navigations: the things you'd do second. */
  menu: { label: string; href: string }[];
};

const MS_PER_DAY = 86_400_000;

/** How far ahead "This week" reaches. */
const THIS_WEEK_DAYS = 7;

/** How far out a BAS is worth listing at all. */
const BAS_HORIZON_DAYS = 30;

function daysBetween(fromIso: string, toIso: string): number | null {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/** `iso` plus `days`, as ISO — for deriving a deadline an item doesn't carry. */
function addDaysIso(iso: string, days: number): string {
  const base = parseIsoDate(iso);
  if (!base) return iso;
  const moved = new Date(base.getTime() + days * MS_PER_DAY);
  return moved.toISOString().slice(0, 10);
}

const plural = (count: number, one: string, many = `${one}s`) =>
  count === 1 ? one : many;

/**
 * Which band an item falls in.
 *
 * One rule over one date, rather than a special case per type: past its
 * deadline is Overdue, inside the next week is This week, beyond that is Later.
 * That's what lets the three chips describe an invoice, a bank transaction and a
 * BAS without any of them meaning something different in each.
 *
 * Items with no formal deadline get a derived one — see each block below — so
 * "a draft you've sat on for a fortnight" lands in the same band as money that's
 * actually late, which is the honest place for it.
 */
function bandFor(due: string, today: string): ActionUrgency {
  const daysLeft = daysBetween(today, due);
  if (daysLeft === null) return "Later";
  if (daysLeft < 0) return "Overdue";
  return daysLeft <= THIS_WEEK_DAYS ? "This week" : "Later";
}

/**
 * The score bands.
 *
 * Bands rather than one formula: "is this later than that" only means something
 * within a type, and across types what matters is the kind of problem it is.
 * Money already late, then a statutory deadline, then money not yet asked for,
 * then money being decided, then the books, then money going out.
 */
const BAND = {
  overdue: 5000,
  basImminent: 4000,
  draft: 3000,
  quoteExpiring: 2500,
  bankFeed: 2200,
  bill: 2000,
  quote: 1500,
  basLater: 1000,
} as const;

/** The GST/BAS set-aside figure the card's "BAS" row is built from. */
export type BasSetAside = {
  amount: number;
  quarter: string;
  dueLabel: string;
  daysAway: number;
  /** What the country calls the return — "BAS", "GST return". "BAS" when absent. */
  returnName?: string;
};

/** Nothing due — the safe default while the real figure hasn't loaded (or
 *  hasn't been wired up) rather than a fabricated one. */
const NO_BAS_DUE: BasSetAside = {
  amount: 0,
  quarter: "",
  dueLabel: "",
  daysAway: Infinity,
};

export function actionItems({
  invoices,
  quotes,
  expenses,
  transactions = [],
  today,
  bas = NO_BAS_DUE,
}: {
  invoices: Invoice[];
  quotes: Quote[];
  expenses: Expense[];
  /** Omitted by the Dashboard card, whose five slots are for documents. */
  transactions?: Transaction[];
  /** ISO date treated as now, so the banding is testable. */
  today: string;
  bas?: BasSetAside;
}): ActionItem[] {
  const rows: ActionItem[] = [];

  /** Fills in the one field every item derives the same way. */
  const push = (item: Omit<ActionItem, "urgency">) => {
    rows.push({ ...item, urgency: bandFor(item.due, today) });
  };

  /* Overdue invoices — money already late, which outranks everything. */
  for (const invoice of invoices) {
    if (invoice.status !== "Overdue") continue;
    const late = daysBetween(invoice.due, today) ?? 0;
    push({
      id: `overdue-${invoice.id}`,
      kind: "invoice-overdue",
      type: "Invoices",
      icon: TriangleAlert,
      title: `${invoice.number} · ${invoice.clientName}`,
      typeLabel: "Invoice",
      status: "Overdue",
      timing: `${late} ${plural(late, "day")} late`,
      date: invoice.due,
      due: invoice.due,
      amount: invoiceAmount(invoice),
      cta: "Follow up",
      href: `/invoices/${invoice.id}`,
      // Capped so a two-year-old invoice can't outrank every other overdue one
      // by so much that the band stops meaning anything.
      score: BAND.overdue + Math.min(late, 900),
      menu: [
        { label: "View invoice", href: `/invoices/${invoice.id}` },
        { label: "All overdue invoices", href: "/invoices?status=overdue" },
      ],
    });
  }

  /* Drafts — money not yet asked for. A week to send it is the deadline. */
  for (const invoice of invoices) {
    if (invoice.status !== "Draft") continue;
    const age = daysBetween(invoice.issued, today) ?? 0;
    push({
      id: `draft-${invoice.id}`,
      kind: "invoice-draft",
      type: "Invoices",
      icon: Send,
      title: `${invoice.number} · ${invoice.clientName}`,
      typeLabel: "Invoice",
      status: "Not sent",
      timing:
        age > 0 ? `drafted ${age} ${plural(age, "day")} ago` : "drafted today",
      date: invoice.issued,
      due: addDaysIso(invoice.issued, THIS_WEEK_DAYS),
      amount: invoiceAmount(invoice),
      cta: "Send",
      href: `/invoices/${invoice.id}`,
      score: BAND.draft + Math.min(age, 900),
      menu: [
        { label: "Edit draft", href: `/invoices/${invoice.id}` },
        { label: "All drafts", href: "/invoices?status=draft" },
      ],
    });
  }

  /* Quotes with the client, undecided. The expiry is the deadline. */
  for (const quote of quotes) {
    if (quote.status !== "Sent") continue;
    const daysLeft = daysBetween(today, quote.expiry);
    const lapsed = daysLeft !== null && daysLeft < 0;
    const expiring =
      daysLeft !== null && daysLeft >= 0 && daysLeft <= THIS_WEEK_DAYS;
    push({
      id: `quote-${quote.id}`,
      kind: "quote-pending",
      type: "Quotes",
      icon: FileText,
      title: `${quote.number} · ${quote.clientName}`,
      typeLabel: "Quote",
      status: lapsed ? "Expired" : "Awaiting a decision",
      timing: lapsed
        ? `lapsed ${Math.abs(daysLeft)} ${plural(Math.abs(daysLeft), "day")} ago`
        : `expires ${quote.expiry}`,
      date: quote.issued,
      due: quote.expiry,
      amount: quoteAmount(quote),
      cta: "Follow up",
      href: `/quotes/${quote.id}`,
      score:
        (lapsed || expiring ? BAND.quoteExpiring : BAND.quote) +
        (daysLeft !== null ? Math.max(0, 30 - daysLeft) : 0),
      menu: [
        { label: "View quote", href: `/quotes/${quote.id}` },
        { label: "All open quotes", href: "/quotes?status=sent" },
      ],
    });
  }

  /* Bills with something still owing. A fortnight to pay is the deadline. */
  for (const expense of expenses) {
    const owing = expenseRemaining(expense);
    if (owing <= 0) continue;
    const age = daysBetween(expense.date, today) ?? 0;
    push({
      id: `bill-${expense.id}`,
      kind: "bill-unpaid",
      type: "Expenses",
      icon: Receipt,
      title: `${expense.supplierName || expense.description} · ${expense.category}`,
      typeLabel: "Bill",
      status: "Unpaid",
      // Expenses carry the date they were incurred rather than a due date, so
      // the line says how long it's been sitting there, not how late it is.
      timing:
        age > 0
          ? `recorded ${age} ${plural(age, "day")} ago`
          : "recorded today",
      date: expense.date,
      due: addDaysIso(expense.date, 14),
      amount: owing,
      cta: "Pay",
      href: "/expenses",
      score: BAND.bill + Math.min(age, 900),
      menu: [{ label: "All unpaid bills", href: "/expenses" }],
    });
  }

  /*
   * Bank feed rows still to code. Only the business ones: classifying something
   * as personal or a transfer *is* reconciling it, so it stops being work — the
   * same rule `transactionSummary` counts by.
   */
  for (const transaction of transactions) {
    if (transaction.status !== "Review") continue;
    if (!isBusinessActivity(transaction)) continue;
    const age = daysBetween(transaction.date, today) ?? 0;
    push({
      id: `bank-${transaction.id}`,
      kind: "bank-review",
      type: "Bank feed",
      icon: Landmark,
      title: `${transaction.description} · ${transaction.account}`,
      typeLabel: "Bank feed",
      status: "Needs coding",
      timing:
        age > 0 ? `landed ${age} ${plural(age, "day")} ago` : "landed today",
      date: transaction.date,
      due: addDaysIso(transaction.date, THIS_WEEK_DAYS),
      amount: transaction.amount,
      cta: "Code it",
      href: "/transactions",
      score: BAND.bankFeed + Math.min(age, 900),
      menu: [{ label: "Open the bank feed", href: "/transactions" }],
    });
  }

  /* The BAS, while there's something to lodge and it's close enough to matter. */
  if (bas.amount > 0 && bas.daysAway <= BAS_HORIZON_DAYS) {
    const imminent = bas.daysAway <= THIS_WEEK_DAYS;
    const due = addDaysIso(today, bas.daysAway);
    const returnName = bas.returnName || "BAS";
    push({
      id: "bas",
      kind: "bas",
      type: "Other",
      icon: imminent ? Landmark : CalendarClock,
      title: `${bas.quarter} · ${returnName}`,
      typeLabel: returnName,
      status: "To lodge",
      timing: `due in ${bas.daysAway} ${plural(bas.daysAway, "day")} · ${bas.dueLabel}`,
      date: due,
      due,
      amount: bas.amount,
      cta: "Review",
      href: "/transactions",
      score:
        (imminent ? BAND.basImminent : BAND.basLater) +
        Math.max(0, 30 - bas.daysAway),
      menu: [{ label: "Open transactions", href: "/transactions" }],
    });
  }

  return rows;
}

/**
 * The list as the page shows it: banded, and oldest first inside each band.
 *
 * Oldest first rather than worst first, because a to-do list is worked through
 * rather than triaged — the thing that has been waiting longest is the thing to
 * do next. The bands already carry the triage.
 *
 * Always all three bands, empty ones included. Dropping the empty ones would
 * make the headings move about as work is cleared, and "nothing overdue" is one
 * of the more useful things this page can tell someone — it's only worth saying
 * if the band is there to say it. The caller decides how to draw an empty one.
 */
export function actionGroups(items: ActionItem[]): {
  urgency: ActionUrgency;
  items: ActionItem[];
}[] {
  return ACTION_URGENCIES.map((urgency) => ({
    urgency,
    items: items
      .filter((item) => item.urgency === urgency)
      .sort((a, b) => a.date.localeCompare(b.date)),
  }));
}

/** How many items each chip would leave, for the counts beside the labels. */
export function actionCounts<T extends string>(
  items: ActionItem[],
  options: readonly T[],
  of: (item: ActionItem) => string,
): Partial<Record<T, number>> {
  return options.reduce<Partial<Record<T, number>>>((counts, option) => {
    counts[option] = items.filter((item) => of(item) === option).length;
    return counts;
  }, {});
}

/** The icon for a type, for a chip or a legend that has no item to hand. */
export const ACTION_TYPE_ICON: Record<ActionType, LucideIcon> = {
  Invoices: FileText,
  "Bank feed": Landmark,
  Expenses: Receipt,
  Time: Clock,
  Quotes: FileText,
  Other: CalendarClock,
};
