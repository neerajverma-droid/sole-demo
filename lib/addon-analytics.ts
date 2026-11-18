/**
 * `add_on_selected` and `add_on_added_to_plan` — the add-on cart in More.
 *
 * One place for the properties because three screens put an add-on in the
 * cart (the More grid, its detail view, the marketplace) and one pays for it;
 * each building its own payload is how the same press ends up described three
 * ways in one report.
 *
 * The price is the one charged at the plan's own interval, from the price
 * list (`addonBilledPrice`), not the card's display figure.
 */
import { addonFlags, track, type AnalyticsProps } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { addonBilledPrice } from "@/lib/addon-entitlements";
import { ADDON_GROUPS, type Addon } from "@/lib/addons";
import { activeBaseCurrency } from "@/lib/country-context";
import type { SubscriptionPlan } from "@/lib/subscription";

type PriceList = {
  catalogue: SubscriptionPlan[];
  interval: string | null;
};

export function addonEventProps(
  addons: readonly Addon[],
  { catalogue, interval }: PriceList,
): AnalyticsProps {
  const paid = addons.reduce(
    (total, addon) => total + addonBilledPrice(addon, catalogue, interval).amount,
    0,
  );
  const categories = [
    ...new Set(
      addons.map(
        (addon) =>
          ADDON_GROUPS.find((group) => group.key === addon.group)?.pill ??
          addon.group,
      ),
    ),
  ];
  return {
    ...addonFlags(addons.map((addon) => addon.slug ?? addon.id)),
    paid_amount: Math.round(paid * 100) / 100,
    currency: activeBaseCurrency(),
    category: categories.join(", ") || null,
  };
}

/** Put in the cart — not bought yet; taking it back out sends nothing. */
export function trackAddonSelected(addon: Addon, prices: PriceList): void {
  track(EVENTS.ADD_ON_SELECTED, addonEventProps([addon], prices));
}

/**
 * "Add to my plan" went through. `via_checkout` is a card payment still to
 * come on Stripe; otherwise they are on the plan now and billed from the next
 * invoice.
 */
export function trackAddonsAddedToPlan(
  addons: readonly Addon[],
  prices: PriceList,
  viaCheckout: boolean,
): void {
  if (addons.length === 0) return;
  track(EVENTS.ADD_ON_ADDED_TO_PLAN, {
    ...addonEventProps(addons, prices),
    addon_count: addons.length,
    via_checkout: viaCheckout,
  });
}
