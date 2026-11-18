"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAtomValue, useSetAtom } from "jotai";
import { Lock, LockOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { usePlanLock } from "@/hooks/use-plan-lock";
import {
  moreAddonsDetailAtom,
  moreAddonsOpenAtom,
  moreAddonsTabAtom,
} from "@/lib/atoms";
import type { PlanGate } from "@/lib/plan-gates";
import { SUBSCRIPTION_SETTINGS_PATH } from "@/lib/subscription";

/**
 * Stands in front of a page the plan doesn't include.
 *
 * However someone got here — the sidebar's locked row, a bookmark, a typed URL —
 * the page itself doesn't render: it would only fire requests the server
 * refuses. A lock takes its place, with a popup that says a subscription is
 * needed and offers the way to get one.
 */
export function PlanRouteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const gate = usePlanLock()(pathname);

  if (!gate) return <>{children}</>;
  return <LockedPage gate={gate} />;
}

function LockedPage({ gate }: { gate: PlanGate }) {
  const router = useRouter();
  const moreOpen = useAtomValue(moreAddonsOpenAtom);
  const setMoreOpen = useSetAtom(moreAddonsOpenAtom);
  const setMoreTab = useSetAtom(moreAddonsTabAtom);
  const setMoreDetail = useSetAtom(moreAddonsDetailAtom);

  /*
   * With a card, More's detail for it — the price and Select are there, and
   * buying from there unlocks this page on the next profile read. Without one
   * (Inventory, Transactions) it's a package question, so the plans.
   */
  const unlock = () => {
    if (gate.seats) {
      // Seats are switched on from the seat picker, not from More.
      router.push(SUBSCRIPTION_SETTINGS_PATH);
      return;
    }
    if (gate.addonId) {
      setMoreTab("addons");
      setMoreDetail(gate.addonId);
      setMoreOpen(true);
      return;
    }
    router.push(SUBSCRIPTION_SETTINGS_PATH);
  };

  return (
    <>
      <Empty className="min-h-[60vh] justify-center">
        <EmptyMedia>
          <Lock aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{gate.label} is locked</EmptyTitle>
        <EmptyDescription>
          It isn&apos;t included in your current subscription.
        </EmptyDescription>
      </Empty>

      {/*
        Can't be dismissed into the page — there's nothing behind it to use.
        Stands aside while More is open over it, so the two dialogs don't stack.
      */}
      <Dialog open={!moreOpen}>
        <DialogContent
          hideClose
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          className="sm:max-w-md"
        >
          <DialogHeader>
            <span
              className="mb-2 grid size-10 place-items-center rounded-full bg-primary/10 text-primary"
              aria-hidden
            >
              <Lock className="size-5" />
            </span>
            <DialogTitle>Subscription required</DialogTitle>
            <DialogDescription>
              {gate.label} isn&apos;t included in your current subscription.{" "}
              {gate.seats
                ? "Enable payroll and choose your employee seats to unlock it."
                : gate.addonId
                  ? "Add it to your plan to unlock it."
                  : "Upgrade your plan to unlock it."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              Go to dashboard
            </Button>
            <Button onClick={unlock}>
              <LockOpen aria-hidden />
              {gate.seats ? "Enable payroll" : gate.addonId ? "Unlock" : "View plans"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
