"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { useCountryContext } from "@/hooks/use-country-context";
import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { returnWord } from "@/lib/country-context";
import {
  fetchDashboardBalance,
  fetchDashboardBankAccounts,
  fetchDashboardCashFlow,
  fetchDashboardGstSetAside,
  fetchDashboardTopExpenses,
  fetchDashboardTopIncomes,
  returnDueTiming,
  type GstSetAside,
} from "@/lib/dashboard";
import { useAccountsStore } from "@/stores/accounts";

/** The hero card's current cash position and its monthly history. */
export function useDashboardBalanceQuery() {
  return useQuery({
    queryKey: ["dashboard", "balance"],
    queryFn: fetchDashboardBalance,
  });
}

/**
 * Real bank balances, mirrored into `useAccountsStore` — same mirror pattern
 * `useInvoicesQuery` uses for the invoice store. `connect`/`archive`/`sync`
 * stay local-only; only the read side is wired up here.
 */
export function useDashboardBankAccountsQuery() {
  const setAccounts = useAccountsStore((state) => state.setAccounts);

  const query = useQuery({
    queryKey: ["dashboard", "bank-accounts"],
    queryFn: fetchDashboardBankAccounts,
  });

  React.useEffect(() => {
    if (query.data) setAccounts(query.data.accounts);
  }, [query.data, setAccounts]);

  return query;
}

/** Money in vs money out, month by month — feeds the Cash flow card. */
export function useDashboardCashFlowQuery() {
  return useQuery({
    queryKey: ["dashboard", "cash-flow"],
    queryFn: fetchDashboardCashFlow,
  });
}

/**
 * The BAS set-aside tile — or GST return, by the business's country.
 *
 * Only the amount is fetched, over the business's financial year. Which return
 * it goes on and when that's due are the country context's filing periods,
 * applied in `select`: a pure calendar fact, so the context landing (or a
 * different business's) re-derives them without refetching the figure, or
 * flashing the tile back to loading for an Australian business whose answer
 * doesn't change.
 */
export function useDashboardGstQuery() {
  const { country } = useCountryContext();
  const fiscalYearStart = useFiscalYearStart();
  const previous = country.previousFilingPeriod;
  const current = country.currentFilingPeriod;
  const returnName = returnWord(country);

  const select = React.useCallback(
    (data: GstSetAside): GstSetAside => {
      const periods = [previous, current].filter((period) => period !== null);
      return {
        ...data,
        ...(periods.length > 0
          ? returnDueTiming(new Date(), periods, fiscalYearStart)
          : {}),
        returnName,
      };
    },
    [previous, current, fiscalYearStart, returnName],
  );

  return useQuery({
    queryKey: ["dashboard", "gst", fiscalYearStart.month, fiscalYearStart.day],
    queryFn: () => fetchDashboardGstSetAside({ fiscalYearStart }),
    select,
  });
}

/** Top income and expense categories for the financial year to date. */
export function useDashboardTopIncomesQuery() {
  const fiscalYearStart = useFiscalYearStart();
  return useQuery({
    queryKey: [
      "dashboard",
      "top-incomes",
      fiscalYearStart.month,
      fiscalYearStart.day,
    ],
    queryFn: () => fetchDashboardTopIncomes(fiscalYearStart),
  });
}

export function useDashboardTopExpensesQuery() {
  const fiscalYearStart = useFiscalYearStart();
  return useQuery({
    queryKey: [
      "dashboard",
      "top-expenses",
      fiscalYearStart.month,
      fiscalYearStart.day,
    ],
    queryFn: () => fetchDashboardTopExpenses(fiscalYearStart),
  });
}
