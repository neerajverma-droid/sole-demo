import { create } from "zustand";

import { type Quote } from "@/lib/quotes";

/**
 * The client source of truth for quotes, filled by useQuotesQuery from
 * `GET /quote` and read by every screen that shows one. Quotes reference
 * contacts by id, so the Client column resolves through useContactsStore.
 * Prices are GST-exclusive; the listed amount is the line total plus GST.
 *
 * Read-only apart from that one fill. Every change to a quote — raising,
 * editing, deleting — goes to the server and comes back through a refetch, so
 * there are no local mutators here to write a change the next fetch would
 * silently erase.
 */
type QuotesState = {
  quotes: Quote[];
  /** True until the first real fetch lands — lets the screen skip the empty state while loading. */
  hydrated: boolean;
  /** Replaces the list wholesale with a fresh `fetchQuotes()` result. */
  setQuotes: (quotes: Quote[]) => void;
};

export const useQuotesStore = create<QuotesState>()((set) => ({
  quotes: [],
  hydrated: false,
  setQuotes: (quotes) => set({ quotes, hydrated: true }),
}));
