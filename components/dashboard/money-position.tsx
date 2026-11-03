"use client";

import Link from "next/link";
import { useAtomValue } from "jotai";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Scale,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import { CountUp } from "@/components/ui/count-up";
import { InfoTip } from "@/components/ui/info-tip";
import { Shimmer } from "@/components/ui/shimmer";
import { BalanceHero } from "@/components/dashboard/balance-hero";
import { useCountryContext } from "@/hooks/use-country-context";
import { accountStageAtom } from "@/lib/atoms";
import { returnWord, taxWord } from "@/lib/country-context";
import { money } from "@/lib/dashboard-data";
import {
  useDashboardBalanceQuery,
  useDashboardBankAccountsQuery,
  useDashboardGstQuery,
} from "@/hooks/use-dashboard-query";
import { expenseRemaining } from "@/lib/expenses";
import { invoiceOutstanding, overdueSummary, toIsoDate } from "@/lib/invoices";
import { cn } from "@/lib/utils";
import { useAccountsStore } from "@/stores/accounts";
import { useExpensesStore } from "@/stores/expenses";
import { useInvoicesStore } from "@/stores/invoices";

/**
 * The four figures that decide whether this month's drawings are affordable,
 * ahead of anything else on the page.
 *
 * Cash on hand keeps the hero card: it's the number the other three qualify,
 * and it's the one surface on the page that carries a trend line rather than a
 * single figure. The rest are compact tiles beside it, because "how much is
 * owed" is a number you read, not one you study.
 */
export function MoneyPosition() {
  const stage = useAtomValue(accountStageAtom);
  const isActive = stage === "active";

  const invoices = useInvoicesStore((state) => state.invoices);
  const invoicesHydrated = useInvoicesStore((state) => state.hydrated);
  const expenses = useExpensesStore((state) => state.expenses);
  const expensesHydrated = useExpensesStore((state) => state.hydrated);
  const accounts = useAccountsStore((state) => state.accounts);
  const { data: gst, isLoading: gstLoading } = useDashboardGstQuery();
  const { data: balance } = useDashboardBalanceQuery();
  const { isLoading: accountsLoading } = useDashboardBankAccountsQuery();
  const { country } = useCountryContext();
  // "BAS" and "GST" in Australia; New Zealand's return is already called a
  // "GST return", so it isn't named twice.
  const returnName = returnWord(country);
  const tax = taxWord(country);
  const setAsideFor = returnName.includes(tax) ? returnName : `${returnName}/${tax}`;

  // The tiles read invoices, expenses, GST and the bank feed — all four have
  // to have landed before the figures mean anything, otherwise a tile shows
  // a confident-looking $0 that's really just "haven't asked yet".
  const tilesLoading =
    !invoicesHydrated || !expensesHydrated || gstLoading || accountsLoading;

  // A draft hasn't been sent, so nobody owes it yet.
  const owedToMe = invoices
    .filter((invoice) => invoice.status !== "Draft")
    .reduce((sum, invoice) => sum + invoiceOutstanding(invoice), 0);
  const overdue = overdueSummary(invoices, toIsoDate(new Date()));

  const bills = expenses.reduce(
    (sum, expense) => sum + expenseRemaining(expense),
    0,
  );
  const unpaidBills = expenses.filter(
    (expense) => expenseRemaining(expense) > 0,
  ).length;

  const basAmount = gst?.amount ?? 0;
  const cashOnHand = accounts.reduce((sum, account) => sum + account.balance, 0);

  // GST collected isn't yours to spend, so it counts against you here rather
  // than sitting quietly inside cash on hand.
  const owedByMe = bills + basAmount;
  const net = cashOnHand + owedToMe - owedByMe;

  /*
   * Only the cash side has real history (the balance query's monthly series).
   * Invoices and expenses carry none yet, so their baselines are 0 — which
   * MoneyTile already reads as "nothing to compare against" rather than as a
   * fabricated swing.
   */
  const series = balance?.series ?? [];
  const lastMonthCashOnHand =
    series.length > 1 ? series[series.length - 2].balance : 0;
  const lastMonthNet = lastMonthCashOnHand;

  const tiles = [
    {
      key: "owed-to-me",
      label: "Money owed to me",
      tip: "Unpaid invoices your clients still owe you (accounts receivable). 'Overdue' are past their due date.",
      icon: ArrowDownLeft,
      value: owedToMe,
      baseline: 0,
      // Receivables falling is clients paying you, so down is the good
      // direction — the same way round as money you owe, not the opposite.
      upIsGood: false,
      meta:
        overdue.count > 0
          ? `${overdue.count} overdue · ${money(overdue.amount)}`
          : "Nothing overdue",
      metaTone: overdue.count > 0 ? "text-destructive" : undefined,
      href: "/invoices",
    },
    {
      key: "owed-by-me",
      label: "Money I owe",
      tip: `Bills and tax you still need to pay (accounts payable), including money set aside for ${setAsideFor}.`,
      icon: ArrowUpRight,
      value: owedByMe,
      baseline: 0,
      upIsGood: false,
      meta: `${unpaidBills} ${unpaidBills === 1 ? "bill" : "bills"} · ${money(
        basAmount,
      )} ${returnName} set aside`,
      href: "/expenses",
    },
    {
      key: "net",
      label: "Net position",
      tip: "What you'd have if every invoice was paid and every bill settled: cash + money owed to you − money you owe.",
      icon: Scale,
      value: net,
      baseline: lastMonthNet,
      upIsGood: true,
      meta: "Cash + owed to you − owed by you",
    },
  ];

  return (
    <section
      data-tour="running-balance"
      data-usertour="dashboard-money-position"
      aria-labelledby="money-position-heading"
      className="space-y-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="money-position-heading"
          className="text-sm font-semibold tracking-tight"
        >
          Money position
        </h2>
      </div>

      <div className="grid items-stretch gap-[15px] lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BalanceHero />
        </div>

        <div className="grid gap-[15px] sm:grid-cols-3 lg:grid-cols-1">
          {tiles.map((tile) => (
            <MoneyTile
              key={tile.key}
              label={tile.label}
              tip={tile.tip}
              icon={tile.icon}
              value={isActive ? tile.value : 0}
              baseline={tile.baseline}
              upIsGood={tile.upIsGood}
              meta={isActive ? tile.meta : "Nothing recorded yet"}
              metaTone={isActive ? tile.metaTone : undefined}
              href={tile.href}
              showDelta={isActive}
              loading={isActive && tilesLoading}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function MoneyTile({
  label,
  tip,
  icon: Icon,
  value,
  baseline,
  upIsGood,
  meta,
  metaTone,
  href,
  showDelta,
  loading,
}: {
  label: string;
  /** Plain-English explanation of the figure, beside its title. */
  tip: string;
  icon: LucideIcon;
  value: number;
  baseline: number;
  /** Whether a rise is good news — money owed rising is not. */
  upIsGood: boolean;
  meta: string;
  metaTone?: string;
  href?: string;
  showDelta: boolean;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Shimmer className="h-[104px] rounded-lg border border-border bg-card" />
    );
  }

  const change =
    baseline === 0 ? null : ((value - baseline) / Math.abs(baseline)) * 100;
  const up = change !== null && change >= 0;
  const good = up === upIsGood;
  const Arrow = up ? TrendingUp : TrendingDown;

  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4"
          aria-hidden
        >
          <Icon />
        </span>
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          {label}
        </span>
        <InfoTip text={tip} />
        <span className="flex-1" aria-hidden />
        {href && (
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className={cn(
            "text-xl font-semibold leading-none tracking-tight tabular",
            value < 0 && "text-destructive",
          )}
        >
          <CountUp value={value} format={money} />
        </span>
        {showDelta && change !== null && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium",
              good ? "text-success" : "text-destructive",
            )}
          >
            <Arrow className="size-3.5" aria-hidden />
            <span className="tabular">{Math.abs(change).toFixed(0)}%</span>
          </span>
        )}
      </div>

      <p className={cn("mt-1.5 text-xs text-muted-foreground", metaTone)}>
        {meta}
      </p>
    </>
  );

  const surface =
    "block rounded-lg border border-border bg-card p-4 shadow-sm outline-none";

  return href ? (
    <Link
      href={href}
      className={cn(
        surface,
        "transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={surface}>{body}</div>
  );
}
