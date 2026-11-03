/**
 * Which add-ons this business actually has, and what it costs to change that.
 *
 * The More modal used to answer the first question from `localStorage`: a list
 * of ids written when someone pressed Select, read back as "on your plan". It
 * agreed with the subscription only by accident. Someone already paying for the
 * asset register saw a locked card asking them to buy it; someone who pressed
 * Select on a different laptop saw nothing at all; and a card could say "on your
 * plan" against a subscription that had never heard of it.
 *
 * The subscription is the answer now. `user_subscriptions.addons` holds the
 * slugs Stripe bills against, it arrives on every `my-subscription` read, and
 * it is per business — which is the right scope, because the plan is.
 *
 * ── The two catalogues ──────────────────────────────────────────────────────
 *
 * `lib/addons.ts` is the shop window: copy, art, benefits, the long detail
 * view. `user_subscription_plans` is the price list: slug, interval, price,
 * what Stripe charges. They are joined by `Addon.slug` and nothing else, and
 * either can hold a row the other doesn't:
 *
 * - Backend-only (`accounting`, `inventory`, `crypto`) — billable, no card
 *   written for them yet. They stay on the plan untouched; this module never
 *   sends a list that would drop one.
 * - Card-only (an add-on with no `slug`) — nothing to sell it against, so it
 *   can't be bought. `purchasableAddons` leaves it out rather than offering a
 *   button that would 400.
 *
 * ── Payroll ────────────────────────────────────────────────────────────────
 *
 * Billed per employee seat through `/payroll/subscription/*`, never as a flat
 * add-on — the backend strips it from any add-on list it's sent. So it is
 * excluded here too, at the one place that builds those lists, rather than
 * being filtered again at each call site.
 */

import { ADDONS, addonById, type Addon } from "@/lib/addons";
import {
  type SubscriptionInfo,
  type SubscriptionPlan,
} from "@/lib/subscription";

/**
 * Billed per seat, so it never travels in an add-on array.
 *
 * `lib/subscription.ts` drops it on the way out too, and the server drops it on
 * the way in. Three guards for one rule is two too many, but the one that
 * matters is this one: it's the only one that also keeps payroll out of the
 * card's own buy button.
 */
export const SEAT_BILLED_SLUGS = new Set(["payroll"]);

/** Every add-on with a slug the backend could bill, payroll aside. */
export function purchasableAddons(): Addon[] {
  return ADDONS.filter(
    (addon) => addon.slug && !SEAT_BILLED_SLUGS.has(addon.slug),
  );
}

/** The card for a subscription slug, when one has been written. */
export function addonBySlug(slug: string): Addon | undefined {
  return ADDONS.find((addon) => addon.slug === slug);
}

/**
 * The slugs behind a list of card ids, dropping any the backend can't bill.
 *
 * Deduped, because the same slug reaching Stripe twice is a second subscription
 * item for one add-on.
 */
export function slugsForIds(ids: string[]): string[] {
  const slugs = ids
    .map((id) => addonById(id)?.slug)
    .filter((slug): slug is string => !!slug && !SEAT_BILLED_SLUGS.has(slug));
  return [...new Set(slugs)];
}

/**
 * The card ids a subscription's slugs resolve to.
 *
 * A slug with no card is dropped — it's on the plan and billed either way, this
 * just has nothing to draw for it.
 */
export function idsForSlugs(slugs: string[] = []): string[] {
  return slugs
    .map((slug) => addonBySlug(slug)?.id)
    .filter((id): id is string => !!id);
}

/**
 * The full add-on list to send for a change, given what's on the plan now.
 *
 * `update-session` and `create-session` both REPLACE the add-on array rather
 * than merging into it, so every call has to carry the slugs being kept as well
 * as the one being changed. Reading the current list and sending the union back
 * is not an optimisation — leaving it out silently cancels every other add-on
 * the business pays for, including the ones this app has no card for.
 *
 * Which is why `current` is the subscription's own slugs, not the resolved card
 * ids: `accounting` has no card, and a list rebuilt from cards alone would drop
 * it on the first purchase anybody made.
 */
export function nextAddonSlugs(
  current: string[] = [],
  change: { add?: string; remove?: string },
): string[] {
  const next = new Set(current.filter((slug) => !SEAT_BILLED_SLUGS.has(slug)));
  if (change.add) next.add(change.add);
  if (change.remove) next.delete(change.remove);
  return [...next];
}

/**
 * What a business can do about its add-ons right now.
 *
 * `canChangeInPlace` is the question the buy button asks: a subscription Stripe
 * is already billing can have an item added to it, and anything else — free,
 * expired, never subscribed — has to go through checkout first, because
 * `update-session` 400s without a `stripe_subscription_id`.
 *
 * A trial counts as in place. It's a real Stripe subscription with a card
 * against it; the add-on joins it and bills when the trial does.
 *
 * An App Store or Play subscription is neither: it can't be changed from here
 * at all, and the honest answer is to say so rather than to fail at the call.
 */
export type AddonBillingMode = "in-place" | "checkout" | "store-managed";

export function addonBillingMode(
  subscription: SubscriptionInfo | null,
): AddonBillingMode {
  if (!subscription) return "checkout";
  if (subscription.platform && subscription.platform !== "WEBP") {
    return "store-managed";
  }
  const live =
    subscription.status === "active" || subscription.status === "trialing";
  return live && !subscription.isFree ? "in-place" : "checkout";
}

/**
 * What an add-on costs, from the price list rather than from the card.
 *
 * The card's `priceMonthly` is copy — written by hand, and wrong the moment
 * anybody edits a price in the database. The catalogue row is what Stripe
 * charges. The card's figure stays as the fallback for the window before the
 * catalogue lands, and for an add-on the price list has no row for.
 *
 * Matched on slug AND interval: every add-on has two rows, monthly and annual,
 * and taking the first match would quote the annual price to a monthly plan.
 */
export function addonMonthlyPrice(
  addon: Addon,
  catalogue: SubscriptionPlan[] = [],
  interval: string | null = "monthly",
): number {
  return addon.slug
    ? monthlyPriceForSlug(addon.slug, catalogue, interval, addon.priceMonthly)
    : addon.priceMonthly;
}

/**
 * The same, for a slug that may have no card.
 *
 * `accounting`, `inventory` and `crypto` are billable with nothing written for
 * them here, so pricing through the card returns nothing and a total built that
 * way quietly reports a business paying $7.99 a month as paying zero. The price
 * list knows them; the card is only needed for the fallback.
 *
 * `fallback` is that card's own figure where there is one, and 0 otherwise —
 * which is the honest answer for a slug neither catalogue has heard of, rather
 * than a number invented for it.
 */
export function monthlyPriceForSlug(
  slug: string,
  catalogue: SubscriptionPlan[] = [],
  interval: string | null = "monthly",
  fallback = 0,
): number {
  const wanted = interval === "annual" ? "annual" : "monthly";
  const row =
    catalogue.find((plan) => plan.slug === slug && plan.interval === wanted) ??
    catalogue.find((plan) => plan.slug === slug);

  if (row) return row.monthlyPrice;
  return addonBySlug(slug)?.priceMonthly ?? fallback;
}

/**
 * Add-ons a package already covers, which the shop has to stop charging for.
 *
 * The allowance is positional on the server — the first N slugs of the stored
 * array are free on `bundle` (3), `advanced` (6) and `pro` (unlimited), by
 * array order rather than by which add-on it is. This mirrors that rather than
 * inventing a nicer rule, because a total that disagrees with the invoice is
 * worse than a total that is hard to explain.
 */
export const INCLUDED_ADDON_COUNT: Record<string, number> = {
  bundle: 3,
  advanced: 6,
  pro: Number.POSITIVE_INFINITY,
};

export function includedAddonCount(planSlug: string): number {
  return INCLUDED_ADDON_COUNT[planSlug] ?? 0;
}

/**
 * What the add-ons already on the plan cost per month.
 *
 * A different question from `addedMonthlyCost` below, and the distinction is
 * the whole reason both exist. This one asks "what am I paying"; that one asks
 * "what would this change it by". Running the current list through the
 * incremental version counts it against the allowance twice — once as what's
 * already there, once as what's arriving — and bills a business for three
 * add-ons on a package that includes three.
 *
 * Positional, like the server's: the first N on the plan are the free ones.
 */
export function currentMonthlyCost(
  subscription: SubscriptionInfo | null,
  catalogue: SubscriptionPlan[] = [],
): number {
  const current = (subscription?.addons ?? []).filter(
    (slug) => !SEAT_BILLED_SLUGS.has(slug),
  );
  const allowance = includedAddonCount(subscription?.planSlug ?? "free");

  const charged = current.slice(Math.min(allowance, current.length));
  const total = charged.reduce(
    (sum, slug) =>
      sum +
      monthlyPriceForSlug(
        slug,
        catalogue,
        subscription?.planInterval ?? "monthly",
      ),
    0,
  );

  return Math.round(total * 100) / 100;
}

/**
 * What adding these slugs changes the monthly bill by.
 *
 * Counted against the allowance: on a plan that includes three, the fourth is
 * the first one charged. Positional, so the ones already on the plan take the
 * free slots before anything new does — same order the server reads them in.
 */
export function addedMonthlyCost(
  subscription: SubscriptionInfo | null,
  adding: string[],
  catalogue: SubscriptionPlan[] = [],
): number {
  const current = (subscription?.addons ?? []).filter(
    (slug) => !SEAT_BILLED_SLUGS.has(slug),
  );
  const allowance = includedAddonCount(subscription?.planSlug ?? "free");

  let freeLeft = Math.max(0, allowance - current.length);
  let total = 0;

  for (const slug of adding) {
    if (freeLeft > 0) {
      freeLeft -= 1;
      continue;
    }
    total += monthlyPriceForSlug(
      slug,
      catalogue,
      subscription?.planInterval ?? "monthly",
    );
  }

  return Math.round(total * 100) / 100;
}
