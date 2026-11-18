"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";

import { pinnedNavIdsAtom } from "@/lib/atoms";
import { ADDONS, addonById } from "@/lib/addons";
import {
  addonBillingMode,
  addedMonthlyCost,
  currentMonthlyCost,
  idsForSlugs,
  nextAddonSlugs,
  SEAT_BILLED_SLUGS,
  type AddonBillingMode,
} from "@/lib/addon-entitlements";
import {
  createCheckoutSession,
  fetchSubscriptionCatalogue,
  updateSubscriptionPlan,
  type SubscriptionInfo,
  type SubscriptionPlan,
} from "@/lib/subscription";
import { useAccess } from "@/hooks/use-access";
import { useSubscriptionQuery } from "@/hooks/use-subscription-query";

/**
 * The add-ons this business has, and the two ways to change that.
 *
 * One hook rather than an atom, because what it reports is not local state: it
 * is the subscription, which lives on the server, is scoped to the open
 * business, and can change from Stripe, from the pricing screen, or from
 * another device. The `addedAddonsAtom` this replaces was a localStorage list
 * that only ever agreed with the plan by coincidence.
 *
 * Writes go through the subscription too. There is no "buy one add-on"
 * endpoint — `update-session` and `create-session` both take the COMPLETE
 * desired array and replace what's there — so every call here reads the
 * current slugs and sends the union. See `nextAddonSlugs` for why skipping that
 * silently cancels everything else the business pays for.
 */

export type AddonState = {
  /** Card ids currently on the plan — what the rail draws and the cards unlock. */
  activeIds: string[];
  /**
   * Card ids the package itself includes — unlocked by the plan's
   * `allowed_features`, not bought as an add-on, so there's nothing to remove.
   * Never overlaps `activeIds`. Empty until the profile has been read.
   */
  includedIds: string[];
  /** The raw subscription slugs, including ones this app has no card for. */
  activeSlugs: string[];
  /** False until the subscription has been read once. Cards stay locked until then. */
  ready: boolean;
  subscription: SubscriptionInfo | null;
  catalogue: SubscriptionPlan[];
  mode: AddonBillingMode;
  /** True while a purchase or removal is in flight. */
  busy: boolean;
  /**
   * Ask the server again, now.
   *
   * For a surface that is mounted long before it is looked at. The shared
   * subscription is cached for five minutes and doesn't refetch on focus, so a
   * modal that lives beside the sidebar can open onto a plan that changed in
   * another tab, on another device, or in the seconds after a Stripe webhook
   * landed — and an add-on catalogue is exactly where that matters, because
   * every card's state is a claim about what the business is paying for.
   */
  refresh: () => void;
  has: (id: string) => boolean;
  /** What these card ids would ADD to the monthly bill, allowance applied. */
  costOf: (ids: string[]) => number;
  /** What the add-ons already on the plan cost per month. Not the same sum. */
  currentCost: number;
  /**
   * Put these on the plan.
   *
   * On a live Stripe subscription the items are added in place and this
   * resolves — the add-on is usable immediately and lands on the next invoice,
   * because the server adds it with `proration_behavior: 'none'` and takes no
   * money today. Anywhere else it returns a checkout URL for the caller to
   * navigate to; nothing is on the plan until they come back through Stripe.
   */
  buy: (ids: string[]) => Promise<{ checkoutUrl?: string }>;
  /** Take one off the plan. Same replace-the-whole-list rule. */
  remove: (id: string) => Promise<void>;
};

export function useAddons(): AddonState {
  const queryClient = useQueryClient();
  const subscriptionQuery = useSubscriptionQuery();
  const subscription = subscriptionQuery.data ?? null;
  const setPinned = useSetAtom(pinnedNavIdsAtom);

  /*
   * The price list. Its own query because it is the same for everybody and
   * changes about never, where the subscription is per business and changes
   * whenever a plan does — one query holding both would refetch the catalogue
   * on every purchase. Stale time is long for the same reason.
   */
  const catalogueQuery = useQuery({
    queryKey: ["subscription", "catalogue"],
    queryFn: fetchSubscriptionCatalogue,
    staleTime: 1000 * 60 * 30,
  });

  const activeSlugs = React.useMemo(
    () =>
      (subscription?.addons ?? []).filter(
        (slug) => !SEAT_BILLED_SLUGS.has(slug),
      ),
    [subscription],
  );
  const activeIds = React.useMemo(
    () => idsForSlugs(activeSlugs),
    [activeSlugs],
  );
  const catalogue = catalogueQuery.data?.addons ?? [];

  /*
   * What the package unlocks without an add-on, from the server's feature list
   * rather than a copy of its plan table here. Waits for the profile: the
   * access hook is permissive before it loads, which would flash every card as
   * included.
   */
  const access = useAccess();
  const includedIds = access.ready
    ? ADDONS.filter(
        (addon) =>
          addon.feature &&
          !activeIds.includes(addon.id) &&
          access.hasFeature(addon.feature),
      ).map((addon) => addon.id)
    : [];

  /*
   * Both writes refetch the subscription rather than patching a local copy of
   * it. The server does more than echo the list back — the free-add-on
   * allowance, the billing total and the next invoice date all move — and a
   * hand-rolled optimistic value would be a second, worse answer to a question
   * the next refetch settles anyway.
   */
  const settle = React.useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["subscription", "my-subscription"],
        }),
        // The feature list moves with the plan, and decides `includedIds`.
        queryClient.invalidateQueries({ queryKey: ["access-profile"] }),
      ]),
    [queryClient],
  );

  /*
   * Both the subscription and the price list, because the two are read
   * together: the catalogue's stale time is half an hour, and a card priced
   * from a figure that moved since is a card arguing with the invoice.
   */
  const refresh = React.useCallback(() => {
    void settle();
    void queryClient.invalidateQueries({
      queryKey: ["subscription", "catalogue"],
    });
  }, [queryClient, settle]);

  const mode = addonBillingMode(subscription);

  const buyMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const slugs = ids
        .map((id) => addonById(id)?.slug)
        .filter((slug): slug is string => !!slug);

      let wanted = activeSlugs;
      for (const slug of slugs) wanted = nextAddonSlugs(wanted, { add: slug });

      /*
       * A plan change needs a plan to change. `planSlug` is whatever they're on
       * — the point is to add items to that subscription, not to move them to
       * a different package behind their back.
       */
      const selection = {
        planSlug: subscription?.planSlug ?? "free",
        billing: (subscription?.planInterval === "annual"
          ? "annual"
          : "monthly") as "annual" | "monthly",
        addons: wanted,
      };

      if (mode === "in-place") {
        await updateSubscriptionPlan(selection);
        return {};
      }

      // No live subscription to add to: Stripe Checkout buys the plan and the
      // add-ons together. Nothing is on the plan until they return through it,
      // so this resolves with a URL rather than with a purchase.
      const checkoutUrl = await createCheckoutSession(selection);
      return { checkoutUrl };
    },
    onSuccess: (result) => {
      if (!result.checkoutUrl) void settle();
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const slug = addonById(id)?.slug;
      if (!slug) return;

      await updateSubscriptionPlan({
        planSlug: subscription?.planSlug ?? "free",
        billing: subscription?.planInterval === "annual" ? "annual" : "monthly",
        addons: nextAddonSlugs(activeSlugs, { remove: slug }),
      });
    },
    onSuccess: (_result, id) => {
      /*
       * Clear any pin stored under the add-on's id. Add-ons aren't pinnable
       * now, but a pin written before that changed would otherwise sit in the
       * list forever — invisible, because `pinTargets` won't resolve it, and
       * no less wrong for it. Carried over from `removeAddonAtom`, which this
       * replaced.
       */
      setPinned((current) => current.filter((pinnedId) => pinnedId !== id));
      void settle();
    },
  });

  const ready = subscriptionQuery.isSuccess;

  return {
    activeIds,
    includedIds,
    activeSlugs,
    ready,
    subscription,
    catalogue,
    mode,
    busy: buyMutation.isPending || removeMutation.isPending,
    refresh,
    /*
     * Locked until the subscription has been read. The other way round would
     * flash every card as owned on a slow connection and let someone open an
     * add-on they don't have — and `activeIds` being empty before the first
     * read is indistinguishable from owning none.
     */
    has: (id: string) => ready && activeIds.includes(id),
    costOf: (ids: string[]) =>
      addedMonthlyCost(
        subscription,
        ids
          .map((id) => addonById(id)?.slug)
          .filter((slug): slug is string => !!slug),
        catalogue,
      ),
    currentCost: currentMonthlyCost(subscription, catalogue),
    buy: (ids: string[]) => buyMutation.mutateAsync(ids),
    remove: (id: string) =>
      removeMutation.mutateAsync(id).then(() => undefined),
  };
}
