import { create } from "zustand";

import type { Contribution, SuperFund } from "@/lib/super";

/**
 * The client source of truth for super funds and contributions — fetched from
 * `GET /v2/super-contribution` and `GET /fund` (see `fetchContributionsPage`/
 * `fetchFunds`, lib/super.ts) rather than seeded. `contributions` mirrors
 * whichever page of the list is currently on screen, not the whole account —
 * enough for the row-action dialogs (match/delete) to look up by id, since
 * they only ever act on a row that's actually visible. Creating a fund, and
 * creating, editing, deleting, duplicating or matching a contribution, all go
 * through the real API.
 */
type SuperState = {
  funds: SuperFund[];
  contributions: Contribution[];
  /** True once the first real fetch lands — lets the screen skip the empty state while loading. */
  hydrated: boolean;

  /** Replaces the funds list wholesale with a fresh `fetchFunds()` result. */
  setFunds: (funds: SuperFund[]) => void;
  /** Adds a fund the API has already created — dedupes by id. */
  addFund: (fund: SuperFund) => void;

  /** Replaces the contributions list wholesale with a fresh page of results. */
  setContributions: (contributions: Contribution[]) => void;
};

export const useSuperStore = create<SuperState>()((set) => ({
  funds: [],
  contributions: [],
  hydrated: false,

  setFunds: (funds) => set({ funds }),
  addFund: (fund) =>
    set((state) => ({
      funds: state.funds.some((entry) => entry.id === fund.id)
        ? state.funds
        : [fund, ...state.funds],
    })),

  setContributions: (contributions) =>
    set({ contributions, hydrated: true }),
}));
