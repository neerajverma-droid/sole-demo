"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { useCountryContext } from "@/hooks/use-country-context";
import { useDashboardPeriod } from "@/hooks/use-dashboard-period";
import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { returnWord } from "@/lib/country-context";
import { dashboardPeriodParams } from "@/lib/dashboard-period";
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
import { useIsDashboardDemo } from "@/hooks/use-dashboard-demo";
import {
  demoBalance,
  demoBankAccounts,
  demoCashFlow,
  demoGst,
  DEMO_TOP_EXPENSES,
  DEMO_TOP_INCOMES,
} from "@/lib/dashboard-demo";
import { useAccountsStore } from "@/stores/accounts";

/*
 * While a new account is looking at the sample (`use-dashboard-demo`), each of
 * these answers from `lib/dashboard-demo` under its own "demo" key instead of
 * calling the API, so the sample never lands in, or is mistaken for, the live
 * cache. The returned shape is the same either way, so no card has to know.
 */
const DEMO_QUERY = { staleTime: Infinity, gcTime: 0, retry: false } as const;

/** The hero card's current cash position and its monthly history. */
export function useDashboardBalanceQuery() {
  const demo = useIsDashboardDemo();
  return useQuery(
    demo
      ? { queryKey: ["dashboard", "demo", "balance"], queryFn: async () => demoBalance(), ...DEMO_QUERY }
      : { queryKey: ["dashboard", "balance"], queryFn: fetchDashboardBalance },
  );
}

/**
 * Real bank balances, mirrored into `useAccountsStore` — same mirror pattern
 * `useInvoicesQuery` uses for the invoice store. `connect`/`archive`/`sync`
 * stay local-only; only the read side is wired up here.
 */
export function useDashboardBankAccountsQuery() {
  const setAccounts = useAccountsStore((state) => state.setAccounts);
  const demo = useIsDashboardDemo();

  const query = useQuery(
    demo
      ? { queryKey: ["dashboard", "demo", "bank-accounts"], queryFn: async () => demoBankAccounts(), ...DEMO_QUERY }
      : { queryKey: ["dashboard", "bank-accounts"], queryFn: fetchDashboardBankAccounts },
  );

  // Only the real feed is mirrored: the sample must never reach the shared
  // store the Banking screen reads.
  React.useEffect(() => {
    if (query.data && !demo) setAccounts(query.data.accounts);
  }, [query.data, demo, setAccounts]);

  return query;
}

/** Money in vs money out, month by month — feeds the Cash flow card. */
export function useDashboardCashFlowQuery() {
  const demo = useIsDashboardDemo();
  return useQuery(
    demo
      ? { queryKey: ["dashboard", "demo", "cash-flow"], queryFn: async () => demoCashFlow(), ...DEMO_QUERY }
      : { queryKey: ["dashboard", "cash-flow"], queryFn: fetchDashboardCashFlow },
  );
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

  const demo = useIsDashboardDemo();
  return useQuery({
    queryKey: demo
      ? ["dashboard", "demo", "gst", fiscalYearStart.month, fiscalYearStart.day]
      : ["dashboard", "gst", fiscalYearStart.month, fiscalYearStart.day],
    queryFn: demo
      ? async () => demoGst(fiscalYearStart)
      : () => fetchDashboardGstSetAside({ fiscalYearStart }),
    select,
    ...(demo ? DEMO_QUERY : {}),
  });
}

/**
 * Top income and expense categories over the dashboard's chosen period —
 * this month, this financial year or last. Keyed on the window's dates, so
 * each period is cached on its own and switching back is instant.
 */
export function useDashboardTopIncomesQuery() {
  const fiscalYearStart = useFiscalYearStart();
  const { window: periodWindow } = useDashboardPeriod();
  const query = dashboardPeriodParams(periodWindow);
  const demo = useIsDashboardDemo();
  return useQuery(
    demo
      ? { queryKey: ["dashboard", "demo", "top-incomes"], queryFn: async () => DEMO_TOP_INCOMES, ...DEMO_QUERY }
      : {
          queryKey: ["dashboard", "top-incomes", query.period, query.start, query.end],
          queryFn: () => fetchDashboardTopIncomes(fiscalYearStart, query),
        },
  );
}

export function useDashboardTopExpensesQuery() {
  const fiscalYearStart = useFiscalYearStart();
  const { window: periodWindow } = useDashboardPeriod();
  const query = dashboardPeriodParams(periodWindow);
  const demo = useIsDashboardDemo();
  return useQuery(
    demo
      ? { queryKey: ["dashboard", "demo", "top-expenses"], queryFn: async () => DEMO_TOP_EXPENSES, ...DEMO_QUERY }
      : {
          queryKey: ["dashboard", "top-expenses", query.period, query.start, query.end],
          queryFn: () => fetchDashboardTopExpenses(fiscalYearStart, query),
        },
  );
}
