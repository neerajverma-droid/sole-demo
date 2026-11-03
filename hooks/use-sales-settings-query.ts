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

  const query = useQuery({
    queryKey: ["sales-settings"],
    queryFn: fetchSalesSettings,
  });

  React.useEffect(() => {
    if (query.data) patch(query.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  return query;
}
