/**
 * The Dashboard card's five slots: the most urgent things, worst first.
 *
 * A view over `quick-actions`, not a second derivation. Quick Actions shows
 * everything banded by urgency; this ranks the same items on one scale and takes
 * the top few. Both used to work out independently what counted as an overdue
 * invoice or an imminent BAS, which is how a card and a page end up disagreeing
 * about the same row.
 *
 * The card's shape is kept as it was — `KeyAction`, `keyActions()` — so this is
 * a change of where the facts come from rather than of what the Dashboard draws.
 */

import type { LucideIcon } from "lucide-react";

import { actionItems, type ActionItem, type BasSetAside } from "@/lib/quick-actions";
import type { Expense } from "@/lib/expenses";
import type { Invoice } from "@/lib/invoices";
import type { Quote } from "@/lib/quotes";

export const MAX_KEY_ACTIONS = 5;

export type KeyActionKind =
  "invoice-overdue" | "invoice-draft" | "quote-pending" | "bill-unpaid" | "bas";

/** How loudly the detail line reads. Red for late, amber for approaching. */
export type KeyActionTone = "danger" | "warning";

export type KeyAction = {
  key: string;
  kind: KeyActionKind;
  icon: LucideIcon;
  /** "INV-0003 · Turner Consulting" — the reference and who it's with. */
  title: string;
  /** The neutral pill: Invoice, Quote, Bill, BAS. */
  typeLabel: string;
  /** "828 days overdue · Due 2024-05-17", or whatever the item's clock says. */
  detail: string;
  tone: KeyActionTone;
  amount: number;
  /** The row's own button — contextual, never generic. */
  cta: string;
  href: string;
  /**
   * Higher is more urgent. One scale across every type, so an invoice 800 days
   * late outranks a BAS due next week and both outrank an unsent draft.
   */
  urgency: number;
  /** The overflow menu: the things you'd do second. */
  menu: { label: string; href: string }[];
};

/**
 * An item as the card reads it.
 *
 * The tone is the urgency band restated in the card's two colours: already past
 * its deadline is red, everything still ahead is amber. The card has no third
 * treatment, which is why "Later" folds into amber rather than gaining one.
 */
function toKeyAction(item: ActionItem): KeyAction {
  return {
    key: item.id,
    kind: item.kind as KeyActionKind,
    icon: item.icon,
    title: item.title,
    typeLabel: item.typeLabel,
    detail: `${item.status} · ${item.timing}`,
    tone: item.urgency === "Overdue" ? "danger" : "warning",
    amount: item.amount,
    cta: item.cta,
    href: item.href,
    urgency: item.score,
    menu: item.menu,
  };
}

export function keyActions({
  invoices,
  quotes,
  expenses,
  today,
  bas,
  limit = MAX_KEY_ACTIONS,
}: {
  invoices: Invoice[];
  quotes: Quote[];
  expenses: Expense[];
  /** ISO date treated as now, so the ranking is testable. */
  today: string;
  bas?: BasSetAside;
  limit?: number;
}): { actions: KeyAction[]; total: number } {
  /*
   * No transactions passed on purpose. The card's five slots are for documents —
   * things with a client and an amount — and a bank feed row is a different kind
   * of job that Quick Actions is the place for. Widening what the card
   * shows isn't a side effect this refactor should have.
   */
  const items = actionItems({ invoices, quotes, expenses, today, bas });

  /* Worst first, and the bigger figure breaks a tie. */
  const ranked = [...items].sort(
    (a, b) => b.score - a.score || b.amount - a.amount,
  );

  return {
    actions: ranked.slice(0, limit).map(toKeyAction),
    total: ranked.length,
  };
}
