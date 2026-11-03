"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSetAtom } from "jotai";
import { CalendarClock, Check, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ConnectBankIntroModal } from "@/components/banking/ConnectBankIntroModal";
import { InviteAccountantDialog } from "@/components/layout/invite-accountant-dialog";
import { ConnectBankDialog } from "@/components/transactions/connect-bank-dialog";
import {
  connectBankIntroOpenAtom,
  inviteAccountantOpenAtom,
} from "@/lib/atoms";
import { SCHEDULE_SUPPORT_URL } from "@/lib/support";
import { cn } from "@/lib/utils";
import { useAccountsStore } from "@/stores/accounts";
import { useInvoicesStore } from "@/stores/invoices";
import { useTransactionsStore } from "@/stores/transactions";
import {
  isOnboardingStepDone,
  visibleOnboardingSteps,
  useOnboardingStore,
  type OnboardingStep,
} from "@/stores/onboarding";

/** Shared header pair — present on every page. */
export function HeaderActions() {
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="hidden sm:inline-flex"
        onClick={() =>
          window.open(SCHEDULE_SUPPORT_URL, "_blank", "noopener,noreferrer")
        }
      >
        <CalendarClock className="text-muted-foreground" />
        Schedule support
      </Button>
      {/* <GettingStarted /> */}
      {/*
        Mounted here rather than on the pages that used to own them, so the
        get-started rows work from wherever they're clicked. Both are driven by
        an atom, so a second copy on a page would open two of the same dialog.
      */}
      {/* The explainer and the flow it gates, mounted once for the app. */}
      <ConnectBankIntroModal />
      <ConnectBankDialog />
      <InviteAccountantDialog />
    </>
  );
}

function GettingStarted() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const done = useOnboardingStore((s) => s.done);
  const openConnectBank = useSetAtom(connectBankIntroOpenAtom);
  const openInvite = useSetAtom(inviteAccountantOpenAtom);

  const accounts = useAccountsStore((s) => s.accounts);
  const invoices = useInvoicesStore((s) => s.invoices);
  const transactions = useTransactionsStore((s) => s.transactions);

  // Completion is restored from localStorage after mount.
  React.useEffect(() => setMounted(true), []);

  /**
   * Something to reconcile. Until there is, the bank row stays out of the list
   * rather than sitting there greyed out — a nudge you can't act on yet is
   * just a chore you've been given.
   */
  const hasActivity = invoices.length > 0 || transactions.length > 0;

  const steps = visibleOnboardingSteps(hasActivity);
  const isDone = (step: OnboardingStep) =>
    isOnboardingStepDone(done, step.key, accounts.length);
  const doneCount = steps.filter(isDone).length;
  const allDone = doneCount === steps.length;

  const runStep = (step: OnboardingStep) => {
    setOpen(false);
    if (step.action === "connect-bank") openConnectBank(true);
    else if (step.action === "invite-accountant") openInvite(true);
    else if (step.href) router.push(step.href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* Off on phones, like Schedule support beside it: there's no room in
            the bar, and the dashboard's attention card carries the same list. */}
        <Button variant="outline" size="sm" className="hidden sm:inline-flex">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              mounted && !allDone ? "bg-success" : "bg-muted-foreground/40",
            )}
            aria-hidden
          />
          Getting started
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-semibold">Finish setting up</h2>
            <span className="shrink-0 text-xs tabular text-muted-foreground">
              {doneCount}/{steps.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Start by sending an invoice — the rest can wait until you need it.
          </p>
        </div>
        <ul className="p-1.5">
          {steps.map((step) => {
            const stepDone = isDone(step);
            return (
              <li key={step.key}>
                <button
                  type="button"
                  onClick={() => runStep(step)}
                  className="flex w-full items-center gap-3 rounded-sm px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border",
                      stepDone
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input",
                    )}
                  >
                    {stepDone && <Check className="size-3" aria-hidden />}
                  </span>
                  <span
                    className={cn(
                      "flex-1",
                      stepDone && "text-muted-foreground line-through",
                    )}
                  >
                    {step.label}
                    {step.optional && !stepDone && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        Optional
                      </span>
                    )}
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
