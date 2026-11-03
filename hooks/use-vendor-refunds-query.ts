"use client";

import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { toIsoDate } from "@/lib/invoices";
import {
  fetchVendorRefundsCount,
  fetchVendorRefundsPage,
  fetchVendorRefundsSummary,
  type VendorRefundPeriod,
  type VendorRefundStatusFilter,
} from "@/lib/vendor-refunds";
import { useVendorRefundsStore } from "@/stores/vendor-refunds";
import { sessionUserId, useSessionStore } from "@/stores/session";

function useVendorRefundsUserId() {
  return useSessionStore(
    (state) => sessionUserId(state.user) ?? undefined,
  );
}

/**
 * Loads one page of the account's vendor refunds and mirrors it into the
 * shared store. `page`, `pageSize`, `status`, `search` and `period` are all
 * the server understands, so changing any of them refetches — same contract
 * as super-contributions' own paginated query.
 */
export function useVendorRefundsQuery(
  page: number,
  pageSize: number,
  status: VendorRefundStatusFilter,
  search: string,
  period: VendorRefundPeriod,
) {
  const setVendorRefunds = useVendorRefundsStore((state) => state.setVendorRefunds);
  const userId = useVendorRefundsUserId();
  const today = toIsoDate(new Date());

  const query = useQuery({
    queryKey: ["vendor-refunds", page, pageSize, status, search, period, userId],
    queryFn: () =>
      fetchVendorRefundsPage(
        page,
        pageSize,
        status,
        userId as string | number,
        search,
        period,
        today,
      ),
    enabled: userId !== undefined,
    /*
     * The page on screen stays put while the next one loads, so paging or
     * changing a filter never drops the table back to a first-load shimmer.
     */
    placeholderData: keepPreviousData,
  });

  React.useEffect(() => {
    if (query.data) setVendorRefunds(query.data.refunds);
  }, [query.data, setVendorRefunds]);

  return query;
}

/**
 * Every refund matching the current filters, for the stat strip — decoupled
 * from the paginated table fetch, since a stat computed from just one page
 * would undercount as soon as there's more than one.
 */
export function useVendorRefundsSummaryQuery(
  status: VendorRefundStatusFilter,
  search: string,
  period: VendorRefundPeriod,
) {
  const userId = useVendorRefundsUserId();
  const today = toIsoDate(new Date());

  return useQuery({
    queryKey: ["vendor-refunds-summary", status, search, period, userId],
    queryFn: () =>
      fetchVendorRefundsSummary(
        status,
        userId as string | number,
        search,
        period,
        today,
      ),
    enabled: userId !== undefined,
    // Same again for the stat strip above the table.
    placeholderData: keepPreviousData,
  });
}

/**
 * The account's vendor refunds counted with nothing narrowing them — not
 * status, not search, not period. The page query can't answer that: every
 * request it makes is scoped to "This year" or "This month", so an empty
 * month would read as an empty account.
 */
export function useVendorRefundsCountQuery() {
  const userId = useVendorRefundsUserId();

  return useQuery({
    // Under "vendor-refunds", so anything refreshing the list refreshes this.
    queryKey: ["vendor-refunds", "count", userId],
    queryFn: () => fetchVendorRefundsCount(userId as string | number),
    enabled: userId !== undefined,
  });
}
