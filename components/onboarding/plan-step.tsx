"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OnboardingLayout } from "@/components/onboarding/onboarding-layout";
import { CouponField } from "@/components/pricing/coupon-field";
import {
  PricingPlans,
  type PricingSelection,
} from "@/components/pricing/pricing-plans";
import { useCheckoutReturn } from "@/hooks/use-checkout-return";
import { useCouponCode } from "@/hooks/use-coupon-code";
import { useSubscriptionQuery } from "@/hooks/use-subscription-query";
import { apiErrorMessage } from "@/lib/api-error";
import { activeBaseCurrency } from "@/lib/country-context";
import {
  forgetOnboardingProfile,
  markSignupReported,
  rememberOnboardingPayment,
  planProfile,
  planSelectionProps,
  recallOnboardingProfile,
  setUserProfile,
  signupAlreadyReported,
  takeOnboardingPayment,
  track,
} from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import {
  MONEY_BACK_GUARANTEE_DAYS,
  ONBOARDING_DONE_HREF,
  ONBOARDING_PLAN_HREF,
} from "@/lib/onboarding";
import {
  createCheckoutSession,
  fetchMySubscription,
  isSubscriptionActivated,
  type SubscriptionInfo,
} from "@/lib/subscription";
import { useBusinessesStore } from "@/stores/businesses";
import { sessionUserId, useSessionStore } from "@/stores/session";

/**
 * Where the first subscription is taken.
 *
 * There is no free trial: a new account pays here, and the product opens once
 * Stripe's webhook has made the subscription live. It is the same picker and
 * the same checkout the Settings and add-a-business flows use, so the plans,
 * add-ons and prices can't disagree with the ones on the invoice.
 *
 * The return from Stripe lands back on this page rather than the celebration,
 * because arriving back proves nothing yet — the subscription is written by the
 * webhook a few seconds later, and `useCheckoutReturn` polls for it. Only then
 * does the account move on, which is also why the picker is never offered again
 * while a payment is being confirmed: a second checkout would charge twice.
 *
 * A coupon the account signed up with arrives already applied, and one typed
 * here is checked before Stripe opens — a code that doesn't work stops the
 * checkout rather than charging the full price.
 *
 * An account that already has a subscription (a returning user who opens this
 * URL, or one that paid in another tab) is sent straight on.
 */
/**
 * `signup_completed`: the onboarding payment is confirmed.
 *
 * Sent here rather than on the company step so it carries the plan that was
 * actually paid for. Who the person is comes from what the company step kept
 * (the Stripe round trip reloads the page), falling back to the session.
 * `$insert_id` makes a second confirmation — a reload, the "Check again"
 * button — the same event rather than a second sign-up.
 */
function reportSignupCompleted(
  subscription: SubscriptionInfo | null,
  { onlyIfOnboarding = false }: { onlyIfOnboarding?: boolean } = {},
): void {
  const user = useSessionStore.getState().user;
  const sessionId = sessionUserId(user);
  const remembered = recallOnboardingProfile(sessionId);
  // The redirect for an account that already has a plan runs for anyone who
  // opens this page; only one that came through the company step is signing up.
  if (onlyIfOnboarding && Object.keys(remembered).length === 0) return;

  const userId = remembered.user_id ?? sessionId;
  if (userId && signupAlreadyReported(userId)) {
    forgetOnboardingProfile();
    return;
  }

  const { activeId, businesses } = useBusinessesStore.getState();
  const profile = {
    primary_country: remembered.primary_country ?? null,
    primary_email: remembered.primary_email ?? user?.email ?? null,
    primary_business_name:
      remembered.primary_business_name ??
      businesses.find((business) => business.id === activeId)?.name ??
      null,
    user_name: remembered.user_name ?? user?.name ?? null,
    user_id: userId,
    mobile_number: remembered.mobile_number ?? null,
    abn_number: remembered.abn_number ?? null,
    total_businesses: Math.max(1, businesses.length),
    ...planProfile(subscription),
  };
  track(EVENTS.SIGNUP_COMPLETED, {
    ...profile,
    business_id: activeId || null,
    // Event only: the profile's lifetime_value is sole-ocr's running $add.
    lifetime_value: takeOnboardingPayment(),
    // Mixpanel's format: letters, digits and "-", at most 36 characters.
    ...(userId ? { $insert_id: `signup-completed-${userId}` } : {}),
  });
  setUserProfile(profile, { userId });
  if (userId) markSignupReported(userId);
  forgetOnboardingProfile();
}

export function PlanStep() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const subscriptionQuery = useSubscriptionQuery();
  const [paying, setPaying] = React.useState(false);
  const [rechecking, setRechecking] = React.useState(false);
  const coupon = useCouponCode();

  /*
   * Refreshes the shared subscription before leaving, so the app's gate reads
   * the paid state rather than the pending one it last cached and sends the
   * account straight back here.
   */
  const finish = React.useCallback(async () => {
    let subscription: SubscriptionInfo | null = null;
    try {
      subscription = await queryClient.fetchQuery({
        queryKey: ["subscription", "my-subscription"],
        queryFn: fetchMySubscription,
        staleTime: 0,
      });
    } catch {
      // The webhook has already been confirmed; a failed refresh is retried by
      // the app's own subscription query once it mounts. The event still
      // carries the plan from whatever was last fetched.
      subscription =
        queryClient.getQueryData<SubscriptionInfo>([
          "subscription",
          "my-subscription",
        ]) ?? null;
    }
    reportSignupCompleted(subscription);
    router.replace(ONBOARDING_DONE_HREF);
  }, [queryClient, router]);

  const checkout = useCheckoutReturn(
    async (result) =>
      isSubscriptionActivated(await fetchMySubscription(), result.planSlug),
    {
      // The payment itself is reported by sole-ocr from Stripe's webhook
      // (`subscription_payment_completed`), so nothing is tracked here.
      onConfirmed: () => {
        void finish();
      },
    },
  );

  const alreadySubscribed =
    subscriptionQuery.data != null &&
    !subscriptionQuery.data.requiresFirstSubscription;
  React.useEffect(() => {
    if (alreadySubscribed && checkout.phase === "idle") {
      /*
       * Paid, but the confirmation was never seen here: the wait ran out and
       * the page was reloaded, the Stripe tab was closed and they came back
       * later, or the plan is paid by someone else (an accountant). Still the
       * end of sign-up — reported once, and only for an account that came
       * through the company step.
       */
      reportSignupCompleted(subscriptionQuery.data ?? null, {
        onlyIfOnboarding: true,
      });
      router.replace(ONBOARDING_DONE_HREF);
    }
    // subscriptionQuery.data is read once alreadySubscribed says it's there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alreadySubscribed, checkout.phase, router]);

  React.useEffect(() => {
    if (checkout.phase !== "cancelled") return;
    toast("Checkout cancelled", {
      id: "checkout-cancelled",
      description:
        "You haven't been charged. Choose a plan whenever you're ready.",
    });
    checkout.dismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout.phase]);

  const startCheckout = async (selection: PricingSelection) => {
    if (paying) return;
    setPaying(true);
    try {
      // Before anything is sent: a bad code has to be fixed on this page, not
      // found out after the redirect.
      const couponCode = await coupon.couponForCheckout();
      if (couponCode === null) {
        setPaying(false);
        return;
      }

      const url = await createCheckoutSession(
        {
          planSlug: selection.planSlug,
          billing: selection.billing,
          addons: selection.addons,
          couponCode,
        },
        { returnPath: ONBOARDING_PLAN_HREF },
      );
      const { activeId, businesses } = useBusinessesStore.getState();
      const onboardingSelection = planSelectionProps({
        planName: selection.planName,
        interval: selection.billing,
        addons: selection.addons,
        paidAmount:
          selection.billing === "annual"
            ? selection.monthlyTotal * 12
            : selection.monthlyTotal,
        currency: activeBaseCurrency(),
        businessId: activeId || null,
        businessName:
          businesses.find((business) => business.id === activeId)?.name ??
          recallOnboardingProfile().primary_business_name ??
          null,
        isOnboarding: true,
      });
      track(EVENTS.ONBD_SUBSCRIPTION_PLAN_SELECTED, onboardingSelection);
      if (typeof onboardingSelection.paid_amount === "number") {
        rememberOnboardingPayment(onboardingSelection.paid_amount);
      }
      window.location.href = url;
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't open checkout. Try again."));
      setPaying(false);
    }
  };

  /*
   * For when the webhook is slower than the wait. Checking again rather than
   * letting the account through: the app stays closed until Stripe's word is in.
   */
  const recheck = async () => {
    if (rechecking) return;
    setRechecking(true);
    try {
      const subscription = await fetchMySubscription();
      if (isSubscriptionActivated(subscription, checkout.result?.planSlug ?? null)) {
        await finish();
        return;
      }
      toast("Still activating", {
        id: "plan-still-activating",
        description: "Your payment is in. This can take a few minutes — there's no need to pay again.",
      });
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't check just now. Try again."));
    } finally {
      setRechecking(false);
    }
  };

  const confirming = checkout.phase === "confirming";
  const confirmed = checkout.phase === "confirmed";
  const delayed = checkout.phase === "delayed";

  return (
    <OnboardingLayout wide>
      {/*
        No card around it: the picker's own sections are the cards, and a frame
        on top of them only spends the height that keeps this to one screen.
      */}
      <PricingPlans
        compact
        title={
          <h1 className="text-2xl font-semibold tracking-tight">
            Choose your plan
          </h1>
        }
        ctaLabel="Continue to payment"
        guaranteeDays={MONEY_BACK_GUARANTEE_DAYS}
        coupon={<CouponField coupon={coupon} disabled={paying} />}
        onSubmit={(selection) => void startCheckout(selection)}
        busy={paying}
      />

      {/*
        Not closable at any point: closing it would hand back the picker while a
        payment is still being confirmed, and a second checkout is a second
        charge.
      */}
      <Dialog open={confirming || confirmed || delayed}>
        <DialogContent hideClose className="max-w-sm text-center">
          {delayed ? (
            <Clock
              className="mx-auto size-10 text-muted-foreground"
              aria-hidden
            />
          ) : confirmed ? (
            <CircleCheck className="mx-auto size-10 text-success" aria-hidden />
          ) : (
            <Loader2
              className="mx-auto size-10 animate-spin text-primary"
              aria-hidden
            />
          )}

          <DialogHeader className="sm:text-center">
            <DialogTitle>
              {delayed
                ? "Payment received"
                : confirmed
                  ? "You're subscribed"
                  : "Activating your plan…"}
            </DialogTitle>
            <DialogDescription>
              {delayed
                ? "It's taking a little longer than usual to activate. It will open on its own — there's no need to pay again."
                : confirmed
                  ? "Taking you in."
                  : "Payment went through. We're setting up your account — this usually takes a few seconds."}
            </DialogDescription>
          </DialogHeader>

          {delayed && (
            <DialogFooter className="sm:justify-center">
              <Button onClick={() => void recheck()} disabled={rechecking}>
                {rechecking && <Loader2 className="animate-spin" aria-hidden />}
                Check again
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </OnboardingLayout>
  );
}
