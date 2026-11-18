import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  DEFAULT_DOCUMENT_DEFAULTS,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_TAX_SETTINGS,
  type DocumentDefaults,
  type LocalNotificationPrefs,
  type TaxSettings,
} from "@/lib/settings";

/**
 * The settings that genuinely have nowhere else to live yet — kept per
 * business, and honest about being local.
 *
 * What this is NOT: the old `sole-settings` store. That one also held the
 * business profile and bank details, which it invented defaults for and never
 * synced; those are real server fields and now come from
 * `lib/business-settings.ts` via `GET /businesses`.
 *
 * What's left are the fields with no matching column in sole-ocr today:
 *
 * - `tax` — BAS frequency and the financial year start.
 *   `/v2/settings/tax-settings` holds a tax NAME, a PERCENTAGE and an
 *   is-default flag and nothing else, so the rate and "Registered for GST"
 *   moved there (`lib/tax-settings.ts`) and the accounting basis moved to
 *   `accounting_type` on the business record. These two had nowhere to go.
 * - `documents` — payment terms, quote expiry, GST treatment and the income
 *   account, all applied client-side when a document is created. The notes
 *   and the logo moved to the `save-branding` record, which is where Sales
 *   settings already kept them.
 * - `notifications` — only the weekly summary. Invoice and quote emails are
 *   saved through `/v2/notification-setting`; the weekly summary has no
 *   backend setting yet.
 * - `website` / `payId` — two fields on the Settings form that
 *   `updateBusinessProfile` has no column for.
 *
 * TODO: each of these should move to the server once an endpoint exists.
 * Until then they are device-local, which the Settings screen says plainly
 * rather than showing a Save button that implies otherwise.
 *
 * ── Why keyed by business ───────────────────────────────────────────────
 *
 * Because every one of them is a property of a business, not of an account.
 * The old store was a single flat object, so opening a second business showed
 * the first one's tax basis and invoice defaults — and changing them there
 * changed them for both. Keyed storage means a switch simply reads a different
 * entry, with no reset step to forget.
 */

export type BusinessPreferences = {
  tax: TaxSettings;
  documents: DocumentDefaults;
  notifications: LocalNotificationPrefs;
  /** No column on `businesses` — see the file doc. */
  website: string;
  /** Same. */
  payId: string;
};

export const DEFAULT_PREFERENCES: BusinessPreferences = {
  tax: DEFAULT_TAX_SETTINGS,
  documents: DEFAULT_DOCUMENT_DEFAULTS,
  notifications: DEFAULT_NOTIFICATIONS,
  website: "",
  payId: "",
};

type PreferencesState = {
  /** Keyed by business id. A business with no entry reads the defaults. */
  byBusiness: Record<string, BusinessPreferences>;
  patch: (businessId: string, values: Partial<BusinessPreferences>) => void;
  /** Drops one business's entry — used when a business is deleted. */
  forget: (businessId: string) => void;
};

/** Bump when this store's persisted shape changes. */
const PREFERENCES_VERSION = 1;

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      byBusiness: {},

      patch: (businessId, values) => {
        // No id means no business is open yet; writing under "" would create a
        // shared bucket that every business then read from, which is the exact
        // bug keying this store was meant to end.
        if (!businessId) return;
        set((state) => ({
          byBusiness: {
            ...state.byBusiness,
            [businessId]: {
              ...DEFAULT_PREFERENCES,
              ...state.byBusiness[businessId],
              ...values,
            },
          },
        }));
      },

      forget: (businessId) =>
        set((state) => {
          if (!(businessId in state.byBusiness)) return state;
          const next = { ...state.byBusiness };
          delete next[businessId];
          return { byBusiness: next };
        }),
    }),
    {
      name: "sole-preferences",
      storage: createJSONStorage(() => localStorage),
      // Rehydrated by `usePreferences`, so the server and the first client
      // render agree on the defaults.
      skipHydration: true,
      version: PREFERENCES_VERSION,
    },
  ),
);

/*
 * There is deliberately no `preferencesFor(state, id)` helper here.
 *
 * It existed, and it was a trap: merging over the defaults builds a NEW object
 * on every call, so using it as a Zustand selector returned a different
 * reference each render and React reported "The result of getSnapshot should
 * be cached to avoid an infinite loop". Select `state.byBusiness[id]` — a
 * reference that only changes when the stored value does — and merge the
 * defaults in a memo. `usePreferences` in `hooks/use-business-settings.ts`
 * does exactly that, and is how this store should be read.
 */
