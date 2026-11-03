import { create } from "zustand";

import type { Asset } from "@/lib/assets";

/**
 * The asset register.
 *
 * A pure mirror of `useAssetsQuery`'s data, same shape as `stores/inventory.ts`:
 * this store never talks to the network itself. Every create/update/delete
 * calls sole-ocr's `/assets` endpoints directly from the component, then
 * invalidates the `["assets"]` query — `useAssetsQuery`'s own effect is what
 * refreshes `assets` here.
 */
type AssetsState = {
  assets: Asset[];
  /** True once the first real fetch lands — lets a screen skip the empty/zero state while loading. */
  hydrated: boolean;
  /** Replaces the list wholesale with a fresh `fetchAssets()` result. */
  setAssets: (assets: Asset[]) => void;
};

export const useAssetsStore = create<AssetsState>()((set) => ({
  assets: [],
  hydrated: false,
  setAssets: (assets) => set({ assets, hydrated: true }),
}));
