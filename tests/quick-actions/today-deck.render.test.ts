// @vitest-environment node
/**
 * Quick Actions "Today" — the swipe deck, rendered.
 *
 * Renders the real `SwipeDeck` and checks what each card shows: title,
 * figure, line items with their ticks, "+ N more in the breakdown", "See
 * details", the stamps, and the two cards peeking behind. (Rendered to markup,
 * as the repo's other component tests are — the gestures themselves are
 * covered by the physics tests.)
 */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/axiosInstance", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));

const { SwipeDeck, DeckControls } = await import("@/components/actions/today/swipe-deck");
const { buildDeck } = await import("@/lib/quick-actions-today");

import type { DeckCard } from "@/lib/quick-actions-today";
import type { UniboxInvoice } from "@/lib/unibox";

const NOW = new Date("2026-11-13T12:00:00").getTime();

const overdue = (id: number, total: number): UniboxInvoice => ({
  id,
  invoice_no: `INV-${id}`,
  status: "overdue",
  due_date: "2026-10-01T12:00:00",
  total,
  client: { name: "Adam" },
});

const deck = (invoiceCount: number, extra: Partial<Parameters<typeof buildDeck>[0]> = {}) =>
  buildDeck({
    invoices: Array.from({ length: invoiceCount }, (_, i) => overdue(i + 1, 100)),
    quotes: [],
    suggestions: [],
    bankLines: [],
    expenses: [],
    onboarding: null,
    now: NOW,
    ...extra,
  });

function render(cards: DeckCard[], unticked: Record<string, string[]> = {}) {
  return renderToStaticMarkup(
    React.createElement(SwipeDeck, {
      cards,
      untickedFor: (card: DeckCard) => new Set(unticked[card.id] ?? []),
      onToggle: () => {},
      onApprove: () => true,
      onLater: () => {},
      onOpen: () => {},
    }),
  );
}

describe("the top card", () => {
  it("shows the title, the area, 'Prepared by Sole' and the figure for the ticked items", () => {
    const html = render(deck(2));
    expect(html).toContain("Send 2 payment reminders");
    expect(html).toContain("Get paid");
    expect(html).toContain("Prepared by Sole");
    expect(html).toContain("$200.00");
    expect(html).toContain("overdue");
  });

  it("lists up to three items, each with a tick", () => {
    const html = render(deck(3));
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
    expect(html).toContain("INV-1 · Adam");
    expect(html).not.toContain("more in the breakdown");
  });

  it("sends the rest to the breakdown", () => {
    const html = render(deck(7));
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
    expect(html).toContain("+ 4 more in the breakdown");
  });

  it("follows the ticks — an unticked item is struck through and leaves the total", () => {
    const html = render(deck(2), { remind: ["2"] });
    expect(html).toContain("Send 1 payment reminder");
    expect(html).toContain("$100.00");
    expect(html).toMatch(/line-through[^>]*>[^<]*\$100\.00/);
  });

  it("always offers See details", () => {
    expect(render(deck(1))).toContain("See details");
  });

  it("carries both stamps, hidden until dragged", () => {
    const html = render(deck(1));
    expect(html).toContain("APPROVE");
    expect(html).toContain("LATER");
    expect(html.match(/opacity-0/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it("tells a screen reader what it is and how to act on it", () => {
    expect(render(deck(1))).toContain('aria-label="Send 1 payment reminder. Swipe right to approve, left for later."');
  });
});

describe("cards that need a decision per item", () => {
  it("list their items without ticks and ask for a review", () => {
    const cards = deck(0, { bankLines: [{ id: 1, description: "Etsy", amount: 58, direction: "credit" }] });
    const html = render(cards);
    expect(html).toContain("Match 1 bank transaction");
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain("+$58.00");
  });
});

describe("getting-started cards", () => {
  it("show their text instead of items", () => {
    const html = render(deck(0, { onboarding: { show_suggestions: true, suggestions: {} } }));
    expect(html).toContain("Add your first contact");
    expect(html).toContain("Save a customer or supplier to use later.");
    expect(html).not.toContain("Prepared by Sole");
  });
});

describe("the stack", () => {
  it("draws the top card and at most two behind it, hidden from screen readers", () => {
    const cards = deck(1, {
      quotes: [{ id: 1, status: "draft", total: 5 }, { id: 2, status: "sent", total: 9 }],
      onboarding: { show_suggestions: true, suggestions: {} },
    });
    expect(cards.length).toBeGreaterThan(3);
    const html = render(cards);
    expect(html.match(/data-depth="/g)).toHaveLength(3);
    expect(html.match(/data-depth="[12]"[^>]*aria-hidden="true"|aria-hidden="true"[^>]*data-depth="[12]"/g)).toHaveLength(2);
  });

  it("lets only the top card take focus", () => {
    const html = render(deck(1, { quotes: [{ id: 1, status: "draft", total: 5 }] }));
    expect(html.match(/data-depth="0"[^>]*tabindex="0"|tabindex="0"[^>]*data-depth="0"/)).not.toBeNull();
  });
});

describe("the buttons", () => {
  it("name the action on Approve", () => {
    const html = renderToStaticMarkup(
      React.createElement(DeckControls, { yesLabel: "Send 2 reminders", onLater: () => {}, onApprove: () => {} }),
    );
    expect(html).toContain('aria-label="Later"');
    expect(html).toContain('aria-label="Approve: Send 2 reminders"');
    expect(html).toContain("Send 2 reminders");
  });
});
