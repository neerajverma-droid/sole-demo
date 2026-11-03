"use client";

import Link from "next/link";
import { Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSubscriptionStore } from "@/stores/subscription";

/** Below this, the strip stops being ambient and turns urgent. */
const URGENT_DAYS = 7;

export function TrialBanner() {
  // Single source of truth with the Subscription settings section — both
  // read the real subscription `useSubscriptionQuery` (mounted in the
  // header) mirrors into this store.
  const subscription = useSubscriptionStore((state) => state.subscription);

  // Nothing to show until the real fetch lands, and nothing once there's no
  // active trial to count down — a business on a paid plan, or one whose
  // trial has already lapsed (that case gets its own expired messaging
  // elsewhere), doesn't get a banner quoting a made-up number of days.
  if (!subscription?.isTrialing || subscription.trialDaysLeft == null) {
    return null;
  }

  const daysLeft = subscription.trialDaysLeft;
  const urgent = daysLeft < URGENT_DAYS;

  return (
    <div className="flex items-center gap-2.5 border-b bg-muted/50 px-7 py-2 text-sm">
      <Clock
        className={cn(
          "size-4 shrink-0",
          urgent ? "text-destructive" : "text-muted-foreground",
        )}
        aria-hidden
      />
      <p className="flex-1 text-muted-foreground">
        You have{" "}
        <span
          className={cn(
            "font-semibold",
            urgent ? "text-destructive" : "text-foreground",
          )}
        >
          {daysLeft} {daysLeft === 1 ? "day" : "days"}
        </span>{" "}
        left in your free trial.
      </p>
      <Button size="sm" asChild className="shrink-0">
        <Link href="/settings?section=subscription">Subscribe now</Link>
      </Button>
    </div>
  );
}
