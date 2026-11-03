import { create } from "zustand";

import type { InventoryItem } from "@/lib/inventory";

/**
 * Products and services, with stock derived from each item's own threshold.
 *
 * A pure mirror of `useInventoryQuery`'s data, same shape as `stores/invoices`
 * and `stores/businesses`: this store never talks to the network itself.
 * Every save/delete/adjust calls sole-ocr's `/custom-product` endpoints
 * directly from the component, then invalidates the `["inventory-items"]`
 * query — `useInventoryQuery`'s own effect is what refreshes `items` here.
 */
type InventoryState = {
  items: InventoryItem[];
  /** Replaces the list wholesale with a fresh `fetchInventoryItems()` result. */
  setItems: (items: InventoryItem[]) => void;
};

export const useInventoryStore = create<InventoryState>()((set) => ({
  items: [],
  setItems: (items) => set({ items }),
}));
