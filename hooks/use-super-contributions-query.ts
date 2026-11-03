"use client";

import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { fetchContributionsPage } from "@/lib/super";
import { useSuperStore } from "@/stores/super";

/**
 * Loads one page of the account's super contributions and mirrors it into
 * the shared store. `page`, `pageSize` and `search` are all the server
 * understands — user_id/business_id/tenant_id come from the auth context
 * automatically — so changing any of them refetches.
 */
export function useContributionsQuery(
  page: number,
  pageSize: number,
  search: string,
) {
  const setContributions = useSuperStore((state) => state.setContributions);

  const query = useQuery({
    queryKey: ["super-contributions", page, pageSize, search],
    queryFn: () => fetchContributionsPage(page, pageSize, search),
    /*
     * The previous page's rows stay on screen while the next one is in
     * flight, so a page, page-size or search change never empties the table
     * back to a first-load shimmer. `isPlaceholderData` is what tells the
     * table a fresh page is still coming.
     */
    placeholderData: keepPreviousData,
  });

  React.useEffect(() => {
    if (query.data) setContributions(query.data.contributions);
  }, [query.data, setContributions]);

  return query;
}
