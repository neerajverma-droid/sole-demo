"use client";

import { useAssetsQuery } from "@/hooks/use-assets-query";
import { useExpensesQuery } from "@/hooks/use-expenses-query";
import { useInvoicesQuery } from "@/hooks/use-invoices-query";
import { useQuotesQuery } from "@/hooks/use-quotes-query";

/**
 * BusinessSnapshot, RevenueGoalCard, InvoiceSummaryCard and AttentionCard all
 * read the real invoice/expense/asset/quote stores, but those stores are only
 * ever populated by their own screen mounting (`useInvoicesQuery` etc. live
 * on the /invoices, /expenses, /assets and /quotes screens). Landing on
 * /dashboard first — before ever visiting one of those — would otherwise
 * show an empty book. Renders nothing; it only triggers the fetches.
 */
export function DashboardDataBootstrap() {
  useInvoicesQuery();
  useExpensesQuery();
  useAssetsQuery();
  useQuotesQuery();
  return null;
}
