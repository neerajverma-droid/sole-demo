"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchMySubscription } from "@/lib/subscription";
import { useSubscriptionStore } from "@/stores/subscription";

/**
 * Loads the account's real subscription and mirrors it into the shared store,
 * so the trial banner and the Subscription settings section read the same
 * live plan and trial countdown instead of each holding their own guess.
 * Mounted once in the header (`TopBar`) — safe to call again elsewhere too,
 * since React Query dedupes the underlying request.
 */
export function useSubscriptionQuery() {
  const setSubscription = useSubscriptionStore((state) => state.setSubscription);

  const query = useQuery({
    queryKey: ["subscription", "my-subscription"],
    queryFn: fetchMySubscription,
  });

  React.useEffect(() => {
    if (query.data) setSubscription(query.data);
  }, [query.data, setSubscription]);

  return query;
}
