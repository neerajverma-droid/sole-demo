import { create } from "zustand";

import type { CountryContext } from "@/lib/country-context";

/**
 * The open business's country context — its currency, tax words, bank fields
 * and per-module forms (`forms.address`, `forms.contact`).
 *
 * Not persisted, on purpose. A country belongs to a business and is fixed for
 * its life, but which business is open changes; a copy restored from disk could
 * paint one business's country onto another until the server answered. It is
 * filled by `useCountryContext` (which owns the fetch and its cache) and read
 * from here, so every screen sees the same value and a business switch drops
 * the old one at once.
 *
 * Empty means "not loaded yet": readers fall back to the bundled Australian
 * context, which is what every existing business is.
 */
type CountryState = {
  businessId: string | number | null;
  context: CountryContext | null;
  setContext: (businessId: string | number, context: CountryContext) => void;
  reset: () => void;
};

export const useCountryStore = create<CountryState>()((set) => ({
  businessId: null,
  context: null,
  setContext: (businessId, context) => set({ businessId, context }),
  reset: () => set({ businessId: null, context: null }),
}));
