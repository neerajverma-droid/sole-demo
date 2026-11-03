"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchBusinesses } from "@/lib/businesses";
import { useBusinessesStore } from "@/stores/businesses";

/**
 * Loads the account's businesses and mirrors them into the shared store, so
 * the sidebar switcher and the businesses screen read the same live list
 * instead of each holding their own copy. Safe to call from more than one
 * mounted component — React Query dedupes the underlying request.
 */
export function useBusinessesQuery() {
  const setBusinesses = useBusinessesStore((state) => state.setBusinesses);

  const query = useQuery({
    queryKey: ["businesses"],
    queryFn: fetchBusinesses,
  });

  React.useEffect(() => {
    if (query.data) setBusinesses(query.data.businesses, query.data.defaultId);
  }, [query.data, setBusinesses]);

  return query;
}
