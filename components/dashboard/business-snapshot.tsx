"use client";

import { DollarSign, Landmark, Percent, Receipt } from "lucide-react";

import { StatCards, type StatCard } from "@/components/ui/stat-cards";
import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { assetStats } from "@/lib/assets";
import { money } from "@/lib/dashboard-data";
import { expenseTotal } from "@/lib/expenses";
import { currentFinancialYear, financialYearRevenue } from "@/lib/invoices";
import { reportPercent } from "@/lib/reports";
import { useAssetsStore } from "@/stores/assets";
import { useExpensesStore } from "@/stores/expenses";
import { useInvoicesStore } from "@/stores/invoices";

/**
 * What net profit is, and what it isn't.
 *
 * Worth saying on the tile, because the dashboard reports both this and a cash
 * position, and the two are different questions that people read as the same
 * one — which is how a good year with an empty bank account becomes a surprise.
 */
const NET_PROFIT_TIP =
  "A flow: everything you've invoiced across the financial year, less everything you've spent in it. Not the same as your net position, which is what you're worth right now.";

/** The register is a list of things you own, not a balance-sheet total. */
const ASSETS_TIP =
  "The value of the items in your asset register. Not accounting total assets, which would also count your cash, your stock and what your clients owe you.";

/**
 * Where the business stands, in four figures.
 *
 * The house `StatCards` rather than a strip of its own: these are four figures
 * of the same kind, which is the row that component exists for, and a bespoke
 * six-up in pastels would be the one metrics treatment on the platform nobody
 * would recognise anywhere else.
 *
 * Every figure is read off the live stores. This used to run `plReport`, which
 * is the profit and loss engine's seeded sample book — so the profit on this
 * strip was a demo figure sitting inches from a revenue goal computed from real
 * invoices, and the two had no reason to agree about anything. Revenue comes
 * through `financialYearRevenue` now, which is the same call the goal card
 * makes, so the profit here is the revenue there minus the expenses below it.
 *
 * No year-on-year movement: there is no previous year in these stores, and a
 * delta against a seeded baseline would be a made-up figure dressed as a fact.
 */
export function BusinessSnapshot() {
  const invoices = useInvoicesStore((state) => state.invoices);
  const invoicesHydrated = useInvoicesStore((state) => state.hydrated);
  const expenses = useExpensesStore((state) => state.expenses);
  const expensesHydrated = useExpensesStore((state) => state.hydrated);
  const assets = useAssetsStore((state) => state.assets);
  const assetsHydrated = useAssetsStore((state) => state.hydrated);
  const loading = !invoicesHydrated || !expensesHydrated || !assetsHydrated;

  // The business's own year — 1 April in New Zealand — not Australia's.
  const fiscalYearStart = useFiscalYearStart();
  const year = currentFinancialYear(new Date(), fiscalYearStart);

  const revenue = financialYearRevenue(invoices, year).amount;

  /*
   * Scoped by the date the money went out, on the same inclusive ISO bounds the
   * revenue uses — so the two sides of the subtraction cover exactly the same
   * twelve months. Every expense in the period counts, paid or still owing: an
   * expense is incurred when it happens, which is the accrual the revenue line
   * is already on.
   */
  const totalExpenses = expenses
    .filter(
      (expense) => expense.date >= year.startIso && expense.date <= year.endIso,
    )
    .reduce((sum, expense) => sum + expenseTotal(expense), 0);

  const netProfit = revenue - totalExpenses;
  /** Share of revenue, so a year with no invoices reads 0% rather than NaN. */
  const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  const totalAssets = assetStats(assets).totalValue;

  const stats: StatCard[] = [
    {
      // Colour on the tile says which way it went, which is the one thing a
      // profit figure has to say before it's read.
      key: "net-profit",
      label: "Net profit",
      tip: NET_PROFIT_TIP,
      value: money(netProfit),
      meta: year.label,
      icon: DollarSign,
      tone: netProfit >= 0 ? "success" : "danger",
    },
    {
      key: "profit-margin",
      label: "Profit margin",
      value: reportPercent(margin),
      meta: year.label,
      icon: Percent,
      tone: margin >= 0 ? "success" : "danger",
    },
    {
      key: "total-expenses",
      label: "Total expenses",
      value: money(totalExpenses),
      meta: year.label,
      icon: Receipt,
      tone: "warning",
    },
    {
      // "Registered" rather than "Total": what's in the register, said in the
      // label, so the figure isn't read as a balance sheet line.
      key: "registered-assets",
      label: "Registered assets",
      tip: ASSETS_TIP,
      value: money(totalAssets),
      meta: year.label,
      icon: Landmark,
      tone: "accent",
    },
  ];

  return <StatCards stats={stats} loading={loading} />;
}
