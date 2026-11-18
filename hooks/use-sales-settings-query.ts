"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchSalesSettings } from "@/lib/sales-settings-api";
import { useSalesSettingsStore } from "@/stores/sales-settings";

/**
 * Loads the account's real sales settings and mirrors them into the shared
 * store, the same pattern `useBusinessesQuery` uses for businesses. Safe to
 * call from more than one mounted component — React Query dedupes the
 * underlying requests.
 */
export function useSalesSettingsQuery() {
  const patch = useSalesSettingsStore((state) => state.patch);
  /** True once the fetched settings are in the store — or the fetch failed. */
  const [applied, setApplied] = React.useState(false);

  const query = useQuery({
    queryKey: ["sales-settings"],
    queryFn: fetchSalesSettings,
  });

  React.useEffect(() => {
    if (query.data) {
      patch(query.data);
      setApplied(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  /*
   * Set only after `patch`, in the same effect, so a screen reading `ready`
   * never paints the stored defaults for a frame between the response landing
   * and the store catching up. A failed fetch is ready too: the screen falls
   * back to whatever was stored rather than loading forever.
   */
  return { ...query, ready: applied || query.isError };
}
