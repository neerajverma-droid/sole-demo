"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchReceiptAddress } from "@/lib/email-receipts";
import { useActiveBusiness } from "@/hooks/use-active-business";

/**
 * The open business's receipt-forwarding address.
 *
 * Keyed on the business id: the address is `sole-<businessId>@…`, so a cached
 * one must never be shown under a different business. `enabled` is the dialog's
 * own open state, so the request only goes out when someone actually asks.
 */
export function useReceiptAddressQuery(enabled: boolean) {
  const { business } = useActiveBusiness();

  return useQuery({
    queryKey: ["receipt-address", business?.id ?? null],
    queryFn: fetchReceiptAddress,
    enabled,
    // The address is derived from the business id and never changes.
    staleTime: Infinity,
    retry: 1,
  });
}
