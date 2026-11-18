/**
 * Quick Actions "Today" — the swipe deck, built from the business's own data.
 *
 * The screen follows the "Today" design (one card at a time; swipe right to
 * approve, left for later; every detail is a sheet). What the cards *do* is
 * this app's existing actions on its existing data, never the prototype's:
 *
 *  - batch cards act on the ticked items in one go, through the same APIs the
 *    rest of the app uses — reminders, sending invoices and quotes, converting
 *    quotes, approving the bank feed's AI categories;
 *  - cards whose items each need a decision (matching a bank line, matching an
 *    expense) open their breakdown instead, where every row has the existing
 *    match dialog;
 *  - "Getting started" cards open the existing create flow.
 *
 * Pure: nothing here fetches or renders. See `components/actions/today/`.
 */
import type { ApprovalRow } from "@/lib/bank-transactions";
import type { Transaction } from "@/lib/transactions";
import {
  QUICK_START_SUGGESTIONS,
  isReconciled,
  pendingQuickStart,
  toNumber,
  type UniboxBankTransaction,
  type UniboxInvoice,
  type UniboxMatchable,
  type UniboxOnboarding,
  type UniboxQuote,
} from "@/lib/unibox";
import { isDemoRow } from "@/lib/unibox-demo";
import {
  bankAmount,
  bankLabel,
  getPaidSets,
  invoiceSub,
  invoiceTitle,
  isCreditLine,
  isUnmatchedBankLine,
  matchableId,
  matchableSub,
  matchableTitle,
  quoteIdOf,
  quoteSub,
  quoteTitle,
  uniboxMoney,
} from "@/lib/unibox-rules";

/* ------------------------------------------------------------------ *
 * Cards
 * ------------------------------------------------------------------ */

export type CardTone = "primary" | "warning" | "info" | "success";

export type DeckCardKind =
  | "remind"
  | "send-invoices"
  | "send-quotes"
  | "convert-quotes"
  | "approve-categories"
  | "match-bank"
  | "match-expenses"
  | "start";

/** One line on a card, and one row in its breakdown. */
export type DeckItem = {
  id: string;
  label: string;
  sub: string;
  /** Signed for bank lines (money out is negative); otherwise positive. */
  amount: number;
  /** A tour sample: pressing it explains, never calls the server. */
  demo: boolean;
  /** The record the item came from, for the row's existing actions. */
  source:
    | { kind: "invoice"; row: UniboxInvoice }
    | { kind: "quote"; row: UniboxQuote }
    | { kind: "suggestion"; row: Transaction; approval: ApprovalRow }
    | { kind: "bank"; row: UniboxBankTransaction }
    | { kind: "expense"; row: UniboxMatchable };
};

export type DeckCard = {
  /** Stable across refetches, so ticks and Later survive them. */
  id: string;
  kind: DeckCardKind;
  area: string;
  tone: CardTone;
  /**
   * Batch: approving acts on the ticked items at once. Otherwise approving
   * opens the breakdown (each item needs its own decision) or, for a
   * getting-started card, the existing create flow.
   */
  batch: boolean;
  /** Sends email or moves money — held for the undo window before it runs. */
  sends: boolean;
  items: DeckItem[];
  /** Under the breakdown — e.g. what couldn't be batched. */
  note?: string;
  /** Getting-started cards only. */
  single?: { title: string; text: string; yes: string; href: string };
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const total = (items: DeckItem[]) => Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;

/** The items still ticked: all of them, less the ones unticked. */
export const tickedItems = (card: DeckCard, unticked: ReadonlySet<string> = new Set()) =>
  card.items.filter((item) => !unticked.has(item.id));

/** What a card says, for the items currently ticked. */
export function cardText(card: DeckCard, unticked: ReadonlySet<string> = new Set()) {
  if (card.single) {
    return {
      title: card.single.title,
      figure: "",
      figureLabel: "",
      yes: card.single.yes,
      done: card.single.title,
      summary: "",
    };
  }
  const sel = tickedItems(card, unticked);
  const n = sel.length;
  const all = card.items.length;
  const money = uniboxMoney(Math.abs(total(sel)));
  const of = `${n} of ${all} selected`;

  switch (card.kind) {
    case "remind":
      return {
        title: `Send ${n} payment ${plural(n, "reminder", "reminders")}`,
        figure: money,
        figureLabel: "overdue",
        yes: `Send ${n} ${plural(n, "reminder", "reminders")}`,
        done: `Sent ${n} ${plural(n, "reminder", "reminders")}`,
        summary: `${of} · ${money}`,
      };
    case "send-invoices":
      return {
        title: `Send ${n} draft ${plural(n, "invoice", "invoices")}`,
        figure: money,
        figureLabel: "to send",
        yes: `Send ${n} ${plural(n, "invoice", "invoices")}`,
        done: `Sent ${n} ${plural(n, "invoice", "invoices")}`,
        summary: `${of} · ${money}`,
      };
    case "send-quotes":
      return {
        title: `Send ${n} ${plural(n, "quote", "quotes")}`,
        figure: money,
        figureLabel: "quoted",
        yes: `Send ${n} ${plural(n, "quote", "quotes")}`,
        done: `Sent ${n} ${plural(n, "quote", "quotes")}`,
        summary: `${of} · ${money}`,
      };
    case "convert-quotes":
      return {
        title: `Convert ${n} ${plural(n, "quote", "quotes")} to ${plural(n, "an invoice", "invoices")}`,
        figure: money,
        figureLabel: "accepted",
        yes: `Convert ${n} ${plural(n, "quote", "quotes")}`,
        done: `Converted ${n} ${plural(n, "quote", "quotes")}`,
        summary: `${of} · ${money}`,
      };
    case "approve-categories":
      return {
        title: `Approve ${n} bank ${plural(n, "category", "categories")}`,
        figure: String(n),
        figureLabel: `of ${all} suggested`,
        yes: `Approve ${n}`,
        done: `Approved ${n} bank ${plural(n, "category", "categories")}`,
        summary: of,
      };
    case "match-bank":
      return {
        title: `Match ${all} bank ${plural(all, "transaction", "transactions")}`,
        figure: String(all),
        figureLabel: "to match",
        yes: `Review ${all}`,
        done: "",
        summary: "",
      };
    case "match-expenses":
    default:
      return {
        title: `Match ${all} ${plural(all, "expense", "expenses")}`,
        figure: uniboxMoney(total(card.items)),
        figureLabel: "to match",
        yes: `Review ${all}`,
        done: "",
        summary: "",
      };
  }
}

/* ------------------------------------------------------------------ *
 * Building the deck
 * ------------------------------------------------------------------ */

const QUICK_START_TEXT: Record<string, { yes: string }> = {
  first_contact: { yes: "Add contact" },
  first_invoice: { yes: "Create invoice" },
  customise_sales_documents: { yes: "Customise" },
};

/**
 * The approval an AI-categorised bank line gets if nobody edits it — what the
 * existing review dialog sends for an untouched row. Null when the suggestion
 * is missing something approval needs (a category and a client, or a
 * suggested document), so it can't go in a batch.
 */
export function suggestionApproval(row: Transaction): ApprovalRow | null {
  const client = row.suggestedClient;
  const document = row.suggestedDocument ?? null;
  const approval: ApprovalRow = {
    transactionId: row.id,
    categoryId: row.suggestedCategoryId ?? "",
    clientId: client?.id ?? "",
    gstIncluded: row.gst,
    contactPersonId: "",
    contactName: client?.name ?? "",
    document: document ? { type: document.type, id: document.id } : null,
  };
  if (approval.document) return approval;
  return approval.categoryId && approval.clientId ? approval : null;
}

export type DeckInput = {
  invoices: UniboxInvoice[];
  quotes: UniboxQuote[];
  suggestions: Transaction[];
  bankLines: UniboxBankTransaction[];
  expenses: UniboxMatchable[];
  onboarding: UniboxOnboarding | null | undefined;
  now: number;
};

/** Needs-you cards first, then getting started — the design's order. */
export function buildDeck(input: DeckInput): DeckCard[] {
  const cards: DeckCard[] = [];
  const sets = getPaidSets(input.invoices, input.quotes, input.now);

  const overdue = sets.invoices.Overdue;
  if (overdue.length) {
    cards.push({
      id: "remind",
      kind: "remind",
      area: "Get paid",
      tone: "warning",
      batch: true,
      sends: true,
      items: overdue.map((row) => ({
        id: String(row.id),
        label: invoiceTitle(row),
        sub: invoiceSub(row, "Overdue", input.now),
        amount: toNumber(row.total),
        demo: isDemoRow(row),
        source: { kind: "invoice", row },
      })),
    });
  }

  const drafts = sets.invoices["To send"];
  if (drafts.length) {
    cards.push({
      id: "send-invoices",
      kind: "send-invoices",
      area: "Get paid",
      tone: "primary",
      batch: true,
      sends: true,
      items: drafts.map((row) => ({
        id: String(row.id),
        label: invoiceTitle(row),
        sub: "Draft",
        amount: toNumber(row.total),
        demo: isDemoRow(row),
        source: { kind: "invoice", row },
      })),
    });
  }

  const quoteCard = (id: "send-quotes" | "convert-quotes", rows: UniboxQuote[], sends: boolean) => {
    if (!rows.length) return;
    cards.push({
      id,
      kind: id,
      area: "Get paid",
      tone: id === "send-quotes" ? "primary" : "success",
      batch: true,
      sends,
      items: rows.map((row) => ({
        id: String(quoteIdOf(row)),
        label: quoteTitle(row),
        sub: quoteSub(row),
        amount: toNumber(row.total),
        demo: isDemoRow(row),
        source: { kind: "quote", row },
      })),
    });
  };
  quoteCard("send-quotes", sets.quotes["To send"], true);
  quoteCard("convert-quotes", sets.quotes["Convert invoice"], false);

  const ready = input.suggestions
    .map((row) => ({ row, approval: suggestionApproval(row) }))
    .filter((entry): entry is { row: Transaction; approval: ApprovalRow } => entry.approval !== null);
  const needsEye = input.suggestions.length - ready.length;
  if (ready.length) {
    cards.push({
      id: "approve-categories",
      kind: "approve-categories",
      area: "Bank feed",
      tone: "info",
      batch: true,
      sends: false,
      items: ready.map(({ row, approval }) => ({
        id: row.id,
        label: row.description || "Bank transaction",
        sub: [row.date, row.suggestedCategory?.category].filter(Boolean).join(" · "),
        amount: row.type === "Debit" ? -Math.abs(row.amount) : Math.abs(row.amount),
        demo: false,
        source: { kind: "suggestion", row, approval },
      })),
      note: needsEye
        ? `${needsEye} more ${plural(needsEye, "suggestion needs", "suggestions need")} your eye — review ${plural(needsEye, "it", "them")} in Bank feed.`
        : undefined,
    });
  }

  const unmatched = input.bankLines.filter(isUnmatchedBankLine);
  if (unmatched.length) {
    cards.push({
      id: "match-bank",
      kind: "match-bank",
      area: "Bank feed",
      tone: "info",
      batch: false,
      sends: false,
      items: unmatched.map((row) => ({
        id: String(row.bank_transacton_id ?? row.id),
        label: bankLabel(row),
        sub: row.transaction_date ? `Unmatched · ${row.transaction_date}` : "Unmatched",
        amount: isCreditLine(row) ? bankAmount(row) : -bankAmount(row),
        demo: isDemoRow(row),
        source: { kind: "bank", row },
      })),
    });
  }

  const expenses = input.expenses.filter((row) => !isReconciled(row));
  if (expenses.length) {
    cards.push({
      id: "match-expenses",
      kind: "match-expenses",
      area: "Expenses",
      tone: "warning",
      batch: false,
      sends: false,
      items: expenses.map((row) => ({
        id: matchableId("expense", row),
        label: matchableTitle("expense", row),
        sub: matchableSub("expense", row),
        amount: toNumber(row.price),
        demo: isDemoRow(row),
        source: { kind: "expense", row },
      })),
    });
  }

  for (const step of pendingQuickStart(input.onboarding)) {
    cards.push({
      id: `start:${step.key}`,
      kind: "start",
      area: "Getting started",
      tone: "success",
      batch: false,
      sends: false,
      items: [],
      single: {
        title: step.title,
        text: step.description,
        yes: QUICK_START_TEXT[step.key]?.yes ?? "Start",
        href: step.href,
      },
    });
  }

  return cards;
}

/** Every getting-started step the deck can show, for tests and copy checks. */
export const START_STEPS = QUICK_START_SUGGESTIONS;

/**
 * The deck as it stands: items still waiting on an undo window or already
 * acted on drop out, and so does any card left with nothing in it, or put off
 * until later today.
 */
export function visibleDeck(
  deck: DeckCard[],
  hiddenItems: ReadonlySet<string>,
  later: ReadonlySet<string>,
): DeckCard[] {
  return deck
    .filter((card) => !later.has(card.id))
    .map((card) =>
      card.single ? card : { ...card, items: card.items.filter((item) => !hiddenItems.has(itemKey(card, item))) },
    )
    .filter((card) => card.single || card.items.length > 0);
}

/** An item's key across cards — the same invoice can't clash with a quote. */
export const itemKey = (card: Pick<DeckCard, "id">, item: Pick<DeckItem, "id">) => `${card.id}:${item.id}`;

/* ------------------------------------------------------------------ *
 * Later — put off for the rest of the day, in this browser
 * ------------------------------------------------------------------ */

const pad = (value: number) => String(value).padStart(2, "0");

/** `YYYY-MM-DD` in local time — "today" is the user's day, not UTC's. */
export const localDay = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Per business and per day, so tomorrow (or another business) starts fresh. */
export const laterKey = (businessId: string | null, day: string) =>
  `sole-qa-later:${businessId || "default"}:${day}`;

export function parseLater(raw: string | null): Set<string> {
  try {
    const parsed = JSON.parse(raw || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

/* ------------------------------------------------------------------ *
 * Customise — what shows and in what order
 * ------------------------------------------------------------------ */

export type LayoutKey =
  | "away"
  | "getpaid"
  | "bank"
  | "expenses"
  | "ready"
  | "time"
  | "assets"
  | "progress"
  | "projects"
  | "work"
  | "km"
  | "liabilities"
  | "equity";

export type LayoutItem = { key: LayoutKey; label: string; recommended: boolean };

/**
 * The design's set, then this app's other modules — off by default, so
 * nothing the old page showed is lost, but the screen starts as designed.
 */
export const LAYOUT_ITEMS: LayoutItem[] = [
  { key: "away", label: "While you were away", recommended: true },
  { key: "getpaid", label: "Get paid", recommended: true },
  { key: "bank", label: "Bank feed", recommended: true },
  { key: "expenses", label: "Expenses", recommended: true },
  { key: "ready", label: "Ready for you", recommended: true },
  { key: "time", label: "Time tracker", recommended: false },
  { key: "assets", label: "Assets", recommended: false },
  { key: "progress", label: "Your progress", recommended: false },
  { key: "projects", label: "Projects", recommended: false },
  { key: "work", label: "Work coming up", recommended: false },
  { key: "km", label: "KM tracker", recommended: false },
  { key: "liabilities", label: "Liabilities", recommended: false },
  { key: "equity", label: "Equity", recommended: false },
];

/** The tiles — everything but the updates bar and the deck. */
export const TILE_KEYS: LayoutKey[] = LAYOUT_ITEMS.map((item) => item.key).filter(
  (key) => key !== "away" && key !== "ready",
);

export type Layout = { order: LayoutKey[]; on: Record<LayoutKey, boolean> };

export const recommendedLayout = (): Layout => ({
  order: LAYOUT_ITEMS.map((item) => item.key),
  on: Object.fromEntries(LAYOUT_ITEMS.map((item) => [item.key, item.recommended])) as Record<LayoutKey, boolean>,
});

/** Per user and business, as the old page's card preference was. */
export const layoutKey = (userId: string, businessId: string | null) =>
  `sole-qa-layout:${userId}:${businessId || "default"}`;

/**
 * A saved layout, or the recommended one when there isn't a usable save. New
 * items added since it was saved join at the end, hidden, so an update never
 * scrambles anyone's order.
 */
export function parseLayout(raw: string | null): Layout {
  const fallback = recommendedLayout();
  try {
    const saved = JSON.parse(raw || "null") as Partial<Layout> | null;
    if (!saved || !Array.isArray(saved.order) || typeof saved.on !== "object" || !saved.on) return fallback;
    const known = new Set(fallback.order);
    const order = saved.order.filter((key): key is LayoutKey => known.has(key as LayoutKey));
    const deduped = [...new Set(order)];
    const missing = fallback.order.filter((key) => !deduped.includes(key));
    const on = { ...fallback.on };
    for (const key of fallback.order) {
      const value = (saved.on as Record<string, unknown>)[key];
      on[key] = typeof value === "boolean" ? value : missing.includes(key) ? false : fallback.on[key];
    }
    return { order: [...deduped, ...missing], on };
  } catch {
    return fallback;
  }
}

/** Swaps a movable item with its neighbour; the updates bar has no position. */
export function moveLayoutItem(layout: Layout, key: LayoutKey, direction: "up" | "down"): Layout {
  const movable: LayoutKey[] = layout.order.filter((item) => item !== "away");
  const index = movable.indexOf(key);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= movable.length) return layout;
  [movable[index], movable[target]] = [movable[target], movable[index]];
  return { ...layout, order: ["away", ...movable] };
}

export const toggleLayoutItem = (layout: Layout, key: LayoutKey): Layout => ({
  ...layout,
  on: { ...layout.on, [key]: !layout.on[key] },
});

/** The tiles to draw, in the user's order. */
export const visibleTiles = (layout: Layout) =>
  layout.order.filter((key) => TILE_KEYS.includes(key) && layout.on[key]);

/**
 * Where the deck sits relative to the tiles. The design puts the tiles above
 * the card; moving "Ready for you" above every tile flips that.
 */
export const deckFirst = (layout: Layout) => {
  const tiles = visibleTiles(layout);
  return tiles.length === 0 || layout.order.indexOf("ready") < layout.order.indexOf(tiles[0]);
};
