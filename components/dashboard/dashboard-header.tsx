"use client";

import * as React from "react";
import Link from "next/link";
import { useAtom, useAtomValue } from "jotai";
import {
  Check,
  ChevronDown,
  FileCheck2,
  FileText,
  LayoutDashboard,
  Plus,
  Receipt,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InfoTip } from "@/components/ui/info-tip";
import { Shimmer } from "@/components/ui/shimmer";
import { accountStageAtom, authNameAtom } from "@/lib/atoms";
import { money } from "@/lib/dashboard-data";
import { DASHBOARD_PERIODS, dashboardPeriodLabel } from "@/lib/dashboard-period";
import { financialYearRevenue, toIsoDate } from "@/lib/invoices";
import { keyActions } from "@/lib/key-actions";
import { useDashboardGstQuery } from "@/hooks/use-dashboard-query";
import { useDashboardPeriod } from "@/hooks/use-dashboard-period";
import {
  isOnboardingStepDone,
  visibleOnboardingSteps,
  useOnboardingStore,
} from "@/stores/onboarding";
import { useAccountsStore } from "@/stores/accounts";
import { useTransactionsStore } from "@/stores/transactions";
import { titleCaseName } from "@/lib/onboarding";
import { useInvoicesStore } from "@/stores/invoices";
import { useBusinessDetails } from "@/hooks/use-business-settings";
import {
  useDashboardExpenses,
  useDashboardInvoices,
  useDashboardQuotes,
} from "@/hooks/use-dashboard-source";

/** Deep-link intents — the target screen opens its create UI on mount. */
const CREATE_ITEMS = [
  { label: "New invoice", href: "/invoices/new", icon: FileText },
  { label: "New quote", href: "/quotes?new=1", icon: FileCheck2 },
  { label: "New expense", href: "/expenses?new=1", icon: Receipt },
  { label: "New contact", href: "/contacts?new=1", icon: UserPlus },
];

export function DashboardHeader() {
  const [stage] = useAtom(accountStageAtom);
  const greeting = useGreeting();
  const { invoices, hydrated: invoicesHydrated } = useDashboardInvoices();
  const { expenses, hydrated: expensesHydrated } = useDashboardExpenses();
  const { quotes, hydrated: quotesHydrated } = useDashboardQuotes();
  // The setup checklist is about the account's own progress, so it reads the
  // real list even while the figures above are the sample's.
  const ownInvoiceCount = useInvoicesStore((state) => state.invoices.length);
  const accounts = useAccountsStore((state) => state.accounts);
  const transactions = useTransactionsStore((state) => state.transactions);
  const done = useOnboardingStore((state) => state.done);
  const { data: gst, isLoading: gstLoading } = useDashboardGstQuery();
  const numbersLoading =
    !invoicesHydrated || !expensesHydrated || !quotesHydrated || gstLoading;

  /**
   * Who the greeting names.
   *
   * The business captured on the page after sign-up, which is the name this
   * person chose for the thing they're looking at. It used to be a hard-coded
   * "Jane" — a placeholder that survived because nothing on the dashboard knew
   * the real one until that page existed to ask.
   *
   * Gated on hydration, because the settings store rehydrates after mount and
   * the shipped sample name would otherwise flash first — greeting someone by
   * the wrong business name is worse than greeting them by none. Falls back to
   * the account holder's own first name from sign-up, and then to nothing at
   * all: "Good morning" on its own is a complete sentence.
   */
  // Gated on the business record having landed rather than on a local store
  // having rehydrated — the name comes from the server now.
  const { values: business, loading } = useBusinessDetails();
  const accountName = useAtomValue(authNameAtom);
  const name = !loading
    ? business.businessName.trim() ||
    titleCaseName(accountName.trim().split(/\s+/)[0] ?? "")
    : "";

  // Billed over the period the dropdown picks — the same window, through the
  // same helper, as the snapshot strip below, so the two can't disagree.
  const { period, setPeriod, window: periodWindow } = useDashboardPeriod();
  const billed = financialYearRevenue(invoices, periodWindow).amount;

  // Same call the Attention card makes, so the two never disagree about how
  // many things there are to do.
  const { total: attentionCount } = keyActions({
    invoices,
    quotes,
    expenses,
    today: toIsoDate(new Date()),
    bas: gst,
  });

  // Same list and rules the Attention card's "Finish setting up" uses.
  const steps = visibleOnboardingSteps(
    ownInvoiceCount > 0 || transactions.length > 0,
  );
  const doneCount = steps.filter((step) =>
    isOnboardingStepDone(done, step.key, accounts.length),
  ).length;

  const subline =
    stage === "active"
      ? `You've billed ${money(billed)} ${periodWindow.phrase} — ${attentionCount} ${attentionCount === 1 ? "thing needs" : "things need"
      } your attention.`
      : `Let's finish setting up — you're ${doneCount} of ${steps.length} steps in.`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 ">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
          aria-hidden
        >
          <LayoutDashboard className="size-6" />
        </span>
        <div className="min-w-0 ">
          <h1 className="text-xl font-semibold tracking-tight">
            {name ? `${greeting}, ${name}` : greeting}
          </h1>
          {numbersLoading ? (
            <Shimmer className="h-4 w-64" />
          ) : (
            <p className="text-sm font-medium text-muted-foreground">{subline}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <InfoTip text="All figures on this dashboard are calculated using matched transactions only." />

        {/* sole-webapp's period filter: what the period-based figures on the
            page report over. The cash flow card keeps its own range selector,
            beside the chart it changes. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              aria-label={`Dashboard period: ${dashboardPeriodLabel(period)}`}
              data-usertour="dashboard-period"
            >
              {dashboardPeriodLabel(period)}
              <ChevronDown className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {DASHBOARD_PERIODS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onSelect={() => setPeriod(option.value)}
                className="justify-between"
              >
                {option.label}
                {option.value === period ? <Check className="size-4 text-primary" aria-hidden /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* No page guide here. The dashboard has its own header rather than the
            shared PageHeader, so this is the one screen that has to opt out
            explicitly — every other page still gets the button from
            `PageHeader`. The tour itself is untouched and still reachable from
            them. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button data-tour="create-new" data-usertour="dashboard-create-new">
              <Plus />
              Create new
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {CREATE_ITEMS.map((item) => (
              <DropdownMenuItem key={item.href} asChild>
                <Link href={item.href}>
                  <item.icon className="size-4 text-muted-foreground" />
                  {item.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/** Resolved after mount so the server and client markup agree. */
function useGreeting() {
  const [greeting, setGreeting] = React.useState("Good morning");

  React.useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(
      hour < 12
        ? "Good morning"
        : hour < 18
          ? "Good afternoon"
          : "Good evening",
    );
  }, []);

  return greeting;
}
