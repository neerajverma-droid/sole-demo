"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { useActiveBusiness } from "@/hooks/use-active-business";
import { useCountryStore } from "@/stores/country";
import {
  FALLBACK_COUNTRY_CONTEXT,
  fetchCountryContext,
  type CountryContext,
} from "@/lib/country-context";

/**
 * What the open business's country decides — its tax and rate, its financial
 * year, the words on its documents and the bank fields it asks for.
 *
 * Never null. Every screen that reads this is a form someone may already be
 * typing in, and a field whose label and validation arrive a moment later —
 * or change under the cursor — is worse than one that starts Australian and
 * corrects itself. So it starts from the fallback, which is what every
 * existing business is, and the server's answer replaces it. `ready` is there
 * for the rare caller that must not act until it knows.
 *
 * Keyed by business: switching businesses can switch countries, and the rest
 * of the screen already re-reads on that change.
 */
export function useCountryContext(): {
  country: CountryContext;
  /** True once the server has answered — not merely once something is readable. */
  ready: boolean;
  loading: boolean;
  isError: boolean;
} {
  const { business } = useActiveBusiness();
  const businessId = business?.id ?? null;

  const query = useQuery({
    queryKey: ["country-context", businessId],
    queryFn: fetchCountryContext,
    enabled: businessId !== null,
    /*
     * An hour. The registry changes when a super admin publishes, which is a
     * deliberate, rare act — and a scheduled rate change applies itself on its
     * effective date server-side, so a stale copy here can't price anything
     * wrongly. It is read by almost every form, so refetching per mount would
     * be pure waste.
     */
    staleTime: 60 * 60_000,
  });

  // The store is what every screen reads; this hook is what fills it. A
  // context held for another business is never handed to this one.
  const stored = useCountryStore((state) => state.context);
  const storedFor = useCountryStore((state) => state.businessId);
  const setContext = useCountryStore((state) => state.setContext);
  const reset = useCountryStore((state) => state.reset);

  React.useEffect(() => {
    if (businessId === null) {
      reset();
    } else if (query.data) {
      setContext(businessId, query.data);
    }
  }, [businessId, query.data, setContext, reset]);

  const fromStore = stored && storedFor === businessId ? stored : null;

  return {
    country: query.data ?? fromStore ?? FALLBACK_COUNTRY_CONTEXT,
    ready: query.isSuccess,
    loading: query.isLoading,
    isError: query.isError,
  };
}
