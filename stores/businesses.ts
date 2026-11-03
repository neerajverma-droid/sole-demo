import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  deleteBusinessApi,
  setBusinessDefaultApi,
  type BusinessProfile,
  type BusinessSubscription,
} from "@/lib/businesses";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { getBusinessId, setBusinessId } from "@/utils/businessStorage";

/**
 * The businesses on the account, and which one is open.
 *
 * Zustand with `persist`, matching the settings and onboarding stores rather
 * than the Jotai atoms: which business you're in is account state that outlives
 * a page load, not screen state — reopening the product in a different business
 * from the one you left would be a worse surprise than any filter resetting.
 *
 * `skipHydration` for the same reason those two use it: reading storage during
 * render would have the server and the first client paint disagree about the
 * name in the sidebar. `Providers` rehydrates on mount.
 */
type BusinessesState = {
  businesses: BusinessProfile[];
  /** The open one. Always an id in `businesses`, and always a paid one. */
  activeId: string;
  /**
   * The one opened on arrival, as the API reports it.
   *
   * Always a paid business once `setBusinesses` has run — a locked default
   * would open the product into a business nobody can use.
   */
  defaultId: string;
  /** True until the first real fetch lands — lets the screen skip the empty state while loading. */
  hydrated: boolean;

  /** Replaces the list wholesale with a fresh `fetchBusinesses()` result. */
  setBusinesses: (
    businesses: BusinessProfile[],
    defaultId: string | null,
  ) => void;

  select: (id: string) => void;
  /** Calls the API, then applies the change locally on success. */
  setDefault: (id: string) => Promise<void>;
  /** Calls the API, then applies the change locally on success. Only ever an unactivated business — see the guard. */
  removeBusiness: (id: string) => Promise<void>;
  addBusiness: (name: string) => BusinessProfile;
  /**
   * Renames a business in the list.
   *
   * There because two stores hold a business name for two different jobs: the
   * settings profile is what prints on a document, and this list is what the
   * switcher at the top of the rail shows. The page after sign-up captures one
   * name and has to write both, or the rail spends the account's whole life
   * naming a sample business nobody created.
   *
   * A no-op on a blank name — an unnamed row in the switcher would be worse
   * than the placeholder it replaced.
   */
  renameBusiness: (id: string, name: string) => void;
  /** Applies a change already saved on the server to one business in the list. */
  patchBusiness: (id: string, values: Partial<BusinessProfile>) => void;
  /**
   * Changes what a business is on, without claiming anything was paid.
   *
   * Paying is never recorded here: a business unlocks only when the server
   * says so (Stripe's webhook writes the subscription, and the next
   * `setBusinesses` carries `paid`). This is for a plan change on a business
   * that is already live.
   *
   * A no-op on an unknown id, so a stale selection can't add a phantom row.
   */
  setSubscription: (id: string, subscription: BusinessSubscription) => void;
};

export const useBusinessesStore = create<BusinessesState>()(
  persist(
    (set, get) => ({
      businesses: [],
      activeId: "",
      defaultId: "",
      hydrated: false,

      setBusinesses: (businesses, defaultId) => {
        /*
         * `activeId` is the store's idea of which business is open;
         * `getBusinessId()` is what every request actually gets stamped with.
         * The two have to start from the same place, so the id in storage is
         * considered alongside the persisted `activeId` — a fresh tab has the
         * second rehydrated from localStorage but may have had the first
         * written by the post-auth redirect moments earlier.
         */
        const stored = getBusinessId();
        const currentActive = get().activeId || stored || "";
        const activeStillValid = businesses.some(
          (business) => business.id === currentActive && business.paid,
        );
        // Keep whatever was already open if it's still valid — a fresh list
        // shouldn't silently switch someone's context — otherwise fall back
        // to the account's default.
        const activeId = activeStillValid ? currentActive : (defaultId ?? "");

        /*
         * Written through, not just held. Without this the store could settle
         * on the default business while requests kept going out with the id
         * storage happened to hold (or with none at all, which makes the
         * backend pick its own default) — so the rail named one business and
         * the figures under it belonged to another.
         */
        if (activeId && activeId !== stored) setBusinessId(activeId);

        set({
          businesses,
          defaultId: defaultId ?? "",
          hydrated: true,
          activeId,
        });
      },

      select: (id) => {
        /*
         * Guarded rather than trusted: a stored id can outlive the business it
         * named, and an unpaid business isn't openable — so neither a stale id
         * nor a locked one can end up as the active context.
         */
        const target = get().businesses.find((business) => business.id === id);
        if (!target || !target.paid) return;

        /*
         * Only a real change counts. `select` is also called on rehydrate and
         * whenever the switcher re-renders with the same business open, and
         * counting those would turn "how often do people switch business"
         * into a count of page loads.
         */
        const previous = get().activeId;

        // The axios client reads business_id from here on every request —
        // this is the one place selecting a business actually takes effect.
        setBusinessId(id);
        set({ activeId: id });

        if (previous && previous !== id) {
          track(EVENTS.BUSINESS_SWITCHED, {
            business_count: get().businesses.length,
          });
        }
      },

      setDefault: async (id) => {
        const target = get().businesses.find((business) => business.id === id);
        if (!target || !target.paid) return;
        await setBusinessDefaultApi(id);
        set({ defaultId: id });
      },

      removeBusiness: async (id) => {
        const businesses = get().businesses;
        const target = businesses.find((business) => business.id === id);
        /*
         * Only an unactivated business, and never the default. Closing a live
         * business is a different job with tax records attached — the cards only
         * offer this where there's nothing to lose, and the guard is here so a
         * second caller can't skip that reasoning.
         */
        if (!target || target.paid || id === get().defaultId) return;
        await deleteBusinessApi(id);
        set({
          businesses: businesses.filter((business) => business.id !== id),
          // It was never openable, so it can't have been the open one — but if
          // storage says otherwise, fall back rather than leave a dangling id.
          activeId: get().activeId === id ? get().defaultId : get().activeId,
        });
      },

      renameBusiness: (id, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set((state) => ({
          businesses: state.businesses.map((business) =>
            business.id === id ? { ...business, name: trimmed } : business,
          ),
        }));
      },

      patchBusiness: (id, values) =>
        set((state) => ({
          businesses: state.businesses.map((business) =>
            business.id === id ? { ...business, ...values } : business,
          ),
        })),

      addBusiness: (name) => {
        const businesses = get().businesses;
        const created: BusinessProfile = {
          id: `b${Date.now()}`,
          name: name.trim(),
          email: "",
          abn: "",
          paid: false,
          tone: businesses.length,
          logo: null,
          subscription: null,
          // Step one of the add flow only captures the name — everything
          // else here is blank until the real create/detail endpoints hand
          // back a full record, same shape `mapBusinessProfile` produces.
          industryId: null,
          ndisNumber: "",
          accountingType: "",
          companyType: "",
          bank: { bsb: "", accountNumber: "", accountHolder: "", bankName: "" },
          address: {
            line1: "",
            city: "",
            state: "",
            postcode: "",
            country: "",
          },
          // Blank until the server answers; `createBusiness` resolves it from
          // the registry (defaulting to AU) and the next list refresh fills it.
          countryIso2: "",
          countryCode: "",
          mobile: "",
          firstName: "",
          middleName: "",
          lastName: "",
          companyName: "",
          documents: [],
        };
        set({ businesses: [...businesses, created] });
        return created;
      },

      setSubscription: (id, subscription) =>
        set((state) => ({
          businesses: state.businesses.map((business) =>
            business.id === id ? { ...business, subscription } : business,
          ),
        })),
    }),
    {
      name: "sole-businesses",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      // The list itself is server data, refetched every time it's needed —
      // only the active selection is worth remembering across a reload.
      partialize: (state) => ({ activeId: state.activeId }),
    },
  ),
);

/**
 * The open business, resolved.
 *
 * Null only while the list hasn't loaded yet (or is genuinely empty) — real
 * data arrives asynchronously now, so "nothing to show yet" is a state
 * callers have to render, not one that can be defaulted away.
 */
export function activeBusiness(state: {
  businesses: BusinessProfile[];
  activeId: string;
}): BusinessProfile | null {
  return (
    state.businesses.find((business) => business.id === state.activeId) ??
    // Falls back to the first openable one rather than the first: a stale
    // selection shouldn't land the rail on a business that's still locked.
    state.businesses.find((business) => business.paid) ??
    state.businesses[0] ??
    null
  );
}
