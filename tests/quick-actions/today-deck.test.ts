/**
 * Quick Actions "Today" — the swipe deck, Later and Customise.
 *
 * The deck is built from the business's own data and acts through the app's
 * existing actions; these pin which cards appear, what they say for the items
 * ticked, and the layout rules from the design handoff.
 */
import { describe, expect, it } from "vitest";

import type { Transaction } from "@/lib/transactions";
import type { UniboxBankTransaction, UniboxInvoice, UniboxMatchable, UniboxQuote } from "@/lib/unibox";
import {
  LAYOUT_ITEMS,
  TILE_KEYS,
  buildDeck,
  cardText,
  deckFirst,
  itemKey,
  laterKey,
  layoutKey,
  localDay,
  moveLayoutItem,
  parseLater,
  parseLayout,
  recommendedLayout,
  suggestionApproval,
  tickedItems,
  toggleLayoutItem,
  visibleDeck,
  visibleTiles,
  type DeckInput,
} from "@/lib/quick-actions-today";

const NOW = new Date("2026-11-13T12:00:00").getTime();

const input = (over: Partial<DeckInput> = {}): DeckInput => ({
  invoices: [],
  quotes: [],
  suggestions: [],
  bankLines: [],
  expenses: [],
  onboarding: null,
  now: NOW,
  ...over,
});

const overdue = (id: number, total: number): UniboxInvoice => ({
  id,
  invoice_no: `INV-${id}`,
  status: "overdue",
  due_date: "2026-10-01T12:00:00",
  total,
  client: { name: "Adam" },
});

const suggestion = (id: string, over: Partial<Transaction> = {}): Transaction =>
  ({
    id,
    date: "2026-11-01",
    description: `Line ${id}`,
    type: "Debit",
    amount: 120,
    gst: true,
    suggestedCategoryId: "cat-1",
    suggestedCategory: { category: "Software" },
    suggestedClient: { id: "client-1", name: "Adobe" },
    suggestedDocument: null,
    ...over,
  }) as unknown as Transaction;

describe("building the deck", () => {
  it("is empty with nothing to do", () => {
    expect(buildDeck(input())).toEqual([]);
  });

  it("batches overdue invoices into one reminders card", () => {
    const [card] = buildDeck(input({ invoices: [overdue(1, 100), overdue(2, 46.24)] }));
    expect(card).toMatchObject({ id: "remind", kind: "remind", area: "Get paid", tone: "warning", batch: true, sends: true });
    expect(card.items.map((item) => item.label)).toEqual(["INV-1 · Adam", "INV-2 · Adam"]);
    expect(card.items[0].sub).toMatch(/days overdue · Due /);
  });

  it("batches draft invoices into a send card", () => {
    const deck = buildDeck(input({ invoices: [{ id: 5, status: "draft", total: 300, client: { name: "Maria" } }] }));
    expect(deck.map((card) => card.id)).toEqual(["send-invoices"]);
    expect(deck[0]).toMatchObject({ batch: true, sends: true });
  });

  it("splits quotes into ones to send and ones to convert, by the existing rules", () => {
    const quotes: UniboxQuote[] = [
      { id: 1, status: "draft", total: 110 },
      { id: 2, status: "rejected", total: 90 },
      { id: 3, status: "sent", total: 400, quote_id: 33 },
      { id: 4, status: "converted", total: 50 },
    ];
    const deck = buildDeck(input({ quotes }));
    expect(deck.map((card) => card.id)).toEqual(["send-quotes", "convert-quotes"]);
    expect(deck[0].items.map((item) => item.id)).toEqual(["1", "2"]);
    // A quote is acted on by its quote id where it has one.
    expect(deck[1].items.map((item) => item.id)).toEqual(["33"]);
    expect(deck[1].sends).toBe(false);
  });

  it("batches only the AI suggestions that can be approved untouched", () => {
    const deck = buildDeck(
      input({
        suggestions: [
          suggestion("a"),
          suggestion("b", { suggestedClient: null }),
          suggestion("c", { suggestedCategoryId: null, suggestedDocument: { type: "invoice", id: "9" } as never }),
        ],
      }),
    );
    const [card] = deck;
    expect(card.id).toBe("approve-categories");
    expect(card.items.map((item) => item.id)).toEqual(["a", "c"]);
    expect(card.note).toBe("1 more suggestion needs your eye — review it in Bank feed.");
    expect(card.items[0].amount).toBe(-120);
  });

  it("puts unmatched bank lines on a card that opens its breakdown", () => {
    const bank: UniboxBankTransaction[] = [
      { id: 1, bank_transacton_id: 11, description: "Etsy", amount: 58, direction: "credit", transaction_date: "2026-10-26" },
      { id: 2, description: "Matched", amount: 10, matched_transaction_no: "TX-1" },
    ];
    const [card] = buildDeck(input({ bankLines: bank }));
    expect(card).toMatchObject({ id: "match-bank", batch: false });
    expect(card.items).toHaveLength(1);
    expect(card.items[0]).toMatchObject({ id: "11", label: "Etsy", amount: 58, sub: "Unmatched · 2026-10-26" });
  });

  it("puts unreconciled expenses on a card that opens its breakdown", () => {
    const expenses: UniboxMatchable[] = [
      { id: 1, expense_id: 70, name: "Fuel", price: 100, date: "2026-11-01T12:00:00" },
      { id: 2, name: "Done", price: 5, is_reconciled: 1 },
    ];
    const [card] = buildDeck(input({ expenses }));
    expect(card).toMatchObject({ id: "match-expenses", batch: false, area: "Expenses" });
    expect(card.items.map((item) => item.id)).toEqual(["70"]);
  });

  it("adds getting-started cards last, each opening the existing flow", () => {
    const deck = buildDeck(
      input({
        invoices: [overdue(1, 100)],
        onboarding: { show_suggestions: true, suggestions: { first_contact: { href: "/contacts?new=1" } } },
      }),
    );
    expect(deck.map((card) => card.id)).toEqual([
      "remind",
      "start:first_contact",
      "start:first_invoice",
      "start:customise_sales_documents",
    ]);
    expect(deck[1].single).toEqual({
      title: "Add your first contact",
      text: "Save a customer or supplier to use later.",
      yes: "Add contact",
      href: "/contacts?new=1",
    });
  });

  it("orders needs-you cards before getting started", () => {
    const deck = buildDeck(
      input({
        invoices: [overdue(1, 100), { id: 5, status: "draft", total: 1 }],
        quotes: [{ id: 1, status: "draft" }],
        suggestions: [suggestion("a")],
        bankLines: [{ id: 1, amount: 1 }],
        expenses: [{ id: 1, price: 1 }],
        onboarding: { show_suggestions: true, suggestions: {} },
      }),
    );
    expect(deck.map((card) => card.kind)).toEqual([
      "remind",
      "send-invoices",
      "send-quotes",
      "approve-categories",
      "match-bank",
      "match-expenses",
      "start",
      "start",
      "start",
    ]);
  });

  it("flags tour samples so their buttons never reach the server", () => {
    const [card] = buildDeck(input({ invoices: [{ ...overdue(1, 10), __demo: true } as UniboxInvoice] }));
    expect(card.items[0].demo).toBe(true);
  });
});

describe("what a card says", () => {
  const [remind] = buildDeck(input({ invoices: [overdue(1, 100), overdue(2, 46.24), overdue(3, 20)] }));

  it("counts and totals every item at first", () => {
    expect(cardText(remind)).toMatchObject({
      title: "Send 3 payment reminders",
      figure: "$166.24",
      figureLabel: "overdue",
      yes: "Send 3 reminders",
      summary: "3 of 3 selected · $166.24",
    });
  });

  it("updates live as items are unticked", () => {
    const unticked = new Set(["2", "3"]);
    expect(tickedItems(remind, unticked).map((item) => item.id)).toEqual(["1"]);
    expect(cardText(remind, unticked)).toMatchObject({
      title: "Send 1 payment reminder",
      figure: "$100.00",
      yes: "Send 1 reminder",
      done: "Sent 1 reminder",
      summary: "1 of 3 selected · $100.00",
    });
  });

  it("says nothing is selected when every item is unticked", () => {
    expect(cardText(remind, new Set(["1", "2", "3"])).yes).toBe("Send 0 reminders");
  });

  it("asks for a review on cards that open their breakdown", () => {
    const [bank] = buildDeck(input({ bankLines: [{ id: 1, amount: 5 }, { id: 2, amount: 7 }] }));
    expect(cardText(bank)).toMatchObject({ title: "Match 2 bank transactions", figure: "2", figureLabel: "to match", yes: "Review 2" });
  });

  it("uses a getting-started card's own words", () => {
    const [start] = buildDeck(input({ onboarding: { show_suggestions: true, suggestions: {} } }));
    expect(cardText(start)).toMatchObject({ title: "Add your first contact", yes: "Add contact", figure: "" });
  });
});

describe("approving an AI suggestion untouched", () => {
  it("sends its category, client and tax", () => {
    expect(suggestionApproval(suggestion("a"))).toEqual({
      transactionId: "a",
      categoryId: "cat-1",
      clientId: "client-1",
      gstIncluded: true,
      contactPersonId: "",
      contactName: "Adobe",
      document: null,
    });
  });

  it("pairs with a suggested document instead of a category when there is one", () => {
    const approval = suggestionApproval(
      suggestion("a", { suggestedCategoryId: null, suggestedClient: null, suggestedDocument: { type: "expense", id: "4" } as never }),
    );
    expect(approval?.document).toEqual({ type: "expense", id: "4" });
  });

  it("can't be batched without a category or a client", () => {
    expect(suggestionApproval(suggestion("a", { suggestedCategoryId: null }))).toBeNull();
    expect(suggestionApproval(suggestion("a", { suggestedClient: null }))).toBeNull();
  });
});

describe("the deck as it stands", () => {
  const deck = buildDeck(
    input({ invoices: [overdue(1, 100), overdue(2, 50)], onboarding: { show_suggestions: true, suggestions: {} } }),
  );
  const remind = deck[0];

  it("drops items being sent or already sent", () => {
    const visible = visibleDeck(deck, new Set([itemKey(remind, remind.items[0])]), new Set());
    expect(visible[0].items.map((item) => item.id)).toEqual(["2"]);
  });

  it("drops a card once all its items are gone", () => {
    const hidden = new Set(remind.items.map((item) => itemKey(remind, item)));
    expect(visibleDeck(deck, hidden, new Set()).map((card) => card.id)).not.toContain("remind");
  });

  it("drops a card put off until later", () => {
    expect(visibleDeck(deck, new Set(), new Set(["remind"])).map((card) => card.id)).not.toContain("remind");
  });

  it("keys items per card, so an invoice and a quote with the same id don't clash", () => {
    expect(itemKey({ id: "remind" }, { id: "7" })).not.toBe(itemKey({ id: "send-quotes" }, { id: "7" }));
  });
});

describe("Later", () => {
  it("is remembered per business and per local day", () => {
    expect(localDay(new Date(2026, 10, 3, 23, 59))).toBe("2026-11-03");
    expect(laterKey("32847", "2026-11-13")).toBe("sole-qa-later:32847:2026-11-13");
    expect(laterKey(null, "2026-11-13")).toBe("sole-qa-later:default:2026-11-13");
  });

  it("reads back what was saved, ignoring anything malformed", () => {
    expect([...parseLater(JSON.stringify(["remind", 4, "match-bank"]))]).toEqual(["remind", "match-bank"]);
    expect(parseLater(null).size).toBe(0);
    expect(parseLater("{bad").size).toBe(0);
    expect(parseLater('{"a":1}').size).toBe(0);
  });
});

describe("Customise", () => {
  it("recommends the design's set and leaves the other modules off", () => {
    const layout = recommendedLayout();
    expect(LAYOUT_ITEMS.filter((item) => layout.on[item.key]).map((item) => item.label)).toEqual([
      "While you were away",
      "Get paid",
      "Bank feed",
      "Expenses",
      "Ready for you",
    ]);
    expect(TILE_KEYS).toEqual([
      "getpaid",
      "bank",
      "expenses",
      "time",
      "assets",
      "progress",
      "projects",
      "work",
      "km",
      "liabilities",
      "equity",
    ]);
  });

  it("puts the tiles above the card by default, as the design does", () => {
    const layout = recommendedLayout();
    expect(visibleTiles(layout)).toEqual(["getpaid", "bank", "expenses"]);
    expect(deckFirst(layout)).toBe(false);
  });

  it("moves an item up or down, never past the ends, and never the updates bar", () => {
    let layout = recommendedLayout();
    layout = moveLayoutItem(layout, "ready", "up");
    layout = moveLayoutItem(layout, "ready", "up");
    layout = moveLayoutItem(layout, "ready", "up");
    expect(layout.order.slice(0, 2)).toEqual(["away", "ready"]);
    expect(deckFirst(layout)).toBe(true);
    expect(moveLayoutItem(layout, "ready", "up")).toBe(layout);
    expect(moveLayoutItem(layout, "equity", "down")).toBe(layout);
  });

  it("shows and hides items", () => {
    const layout = toggleLayoutItem(recommendedLayout(), "time");
    expect(visibleTiles(layout)).toContain("time");
    expect(toggleLayoutItem(layout, "time").on.time).toBe(false);
  });

  it("is saved per user and business", () => {
    expect(layoutKey("42", "7")).toBe("sole-qa-layout:42:7");
    expect(layoutKey("42", null)).toBe("sole-qa-layout:42:default");
  });

  it("reads a saved layout, adding anything new at the end, hidden", () => {
    const saved = JSON.stringify({ order: ["away", "ready", "getpaid"], on: { away: false, ready: true, getpaid: true } });
    const layout = parseLayout(saved);
    expect(layout.order.slice(0, 3)).toEqual(["away", "ready", "getpaid"]);
    expect(layout.order).toHaveLength(LAYOUT_ITEMS.length);
    expect(layout.on.away).toBe(false);
    expect(layout.on.bank).toBe(false);
  });

  it.each([null, "", "nope", "[]", '{"order":"x","on":{}}'])("falls back to recommended for %j", (raw) => {
    expect(parseLayout(raw)).toEqual(recommendedLayout());
  });

  it("drops unknown and repeated keys from a saved order", () => {
    const layout = parseLayout(JSON.stringify({ order: ["ready", "zzz", "ready", "away"], on: {} }));
    expect(layout.order.filter((key) => key === "ready")).toHaveLength(1);
    expect(layout.order).not.toContain("zzz");
  });
});
