"use client";

import { useQuery } from "@tanstack/react-query";

import {
  fetchNdisSupportItemsPage,
  type NdisPageParams,
} from "@/lib/ndis-support-items";

/**
 * One real page of the NDIS catalogue. The query key carries every param
 * that changes what comes back, so paging, searching or narrowing by
 * registration group/support category each fetch their own correct page
 * instead of re-slicing whatever the previous request happened to return.
 *
 * `enabled` lets the screen skip fetching while a different tab is showing —
 * the NDIS table isn't on screen, so there's nothing to page through yet.
 */
export function useNdisPageQuery(params: NdisPageParams, enabled: boolean) {
  return useQuery({
    queryKey: ["ndis-support-items-page", params],
    queryFn: () => fetchNdisSupportItemsPage(params),
    enabled,
    placeholderData: (previous) => previous,
  });
}
