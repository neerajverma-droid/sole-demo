import { create } from "zustand";

import type { VendorRefund } from "@/lib/vendor-refunds";

/**
 * The client source of truth for vendor refunds and supplier credit notes —
 * fetched from `GET /credit-note` (see `fetchVendorRefundsPage`,
 * lib/vendor-refunds.ts) rather than seeded. Read-only: there's no create,
 * edit or delete UI for this module, only marking one as refunded.
 *
 * `vendorRefunds` mirrors whichever page of the list is currently on screen,
 * not every refund the account has — same contract as super-contributions'
 * own store, now that the list is server-paginated.
 */
type VendorRefundsState = {
  vendorRefunds: VendorRefund[];
  /** True once the first real fetch lands — lets the screen skip the empty state while loading. */
  hydrated: boolean;
  /** Replaces the current page wholesale with a fresh `fetchVendorRefundsPage()` result. */
  setVendorRefunds: (vendorRefunds: VendorRefund[]) => void;
  /** Marks an awaited refund as received. */
  markVendorRefunded: (id: string) => void;
};

export const useVendorRefundsStore = create<VendorRefundsState>()((set) => ({
  vendorRefunds: [],
  hydrated: false,
  setVendorRefunds: (vendorRefunds) => set({ vendorRefunds, hydrated: true }),
  markVendorRefunded: (id) =>
    set((state) => ({
      vendorRefunds: state.vendorRefunds.map((refund) =>
        refund.id === id ? { ...refund, status: "Refunded" } : refund,
      ),
    })),
}));
