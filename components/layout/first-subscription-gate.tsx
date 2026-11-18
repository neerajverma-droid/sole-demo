"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useSession } from "@/components/auth/session-provider";
import BrandSplashLoader from "@/components/layout/brand-splash-loader";
import { useSubscriptionQuery } from "@/hooks/use-subscription-query";
import { ONBOARDING_PLAN_HREF } from "@/lib/onboarding";
import { firstSubscriptionGate } from "@/lib/subscription";

/**
 * Keeps the app closed until the first subscription has been taken.
 *
 * There is no free trial, so a new account has nothing to open the product
 * with until it has paid — onboarding's plan step is where that happens, and
 * this is what stops a new account walking around it by typing `/dashboard`.
 * It is deliberately narrow: only an account the server says has never held a
 * trial or a plan (`requiresFirstSubscription`) is redirected. A lapsed trial or
 * a cancelled plan keeps the free tier, so nobody already in the product is
 * sent back to onboarding.
 *
 * Nothing renders while the first answer is in flight, rather than the app
 * showing for a moment and then being taken away from someone who has to pay —
 * the same splash the session check shows, so it reads as one wait. If the
 * request fails the app opens: a billing hiccup must not lock paying customers
 * out, and the server remains the authority on what each call is allowed to do.
 * The decision itself is `firstSubscriptionGate`, which is where the rules and
 * their tests live.
 */
export function FirstSubscriptionGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, status } = useSession();
  const subscription = useSubscriptionQuery();

  const gate = firstSubscriptionGate({
    // The accountant exemption reads the session's user, so nothing is decided
    // until the session has proved one — an accountant must not be redirected
    // on the strength of a subscription answer that arrived first.
    sessionPending: status === "loading",
    isAccountant: Boolean(user?.isAccountant),
    subscriptionPending: subscription.isPending,
    requiresFirstSubscription: subscription.data?.requiresFirstSubscription,
  });

  React.useEffect(() => {
    if (gate === "required") router.replace(ONBOARDING_PLAN_HREF);
  }, [gate, router]);

  if (gate !== "open") {
    return (
      <div
        className="grid min-h-svh w-full place-items-center"
        role="status"
        aria-live="polite"
      >
        <BrandSplashLoader
          text={
            gate === "required"
              ? "Taking you to choose a plan…"
              : "Loading your account…"
          }
        />
      </div>
    );
  }

  return <>{children}</>;
}
