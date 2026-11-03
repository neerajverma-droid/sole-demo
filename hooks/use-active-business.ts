"use client";

import { useBusinessesQuery } from "@/hooks/use-businesses-query";
import type { BusinessProfile } from "@/lib/businesses";
import { NDIS_INDUSTRY_ID } from "@/lib/invoice-templates";
import { activeBusiness, useBusinessesStore } from "@/stores/businesses";

/**
 * The open business's full profile, from the store.
 *
 * The list endpoint returns complete records, so once the account's businesses
 * have loaded there is nothing left to ask the server about the one that's
 * open — its industry, NDIS number, bank account and address are all already
 * held. Screens that need any of that read it from here instead of fetching a
 * business's detail again.
 *
 * `useBusinessesQuery` is called rather than assumed: the app shell's switcher
 * loads the same list, and React Query dedupes the request, so this only
 * actually fetches when a screen is somehow mounted without it.
 */
export function useActiveBusiness(): {
  business: BusinessProfile | null;
  /** True while the list is still on its way and there's nothing to read yet. */
  loading: boolean;
  /** True once the list has landed, whether or not it had anything in it. */
  ready: boolean;
  /**
   * True once the SERVER has answered this session — not merely once the
   * persisted store rehydrated.
   *
   * `ready` is satisfied by a rehydrate, which on a fresh sign-in is an empty
   * store (the teardown wipes it), so "ready with no business" is what a
   * just-signed-in account looks like for the whole time the list is in
   * flight. That's fine for a screen that wants to render something rather
   * than spin — it's wrong for anything deciding whether this account is
   * MISSING a detail, which is what the onboarding survey asks. Those wait
   * for this instead.
   */
  settled: boolean;
  /** The lookup failed — callers should fail open rather than block. */
  error: boolean;
} {
  const query = useBusinessesQuery();
  const businesses = useBusinessesStore((state) => state.businesses);
  const activeId = useBusinessesStore((state) => state.activeId);
  const hydrated = useBusinessesStore((state) => state.hydrated);

  const business = activeBusiness({ businesses, activeId });

  return {
    business,
    loading: !hydrated && query.isPending,
    ready: hydrated || query.isSuccess,
    // Errors settle too: a list that failed is an answer the caller has to
    // act on, and waiting forever for a retry would hold a decision open.
    settled: query.isSuccess || query.isError,
    error: query.isError,
  };
}

/**
 * Whether NDIS invoicing is available to this business.
 *
 * The industry alone decides it — industry 9, Health and Social Care. The
 * provider's own registration number is deliberately not part of this: it
 * prints on a claim when it's set, but a provider part-way through setting up
 * should still be able to draft one, and the thing that genuinely blocks a
 * claim is the *participant's* NDIS number, which lives on the client.
 */
export function isNdisBusinessProfile(
  business: BusinessProfile | null,
): boolean {
  return business?.industryId === NDIS_INDUSTRY_ID;
}

/**
 * The open business's IANA timezone, for showing event times where the
 * business operates — undefined when it has none, so formatters fall back
 * to the browser's zone. See `lib/datetime.ts`.
 */
export function useBusinessTimeZone(): string | undefined {
  const { business } = useActiveBusiness();
  return business?.timezone || undefined;
}
