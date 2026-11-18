import { describe, expect, it } from "vitest";

import {
  ADDON_GROUPS,
  ADDONS,
  addonMoney,
  addonPrice,
  addonPriceShort,
  addonRecommendedFor,
  addonSoldBySeat,
  addonsByGroup,
  addonsForFilter,
  withCatalogueContent,
} from "@/lib/addons";
import type { PlanContent, SubscriptionPlan } from "@/lib/subscription";

/**
 * Payroll in the shop.
 *
 * It's listed — the card, the price, the description — but bought as seats,
 * which a cart toggle can't carry. It once got a working-looking "Select":
 * the flat-add-on path sent a bare `"payroll"` slug the backend strips before
 * Stripe, so the call resolved and nothing was charged or granted. Its card now
 * sends people to the seat picker, and `addonSoldBySeat` is how a card knows.
 */
describe("payroll in the shopping grid", () => {
  const payroll = ADDONS.find((addon) => addon.id === "payroll")!;

  it("is a per-seat add-on", () => {
    expect(payroll.priceUnit).toBe("employee");
    expect(addonSoldBySeat(payroll)).toBe(true);
    expect(ADDONS.filter(addonSoldBySeat).map((addon) => addon.id)).toEqual(["payroll"]);
  });

  it("is listed under Finance and found by its name", () => {
    const finance = ADDON_GROUPS.find((g) => g.key === payroll.group)?.pill;
    expect(addonsForFilter(finance!).map((addon) => addon.id)).toContain("payroll");
    expect(addonsForFilter("All", "payroll").map((addon) => addon.id)).toEqual(["payroll"]);
    expect(
      addonsByGroup().flatMap((entry) => entry.addons.map((addon) => addon.id)),
    ).toContain("payroll");
  });
});

describe("a card with no slug yet", () => {
  it("would be excluded the same way, if one existed", () => {
    // No card in the live catalogue hits this today — every one of them has
    // a slug — so this pins the rule itself rather than a live example of it.
    const withoutSlug = ADDONS.filter((addon) => !addon.slug);
    for (const addon of withoutSlug) {
      const ids = addonsForFilter("All").map((a) => a.id);
      expect(ids, addon.id).not.toContain(addon.id);
    }
  });
});

/** One add-on row from GET /subscription/plans, with whatever content it has. */
const row = (slug: string, content: Partial<PlanContent> | null): SubscriptionPlan => ({
  slug,
  name: slug,
  description: "",
  price: 4.99,
  interval: "monthly",
  monthlyPrice: 4.99,
  badge: null,
  comingSoon: false,
  includes: [],
  excludes: [],
  content: content ? { industries: [], ...content } : null,
});

describe("the catalogue's content over the card", () => {
  const investment = ADDONS.find((addon) => addon.id === "investment")!;

  it("takes every field the row has, and keeps the card's for the rest", () => {
    const merged = withCatalogueContent(investment, [
      row("investment", {
        subtext: "Track rent per property",
        videoUrl: "https://example.com/video",
        overview: "From the database",
      }),
    ]);

    expect(merged.subtext).toBe("Track rent per property");
    expect(merged.videoUrl).toBe("https://example.com/video");
    expect(merged.overview).toBe("From the database");
    expect(merged.whatItDoes).toBe(investment.whatItDoes);
    expect(merged.icon).toBe(investment.icon);
  });

  it("moves an add-on to the category the row names, and ignores one it doesn't know", () => {
    expect(withCatalogueContent(investment, [row("investment", { category: "operations" })]).group).toBe("operations");
    expect(withCatalogueContent(investment, [row("investment", { category: "growth" })]).group).toBe("finance");
  });

  it("keeps the card's three benefits unless the row has exactly three", () => {
    const two = withCatalogueContent(investment, [row("investment", { benefits: ["a", "b"] })]);
    expect(two.benefits).toEqual(investment.benefits);
  });

  it("leaves the card alone with no row, or a row with no content", () => {
    expect(withCatalogueContent(investment, [])).toBe(investment);
    expect(withCatalogueContent(investment, [row("investment", null)])).toBe(investment);
  });

  it("feeds the rail and the grid, not just the detail view", () => {
    const catalogue = [row("investment", { subtext: "From the database" })];
    const rail = addonsByGroup("", { catalogue }).flatMap((entry) => entry.addons);
    expect(rail.find((addon) => addon.id === "investment")?.subtext).toBe("From the database");
    expect(addonsForFilter("All", "from the database", { catalogue }).map((a) => a.id)).toEqual(["investment"]);
  });
});

describe("industry tags", () => {
  const catalogue = [row("km", { industries: ["4"] })];

  it("recommends an add-on only to an industry it is tagged for", () => {
    const km = withCatalogueContent(ADDONS.find((addon) => addon.id === "km-tracker")!, catalogue);
    expect(addonRecommendedFor(km, "4")).toBe(true);
    expect(addonRecommendedFor(km, "9")).toBe(false);
    expect(addonRecommendedFor(km, null)).toBe(false);
  });

  it("does not recommend an untagged add-on to anyone", () => {
    const assets = withCatalogueContent(ADDONS.find((addon) => addon.id === "assets")!, catalogue);
    expect(addonRecommendedFor(assets, "4")).toBe(false);
  });

  it("puts tagged add-ons first in their group, and hides nothing", () => {
    const operations = (industryId: string | null) =>
      addonsByGroup("", { catalogue, industryId })
        .find((entry) => entry.group.key === "operations")!
        .addons.map((addon) => addon.id);

    expect(operations("4")[0]).toBe("km-tracker");
    expect([...operations("4")].sort()).toEqual([...operations(null)].sort());
    expect(operations(null)[0]).not.toBe("km-tracker");
  });
});

describe("add-on prices", () => {
  it("rounds an annual plan's monthly share to the cent", () => {
    expect(addonMoney(47.9 / 12)).toBe("$3.99");
    expect(addonMoney(6)).toBe("$6.00");
  });

  it("formats the price-list figure, not the card's", () => {
    const scheduling = ADDONS.find((addon) => addon.id === "scheduling")!;
    expect(addonPrice(scheduling, 47.9 / 12)).toBe("$3.99/month");
    expect(addonPrice(scheduling)).toBe("$6.00/month");
  });

  it("names the period it's charged for", () => {
    const scheduling = ADDONS.find((addon) => addon.id === "scheduling")!;
    const payroll = ADDONS.find((addon) => addon.id === "payroll")!;
    expect(addonPrice(scheduling, 47.9, "annual")).toBe("$47.90/year");
    expect(addonPriceShort(scheduling, 4.99)).toBe("$4.99/mo");
    expect(addonPriceShort(scheduling, 47.9, "annual")).toBe("$47.90/yr");
    expect(addonPriceShort(payroll, 4.99)).toBe("$4.99/employee/mo");
  });

  it("carries the feature key the server unlocks each add-on under", () => {
    // sole-ocr featureAccess.js — a key that drifts leaves a plan-included
    // add-on locked and on sale to someone who already has it.
    const features = Object.fromEntries(
      ADDONS.filter((addon) => addon.slug && addon.feature).map((addon) => [addon.slug, addon.feature]),
    );
    expect(features).toEqual({
      investment: "investment",
      "assets-advanced": "assets-advanced",
      project: "projects",
      booking: "booking",
      time: "time-tracking",
      km: "km-tracker",
    });
  });
});
