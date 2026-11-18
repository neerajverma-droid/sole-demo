"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { BANK_TRANSACTIONS_KEY, useSuggestions } from "@/hooks/use-bank-transactions-query";
import { useRefreshUnibox, useUniboxQuery } from "@/hooks/use-unibox-query";
import { apiErrorMessage } from "@/lib/api-error";
import { approveAllApi } from "@/lib/bank-transactions";
import {
  buildDeck,
  cardText,
  itemKey,
  laterKey,
  localDay,
  parseLater,
  tickedItems,
  visibleDeck,
  type DeckCard,
  type DeckItem,
} from "@/lib/quick-actions-today";
import { runGetPaidAction } from "@/lib/unibox-actions";
import { showSampleNotice } from "@/lib/unibox-demo";
import type { GetPaidActionKey } from "@/lib/unibox-rules";
import { useBusinessesStore } from "@/stores/businesses";

/** How long an approved action can still be taken back — the handoff's 8s. */
export const UNDO_MS = 8000;

export type UndoNotice = { id: number; message: string; undo: () => void };

/** What approving a card did. */
export type ApproveOutcome = "acted" | "open-breakdown" | "navigated" | "sample";

type Pending = { id: number; timer: number | null; run: () => Promise<void> };

const GET_PAID_KEY: Partial<Record<DeckCard["kind"], GetPaidActionKey>> = {
  remind: "follow_up",
  "send-invoices": "send_invoice",
  "send-quotes": "send_quote",
  "convert-quotes": "convert_quote",
};

/**
 * The "Today" deck: the cards, what's ticked on them, and what approving or
 * putting one off does.
 *
 * Approving never calls the server straight away. The items leave the card at
 * once, an Undo bar shows for 8 seconds, and only then does the real action
 * run — the reminders go out, the invoices are sent, the categories approved.
 * Undo inside that window cancels it outright. Leaving the page runs whatever
 * is still waiting rather than dropping it, so nothing approved is lost.
 */
export function useTodayDeck() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const refresh = useRefreshUnibox();
  const businessId = useBusinessesStore((state) => state.activeId) || null;

  const invoices = useUniboxQuery("invoices");
  const quotes = useUniboxQuery("quotes");
  const bank = useUniboxQuery("bankTransactions");
  const expenses = useUniboxQuery("expenses");
  const onboarding = useUniboxQuery("onboarding");
  const suggestions = useSuggestions(true);

  const loading = invoices.isLoading || quotes.isLoading || bank.isLoading || expenses.isLoading;

  const deck = React.useMemo(
    () =>
      buildDeck({
        invoices: invoices.data ?? [],
        quotes: quotes.data ?? [],
        suggestions: suggestions.data ?? [],
        bankLines: bank.data ?? [],
        expenses: expenses.data ?? [],
        // The tour's samples stand in for real work, so setup steps don't
        // crowd them out while it runs.
        onboarding: invoices.isDemo ? null : onboarding.data,
        now: Date.now(),
      }),
    [invoices.data, invoices.isDemo, quotes.data, suggestions.data, bank.data, expenses.data, onboarding.data],
  );

  /* ---------------------------------------------------------------- *
   * Ticks — every item starts ticked; this holds the ones that aren't
   * ---------------------------------------------------------------- */
  const [unticked, setUnticked] = React.useState<Record<string, string[]>>({});
  const untickedFor = React.useCallback(
    (card: DeckCard) => new Set(unticked[card.id] ?? []),
    [unticked],
  );
  const toggleItem = (card: DeckCard, item: DeckItem) =>
    setUnticked((current) => {
      const off = new Set(current[card.id] ?? []);
      if (off.has(item.id)) off.delete(item.id);
      else off.add(item.id);
      return { ...current, [card.id]: [...off] };
    });
  const setAllTicked = (card: DeckCard, ticked: boolean) =>
    setUnticked((current) => ({ ...current, [card.id]: ticked ? [] : card.items.map((item) => item.id) }));

  /* ---------------------------------------------------------------- *
   * Later — put off for today, in this browser
   * ---------------------------------------------------------------- */
  const storageKey = laterKey(businessId, localDay(new Date()));
  const [later, setLater] = React.useState<Set<string>>(() => new Set());
  React.useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(storageKey);
    } catch {
      /* storage blocked — nothing was put off */
    }
    setLater(parseLater(raw));
  }, [storageKey]);
  const saveLater = (next: Set<string>) => {
    setLater(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      /* private mode — it holds for this visit */
    }
  };

  /* ---------------------------------------------------------------- *
   * Items approved and waiting on (or past) their undo window
   * ---------------------------------------------------------------- */
  const [hidden, setHidden] = React.useState<Set<string>>(() => new Set());
  const [order, setOrder] = React.useState<string[]>([]);
  const [done, setDone] = React.useState(0);
  const [undo, setUndo] = React.useState<UndoNotice | null>(null);
  const pending = React.useRef(new Map<number, Pending>());
  const nextId = React.useRef(1);

  const cards = React.useMemo(() => {
    const visible = visibleDeck(deck, hidden, later);
    // Cards sent to the back (approved in part) keep their place behind the rest.
    const rank = (card: DeckCard, index: number) => {
      const at = order.indexOf(card.id);
      return at === -1 ? index : 10_000 + at;
    };
    return visible
      .map((card, index) => ({ card, rank: rank(card, index) }))
      .sort((a, b) => a.rank - b.rank)
      .map(({ card }) => card);
  }, [deck, hidden, later, order]);

  const showUndo = (message: string, revert: () => void) => {
    const id = nextId.current++;
    setUndo({ id, message, undo: revert });
  };

  // The bar goes when its window does.
  React.useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo((current) => (current?.id === undo.id ? null : current)), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [undo]);

  /** What actually happens, once the undo window has passed. */
  const execute = React.useCallback(
    async (card: DeckCard, items: DeckItem[]) => {
      const keys = items.map((item) => itemKey(card, item));
      const text = cardText(card, new Set(card.items.filter((item) => !items.includes(item)).map((item) => item.id)));
      /** What failed is certainly still there: back on the card now, not after the reload. */
      const restore = (failed: DeckItem[]) => {
        if (failed.length === 0) return;
        setHidden((current) => {
          const next = new Set(current);
          failed.forEach((item) => next.delete(itemKey(card, item)));
          return next;
        });
        // Nothing went through: it doesn't count as done.
        if (failed.length === items.length) setDone((n) => Math.max(0, n - 1));
      };
      try {
        if (card.kind === "approve-categories") {
          const rows = items.flatMap((item) => (item.source.kind === "suggestion" ? [item.source.approval] : []));
          const message = await approveAllApi(rows);
          toast.success(message || text.done);
        } else {
          const key = GET_PAID_KEY[card.kind];
          if (!key) return;
          const results = await Promise.allSettled(
            items.map((item) =>
              item.source.kind === "invoice" || item.source.kind === "quote"
                ? runGetPaidAction(key, item.source.row)
                : Promise.resolve(""),
            ),
          );
          const failed = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
          restore(items.filter((_, index) => results[index].status === "rejected"));
          if (failed.length === 0) toast.success(text.done);
          else
            toast.error(
              `${items.length - failed.length} of ${items.length} done — ${failed.length} couldn't be completed.`,
              { description: apiErrorMessage(failed[0].reason, "Please try again.") },
            );
        }
      } catch (error) {
        restore(items);
        toast.error(apiErrorMessage(error, "Unable to complete this action."));
      } finally {
        await Promise.all([
          refresh("invoices", "quotes", "priorities", "progress", "bankTransactions"),
          card.kind === "approve-categories"
            ? queryClient.invalidateQueries({ queryKey: BANK_TRANSACTIONS_KEY })
            : Promise.resolve(),
        ]);
        // What went through has left the data; anything refused comes back.
        setHidden((current) => {
          const next = new Set(current);
          keys.forEach((key) => next.delete(key));
          return next;
        });
      }
    },
    [queryClient, refresh],
  );

  // Leaving the page runs what's still waiting, rather than dropping it.
  React.useEffect(() => {
    const flush = () => {
      pending.current.forEach((entry) => {
        if (entry.timer !== null) window.clearTimeout(entry.timer);
        void entry.run();
      });
      pending.current.clear();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  /**
   * Swipe right / Approve. Batch cards act on their ticked items (held for the
   * undo window); a card with nothing ticked, or whose items each need their
   * own decision, opens its breakdown; a getting-started card opens the
   * existing flow.
   */
  const approve = (card: DeckCard): ApproveOutcome => {
    if (card.single) {
      router.push(card.single.href);
      return "navigated";
    }
    const selected = tickedItems(card, untickedFor(card));
    if (!card.batch || selected.length === 0) return "open-breakdown";
    if (selected.some((item) => item.demo)) {
      showSampleNotice();
      return "sample";
    }

    const keys = selected.map((item) => itemKey(card, item));
    const left = card.items.length - selected.length;
    const text = cardText(card, untickedFor(card));
    const previousTicks = unticked[card.id];
    const previousOrder = order;

    setHidden((current) => new Set([...current, ...keys]));
    setDone((n) => n + 1);
    if (left > 0) {
      // What's left stays, all ticked again, at the back of the deck.
      setUnticked((current) => ({ ...current, [card.id]: [] }));
      setOrder((current) => [...current.filter((id) => id !== card.id), card.id]);
    }

    const id = nextId.current;
    const entry: Pending = {
      id,
      timer: null,
      run: () => execute(card, selected),
    };
    entry.timer = window.setTimeout(() => {
      pending.current.delete(id);
      void entry.run();
    }, UNDO_MS);
    pending.current.set(id, entry);

    const count = text.done.replace(/^\S+ /, "");
    showUndo(card.sends ? `Sending in 8s: ${count}` : text.done, () => {
      const waiting = pending.current.get(id);
      if (!waiting) {
        // The window closed a moment before the bar did: it has already gone
        // through, so don't bring the items back as though it hadn't.
        setUndo(null);
        toast.info(card.sends ? "Too late to undo — it's already been sent." : "Too late to undo — it's already done.");
        return;
      }
      if (waiting.timer != null) window.clearTimeout(waiting.timer);
      pending.current.delete(id);
      setHidden((current) => {
        const next = new Set(current);
        keys.forEach((key) => next.delete(key));
        return next;
      });
      setDone((n) => Math.max(0, n - 1));
      setUnticked((current) => ({ ...current, [card.id]: previousTicks ?? [] }));
      setOrder(previousOrder);
      setUndo(null);
    });
    return "acted";
  };

  /** Swipe left / Later: off the deck until tomorrow. */
  const putOff = (card: DeckCard) => {
    const next = new Set(later);
    next.add(card.id);
    saveLater(next);
    showUndo(`Saved for later: ${cardText(card, untickedFor(card)).title}`, () => {
      const restored = new Set(next);
      restored.delete(card.id);
      saveLater(restored);
      setUndo(null);
    });
  };

  return {
    cards,
    loading,
    done,
    later: later.size,
    undo,
    untickedFor,
    toggleItem,
    setAllTicked,
    approve,
    putOff,
  };
}

export type TodayDeck = ReturnType<typeof useTodayDeck>;
