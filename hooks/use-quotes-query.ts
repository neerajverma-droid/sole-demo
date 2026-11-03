"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";

import { listedQuotesAtom } from "@/lib/atoms";
import { fetchQuotes, type Quote } from "@/lib/quotes";
import { useQuotesStore } from "@/stores/quotes";

/**
 * Loads the business's quotes and mirrors them into the shared store, so every
 * screen reading `useQuotesStore` sees the same live list instead of each
 * holding its own copy. Safe to call from more than one mounted component —
 * React Query dedupes the underlying request.
 */
export function useQuotesQuery() {
  const setQuotes = useQuotesStore((state) => state.setQuotes);

  const query = useQuery({
    queryKey: ["quotes"],
    queryFn: fetchQuotes,
  });

  React.useEffect(() => {
    if (query.data) setQuotes(query.data);
  }, [query.data, setQuotes]);

  return query;
}

/**
 * Every quote a row dialog might be asked about: the list's current page first
 * (it's the fresher copy), then the store's newest-200 fill. A quote on a later
 * page can be older than anything the store holds.
 */
export function useKnownQuotes(): Quote[] {
  const stored = useQuotesStore((state) => state.quotes);
  const listed = useAtomValue(listedQuotesAtom);

  return React.useMemo(() => {
    const listedIds = new Set(listed.map((quote) => quote.id));
    return [...listed, ...stored.filter((quote) => !listedIds.has(quote.id))];
  }, [listed, stored]);
}
