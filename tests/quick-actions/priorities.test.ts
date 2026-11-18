/**
 * Quick Actions — the hero strip and "If you've got 5 minutes"
 * (pages/quick-actions: PriorityRow, QuickStartSuggestions, the hero).
 */
import { describe, expect, it } from "vitest";

import { pendingQuickStart, type PriorityItem } from "@/lib/unibox";
import {
  PRIORITY_ERRORS,
  PRIORITY_SUCCESS,
  TOP_N,
  clearedPriorityIds,
  describePriority,
  heroView,
  priorityActions,
  priorityRoute,
  runBursts,
  runCopy,
  runToast,
  topFive,
} from "@/lib/unibox-rules";

const NOW = new Date("2026-03-10T12:00:00").getTime();
const items = (count: number) =>
  Array.from({ length: count }, (_, index): PriorityItem => ({ id: `p${index}`, resource_type: "invoice" }));

/* ------------------------------------------------------------------ *
 * The hero
 * ------------------------------------------------------------------ */

describe("hero strip", () => {
  it("reads the health score, its label and the day streak", () => {
    expect(heroView({ health: { score: 72, status: "Healthy" }, streak: { current: 4 } })).toEqual({
      score: 72,
      status: "Healthy",
      healthy: true,
      streak: 4,
    });
  });

  it("is healthy only above 50", () => {
    expect(heroView({ health: { score: 51 } }).healthy).toBe(true);
    expect(heroView({ health: { score: 50 } }).healthy).toBe(false);
  });

  it("is zero, unlabelled and streakless with no data", () => {
    expect(heroView(null)).toEqual({ score: 0, status: "", healthy: false, streak: 0 });
  });
});

/* ------------------------------------------------------------------ *
 * Sharing the five
 * ------------------------------------------------------------------ */

describe("topFive", () => {
  it("gives all five slots to priorities when there's nothing else", () => {
    const result = topFive({ quickStartCount: 0, aiCount: 0, priorities: items(8) });
    expect(result.slots).toBe(TOP_N);
    expect(result.visible.map((item) => item.id)).toEqual(["p0", "p1", "p2", "p3", "p4"]);
  });

  it("puts setup suggestions first, leaving the rest to priorities", () => {
    const result = topFive({ quickStartCount: 2, aiCount: 0, priorities: items(8) });
    expect(result.slots).toBe(3);
    expect(result.visible).toHaveLength(3);
  });

  it("takes one slot for the AI review, however many suggestions it has", () => {
    expect(topFive({ quickStartCount: 0, aiCount: 8, priorities: items(8) }).slots).toBe(4);
    expect(topFive({ quickStartCount: 0, aiCount: 1, priorities: items(8) }).slots).toBe(4);
  });

  it("never goes below zero slots", () => {
    expect(topFive({ quickStartCount: 6, aiCount: 3, priorities: items(2) }).slots).toBe(0);
  });

  it("counts what's left to action across all three", () => {
    expect(topFive({ quickStartCount: 1, aiCount: 8, priorities: items(4) }).leftToAction).toBe(6);
  });

  it("uses the server's to-action figure for the hero when it sends one", () => {
    expect(topFive({ quickStartCount: 1, aiCount: 2, priorities: items(4), toActionFromServer: 10 }).toAction).toBe(12);
  });

  it("falls back to the priorities it has", () => {
    expect(topFive({ quickStartCount: 0, aiCount: 0, priorities: items(4) }).toAction).toBe(4);
  });
});

/* ------------------------------------------------------------------ *
 * A priority row
 * ------------------------------------------------------------------ */

describe("describePriority", () => {
  it("describes an overdue invoice", () => {
    const row = describePriority(
      {
        id: "invoice:3",
        type: "overdue_invoice",
        resource_type: "invoice",
        entity_id: 3,
        data: { id: 3, invoice_no: "INV-3", client: { name: "abc" }, due_date: "2026-03-01T12:00:00", total: 11 },
      },
      NOW,
    );
    expect(row).toMatchObject({
      overdue: true,
      bank: false,
      title: "INV-3 · abc",
      chip: "Invoice",
      status: "9 days overdue · Due 2026-03-01T12:00:00",
      amount: 11,
      credit: false,
      href: "/invoices/3",
      openLabel: "Open the invoice",
    });
  });

  it("never says a negative number of days overdue", () => {
    const row = describePriority(
      { id: "x", type: "overdue_invoice", resource_type: "invoice", data: { due_date: "2026-03-20T12:00:00" } },
      NOW,
    );
    expect(row.status).toMatch(/^0 days overdue/);
  });

  it("describes an invoice that's due", () => {
    const row = describePriority(
      { id: "x", type: "due_invoice", resource_type: "invoice", data: { id: 4, due_date: "2026-03-12" } },
      NOW,
    );
    expect(row.status).toBe("Due 2026-03-12");
    expect(row.title).toBe("4 · Client");
  });

  it("describes a bank line, money in shown as credit", () => {
    const row = describePriority(
      {
        id: "bank_feed:9",
        resource_type: "bank_feed",
        entity_id: 9,
        data: { description: "Etsy Ireland", transaction_date: "2026-10-26", amount: 58, direction: "credit" },
      },
      NOW,
    );
    expect(row).toMatchObject({
      bank: true,
      title: "Etsy Ireland",
      chip: "Bank",
      status: "Unmatched · 2026-10-26",
      amount: 58,
      credit: true,
      href: "/transactions",
      openLabel: "Open the bank feed",
    });
  });

  it("falls back to 'Bank transaction' and a bare Unmatched", () => {
    const row = describePriority({ id: "x", resource_type: "bank_feed", data: {} }, NOW);
    expect(row.title).toBe("Bank transaction");
    expect(row.status).toBe("Unmatched");
    expect(row.credit).toBe(false);
  });

  it("describes an expense", () => {
    const row = describePriority(
      { id: "expense:5", resource_type: "expense", entity_id: 5, data: { name: "Fuel", date: "2026-09-08", price: 100 } },
      NOW,
    );
    expect(row).toMatchObject({
      title: "Fuel",
      chip: "Expense",
      status: "Needs matching · 2026-09-08",
      amount: 100,
      href: "/expenses/5",
      openLabel: "Open the expense",
    });
  });

  it("names an expense by its client, else 'Expense'", () => {
    expect(describePriority({ id: "x", resource_type: "expense", data: { client: { name: "Ampol" } } }, NOW).title).toBe("Ampol");
    expect(describePriority({ id: "x", resource_type: "expense" }, NOW).title).toBe("Expense");
  });
});

describe("priorityActions", () => {
  it("takes a list, a single action, or none", () => {
    const follow = { key: "follow_up", label: "Follow up" };
    const paid = { key: "mark_as_paid", label: "Mark as paid" };
    expect(priorityActions({ id: "x", action: [follow, paid] })).toEqual([follow, paid]);
    expect(priorityActions({ id: "x", action: follow })).toEqual([follow]);
    expect(priorityActions({ id: "x", action: null })).toEqual([]);
    expect(priorityActions({ id: "x" })).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * What each action does — handlePriorityAction
 * ------------------------------------------------------------------ */

describe("priorityRoute", () => {
  const invoice: PriorityItem = { id: "invoice:3", resource_type: "invoice", entity_id: 3 };

  it("sends a reminder for Follow up on an invoice", () => {
    expect(priorityRoute(invoice, { key: "follow_up", label: "Follow up" })).toEqual({
      kind: "invoice-reminder",
      invoiceId: "3",
    });
  });

  it("records a cash payment for Mark as paid on an invoice", () => {
    expect(priorityRoute(invoice, { key: "mark_as_paid", label: "Mark as paid" })).toEqual({
      kind: "invoice-paid-cash",
      invoiceId: "3",
    });
  });

  it("does nothing for an invoice action it doesn't know", () => {
    expect(priorityRoute(invoice, { key: "archive", label: "Archive" })).toEqual({ kind: "none" });
  });

  it("opens the bank match dialog for Match on a bank line", () => {
    expect(priorityRoute({ id: "x", resource_type: "bank_feed" }, { key: "match", label: "Match" })).toEqual({
      kind: "bank-match",
    });
    expect(priorityRoute({ id: "x", resource_type: "bank_feed" }, { key: "other", label: "Other" })).toEqual({
      kind: "none",
    });
  });

  it("opens the possible-match dialog for any match action on an expense", () => {
    const expense: PriorityItem = { id: "x", resource_type: "expense", entity_id: 5 };
    expect(priorityRoute(expense, { key: "match", label: "Match" })).toEqual({ kind: "expense-match" });
    expect(priorityRoute(expense, { key: "ai_match", label: "AI Match" })).toEqual({ kind: "expense-match" });
  });

  it("opens the expense itself for any other expense action", () => {
    expect(
      priorityRoute({ id: "x", resource_type: "expense", entity_id: 5 }, { key: "add_receipt", label: "Add receipt" }),
    ).toEqual({ kind: "expense-open", href: "/expenses/5" });
  });

  it("does nothing for a resource it doesn't know", () => {
    expect(priorityRoute({ id: "x", resource_type: "payroll" }, { key: "match", label: "Match" })).toEqual({
      kind: "none",
    });
  });

  it("has the old page's messages for both invoice actions", () => {
    expect(PRIORITY_SUCCESS).toEqual({
      "invoice-reminder": "Invoice reminder sent successfully!",
      "invoice-paid-cash": "Invoice marked as paid with cash successfully!",
    });
    expect(PRIORITY_ERRORS).toEqual({
      "invoice-reminder": "Failed to send the invoice reminder. Please try again.",
      "invoice-paid-cash": "Failed to update cash payment status. Please try again.",
    });
  });
});

/* ------------------------------------------------------------------ *
 * Getting started — QuickStartSuggestions.js
 * ------------------------------------------------------------------ */

describe("pendingQuickStart", () => {
  it("shows nothing unless the server says to", () => {
    expect(pendingQuickStart(null)).toEqual([]);
    expect(pendingQuickStart({ show_suggestions: false, suggestions: {} })).toEqual([]);
  });

  it("shows all three, in order, when none is done", () => {
    expect(pendingQuickStart({ show_suggestions: true, suggestions: {} }).map((s) => s.key)).toEqual([
      "first_contact",
      "first_invoice",
      "customise_sales_documents",
    ]);
  });

  it("drops each one once it's complete", () => {
    const pending = pendingQuickStart({
      show_suggestions: true,
      suggestions: { first_contact: { complete: true } },
    });
    expect(pending.map((s) => s.key)).toEqual(["first_invoice", "customise_sales_documents"]);
  });

  it("drops the customise step once the first contact and invoice are both done", () => {
    const pending = pendingQuickStart({
      show_suggestions: true,
      suggestions: { first_contact: { complete: true }, first_invoice: { complete: true } },
    });
    expect(pending).toEqual([]);
  });

  it("reads the checklist when there are no suggestions", () => {
    const pending = pendingQuickStart({
      show_suggestions: true,
      checklist: { first_contact: { complete: true }, first_invoice: { complete: false } },
    });
    expect(pending.map((s) => s.key)).toEqual(["first_invoice", "customise_sales_documents"]);
  });

  it("links each to its route in this app, ignoring the server's legacy href", () => {
    const pending = pendingQuickStart({
      show_suggestions: true,
      suggestions: { first_contact: { href: "/contacts/new" } },
    });
    expect(pending.map((s) => s.href)).toEqual(["/contacts?new=1", "/invoices/new", "/sales/settings"]);
  });

  it("keeps the old titles and descriptions", () => {
    expect(pendingQuickStart({ show_suggestions: true })).toEqual([
      expect.objectContaining({ title: "Add your first contact", description: "Save a customer or supplier to use later." }),
      expect.objectContaining({ title: "Create your first invoice", description: "Create and send an invoice to a customer." }),
      expect.objectContaining({
        title: "Customise your invoices and quotes",
        description: "Choose how your invoices and quotes will look.",
      }),
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * This sitting's progress — the ring and the run
 * ------------------------------------------------------------------ */

describe("clearedPriorityIds", () => {
  it("counts a priority acted on that has left the server's list", () => {
    expect(clearedPriorityIds(["p1", "p2"], [{ id: "p2" }])).toEqual(["p1"]);
  });

  it("doesn't count one the server still lists, or one never acted on", () => {
    expect(clearedPriorityIds(["p1"], [{ id: "p1" }, { id: "p3" }])).toEqual([]);
    expect(clearedPriorityIds([], [])).toEqual([]);
  });
});

describe("the run of clears", () => {
  it("is ready, then nice, then on a roll, then on fire", () => {
    expect(runCopy(0, 5)).toEqual({ headline: "Ready when you are", sub: "Clear one to get the ball rolling" });
    expect(runCopy(1, 5)).toEqual({ headline: "Ready when you are", sub: "Clear one to get the ball rolling" });
    expect(runCopy(2, 5)).toEqual({ headline: "2 in a row", sub: "Nice — keep it going" });
    expect(runCopy(3, 5)).toEqual({ headline: "3 in a row", sub: "You're on a roll — keep going" });
    expect(runCopy(5, 5)).toEqual({ headline: "5 in a row", sub: "On fire — unstoppable!" });
  });

  it("is all clear with nothing to do", () => {
    expect(runCopy(0, 0)).toEqual({ headline: "All clear", sub: "Nothing waiting on you right now" });
  });

  it("toasts from the third in a row", () => {
    expect(runToast(2)).toBeNull();
    expect(runToast(3)).toBe("🔥 3 in a row!");
    expect(runToast(7)).toBe("🔥 7 in a row!");
  });

  it("bursts confetti at three and from five on, not at four", () => {
    expect([1, 2, 3, 4, 5, 6].map(runBursts)).toEqual([false, false, true, false, true, true]);
  });
});
