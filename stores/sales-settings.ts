import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  DEFAULT_SALES_SETTINGS,
  SALES_SETTINGS_VERSION,
  migrateSalesSettings,
  type SalesSettings,
} from "@/lib/sales-settings";

/**
 * Sales-side defaults for everything that goes out: numbering, branding, footer,
 * what prints on a document, styling and notifications.
 *
 * Rehydration is deferred with `skipHydration` for the same reason as the
 * settings store — the server and the first client render have to agree on the
 * defaults, with the stored values applied in an effect.
 */
type SalesSettingsState = {
  settings: SalesSettings;
  /**
   * Merges a subset. The screen saves one tab at a time, so a whole-object write
   * would revert whatever a sibling tab has open and unsaved.
   */
  patch: (values: Partial<SalesSettings>) => void;
  /** Everything back to factory — used by nothing yet; per-tab reset patches. */
  resetAll: () => void;
};

export const useSalesSettingsStore = create<SalesSettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SALES_SETTINGS,
      patch: (values) =>
        set((state) => ({ settings: { ...state.settings, ...values } })),
      resetAll: () => set({ settings: DEFAULT_SALES_SETTINGS }),
    }),
    {
      name: "sole-sales-settings",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      version: SALES_SETTINGS_VERSION,
      migrate: (stored) => ({
        settings: migrateSalesSettings(
          (stored as { settings?: unknown } | undefined)?.settings,
        ),
      }) as SalesSettingsState,
    },
  ),
);
