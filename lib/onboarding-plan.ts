/**
 * The plan first run opens on: which package, and which add-ons, for this
 * industry.
 *
 * Derived rather than picked. Every input here already exists and is already
 * read by something else — the journey the industry resolves to
 * (`lib/journeys`), the tools that industry is recommended (`lib/workspace-
 * tools`), and what any of it costs (`lib/pricing`, `lib/addons`). This module
 * is the one place those three meet, so the pricing step can't recommend a
 * package the rest of the product would price differently.
 *
 * Two rules, both stated below: the journey picks the tier, and arithmetic
 * overrides it where the industry's add-ons cost more than the tier that
 * includes them. Nothing here hard-codes a single package for everyone, which
 * is the whole point — a consultant and an NDIS provider should not open the
 * same screen.
 */

import { addonById } from "@/lib/addons";
import { resolveJourney, type JourneyId } from "@/lib/journeys";
import {
  PRICING_PACKAGES,
  pricingRate,
  type BillingCycle,
} from "@/lib/pricing";
import { applyTools, recommendedFor } from "@/lib/workspace-tools";

/** The way out of the step, and the one package that isn't a recommendation. */
export const FREE_PACKAGE_ID = "free";

/**
 * The tier a journey needs before any add-on is considered.
 *
 * The journey is the right input because it's already the answer to "how does
 * this business turn work into money", which is also what decides how much of
 * the product they need on day one:
 *
 *   - `j1`, `j2`, `j3` — money arrives against an invoice or on the spot. What
 *     they need unmetered is invoicing and expenses, which is that tier.
 *   - `j3n` — NDIS bills the scheme, and the scheme's paperwork is the job.
 *     BAS, reporting and liability tracking aren't optional extras there.
 *   - `j4` — goods. Stock, margin and GST arrive together, and the compliance
 *     tier is where the last of those lives.
 *
 * Total over `JourneyId`, so a journey added without a tier is a compile error
 * rather than an account quietly recommended whatever `??` reaches for.
 *
 * None of these is Free. The step offers Free as the decline — recommending it
 * would be recommending nothing.
 */
const JOURNEY_PACKAGE: Record<JourneyId, string> = {
  j1: "invexp",
  j2: "invexp",
  j3: "invexp",
  j3n: "compliance",
  j4: "compliance",
};

/**
 * The tier whose feature list reads "every add-on included" — and the reason
 * the arithmetic below exists.
 */
const ALL_INCLUSIVE_PACKAGE_ID = "advanced";

/**
 * Packages that carry every add-on rather than charging for them.
 *
 * A set rather than a flag on the package, because it's a fact about the
 * catalogue's two top tiers and `PRICING_PACKAGES` is transcribed from the
 * design's own table — adding a field to it would be inventing data the
 * reference didn't have.
 */
const ALL_INCLUSIVE = new Set([ALL_INCLUSIVE_PACKAGE_ID, "pro"]);

/** Whether the add-ons come with the package instead of being billed beside it. */
export function planIncludesAddons(packageId: string): boolean {
  return ALL_INCLUSIVE.has(packageId);
}

export function packagePrice(packageId: string): number {
  return PRICING_PACKAGES.find((entry) => entry.id === packageId)?.price ?? 0;
}

export function packageName(packageId: string): string {
  return PRICING_PACKAGES.find((entry) => entry.id === packageId)?.name ?? "";
}

/**
 * The add-ons an industry is recommended, as ids the sidebar can actually
 * place.
 *
 * `recommendedFor` answers in workspace-tool ids, which are a wider vocabulary
 * than add-ons — most of what it returns is a nav row or a pin, and those were
 * already applied to the rail by the page after sign-up. `applyTools` is the
 * existing splitter, so this takes its add-on bucket and nothing else.
 *
 * Filtered against the catalogue on the way out: an id that no longer resolves
 * would be a checkbox that adds a sidebar row pointing nowhere.
 */
export function recommendedAddonsFor(industry: string): string[] {
  return applyTools(recommendedFor(industry)).addons.filter((id) =>
    addonById(id),
  );
}

export function addonsMonthly(addonIds: string[]): number {
  return addonIds.reduce(
    (sum, id) => sum + (addonById(id)?.priceMonthly ?? 0),
    0,
  );
}

export type PlanRecommendation = {
  journey: JourneyId;
  packageId: string;
  addonIds: string[];
};

/**
 * What to open the pricing step on.
 *
 * The journey sets the tier; then one piece of arithmetic can override it. If
 * the industry's own add-ons cost at least as much as the all-inclusive tier
 * does on top of the base, recommending the base tier plus those add-ons would
 * be recommending the more expensive of two identical baskets. So the tier
 * moves up and the add-ons come with it.
 *
 * `paymentAnswer` is passed through to `resolveJourney` rather than consulted
 * here: it's the tie-breaker for the industries that can't settle their own
 * journey, and this module has no business knowing which those are.
 *
 * The promotion doesn't fire for any industry today, and the rule is here
 * anyway. `INDUSTRY_RECOMMENDATIONS` is explicitly a stub — two add-ons per
 * industry, guessed — so the dearest basket it can produce is short of the
 * all-inclusive tier. The researched mapping will recommend more, and the
 * alternative to writing the rule now is a step that quietly recommends the
 * more expensive of two identical baskets the day it lands.
 */
export function recommendPlan(
  industry: string,
  paymentAnswer?: string | null,
): PlanRecommendation {
  const journey = resolveJourney(industry, paymentAnswer);
  const addonIds = recommendedAddonsFor(industry);
  const base = JOURNEY_PACKAGE[journey];

  const cheaperAllInclusive =
    packagePrice(base) + addonsMonthly(addonIds) >=
    packagePrice(ALL_INCLUSIVE_PACKAGE_ID);

  return {
    journey,
    packageId: cheaperAllInclusive ? ALL_INCLUSIVE_PACKAGE_ID : base,
    addonIds,
  };
}

/**
 * What a selection costs per average month, with the cycle applied.
 *
 * Not `pricingTotal`. That one sums `PRICING_ADDONS` — the pricing panel's own
 * add-on list, which is a different set of ids from the add-ons that carry
 * sidebar rows — and it charges for every one of them regardless of tier. Both
 * differences matter here: this step checks add-ons out of `lib/addons` because
 * those are the ones it can switch on, and a tier that includes them mustn't
 * then bill for them.
 */
export function planMonthlyTotal({
  packageId,
  addonIds,
  cycle,
}: {
  packageId: string;
  addonIds: string[];
  cycle: BillingCycle;
}): number {
  const extras = planIncludesAddons(packageId) ? 0 : addonsMonthly(addonIds);
  return pricingRate(packagePrice(packageId) + extras, cycle);
}
