import { create } from "zustand";

import type { Liability } from "@/lib/liabilities";

/**
 * The client source of truth for liabilities — mirrors whichever page of
 * `fetchLiabilitiesPage` (lib/liabilities.ts, `/liability/list`) is
 * currently on screen, not the whole account, same pattern as
 * `stores/super.ts`. Enough for the row-action dialogs to look up by id,
 * since they only ever act on a row that's actually visible. Creating,
 * editing, deleting, matching, unmatching and attaching all go through the
 * real API and then invalidate the `["liabilities"]` query.
 */
type LiabilitiesState = {
  liabilities: Liability[];
  /** True once the first real fetch lands — lets the screen skip the empty state while loading. */
  hydrated: boolean;
  /** Replaces the liabilities list wholesale with a fresh page of results. */
  setLiabilities: (liabilities: Liability[]) => void;
};

export const useLiabilitiesStore = create<LiabilitiesState>()((set) => ({
  liabilities: [],
  hydrated: false,

  setLiabilities: (liabilities) => set({ liabilities, hydrated: true }),
}));
