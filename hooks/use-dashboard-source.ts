"use client";

import * as React from "react";

import { useDashboardDemo } from "@/hooks/use-dashboard-demo";
import type { Asset } from "@/lib/assets";
import {
  demoBankAccounts,
  demoExpenses,
  demoInvoices,
  DEMO_GOAL_TARGET,
} from "@/lib/dashboard-demo";
import type { Expense } from "@/lib/expenses";
import type { Invoice } from "@/lib/invoices";
import type { Quote } from "@/lib/quotes";
import { useAccountsStore, type ConnectedAccount } from "@/stores/accounts";
import { useAssetsStore } from "@/stores/assets";
import { useDashboardStore } from "@/stores/dashboard";
import { useExpensesStore } from "@/stores/expenses";
import { useInvoicesStore } from "@/stores/invoices";
import { useQuotesStore } from "@/stores/quotes";

/*
 * The dashboard's reads of the shared stores, routed through the demo mode.
 *
 * The cards read these instead of the stores directly, so that while a new
 * account is looking at the sample (see `use-dashboard-demo`) they get the
 * sample, and otherwise exactly what they read before. The stores themselves
 * are never touched: the Invoices or Expenses screen keeps showing the
 * account's own (empty) lists the whole time.
 *
 * `hydrated` is false while the mode is still being decided, so every card
 * keeps showing its skeleton until there's a definite answer.
 */

type Listed = { hydrated: boolean };

export function useDashboardInvoices(): Listed & { invoices: Invoice[] } {
  const { mode } = useDashboardDemo();
  const invoices = useInvoicesStore((state) => state.invoices);
  const hydrated = useInvoicesStore((state) => state.hydrated);
  const sample = React.useMemo(() => (mode === "demo" ? demoInvoices() : []), [mode]);
  if (mode === "demo") return { invoices: sample, hydrated: true };
  return { invoices, hydrated: hydrated && mode === "live" };
}

export function useDashboardExpenses(): Listed & { expenses: Expense[] } {
  const { mode } = useDashboardDemo();
  const expenses = useExpensesStore((state) => state.expenses);
  const hydrated = useExpensesStore((state) => state.hydrated);
  const sample = React.useMemo(() => (mode === "demo" ? demoExpenses() : []), [mode]);
  if (mode === "demo") return { expenses: sample, hydrated: true };
  return { expenses, hydrated: hydrated && mode === "live" };
}

/** The sample has no quotes: an empty list keeps the job list short and readable. */
export function useDashboardQuotes(): Listed & { quotes: Quote[] } {
  const { mode } = useDashboardDemo();
  const quotes = useQuotesStore((state) => state.quotes);
  const hydrated = useQuotesStore((state) => state.hydrated);
  if (mode === "demo") return { quotes: EMPTY_QUOTES, hydrated: true };
  return { quotes, hydrated: hydrated && mode === "live" };
}

export function useDashboardAssets(): Listed & { assets: Asset[] } {
  const { mode } = useDashboardDemo();
  const assets = useAssetsStore((state) => state.assets);
  const hydrated = useAssetsStore((state) => state.hydrated);
  if (mode === "demo") return { assets: EMPTY_ASSETS, hydrated: true };
  return { assets, hydrated: hydrated && mode === "live" };
}

export function useDashboardAccounts(): ConnectedAccount[] {
  const { mode } = useDashboardDemo();
  const accounts = useAccountsStore((state) => state.accounts);
  const sample = React.useMemo(
    () => (mode === "demo" ? demoBankAccounts().accounts : []),
    [mode],
  );
  return mode === "demo" ? sample : accounts;
}

export function useDashboardGoalTarget(): number {
  const { mode } = useDashboardDemo();
  const goalTarget = useDashboardStore((state) => state.goalTarget);
  return mode === "demo" ? DEMO_GOAL_TARGET : goalTarget;
}

const EMPTY_QUOTES: Quote[] = [];
const EMPTY_ASSETS: Asset[] = [];
