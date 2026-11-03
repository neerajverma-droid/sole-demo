"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchInventoryItems } from "@/lib/inventory";
import { useInventoryStore } from "@/stores/inventory";

/**
 * Loads every custom product/service and mirrors it into the shared store, so
 * Inventory and the Products & Services "Custom" tab read the same live list
 * instead of each holding their own copy. Safe to call from more than one
 * mounted component — React Query dedupes the underlying request.
 */
export function useInventoryQuery() {
  const setItems = useInventoryStore((state) => state.setItems);

  const query = useQuery({
    queryKey: ["inventory-items"],
    queryFn: fetchInventoryItems,
  });

  React.useEffect(() => {
    if (query.data) setItems(query.data);
  }, [query.data, setItems]);

  return query;
}
