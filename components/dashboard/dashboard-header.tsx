"use client";

import * as React from "react";
import Link from "next/link";
import { useAtom, useAtomValue } from "jotai";
import {
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
import { Shimmer } from "@/components/ui/shimmer";
import { accountStageAtom, authNameAtom } from "@/lib/atoms";
import { money } from "@/lib/dashboard-data";
import {
  currentFinancialYear,
  financialYearRevenue,
  toIsoDate,
} from "@/lib/invoices";
import { keyActions } from "@/lib/key-actions";
import { useDashboardGstQuery } from "@/hooks/use-dashboard-query";
import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import {
  isOnboardingStepDone,
  visibleOnboardingSteps,
  useOnboardingStore,
} from "@/stores/onboarding";
import { useAccountsStore } from "@/stores/accounts";
import { useExpensesStore } from "@/stores/expenses";
import { useQuotesStore } from "@/stores/quotes";
import { useTransactionsStore } from "@/stores/transactions";
import { titleCaseName } from "@/lib/onboarding";
import { useInvoicesStore } from "@/stores/invoices";
import { useBusinessDetails } from "@/hooks/use-business-settings";

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
  const invoices = useInvoicesStore((state) => state.invoices);
  const invoicesHydrated = useInvoicesStore((state) => state.hydrated);
  const expenses = useExpensesStore((state) => state.expenses);
  const expensesHydrated = useExpensesStore((state) => state.hydrated);
  const quotes = useQuotesStore((state) => state.quotes);
  const quotesHydrated = useQuotesStore((state) => state.hydrated);
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

  // The same figure the revenue goal card reports, from the same call — this
  // line used to quote the frozen sample total, which put a different "billed
  // this year" in the greeting than in the card an inch below it.
  const fiscalYearStart = useFiscalYearStart();
  const billed = financialYearRevenue(
    invoices,
    currentFinancialYear(new Date(), fiscalYearStart),
  ).amount;

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
    invoices.length > 0 || transactions.length > 0,
  );
  const doneCount = steps.filter((step) =>
    isOnboardingStepDone(done, step.key, accounts.length),
  ).length;

  const subline =
    stage === "active"
      ? `You've billed ${money(billed)} this year — ${attentionCount} ${attentionCount === 1 ? "thing needs" : "things need"
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

      {/* The page-level period tabs are gone: the only card that read them was
          the profit pair, and the period that matters now belongs to the cash
          flow card, which carries its own selector next to the chart it
          changes. */}
      <div className="flex items-center gap-3">
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
