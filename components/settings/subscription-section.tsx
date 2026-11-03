"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleCheck, Clock, Loader2, Receipt, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field } from "@/components/documents/field";
import {
  DEFAULT_PAYROLL_SEATS,
  PayrollSeatsPicker,
  type PayrollSeatsChoice,
} from "@/components/settings/payroll-seats-picker";
import { SectionCard } from "@/components/settings/section-card";
import { apiErrorMessage } from "@/lib/api-error";
import { PLAN_FEATURES } from "@/lib/settings";
import {
  CANCELLATION_OTHER,
  CANCELLATION_REASONS,
  cancelSubscription,
  createCheckoutSession,
  createPortalSession,
  describeCoupon,
  fetchAccountCoupon,
  fetchBillingHistory,
  fetchMySubscription,
  fetchSubscriptionCatalogue,
  fetchSubscriptionPlans,
  isSubscriptionActivated,
  plansForInterval,
  defaultIncludedAddons,
  selectionMonthlyTotal,
  INCLUDED_ADDON_COUNT,
  resumeSubscription,
  updateSubscriptionPlan,
  validateCoupon,
  type BillingInterval,
  type CouponCheck,
  type SubscriptionInfo,
  type SubscriptionPlan,
} from "@/lib/subscription";
import { AddonRow } from "@/components/pricing/addon-row";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { cn } from "@/lib/utils";
import { useCheckoutReturn } from "@/hooks/use-checkout-return";
import { usePayrollSeatsQuery } from "@/hooks/use-payroll-query";
import { useSubscriptionQuery } from "@/hooks/use-subscription-query";
import { useSubscriptionStore } from "@/stores/subscription";

/** Below this the trial reads as urgent, matching the banner. */
const URGENT_DAYS = 7;

/**
 * The account's plan — live, and changeable from here.
 *
 * Everything on this screen is now a real call against the same five
 * `subscription/*` routes sole-webapp's `components/Settings/Subscriptions`
 * uses: `plans` fills the picker, `history` fills the billing tab,
 * `create-session` and `manage-session` hand back a Stripe URL to navigate to,
 * and `update-session` / `cancel-session` / `resume-session` apply in place.
 * It previously showed a static feature list and three "isn't built yet"
 * toasts.
 *
 * Plan changes are only offered for a subscription bought on the web. An App
 * Store or Play one is managed on that device, and changing it here would
 * leave the two stores disagreeing — sole-webapp hides its own controls on
 * exactly the same test.
 */
export function SubscriptionSection() {
  // Single source of truth with the trial banner — both read what
  // `useSubscriptionQuery` mirrors into this store. Called here as well as in
  // the header so this screen refetches on mount; React Query dedupes it.
  const subscriptionQuery = useSubscriptionQuery();
  const subscription = useSubscriptionStore((state) => state.subscription);
  const queryClient = useQueryClient();

  const [tab, setTab] = React.useState("overview");
  const [interval, setInterval] = React.useState<BillingInterval>("monthly");
  const [selectedSlug, setSelectedSlug] = React.useState<string | null>(null);
  const [couponCode, setCouponCode] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = React.useState(false);

  /** The last coupon check — only counts while it's for the code in the box. */
  const [couponCheck, setCouponCheck] = React.useState<CouponCheck | null>(
    null,
  );
  const [checkingCoupon, setCheckingCoupon] = React.useState(false);
  const couponTrimmed = couponCode.trim();
  const couponResult = couponCheck?.code === couponTrimmed ? couponCheck : null;

  const checkCoupon = async (code: string): Promise<CouponCheck | null> => {
    const trimmed = code.trim();
    if (!trimmed) return null;
    setCheckingCoupon(true);
    try {
      const result = await validateCoupon(trimmed);
      setCouponCheck(result);
      return result;
    } catch (error) {
      toast.error(
        apiErrorMessage(error, "Couldn't check that code. Try again."),
      );
      return null;
    } finally {
      setCheckingCoupon(false);
    }
  };

  /*
   * Payroll seats ride on the plan's own Stripe subscription, so they're
   * chosen here with it. Opens on what the business already has, so changing
   * only the plan doesn't silently drop its seats.
   */
  const payrollSeatsQuery = usePayrollSeatsQuery();
  const currentPayroll = React.useMemo<PayrollSeatsChoice>(() => {
    const seats = payrollSeatsQuery.data;
    const enabled =
      !!seats && (seats.status === "ACTIVE" || seats.employeeLimit > 0);
    return {
      enabled,
      seats:
        enabled && seats
          ? Math.max(1, seats.employeeLimit)
          : DEFAULT_PAYROLL_SEATS,
      interval: seats?.billingInterval === "YEARLY" ? "annual" : "monthly",
    };
  }, [payrollSeatsQuery.data]);
  const [payroll, setPayroll] =
    React.useState<PayrollSeatsChoice>(currentPayroll);
  React.useEffect(() => setPayroll(currentPayroll), [currentPayroll]);
  // A monthly plan can only bill its seats monthly.
  const payrollChoice: PayrollSeatsChoice =
    interval === "annual" ? payroll : { ...payroll, interval: "monthly" };
  // Only once the business's real seats are known — sending 0 on the
  // strength of a lookup that hasn't landed would strip payroll off the plan.
  // Left out, the server keeps whatever seats are already there.
  const payrollSelection = payrollSeatsQuery.data
    ? {
        seats: payrollChoice.enabled ? payrollChoice.seats : 0,
        interval: payrollChoice.interval,
      }
    : undefined;
  const payrollChanged =
    payrollChoice.enabled !== currentPayroll.enabled ||
    (payrollChoice.enabled &&
      (payrollChoice.seats !== currentPayroll.seats ||
        payrollChoice.interval !== currentPayroll.interval));

  const plansQuery = useQuery({
    queryKey: ["subscription", "plans"],
    queryFn: fetchSubscriptionPlans,
  });

  /*
   * The add-on half of the same catalogue.
   *
   * This screen could change a package and its payroll seats but never an
   * add-on: the two calls below carried `subscription.addons` through
   * untouched, so what a business was billed for was decided once at checkout
   * and then unreachable from Settings. The pricing panel a NEW business sees
   * has offered this choice all along, which is what made it look like
   * something had gone missing here.
   *
   * Its own key from `plansQuery`, not a widening of it: the packages list
   * feeds the picker and the Overview tab's feature list, and one query
   * returning both would refetch all of it whenever either was needed.
   */
  const catalogueQuery = useQuery({
    queryKey: ["subscription", "catalogue"],
    queryFn: fetchSubscriptionCatalogue,
  });

  const historyQuery = useQuery({
    queryKey: ["subscription", "history"],
    queryFn: fetchBillingHistory,
    // Nothing on the first two tabs reads it, so it waits until it's asked for.
    enabled: tab === "billing",
  });

  const trialDaysLeft = subscription?.trialDaysLeft ?? null;
  const isTrialing = subscription?.isTrialing ?? false;
  const urgent = isTrialing && (trialDaysLeft ?? 0) < URGENT_DAYS;
  const isFree = subscription?.isFree ?? true;
  const isCancelled = subscription?.isCancelled ?? false;
  // Free or lapsed means there's nothing to change in place — the only way
  // forward is a checkout session.
  const needsCheckout = isFree || (subscription?.isExpired ?? false);
  const webManaged =
    !subscription?.platform ||
    subscription.platform === "WEBP" ||
    subscription.platform === "WEB";

  /*
   * A coupon the account already holds — the one it signed up with, or
   * FITREC for a Fitrec member — opens applied, the way sole-webapp's
   * Subscriptions screen pre-fills its modal. Only asked for when there's a
   * checkout to apply it to.
   */
  const accountCouponQuery = useQuery({
    queryKey: ["subscription", "account-coupon"],
    queryFn: fetchAccountCoupon,
    enabled: needsCheckout,
  });
  const couponPrefilled = React.useRef(false);
  React.useEffect(() => {
    const code = accountCouponQuery.data;
    if (!code || couponPrefilled.current) return;
    couponPrefilled.current = true;
    setCouponCode((current) => current || code);
    void checkCoupon(code);
  }, [accountCouponQuery.data]);

  const plans = React.useMemo(
    () => plansForInterval(plansQuery.data ?? [], interval),
    [plansQuery.data, interval],
  );

  const addons = React.useMemo(
    () => plansForInterval(catalogueQuery.data?.addons ?? [], interval),
    [catalogueQuery.data, interval],
  );

  /*
   * The add-ons the picker has ticked.
   *
   * Seeded from the subscription rather than starting empty, and that matters
   * more than it looks: these endpoints REPLACE the add-on array, so a picker
   * that opened with nothing ticked would take every add-on off the plan the
   * moment somebody changed their package. Null means "not seeded yet" —
   * distinct from an empty list, which is a real answer.
   */
  const [addonSlugs, setAddonSlugs] = React.useState<string[] | null>(null);

  React.useEffect(() => {
    if (addonSlugs !== null || !subscription) return;
    // Payroll rides on its own seat picker below and is never a flat add-on.
    setAddonSlugs(subscription.addons.filter((slug) => slug !== "payroll"));
  }, [subscription, addonSlugs]);

  const chosenAddons = addonSlugs ?? [];

  /**
   * Which ticks the package put there rather than the person.
   *
   * The two have to be told apart because they survive a package change
   * differently — see the effect below. Without this the picker can't
   * distinguish "I want Projects" from "Advanced gave me Projects", and a
   * downgrade carries the second kind across as a charge.
   */
  const [autoFilled, setAutoFilled] = React.useState<string[]>([]);

  /**
   * Which ones the person switched off by hand.
   *
   * The mirror of `autoFilled`, and needed for the same reason: a package
   * change refills its free slots, and without a record of what was
   * deliberately removed it refills them with exactly what was just taken out.
   */
  const [dismissed, setDismissed] = React.useState<string[]>([]);

  const toggleAddon = (slug: string) => {
    setAddonSlugs((current) => {
      const list = current ?? [];
      return list.includes(slug)
        ? list.filter((entry) => entry !== slug)
        : [...list, slug];
    });
    // Touched either way, so it stops being the package's doing: ticking it
    // makes it a choice to carry forward, unticking makes it one to respect.
    setAutoFilled((current) => current.filter((entry) => entry !== slug));
    setDismissed((current) =>
      chosenAddons.includes(slug)
        ? // It was on and is being switched off — remember that.
          [...current, slug]
        : // Switched back on, so it is wanted again.
          current.filter((entry) => entry !== slug),
    );
  };

  const addonsChanged =
    addonSlugs !== null &&
    (chosenAddons.length !==
      subscription?.addons.filter((slug) => slug !== "payroll").length ||
      chosenAddons.some(
        (slug) => !(subscription?.addons ?? []).includes(slug),
      ));

  /** The plan the picker has selected, defaulting to the one in force. */
  const selected =
    plans.find((plan) => plan.slug === selectedSlug) ??
    plans.find((plan) => plan.slug === subscription?.planSlug) ??
    plans.find((plan) => plan.slug !== "free") ??
    null;

  /**
   * The free slots a package comes with, filled in.
   *
   * An effect keyed on the package rather than work done in the click handler,
   * for a reason that only shows up on the package you are already on: a radio
   * group doesn't fire a change for the value it already holds, so clicking
   * "Compliance Bundle" while on the Compliance Bundle did nothing at all — and
   * that is exactly the case where free slots are most likely to sit unused.
   *
   * It runs on arrival too, which does arm the Update button. That is the
   * honest reading: a business on a package covering three add-ons and using
   * one has a change worth making, and the slots cost nothing. The ticks say
   * what the package includes, which is what "Included" is claiming.
   *
   * The ref keeps it to once per package — `setAddonSlugs` re-renders, and
   * without it this would undo every untick the moment it was made.
   */
  const toppedUpFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    // Waits for the seed, so the top-up builds on what is already on the plan
    // rather than on an empty list it would then send as the whole selection.
    if (addonSlugs === null || !selected || addons.length === 0) return;
    if (toppedUpFor.current === selected.slug) return;
    toppedUpFor.current = selected.slug;

    /*
     * Only what the person actually asked for survives the move.
     *
     * Everything the last package filled in is dropped first and the new
     * package's allowance is filled from scratch. That is what makes a
     * downgrade behave: Advanced hands out six free add-ons, and carrying
     * those into a package that includes none would quietly turn $0 of
     * included features into $32.94 a month of charges nobody chose.
     *
     * What's on the subscription already, and anything ticked by hand, is not
     * auto-filled and so is never dropped — downgrading still charges for
     * those, because cancelling something a business pays for to keep a total
     * tidy is the worse mistake.
     */
    const deliberate = addonSlugs.filter((slug) => !autoFilled.includes(slug));
    const next = defaultIncludedAddons(
      selected.slug,
      addons,
      deliberate,
      dismissed,
    );

    setAutoFilled(next.filter((slug) => !deliberate.includes(slug)));
    setAddonSlugs(next);
  }, [selected, addons, addonSlugs, autoFilled, dismissed]);

  /**
   * How many add-ons the selected package covers before any is charged.
   *
   * Positional, mirroring the server: the first N ticked are the free ones, by
   * the order they appear in rather than by which add-on it is.
   */
  const includedCount = selected
    ? (INCLUDED_ADDON_COUNT[selected.slug] ?? 0)
    : 0;

  /** What the picked package and add-ons come to per month, before discounts. */
  const selectionTotal = selectionMonthlyTotal(
    selected,
    chosenAddons
      .map((slug) => addons.find((addon) => addon.slug === slug))
      .filter((addon): addon is SubscriptionPlan => Boolean(addon)),
  );

  // The interval toggle opens on however the plan is actually billed, so an
  // annual subscriber isn't shown monthly prices for their own plan.
  React.useEffect(() => {
    if (subscription?.planInterval === "annual") setInterval("annual");
  }, [subscription?.planInterval]);

  /** What the current plan includes, straight off the plans endpoint. */
  const currentPlan =
    plansQuery.data?.find(
      (plan) =>
        plan.slug === subscription?.planSlug &&
        (subscription?.planInterval
          ? plan.interval === subscription.planInterval
          : true),
    ) ?? null;

  const run = async (key: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await action();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Something went wrong."));
    } finally {
      setBusy(null);
    }
  };

  // Seats ride on the plan, so a plan change can change them too.
  const refreshSubscription = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["subscription"] }),
      queryClient.invalidateQueries({ queryKey: ["payroll"] }),
      // Each business's own plan and lock state ride on the list too.
      queryClient.invalidateQueries({ queryKey: ["businesses"] }),
    ]);

  /*
   * Back from Stripe Checkout. Polled against `my-subscription` — the same
   * record the hero card and the trial banner read — because the redirect
   * lands before Stripe's webhook has written the plan.
   */
  const lastSeen = React.useRef<SubscriptionInfo | null>(null);
  const checkout = useCheckoutReturn(
    async (result) => {
      const fresh = await queryClient.fetchQuery({
        queryKey: ["subscription", "my-subscription"],
        queryFn: fetchMySubscription,
        staleTime: 0,
      });
      lastSeen.current = fresh;
      return isSubscriptionActivated(fresh, result.planSlug);
    },
    {
      onConfirmed: (result) => {
        // The conversion `upgrade_intent` was the intent for — the one moment
        // this app can say money actually changed hands.
        track(EVENTS.PLAN_UPGRADED, {
          plan: result.planSlug ?? lastSeen.current?.planSlug ?? "",
          billing: result.billing ?? undefined,
          amount: lastSeen.current?.planPrice ?? 0,
          via: "checkout",
        });
        void refreshSubscription();
      },
    },
  );

  React.useEffect(() => {
    if (checkout.phase !== "cancelled") return;
    // Straight back to the picker they left, with what they'd chosen.
    setTab("change");
    if (checkout.result?.planSlug) setSelectedSlug(checkout.result.planSlug);
    if (checkout.result?.billing) setInterval(checkout.result.billing);
    // Keyed so StrictMode's second effect run doesn't show it twice.
    toast("Checkout cancelled", {
      id: "checkout-cancelled",
      description:
        "You haven't been charged. Pick up where you left off whenever you're ready.",
    });
    checkout.dismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout.phase]);

  const onSubscribe = () =>
    run("subscribe", async () => {
      if (!selected) return;

      // Checked here rather than left to fail at Stripe: a typo should be
      // caught on this screen, not after a redirect.
      let coupon = "";
      if (couponTrimmed) {
        const check = couponResult ?? (await checkCoupon(couponTrimmed));
        if (!check) return;
        if (!check.valid) {
          toast.error(check.message);
          return;
        }
        coupon = check.code;
      }

      const url = await createCheckoutSession({
        planSlug: selected.slug,
        billing: interval,
        addons: chosenAddons,
        couponCode: coupon,
        payroll: payrollSelection,
      });

      /*
       * Intent, not conversion. Checkout is Stripe-hosted, so this app never
       * sees the moment money changes hands — the honest event is "pressed
       * subscribe and was handed over", and the drop between this and an
       * actual paid subscription is itself the number worth watching.
       *
       * Fired before the navigation rather than after: the line below throws
       * the page away, and an event queued after it may never be sent.
       */
      track(EVENTS.UPGRADE_INTENT, {
        plan: selected.slug,
        billing: interval,
        amount: selected.price,
        has_coupon: Boolean(coupon),
      });

      // Stripe-hosted, so this leaves the app rather than opening a dialog.
      window.location.href = url;
    });

  const onChangePlan = () =>
    run("change", async () => {
      if (!selected) return;
      const message = await updateSubscriptionPlan({
        planSlug: selected.slug,
        billing: interval,
        addons: chosenAddons,
        couponCode,
        payroll: payrollSelection,
      });

      /*
       * The one place a plan change actually completes inside the app — no
       * checkout round trip, so unlike `upgrade_intent` this really is the
       * conversion.
       *
       * `trackSubscription` in the old project was the only thing that would
       * have emitted this, and it was written, exported and never called
       * once. It is the reason `lib/analytics-coverage.test.ts` exists.
       */
      track(EVENTS.PLAN_UPGRADED, {
        plan: selected.slug,
        billing: interval,
        amount: selected.price,
        has_coupon: Boolean(couponCode),
      });

      await refreshSubscription();
      toast.success(message || "Plan updated");
    });

  const onManageBilling = () =>
    run("manage", async () => {
      window.location.href = await createPortalSession();
    });

  const onResume = () =>
    run("resume", async () => {
      const message = await resumeSubscription();
      await refreshSubscription();
      toast.success(message || "Plan resumed");
    });

  return (
    <SectionCard
      title="Subscription"
      description="Manage your plan, billing and payment history."
    >
      {/*
        The one place the plan state is stated: badge, plan, price and trial
        all live here, so nothing below repeats them.
      */}
      <div className="space-y-5 rounded-lg border border-hero-border bg-hero p-[15px] text-hero-foreground">
        <div className="flex flex-wrap items-start justify-between gap-[15px]">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {isTrialing && (
                <Badge className="bg-hero-foreground/15 text-hero-foreground hover:bg-hero-foreground/25">
                  Trial
                </Badge>
              )}
              {isCancelled && (
                <Badge className="bg-red-500/20 text-red-300 hover:bg-red-500/30">
                  Cancels at period end
                </Badge>
              )}
            </div>
            {/* A div, not a p: the loading skeleton inside it is a div, and a
                div inside a p is a hydration error. */}
            <div className="text-3xl font-bold tracking-tight">
              {subscriptionQuery.isPending && !subscription ? (
                <Skeleton className="h-8 w-40 bg-hero-foreground/10" />
              ) : (
                (subscription?.planName ?? "Free plan")
              )}
            </div>
          </div>
          {/*
            What the next invoice comes to, which is the package PLUS whatever
            add-ons it doesn't cover. This showed `planPrice` — the package on
            its own — so a business on the bundle with two charged add-ons was
            told it paid $24.99. The server does this arithmetic itself and
            that figure is the one it will bill, so it is the one shown; the
            package price is the fallback when an older deployment sends no
            billing block.
          */}
          <div className="text-right">
            <p className="text-3xl font-bold tracking-tight tabular">
              $
              {(
                subscription?.nextBillingAmount ??
                subscription?.planPrice ??
                0
              ).toFixed(2)}
              <span className="text-sm font-normal text-hero-foreground/60">
                {" "}
                /{subscription?.planInterval === "annual" ? "yr" : "mo"}
              </span>
            </p>
            {/* Only when add-ons are actually adding to it — "+ $0 in add-ons"
                is a line about nothing. */}
            {!!subscription?.addonsTotal && (
              <p className="text-xs text-hero-foreground/60 tabular">
                ${subscription.planPrice.toFixed(2)} plan + $
                {subscription.addonsTotal.toFixed(2)} add-ons
              </p>
            )}
          </div>
        </div>

        {isTrialing && trialDaysLeft != null ? (
          <p className="flex items-center gap-2 text-sm">
            <Clock
              className={cn(
                "size-4 shrink-0",
                urgent ? "text-red-400" : "text-hero-foreground/60",
              )}
              aria-hidden
            />
            <span
              className={urgent ? "text-red-400" : "text-hero-foreground/80"}
            >
              <span className="font-semibold tabular">
                {trialDaysLeft} {trialDaysLeft === 1 ? "day" : "days"}
              </span>{" "}
              left in your free trial
            </span>
          </p>
        ) : (
          subscription?.subscriptionDueDate && (
            <p className="flex items-center gap-2 text-sm text-hero-foreground/80">
              <Clock
                className="size-4 shrink-0 text-hero-foreground/60"
                aria-hidden
              />
              {isCancelled ? "Access ends" : "Renews"} on{" "}
              <span className="font-semibold">
                {formatDate(subscription.subscriptionDueDate)}
              </span>
            </p>
          )
        )}

        <div className="flex flex-wrap gap-2">
          {webManaged ? (
            <>
              <Button disabled={busy !== null} onClick={() => setTab("change")}>
                {needsCheckout ? "Subscribe now" : "Change plan"}
              </Button>
              {!needsCheckout && (
                <Button
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => void onManageBilling()}
                >
                  {busy === "manage" && (
                    <Loader2 className="animate-spin" aria-hidden />
                  )}
                  Manage billing
                </Button>
              )}
              {!needsCheckout &&
                (isCancelled ? (
                  <Button
                    variant="secondary"
                    disabled={busy !== null}
                    onClick={() => void onResume()}
                  >
                    {busy === "resume" && (
                      <Loader2 className="animate-spin" aria-hidden />
                    )}
                    Resume plan
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    className="text-hero-foreground/70 hover:bg-hero-foreground/10 hover:text-hero-foreground"
                    disabled={busy !== null}
                    onClick={() => setCancelOpen(true)}
                  >
                    Cancel plan
                  </Button>
                ))}
            </>
          ) : (
            <p className="text-sm text-hero-foreground/80">
              This subscription was bought in the{" "}
              {subscription?.platform?.startsWith("IOS")
                ? "App Store"
                : "Play Store"}
              . Manage it there — changes made here wouldn&apos;t reach it.
            </p>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="change">Change plan</TabsTrigger>
          <TabsTrigger value="billing">Billing history</TabsTrigger>
        </TabsList>

        {/* What the plan actually includes — the tab earns its place. */}
        <TabsContent value="overview" className="space-y-[15px]">
          <PlanAddons
            slugs={subscription?.addons ?? []}
            catalogue={catalogueQuery.data?.addons ?? []}
            interval={subscription?.planInterval ?? "monthly"}
            includedCount={
              INCLUDED_ADDON_COUNT[subscription?.planSlug ?? "free"] ?? 0
            }
            loading={catalogueQuery.isPending}
            onChange={() => setTab("change")}
          />

          {plansQuery.isPending ? (
            <PlanFeatureSkeleton />
          ) : currentPlan ? (
            <FeatureList
              includes={currentPlan.includes}
              excludes={currentPlan.excludes}
              planName={currentPlan.name}
            />
          ) : (
            /* The plans endpoint doesn't describe the free tier on every
               account, so this is the static list it falls back to. */
            <FeatureList
              includes={PLAN_FEATURES.filter((f) => f.included).map(
                (f) => f.label,
              )}
              excludes={PLAN_FEATURES.filter((f) => !f.included).map(
                (f) => f.label,
              )}
              planName={subscription?.planName ?? "Free plan"}
            />
          )}
        </TabsContent>

        <TabsContent value="change" className="space-y-[15px]">
          {!webManaged ? (
            <p className="rounded-md border p-4 text-sm text-muted-foreground">
              Plan changes aren&apos;t available for a subscription bought on a
              phone. Open it in the store you bought it from.
            </p>
          ) : (
            <>
              <ToggleGroup
                type="single"
                value={interval}
                onValueChange={(value) =>
                  value && setInterval(value as BillingInterval)
                }
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="monthly">Monthly</ToggleGroupItem>
                <ToggleGroupItem value="annual">Annual</ToggleGroupItem>
              </ToggleGroup>

              {plansQuery.isPending ? (
                <PlanFeatureSkeleton />
              ) : plans.length === 0 ? (
                <p className="rounded-md border p-4 text-sm text-muted-foreground">
                  No plans came back from the server. Try again in a moment.
                </p>
              ) : (
                <ul className="space-y-2">
                  {plans.map((plan) => (
                    <li key={plan.slug}>
                      <PlanRow
                        plan={plan}
                        active={selected?.slug === plan.slug}
                        current={plan.slug === subscription?.planSlug}
                        onSelect={() => setSelectedSlug(plan.slug)}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {/*
                The add-ons, which this screen could never change until now.
                Same row the pricing panel draws, so "Included" means the same
                thing in both places.
              */}
              {addons.length > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="text-sm font-semibold">Add-ons</h4>
                    <p className="text-xs text-muted-foreground">
                      {includedCount === Number.POSITIVE_INFINITY
                        ? `Every add-on is included with ${selected?.name}.`
                        : includedCount > 0
                          ? `${selected?.name} includes ${includedCount} — anything past that is charged.`
                          : "Switch on what this business needs."}
                    </p>
                  </div>

                  <ul className="space-y-2">
                    {addons.map((addon) => {
                      const position = chosenAddons.indexOf(addon.slug);
                      return (
                        <li key={addon.slug}>
                          <AddonRow
                            addon={addon}
                            checked={position !== -1}
                            includedInPlan={
                              position !== -1 && position < includedCount
                            }
                            onToggle={() => toggleAddon(addon.slug)}
                            discount={1}
                            disabled={busy !== null}
                          />
                        </li>
                      );
                    })}
                  </ul>

                  {/*
                    What the picked package and add-ons come to, before any
                    coupon. Here rather than only on the button, because the
                    number moves as add-ons are ticked and the button says what
                    the change IS rather than what it costs.
                  */}
                  <p className="pt-1 text-sm text-muted-foreground">
                    New total{" "}
                    <span className="font-semibold text-foreground tabular">
                      ${selectionTotal.toFixed(2)}
                    </span>{" "}
                    / month
                    {interval === "annual" && " (billed annually)"}
                  </p>
                </div>
              )}

              <PayrollSeatsPicker
                value={payrollChoice}
                onChange={setPayroll}
                planInterval={interval}
                disabled={busy !== null || payrollSeatsQuery.isPending}
              />

              {/* Only where there's a checkout to apply it to — a plan change
                  happens in place, and Stripe doesn't take a code there. */}
              {needsCheckout && (
                <div className="sm:max-w-sm">
                  <Field
                    label="Coupon code"
                    htmlFor="subscription-coupon"
                    error={
                      couponResult && !couponResult.valid
                        ? couponResult.message
                        : undefined
                    }
                    hint={
                      couponResult?.valid
                        ? undefined
                        : "Optional — checked before you're sent to payment."
                    }
                  >
                    <div className="flex gap-2">
                      <Input
                        id="subscription-coupon"
                        value={couponCode}
                        placeholder="SOLE10"
                        aria-invalid={!!couponResult && !couponResult.valid}
                        onChange={(event) => setCouponCode(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void checkCoupon(couponCode);
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          !couponTrimmed ||
                          checkingCoupon ||
                          !!couponResult?.valid
                        }
                        onClick={() => void checkCoupon(couponCode)}
                      >
                        {checkingCoupon && (
                          <Loader2 className="animate-spin" aria-hidden />
                        )}
                        {couponResult?.valid ? "Applied" : "Apply"}
                      </Button>
                    </div>
                    {couponResult?.valid && (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-success">
                        <Check className="size-3.5 shrink-0" aria-hidden />
                        {couponResult.code} —{" "}
                        {describeCoupon(couponResult.discount)}
                      </p>
                    )}
                  </Field>
                </div>
              )}

              <Button
                disabled={
                  busy !== null ||
                  !selected ||
                  (selected.slug === subscription?.planSlug &&
                    interval === subscription?.planInterval &&
                    !payrollChanged &&
                    !addonsChanged)
                }
                onClick={() =>
                  void (needsCheckout ? onSubscribe() : onChangePlan())
                }
              >
                {(busy === "subscribe" || busy === "change") && (
                  <Loader2 className="animate-spin" aria-hidden />
                )}
                {needsCheckout
                  ? "Continue to checkout"
                  : selected?.slug === subscription?.planSlug &&
                      interval === subscription?.planInterval
                    ? /* Same package, same interval — so the change is the
                         add-ons, the seats, or both. Naming only payroll here
                         was wrong the moment add-ons became changeable. */
                      addonsChanged && payrollChanged
                      ? "Update add-ons and seats"
                      : addonsChanged
                        ? "Update add-ons"
                        : "Update payroll seats"
                    : `Switch to ${selected?.name ?? "this plan"}`}
              </Button>
            </>
          )}
        </TabsContent>

        <TabsContent value="billing">
          {historyQuery.isPending ? (
            <PlanFeatureSkeleton />
          ) : (historyQuery.data?.length ?? 0) === 0 ? (
            <div className="rounded-md border p-6 text-center">
              <Receipt
                className="mx-auto size-8 text-muted-foreground"
                aria-hidden
              />
              <p className="mt-2 text-sm font-medium">No billing history yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Invoices and receipts appear here once you&apos;re on a paid
                plan.
              </p>
            </div>
          ) : (
            <ul className="divide-y rounded-md border">
              {historyQuery.data?.map((event) => (
                <li
                  key={event.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium capitalize">
                      {event.type.replace(/_/g, " ")}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[formatDate(event.date), event.plan]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {event.amount != null && (
                    <p className="shrink-0 text-sm font-medium tabular">
                      ${event.amount.toFixed(2)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        endsOn={subscription?.subscriptionDueDate ?? null}
        onConfirmed={async () => {
          await refreshSubscription();
          setCancelOpen(false);
        }}
      />

      <CheckoutReturnDialog
        phase={checkout.phase}
        planName={subscription?.planName ?? null}
        onClose={checkout.dismiss}
      />
    </SectionCard>
  );
}

/**
 * What coming back from Stripe looks like: a wait while the webhook switches
 * the plan on, then confirmation — or, if it's slow, an honest "it's coming"
 * rather than a spinner that never ends or a prompt to pay again.
 */
function CheckoutReturnDialog({
  phase,
  planName,
  onClose,
}: {
  phase: ReturnType<typeof useCheckoutReturn>["phase"];
  planName: string | null;
  onClose: () => void;
}) {
  const confirming = phase === "confirming";
  const open = confirming || phase === "confirmed" || phase === "delayed";

  return (
    <Dialog
      open={open}
      // Can't be dismissed mid-confirmation: closing it wouldn't stop the
      // plan switching on, and would leave the page claiming the old plan.
      onOpenChange={(next) => !next && !confirming && onClose()}
    >
      <DialogContent hideClose={confirming} className="max-w-sm text-center">
        {confirming ? (
          <Loader2
            className="mx-auto size-10 animate-spin text-primary"
            aria-hidden
          />
        ) : phase === "confirmed" ? (
          <CircleCheck className="mx-auto size-10 text-success" aria-hidden />
        ) : (
          <Clock
            className="mx-auto size-10 text-muted-foreground"
            aria-hidden
          />
        )}

        <DialogHeader className="sm:text-center">
          <DialogTitle>
            {confirming
              ? "Finishing your subscription…"
              : phase === "confirmed"
                ? "You're all set"
                : "Payment received"}
          </DialogTitle>
          <DialogDescription>
            {confirming
              ? "Payment went through. We're switching your plan on — this usually takes a few seconds."
              : phase === "confirmed"
                ? `${planName ?? "Your plan"} is now active.`
                : "Your plan is taking a little longer than usual to switch on. It'll show here on its own within a few minutes — there's no need to pay again."}
          </DialogDescription>
        </DialogHeader>

        {!confirming && (
          <DialogFooter className="sm:justify-center">
            <Button onClick={onClose}>Done</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

/**
 * The add-ons on this plan, and what each one costs.
 *
 * The Overview tab used to be a feature list and nothing else, so a business
 * paying for three add-ons had no way to see them — the only mention of an
 * add-on anywhere on this screen was a field being carried, invisibly, through
 * a plan change.
 *
 * Each row says whether the package covers it. That matters more than it
 * sounds: the allowance is positional on the server, so "Accounting is free
 * but KM Tracker isn't" is a fact about the ORDER they were added in, not
 * about the add-ons. Showing it per row is the only honest way to render a
 * rule like that.
 *
 * Renders an empty state rather than nothing at all. Someone looking at this
 * tab for their add-ons needs an answer, and a section that disappears when
 * the answer is "none" reads as a section that failed to load.
 */
function PlanAddons({
  slugs,
  catalogue,
  interval,
  includedCount,
  loading,
  onChange,
}: {
  /** The subscription's own slugs — the authoritative list. */
  slugs: string[];
  catalogue: SubscriptionPlan[];
  interval: string;
  includedCount: number;
  loading: boolean;
  /** Takes them to the tab where add-ons are chosen. */
  onChange: () => void;
}) {
  /*
   * Payroll is billed per seat through its own picker, so it is not one of
   * these rows — listing it here would price it as a flat monthly add-on.
   */
  const billable = slugs.filter((slug) => slug !== "payroll");

  const rows = billable.map((slug, index) => {
    const wanted = interval === "annual" ? "annual" : "monthly";
    const plan =
      catalogue.find((row) => row.slug === slug && row.interval === wanted) ??
      catalogue.find((row) => row.slug === slug) ??
      null;

    return {
      slug,
      // A slug the catalogue hasn't got a row for is still on the plan and
      // still billed; showing its id beats dropping it from the list.
      name: plan?.name ?? slug,
      description: plan?.description ?? "",
      price: plan?.monthlyPrice ?? null,
      included: index < includedCount,
    };
  });

  return (
    <SectionCard
      title="Add-ons"
      description={
        rows.length === 0
          ? "None on this plan yet."
          : includedCount === Number.POSITIVE_INFINITY
            ? "Every add-on is included with your package."
            : includedCount > 0
              ? `Your package covers ${includedCount} — anything past that is charged.`
              : "Charged on top of your package."
      }
      action={
        <Button variant="outline" size="sm" onClick={onChange}>
          {rows.length === 0 ? "Add one" : "Change"}
        </Button>
      }
    >
      {loading ? (
        <PlanFeatureSkeleton />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add-ons switch on parts of Sole your package doesn&apos;t include —
          time tracking, projects, a vehicle logbook.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.slug}
              className="flex items-start justify-between gap-3 rounded-lg border p-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{row.name}</span>
                {row.description && (
                  <span className="block text-xs leading-relaxed text-muted-foreground">
                    {row.description}
                  </span>
                )}
              </span>
              {row.included ? (
                <span className="shrink-0 text-xs font-semibold text-success">
                  Included
                </span>
              ) : (
                <span className="shrink-0 text-sm font-semibold tabular">
                  {row.price === null ? "—" : `$${row.price.toFixed(2)}`}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function PlanRow({
  plan,
  active,
  current,
  onSelect,
}: {
  plan: SubscriptionPlan;
  active: boolean;
  /** The plan in force — labelled so the picker says where you already are. */
  current: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={plan.comingSoon}
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "w-full rounded-lg border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        plan.comingSoon
          ? "cursor-not-allowed border-dashed opacity-60"
          : active
            ? "border-primary bg-primary/5"
            : "hover:border-muted-foreground/40",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid size-4 shrink-0 place-items-center rounded-full border-2",
            active ? "border-primary" : "border-muted-foreground/40",
          )}
          aria-hidden
        >
          {active && <span className="size-2 rounded-full bg-primary" />}
        </span>

        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{plan.name}</span>
          {current && (
            <Badge variant="secondary" className="shrink-0">
              Current
            </Badge>
          )}
          {plan.badge && <Badge className="shrink-0">{plan.badge}</Badge>}
          {plan.comingSoon && (
            <Badge variant="outline" className="shrink-0">
              Coming soon
            </Badge>
          )}
        </span>

        <span className="shrink-0 text-sm font-semibold tabular">
          ${plan.monthlyPrice.toFixed(2)}
          <span className="text-xs font-normal text-muted-foreground">/mo</span>
        </span>
      </div>

      {active && (plan.includes.length > 0 || plan.excludes.length > 0) && (
        <div className="mt-3 space-y-1.5 pl-7">
          {plan.includes.map((feature) => (
            <p
              key={feature}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <Check className="size-3.5 shrink-0 text-success" aria-hidden />
              {feature}
            </p>
          ))}
          {plan.excludes.map((feature) => (
            <p
              key={feature}
              className="flex items-center gap-2 text-xs text-muted-foreground/70"
            >
              <X className="size-3.5 shrink-0" aria-hidden />
              {feature}
            </p>
          ))}
        </div>
      )}
    </button>
  );
}

function FeatureList({
  includes,
  excludes,
  planName,
}: {
  includes: string[];
  excludes: string[];
  planName: string;
}) {
  const total = includes.length + excludes.length;

  return (
    <>
      <p className="text-sm text-muted-foreground tabular">
        {includes.length} of {total} features included on {planName}.
      </p>
      <ul className="divide-y rounded-md border">
        {includes.map((feature) => (
          <li key={feature} className="flex items-center gap-3 px-3 py-2.5">
            <Check
              className="size-4 shrink-0 text-success"
              aria-label="Included"
            />
            <span className="text-sm">{feature}</span>
          </li>
        ))}
        {excludes.map((feature) => (
          <li key={feature} className="flex items-center gap-3 px-3 py-2.5">
            <X
              className="size-4 shrink-0 text-muted-foreground"
              aria-label="Not included"
            />
            <span className="text-sm text-muted-foreground">{feature}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function PlanFeatureSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} className="h-12 w-full rounded-md" />
      ))}
    </div>
  );
}

/**
 * Why, then confirm — the same two-step sole-webapp's
 * `CancellationReasonDialog` runs, because the reason is posted to
 * `cancel-feedback` before the cancellation itself.
 */
function CancelDialog({
  open,
  onOpenChange,
  endsOn,
  onConfirmed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endsOn: string | null;
  onConfirmed: () => Promise<void>;
}) {
  const [reason, setReason] = React.useState<string>(CANCELLATION_REASONS[0]);
  const [otherText, setOtherText] = React.useState("");
  const [cancelling, setCancelling] = React.useState(false);

  const blocked = reason === CANCELLATION_OTHER && !otherText.trim();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel your plan?</AlertDialogTitle>
          <AlertDialogDescription>
            {endsOn
              ? `You keep full access until ${formatDate(endsOn)}, then drop to the free plan.`
              : "You keep full access until the end of the period you've paid for, then drop to the free plan."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <p className="text-sm font-medium">Why are you cancelling?</p>
          <ul className="space-y-1.5">
            {CANCELLATION_REASONS.map((option) => (
              <li key={option}>
                <button
                  type="button"
                  onClick={() => {
                    setReason(option);
                    if (option !== CANCELLATION_OTHER) setOtherText("");
                  }}
                  aria-pressed={reason === option}
                  className={cn(
                    "w-full rounded-md border px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    reason === option
                      ? "border-primary bg-primary/5 font-medium"
                      : "hover:border-muted-foreground/40",
                  )}
                >
                  {option}
                </button>
              </li>
            ))}
          </ul>

          {reason === CANCELLATION_OTHER && (
            <Input
              value={otherText}
              placeholder="Tell us what happened"
              onChange={(event) => setOtherText(event.target.value)}
            />
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancelling}>
            Keep my plan
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={cancelling || blocked}
            onClick={async (event) => {
              // Prevent the AlertDialog from auto-closing on click.
              event.preventDefault();
              setCancelling(true);
              try {
                const message = await cancelSubscription(reason, otherText);
                await onConfirmed();
                toast.success(message || "Plan cancelled");
              } catch (error) {
                toast.error(
                  apiErrorMessage(error, "Couldn't cancel your plan."),
                );
              } finally {
                setCancelling(false);
              }
            }}
          >
            {cancelling && <Loader2 className="animate-spin" aria-hidden />}
            Cancel plan
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** ISO (or full timestamp) to `5 Oct 2026`. Empty for anything unparseable. */
function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
