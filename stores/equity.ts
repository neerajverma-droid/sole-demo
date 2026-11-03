import { create } from "zustand";

import type { Equity } from "@/lib/equity";

/**
 * The client source of truth for equity entries — mirrors whichever page of
 * `fetchEquityPage` (lib/equity.ts, `/equity/list`) is currently on screen,
 * not the whole account, same pattern as `stores/liabilities.ts`. Enough for
 * the row-action dialogs to look up by id, since they only ever act on a row
 * that's actually visible. Creating, editing, deleting, matching and
 * unmatching all go through the real API and then invalidate the
 * `["equity"]` query.
 */
type EquityState = {
  equity: Equity[];
  /** True once the first real fetch lands — lets the screen skip the empty state while loading. */
  hydrated: boolean;
  /** Replaces the equity list wholesale with a fresh page of results. */
  setEquity: (equity: Equity[]) => void;
};

export const useEquityStore = create<EquityState>()((set) => ({
  equity: [],
  hydrated: false,

  setEquity: (equity) => set({ equity, hydrated: true }),
}));
