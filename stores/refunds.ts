import { create } from "zustand";

import type { Refund } from "@/lib/refunds";

/**
 * The client source of truth for client refunds and credit notes — fetched
 * from `GET /credit-note` (see `fetchClientRefunds`, lib/refunds.ts) rather
 * than seeded. Read-only, the same as `stores/vendor-refunds.ts`: creating,
 * editing, deleting and marking one refunded all go straight to the server
 * (see `hooks/use-client-refunds-query.ts`'s mutations) and then refetch,
 * rather than mutating this copy directly.
 */
type RefundsState = {
  refunds: Refund[];
  /** True once the first real fetch lands — lets the screen skip the empty state while loading. */
  hydrated: boolean;
  /** Replaces the list wholesale with a fresh `fetchClientRefunds()` result. */
  setRefunds: (refunds: Refund[]) => void;
};

export const useRefundsStore = create<RefundsState>()((set) => ({
  refunds: [],
  hydrated: false,
  setRefunds: (refunds) => set({ refunds, hydrated: true }),
}));
