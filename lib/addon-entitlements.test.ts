import { describe, expect, it } from "vitest";

import {
  addedMonthlyCost,
  addonBillingMode,
  addonMonthlyPrice,
  currentMonthlyCost,
  idsForSlugs,
  nextAddonSlugs,
  purchasableAddons,
  slugsForIds,
} from "@/lib/addon-entitlements";
import { ADDONS, addonById } from "@/lib/addons";
import {
  NO_SUBSCRIPTION,
  type SubscriptionInfo,
  type SubscriptionPlan,
} from "@/lib/subscription";

/**
 * The join between the shop window and the price list.
 *
 * Everything here guards a way of quietly taking the wrong amount of money, or
 * of taking away something somebody paid for. The one to read first is
 * `nextAddonSlugs`: the subscription endpoints REPLACE the add-on array rather
 * than merging into it, so a call that forgets to carry the existing slugs
 * cancels every other add-on on the plan — including the ones this app has no
 * card for and therefore cannot show anyone it just dropped.
 */

const sub = (over: Partial<SubscriptionInfo> = {}): SubscriptionInfo => ({
  ...NO_SUBSCRIPTION,
  planSlug: "bundle",
  planInterval: "monthly",
  status: "active",
  isFree: false,
  platform: "WEBP",
  ...over,
});

const plan = (
  slug: string,
  monthlyPrice: number,
  interval: string | null = "monthly",
): SubscriptionPlan => ({
  slug,
  name: slug,
  description: "",
  price: monthlyPrice,
  interval,
  monthlyPrice,
  badge: null,
  comingSoon: false,
  includes: [],
  excludes: [],
});

describe("the catalogue join", () => {
  it("gives every purchasable add-on a slug the backend knows", () => {
    // The seeder's ADDONS list in sole-ocr. A card whose slug isn't here can't
    // be bought — update-session resolves slugs against user_subscription_plans.
    const known = new Set([
      "accounting",
      "time",
      "project",
      "payroll",
      "assets-advanced",
      "km",
      "booking",
      "inventory",
      "investment",
      "crypto",
    ]);

    for (const addon of ADDONS) {
      if (!addon.slug) continue;
      expect(known, `${addon.id} → ${addon.slug}`).toContain(addon.slug);
    }
  });

  it("maps the cards whose id and slug differ", () => {
    // The whole reason this module exists: these four never matched, so the
    // modal showed a locked card to a business already paying for it.
    expect(addonById("assets")?.slug).toBe("assets-advanced");
    expect(addonById("projects")?.slug).toBe("project");
    expect(addonById("scheduling")?.slug).toBe("booking");
    expect(addonById("time-tracker")?.slug).toBe("time");
  });

  it("round-trips ids through slugs and back", () => {
    const ids = ["assets", "projects", "scheduling"];

    expect(idsForSlugs(slugsForIds(ids))).toEqual(ids);
  });

  it("drops a slug no card has been written for", () => {
    // `accounting`, `inventory` and `crypto` are billable with no card here.
    expect(idsForSlugs(["accounting", "assets-advanced"])).toEqual(["assets"]);
  });

  it("keeps payroll out — it is billed per seat, not as a flat add-on", () => {
    expect(slugsForIds(["payroll", "assets"])).toEqual(["assets-advanced"]);
    expect(purchasableAddons().some((a) => a.slug === "payroll")).toBe(false);
  });

  it("de-dupes, so one add-on cannot become two Stripe items", () => {
    expect(slugsForIds(["assets", "assets"])).toEqual(["assets-advanced"]);
  });
});

describe("nextAddonSlugs", () => {
  it("carries the existing slugs along when adding one", () => {
    expect(nextAddonSlugs(["accounting", "time"], { add: "km" })).toEqual([
      "accounting",
      "time",
      "km",
    ]);
  });

  it("keeps a slug this app has no card for", () => {
    // The dangerous case. `accounting` is invisible to this modal, so a list
    // rebuilt from the cards alone would cancel it and show nothing about it.
    expect(nextAddonSlugs(["accounting"], { add: "km" })).toContain(
      "accounting",
    );
  });

  it("removes only the one asked for", () => {
    expect(
      nextAddonSlugs(["accounting", "time", "km"], { remove: "time" }),
    ).toEqual(["accounting", "km"]);
  });

  it("never sends payroll, whichever way it got onto the list", () => {
    expect(nextAddonSlugs(["payroll", "km"], { add: "time" })).toEqual([
      "km",
      "time",
    ]);
  });

  it("adding something already there changes nothing", () => {
    expect(nextAddonSlugs(["km"], { add: "km" })).toEqual(["km"]);
  });

  it("treats an absent current list as empty rather than throwing", () => {
    expect(nextAddonSlugs(undefined, { add: "km" })).toEqual(["km"]);
  });
});

describe("addonBillingMode", () => {
  it("adds in place on a live paid subscription", () => {
    expect(addonBillingMode(sub())).toBe("in-place");
  });

  it("adds in place during a trial — it is a real Stripe subscription", () => {
    expect(
      addonBillingMode(sub({ status: "trialing", isTrialing: true })),
    ).toBe("in-place");
  });

  it("sends a free plan to checkout — there is no subscription to add to", () => {
    expect(addonBillingMode(sub({ isFree: true, planSlug: "free" }))).toBe(
      "checkout",
    );
  });

  it("sends an expired subscription to checkout", () => {
    // update-session 400s without a live stripe_subscription_id.
    expect(addonBillingMode(sub({ status: "canceled" }))).toBe("checkout");
  });

  it("refuses an app-store subscription rather than failing at the call", () => {
    expect(addonBillingMode(sub({ platform: "IPHN" }))).toBe("store-managed");
    expect(addonBillingMode(sub({ platform: "ANDR" }))).toBe("store-managed");
  });

  it("sends an unread subscription to checkout", () => {
    expect(addonBillingMode(null)).toBe("checkout");
  });
});

describe("addonMonthlyPrice", () => {
  const assets = addonById("assets")!;

  it("prefers the price list over the card's hardcoded figure", () => {
    expect(addonMonthlyPrice(assets, [plan("assets-advanced", 4.99)])).toBe(
      4.99,
    );
  });

  it("falls back to the card when the price list has no row", () => {
    expect(addonMonthlyPrice(assets, [])).toBe(assets.priceMonthly);
  });

  it("takes the row matching the plan's interval", () => {
    // Every add-on has two rows; taking the first match quotes an annual
    // figure to a monthly plan.
    const catalogue = [
      plan("assets-advanced", 4.99, "monthly"),
      plan("assets-advanced", 3.99, "annual"),
    ];

    expect(addonMonthlyPrice(assets, catalogue, "monthly")).toBe(4.99);
    expect(addonMonthlyPrice(assets, catalogue, "annual")).toBe(3.99);
  });
});

describe("addedMonthlyCost", () => {
  const catalogue = [
    plan("assets-advanced", 4.99),
    plan("km", 4.99),
    plan("time", 4.99),
    plan("project", 4.99),
  ];

  it("charges nothing while the plan's allowance covers it", () => {
    // bundle includes three.
    const result = addedMonthlyCost(
      sub({ planSlug: "bundle" }),
      ["km"],
      catalogue,
    );

    expect(result).toBe(0);
  });

  it("charges once the allowance is spent", () => {
    const onPlan = sub({
      planSlug: "bundle",
      addons: ["accounting", "time", "project"],
    });

    expect(addedMonthlyCost(onPlan, ["km"], catalogue)).toBe(4.99);
  });

  it("counts the allowance across everything being added at once", () => {
    const onPlan = sub({ planSlug: "bundle", addons: ["accounting", "time"] });

    // One free slot left, two going in: only the second is charged.
    expect(addedMonthlyCost(onPlan, ["km", "project"], catalogue)).toBe(4.99);
  });

  it("charges from the first add-on on a plan with no allowance", () => {
    expect(
      addedMonthlyCost(sub({ planSlug: "business" }), ["km"], catalogue),
    ).toBe(4.99);
  });

  it("charges nothing on pro, whose allowance is unlimited", () => {
    const onPlan = sub({
      planSlug: "pro",
      addons: ["accounting", "time", "project", "km", "booking", "inventory"],
    });

    expect(addedMonthlyCost(onPlan, ["investment"], catalogue)).toBe(0);
  });

  it("does not let payroll eat a free slot", () => {
    // Payroll is billed separately, so counting it against the allowance would
    // charge for an add-on the plan actually covers.
    const onPlan = sub({ planSlug: "bundle", addons: ["payroll"] });

    expect(addedMonthlyCost(onPlan, ["km", "time", "project"], catalogue)).toBe(
      0,
    );
  });

  it("rounds to cents rather than carrying float noise into the copy", () => {
    const onPlan = sub({ planSlug: "business" });
    const prices = [plan("km", 0.1), plan("time", 0.2)];

    expect(addedMonthlyCost(onPlan, ["km", "time"], prices)).toBe(0.3);
  });
});

describe("currentMonthlyCost", () => {
  const catalogue = [
    plan("assets-advanced", 4.99),
    plan("km", 4.99),
    plan("accounting", 7.99),
    plan("time", 4.99),
  ];

  it("charges nothing while the plan's allowance covers what's on it", () => {
    // Three add-ons on bundle, which includes three. The header used to run
    // this list through `addedMonthlyCost`, which counted them against the
    // allowance a second time and billed for all three.
    const onPlan = sub({
      planSlug: "bundle",
      addons: ["assets-advanced", "km", "accounting"],
    });

    expect(currentMonthlyCost(onPlan, catalogue)).toBe(0);
  });

  it("charges only the ones past the allowance", () => {
    const onPlan = sub({
      planSlug: "bundle",
      addons: ["assets-advanced", "km", "accounting", "time"],
    });

    expect(currentMonthlyCost(onPlan, catalogue)).toBe(4.99);
  });

  it("charges everything on a plan with no allowance", () => {
    const onPlan = sub({ planSlug: "business", addons: ["km", "time"] });

    expect(currentMonthlyCost(onPlan, catalogue)).toBe(9.98);
  });

  it("counts an add-on with no card — it is still billed", () => {
    const onPlan = sub({ planSlug: "business", addons: ["accounting"] });

    expect(currentMonthlyCost(onPlan, catalogue)).toBe(7.99);
  });

  it("ignores payroll, which is billed per seat elsewhere", () => {
    const onPlan = sub({ planSlug: "business", addons: ["payroll"] });

    expect(currentMonthlyCost(onPlan, catalogue)).toBe(0);
  });

  it("is zero with nothing on the plan", () => {
    expect(currentMonthlyCost(sub({ addons: [] }), catalogue)).toBe(0);
    expect(currentMonthlyCost(null, catalogue)).toBe(0);
  });
});
