"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchFunds } from "@/lib/super";
import { useSuperStore } from "@/stores/super";

/** Loads the account's super funds and mirrors them into the shared store. */
export function useFundsQuery() {
  const setFunds = useSuperStore((state) => state.setFunds);

  const query = useQuery({
    queryKey: ["funds"],
    queryFn: fetchFunds,
  });

  React.useEffect(() => {
    if (query.data) setFunds(query.data);
  }, [query.data, setFunds]);

  return query;
}
