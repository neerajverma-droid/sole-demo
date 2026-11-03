"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  fetchWorldpayTransactions,
  fetchStripeTransactions,
  fetchStripeStats,
  fetchNexxtapTransactions,
} from "@/lib/payments";

/**
 * Loads one page of SolePay (Payrix) payment transactions.
 *
 * `enabled` must be true (i.e. the SolePay Payments tab is active) before
 * any network request is made — mirrors sole-webapp's
 * `activeTabHref === "worldpay-payments"` guard in its useEffect.
 */
export function useWorldpayTransactionsQuery(
  page: number,
  pageSize: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["worldpay-transactions", page, pageSize],
    queryFn: () => fetchWorldpayTransactions(page, pageSize),
    placeholderData: keepPreviousData,
    enabled,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Loads one page of Stripe payment transactions.
 *
 * `enabled` must be true (i.e. the Stripe Payments tab is active) before
 * any network request fires — same guard as sole-webapp's
 * `activeTabHref === "stripe-payments"` check.
 */
export function useStripeTransactionsQuery(
  page: number,
  pageSize: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["stripe-transactions", page, pageSize],
    queryFn: () => fetchStripeTransactions(page, pageSize),
    placeholderData: keepPreviousData,
    enabled,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Fetches account-level Stripe totals from `/stripe-connect/transactions/stats`.
 *
 * Called alongside the paginated list query only when the Stripe tab is active
 * (same as sole-webapp calling `fetchStripeStats()` inside the Stripe tab's
 * useEffect). The stats cover all transactions, not just the current page, so
 * the stat cards always show account-level figures.
 *
 * `staleTime` matches the list query so both refresh together.
 */
export function useStripeStatsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["stripe-transaction-stats"],
    queryFn: fetchStripeStats,
    enabled,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Loads one page of NextTap tap-to-pay captures, with their all-pages summary.
 *
 * `enabled` must be true (i.e. the NextTap Payments tab is active) — same
 * guard as sole-webapp's `activeTabHref === "nexxtap-payments"` check.
 */
export function useNexxtapTransactionsQuery(
  page: number,
  pageSize: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["nexxtap-transactions", page, pageSize],
    queryFn: () => fetchNexxtapTransactions(page, pageSize),
    placeholderData: keepPreviousData,
    enabled,
    staleTime: 2 * 60 * 1000,
  });
}
