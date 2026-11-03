import { create } from "zustand";

import type { AssetRegistryEntry } from "@/lib/assets";

export type { AssetRegistryEntry };

/**
 * The asset registry: the makes and the asset types every asset picks from.
 *
 * A pure mirror of `useAssetRegistryQuery`'s data, same shape as
 * `stores/inventory.ts` — this store never talks to the network itself.
 * Adding a brand/type calls sole-ocr's `/asset-registry/brands|types` directly
 * from `useCreateAssetBrandMutation`/`useCreateAssetTypeMutation`, then merges
 * the created record straight into this store (no full refetch needed for an
 * append-only list).
 *
 * `brands`/`types` stay plain name arrays for the combobox and registry dialog,
 * which only ever needed a list of strings; `brandRecords`/`typeRecords` carry
 * the ids those same components now need to resolve when building an asset's
 * `asset_brand_id`/`asset_type_id`.
 *
 * There is deliberately no rename/remove here: `/asset-registry` only supports
 * list and create, so the dialog no longer offers renaming or removing a make
 * or type — offering an action the server can't perform would just be a local
 * edit that reverts on the next reload.
 */
type AssetRegistryState = {
  brandRecords: AssetRegistryEntry[];
  typeRecords: AssetRegistryEntry[];
  brands: string[];
  types: string[];
  /** Replaces both lists wholesale with a fresh registry fetch. */
  setRegistry: (registry: {
    brands: AssetRegistryEntry[];
    types: AssetRegistryEntry[];
  }) => void;
  /** Appends one newly-created brand, keeping the list sorted. */
  addBrandRecord: (entry: AssetRegistryEntry) => void;
  /** Appends one newly-created asset type, keeping the list sorted. */
  addTypeRecord: (entry: AssetRegistryEntry) => void;
};

function sorted(entries: AssetRegistryEntry[]): AssetRegistryEntry[] {
  return [...entries].sort((a, b) => a.name.localeCompare(b.name));
}

export const useAssetRegistryStore = create<AssetRegistryState>()((set) => ({
  brandRecords: [],
  typeRecords: [],
  brands: [],
  types: [],

  setRegistry: ({ brands, types }) => {
    const brandRecords = sorted(brands);
    const typeRecords = sorted(types);
    set({
      brandRecords,
      typeRecords,
      brands: brandRecords.map((entry) => entry.name),
      types: typeRecords.map((entry) => entry.name),
    });
  },

  addBrandRecord: (entry) =>
    set((state) => {
      const brandRecords = sorted([...state.brandRecords, entry]);
      return { brandRecords, brands: brandRecords.map((e) => e.name) };
    }),

  addTypeRecord: (entry) =>
    set((state) => {
      const typeRecords = sorted([...state.typeRecords, entry]);
      return { typeRecords, types: typeRecords.map((e) => e.name) };
    }),
}));
