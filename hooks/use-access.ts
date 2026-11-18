"use client";

import { useQuery } from "@tanstack/react-query";

import {
  fetchAccessProfile,
  hasPlanFeature,
  isActionBlocked,
  type AccessAction,
} from "@/lib/access";

/**
 * What this session may do and what its plan includes.
 *
 * Both answers are permissive until the profile has loaded: the server enforces
 * the same rules on every route, so waiting would only make the first paint
 * flicker between "allowed" and "not".
 */
export function useAccess() {
  const query = useQuery({
    queryKey: ["access-profile"],
    queryFn: fetchAccessProfile,
    staleTime: 5 * 60 * 1000,
  });
  const profile = query.data;

  return {
    ready: query.isSuccess,
    /** True when the session's grant allows `action` on `module`. */
    can: (module: string, action: AccessAction) =>
      !isActionBlocked(profile, module, action),
    /** True when the plan includes `feature`. */
    hasFeature: (feature: string) => hasPlanFeature(profile, feature),
    /**
     * The server's feature list as sent, or null when it hasn't loaded or sent
     * none — for a caller that must not lock anything on a fallback guess.
     */
    features: profile?.allowedFeatures ?? null,
    /** The free-tier asset allowance; permissive (can add) until loaded. */
    assetLimit: profile?.assetLimit ?? null,
  };
}
