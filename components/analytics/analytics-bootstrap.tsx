"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { useSession } from "@/components/auth/session-provider";
import {
  identify,
  initAnalytics,
  resetAnalytics,
  setBusinessContext,
} from "@/lib/analytics";
import { fetchIndustries } from "@/lib/industries";
import { activeBusiness, useBusinessesStore } from "@/stores/businesses";
import { useSubscriptionStore } from "@/stores/subscription";

/**
 * Boots Mixpanel once per app load and keeps its identity in step with
 * whoever is signed in.
 *
 * Mount this INSIDE `SessionProvider`, next to `UsertourBootstrap`:
 * `useSession` throws outside it, and as a sibling it could not see the
 * session at all. The same reasoning is already written into the tour
 * bootstrap, and for the same reason — the tour read a store nothing ever
 * wrote to, so it identified nobody for the life of that integration.
 */

export function AnalyticsBootstrap() {
  const { user, status } = useSession();
  const businessId = useBusinessesStore((state) => state.activeId);
  const businessName = useBusinessesStore(
    (state) => activeBusiness(state)?.name ?? null,
  );
  const totalBusinesses = useBusinessesStore(
    (state) => state.businesses.length,
  );
  const industryId = useBusinessesStore(
    (state) => activeBusiness(state)?.industryId ?? null,
  );
  const { data: industries } = useQuery({
    queryKey: ["industries"],
    queryFn: fetchIndustries,
    staleTime: 5 * 60_000,
    enabled: status === "authenticated" && industryId != null,
  });
  const industry =
    industryId == null
      ? null
      : (industries?.find((entry) => entry.id === String(industryId))?.name ??
        null);
  // `TopBar` fetches this on every authenticated page via
  // `useSubscriptionQuery`; read rather than refetched here.
  const subscription = useSubscriptionStore((state) => state.subscription);

  /*
   * `user_id`, not `id`. The profile endpoint returns `user_id`; `AuthUser`
   * declares an optional `id` that never arrives, and because every field on
   * that type is optional, reading the wrong one type-checks cleanly and
   * silently identifies nobody. That exact mistake is why all 479 profiles in
   * the old project are keyed on an email address.
   */
  const rawId = user?.user_id ?? user?.id;
  const userId = rawId == null || rawId === "" ? null : String(rawId);

  const name =
    user?.full_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    null;

  // Strict Mode runs effects twice in development; `initAnalytics` is
  // idempotent, so this needs no guard of its own.
  React.useEffect(() => {
    initAnalytics();
  }, []);

  /*
   * Only reset for somebody who was actually signed in.
   *
   * A logged-out visitor's status settles loading → unauthenticated on the
   * first paint, and `reset()` clears the super properties — including the
   * first-touch campaign attribution `initAnalytics` has just registered. A
   * blanket reset here would wipe the UTM of every visitor arriving from an
   * ad before they ever reached the signup form.
   */
  const wasIdentified = React.useRef(false);

  React.useEffect(() => {
    /*
     * "loading" is the first render on every page load, before /auth/profile
     * settles. Identifying then is guessing, and resetting then would sign the
     * person out of Mixpanel on each navigation.
     */
    if (status === "loading") return;

    if (status === "authenticated") {
      wasIdentified.current = true;
      identify({
        userId,
        email: user?.email ?? null,
        name,
        subscription,
        totalBusinesses,
      });
      return;
    }

    if (wasIdentified.current) {
      wasIdentified.current = false;
      resetAnalytics();
    }
  }, [
    status,
    userId,
    name,
    user?.email,
    subscription,
    totalBusinesses,
  ]);

  // The business can change without the session doing so.
  React.useEffect(() => {
    if (status !== "authenticated") return;
    setBusinessContext({
      id: businessId || null,
      name: businessName,
      industry,
    });
  }, [status, businessId, businessName, industry]);

  return null;
}
