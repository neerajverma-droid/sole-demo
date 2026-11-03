import { create } from "zustand";

import { type SubscriptionInfo } from "@/lib/subscription";

/**
 * The account's live subscription, mirrored in from `useSubscriptionQuery`.
 *
 * Not persisted, same reasoning as the businesses list: this is server truth
 * refetched every session, not a local preference — a stale trial countdown
 * surviving in localStorage would drift from the real one within a day.
 */
type SubscriptionState = {
  subscription: SubscriptionInfo | null;
  /** True once the first real fetch has landed. */
  hydrated: boolean;
  setSubscription: (subscription: SubscriptionInfo) => void;
};

export const useSubscriptionStore = create<SubscriptionState>()((set) => ({
  subscription: null,
  hydrated: false,
  setSubscription: (subscription) => set({ subscription, hydrated: true }),
}));
