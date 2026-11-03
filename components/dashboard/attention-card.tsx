"use client";

import Link from "next/link";
import { useAtomValue } from "jotai";
import { Check, ChevronRight, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Shimmer } from "@/components/ui/shimmer";
import { accountStageAtom } from "@/lib/atoms";
import { toIsoDate } from "@/lib/invoices";
import { money } from "@/lib/dashboard-data";
import { keyActions, type KeyAction } from "@/lib/key-actions";
import { useDashboardGstQuery } from "@/hooks/use-dashboard-query";
import { cn } from "@/lib/utils";
import {
  isOnboardingStepDone,
  visibleOnboardingSteps,
  useOnboardingStore,
} from "@/stores/onboarding";
import { useAccountsStore } from "@/stores/accounts";
import { useExpensesStore } from "@/stores/expenses";
import { useInvoicesStore } from "@/stores/invoices";
import { useQuotesStore } from "@/stores/quotes";
import { useTransactionsStore } from "@/stores/transactions";

/** Setup checklist for a new account, the live job list once there's data. */
export function AttentionCard() {
  const stage = useAtomValue(accountStageAtom);
  return stage === "active" ? <KeyActions /> : <FinishSetup />;
}

/**
 * The short list of jobs, worst first.
 *
 * This was "Needs attention", which listed whatever was outstanding and always
 * carried a BAS row, so it never emptied and never ranked. The list is capped
 * and derived now — see `keyActions` — and when there's genuinely nothing on it
 * the card says so rather than manufacturing a fifth thing to worry about.
 */
function KeyActions() {
  const invoices = useInvoicesStore((state) => state.invoices);
  const invoicesHydrated = useInvoicesStore((state) => state.hydrated);
  const expenses = useExpensesStore((state) => state.expenses);
  const expensesHydrated = useExpensesStore((state) => state.hydrated);
  const quotes = useQuotesStore((state) => state.quotes);
  const quotesHydrated = useQuotesStore((state) => state.hydrated);
  const { data: gst, isLoading: gstLoading } = useDashboardGstQuery();

  // "You're all caught up" is a false reassurance if it's shown before the
  // real lists have even landed, not just an empty $0 — worse than a
  // misleading number, so this gates on loading rather than just the figures.
  const loading =
    !invoicesHydrated || !expensesHydrated || !quotesHydrated || gstLoading;

  const { actions, total } = keyActions({
    invoices,
    quotes,
    expenses,
    today: toIsoDate(new Date()),
    bas: gst,
  });

  if (loading) {
    return (
      <Card data-tour="needs-attention" data-usertour="dashboard-attention" className="flex flex-col">
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">
            If you&apos;ve got 5 minutes
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 space-y-2">
          <Shimmer className="h-14 w-full" />
          <Shimmer className="h-14 w-full" />
          <Shimmer className="h-14 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-tour="needs-attention" data-usertour="dashboard-attention" className="flex flex-col">
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            If you&apos;ve got 5 minutes
          </CardTitle>
          {total > 0 && (
            <div className="flex shrink-0 items-center gap-2">
              {/* Muted rather than destructive: the count is how much there is
                  to do, not an alarm — the rows carry their own urgency. */}
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular">
                {total} left to action
              </span>
              {total > actions.length && (
                <span className="text-xs text-muted-foreground tabular">
                  showing top {actions.length}
                </span>
              )}
            </div>
          )}
        </div>
        {total > 0 && (
          <p className="text-sm text-muted-foreground">
            Your {actions.length} most urgent — clear one and the next moves up.
          </p>
        )}
      </CardHeader>

      <CardContent className="flex-1">
        {actions.length === 0 ? (
          <AllClear />
        ) : (
          <ul className="divide-y divide-border rounded-md border">
            {actions.map((action) => (
              <li key={action.key}>
                <ActionRow action={action} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One job, with the button that does it.
 *
 * The row isn't a link: it holds two controls, and a link wrapping buttons is
 * both invalid and ambiguous about what a click means. The reference is the link
 * instead, so "open the record" and "do the thing" are separate targets.
 */
function ActionRow({ action }: { action: KeyAction }) {
  return (
    <div className="flex items-center gap-3 p-3">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4",
          action.tone === "danger"
            ? "bg-destructive/10 text-destructive"
            : "bg-warning/10 text-warning",
        )}
        aria-hidden
      >
        <action.icon />
      </span>

      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={action.href}
            className="truncate rounded text-sm font-medium leading-snug tabular outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            {action.title}
          </Link>
          <span className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {action.typeLabel}
          </span>
        </div>
        <p
          className={cn(
            "text-xs tabular",
            action.tone === "danger" ? "text-destructive" : "text-warning",
          )}
        >
          {action.detail}
        </p>
      </div>

      <p className="shrink-0 text-sm font-semibold tabular">
        {money(action.amount)}
      </p>

      {/*
        A ghost button, not the indigo primary: there are five of these stacked,
        and five primaries is a card with no primary at all.
      */}
      <Button
        asChild
        variant="outline"
        size="sm"
        className="shrink-0 border-[#D1D5DB] bg-white font-semibold text-[#374151] hover:bg-[#F5F4F8] dark:border-border dark:bg-transparent dark:text-foreground dark:hover:bg-accent"
      >
        <Link href={action.href} aria-label={`${action.cta}: ${action.title}`}>
          {action.cta}
        </Link>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground"
            aria-label={`More actions for ${action.title}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {action.menu.map((item) => (
            <DropdownMenuItem key={item.href + item.label} asChild>
              <Link href={item.href}>{item.label}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Nothing outstanding. Said once, calmly, instead of an empty card. */
function AllClear() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-8 text-center">
      <span
        className="grid size-10 place-items-center rounded-full bg-success/10 text-success"
        aria-hidden
      >
        <Check className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium">You&apos;re all caught up</p>
        <p className="text-xs text-muted-foreground">
          No overdue invoices, unsent drafts, quotes waiting or bills to pay.
        </p>
      </div>
    </div>
  );
}

function FinishSetup() {
  const done = useOnboardingStore((s) => s.done);
  const toggle = useOnboardingStore((s) => s.toggle);
  const accounts = useAccountsStore((s) => s.accounts);
  const invoices = useInvoicesStore((s) => s.invoices);
  const transactions = useTransactionsStore((s) => s.transactions);

  // Same list and the same rules as the header's Getting started, so the two
  // never disagree about what's left to do.
  const steps = visibleOnboardingSteps(
    invoices.length > 0 || transactions.length > 0,
  );
  const doneCount = steps.filter((step) =>
    isOnboardingStepDone(done, step.key, accounts.length),
  ).length;

  return (
    <Card data-usertour="dashboard-attention" className="flex flex-col">
      <CardHeader className="space-y-1.5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Finish setting up</CardTitle>
          <span className="text-xs tabular text-muted-foreground">
            {doneCount}/{steps.length}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Start by sending an invoice — the rest can wait until you need it.
        </p>
      </CardHeader>
      <CardContent className="flex-1 space-y-0.5">
        {steps.map((step) => {
          const isDone = isOnboardingStepDone(done, step.key, accounts.length);
          return (
            <button
              key={step.key}
              type="button"
              onClick={() => toggle(step.key)}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border",
                  isDone
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input",
                )}
              >
                {isDone && <Check className="size-3" aria-hidden />}
              </span>
              <span
                className={cn(
                  "flex-1 text-sm",
                  isDone && "text-muted-foreground line-through",
                )}
              >
                {step.label}
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
