import { describe, expect, it } from "vitest";

import {
  INCLUDED_ADDON_COUNT,
  defaultIncludedAddons,
  type SubscriptionPlan,
} from "@/lib/subscription";

/**
 * Which add-ons a package arrives with switched on.
 *
 * Picking "Compliance Bundle" and seeing every box unticked under a line that
 * says it includes three is the bug this fixes: the offer and the form
 * disagreed, which reads as a page that hasn't finished loading.
 *
 * The rule that matters most here is the one about NOT unticking. Someone
 * moving to a smaller package keeps what they have and pays for the overflow —
 * a helper that trimmed the list to fit the allowance would cancel an add-on
 * they pay for in order to make a number look tidy, and it would do it without
 * saying so.
 */

const plan = (slug: string, comingSoon = false): SubscriptionPlan => ({
  slug,
  name: slug,
  description: "",
  price: 4.99,
  interval: "monthly",
  monthlyPrice: 4.99,
  badge: null,
  comingSoon,
  includes: [],
  excludes: [],
});

/** The catalogue in its own order, as `/plans` returns it. */
const ADDONS = [
  plan("accounting"),
  plan("time"),
  plan("project"),
  plan("assets-advanced"),
  plan("km"),
  plan("booking"),
  plan("inventory"),
  plan("investment"),
  plan("crypto", true),
];

describe("how many get switched on", () => {
  it("fills the bundle's three", () => {
    // "Accounting Module Included" + "Any 2 Add-ons Included" = 3, which is
    // exactly FREE_ADDON_LIMITS.bundle on the server.
    expect(defaultIncludedAddons("bundle", ADDONS)).toHaveLength(3);
  });

  it("fills Advanced's six", () => {
    // "Core Accounting Included" + "Any 5 Add-ons Included" = 6.
    expect(defaultIncludedAddons("advanced", ADDONS)).toHaveLength(6);
  });

  it("switches on everything available for pro, whose allowance is unlimited", () => {
    const result = defaultIncludedAddons("pro", ADDONS);

    expect(result).toHaveLength(ADDONS.length - 1); // minus the coming-soon one
    expect(result).not.toContain("crypto");
  });

  it("switches nothing on for a package with no allowance", () => {
    expect(defaultIncludedAddons("business", ADDONS)).toEqual([]);
    expect(defaultIncludedAddons("free", ADDONS)).toEqual([]);
  });

  it("switches nothing on for a package it has never heard of", () => {
    expect(defaultIncludedAddons("brand-new-tier", ADDONS)).toEqual([]);
  });

  it("agrees with the allowance table it is counting against", () => {
    for (const [slug, allowance] of Object.entries(INCLUDED_ADDON_COUNT)) {
      const expected = Number.isFinite(allowance)
        ? allowance
        : ADDONS.length - 1;

      expect(defaultIncludedAddons(slug, ADDONS), slug).toHaveLength(expected);
    }
  });
});

describe("which ones", () => {
  it("leads with accounting, which both packages name first", () => {
    expect(defaultIncludedAddons("bundle", ADDONS)[0]).toBe("accounting");
  });

  it("then follows the catalogue's own order", () => {
    expect(defaultIncludedAddons("bundle", ADDONS)).toEqual([
      "accounting",
      "time",
      "project",
    ]);
  });

  it("never switches on something that isn't released", () => {
    const soon = [plan("crypto", true), plan("time")];

    expect(defaultIncludedAddons("bundle", soon)).toEqual(["time"]);
  });

  it("never switches on payroll, which is billed per seat", () => {
    const withPayroll = [plan("payroll"), plan("time"), plan("project")];

    expect(defaultIncludedAddons("bundle", withPayroll)).toEqual([
      "time",
      "project",
    ]);
  });

  it("leads with accounting even when the catalogue lists it last", () => {
    const reordered = [plan("time"), plan("project"), plan("accounting")];

    expect(defaultIncludedAddons("bundle", reordered)[0]).toBe("accounting");
  });
});

describe("what is already chosen", () => {
  it("keeps it and tops up the remaining free slots", () => {
    expect(defaultIncludedAddons("bundle", ADDONS, ["km"])).toEqual([
      "km",
      "accounting",
      "time",
    ]);
  });

  it("does not add a second copy of something already chosen", () => {
    const result = defaultIncludedAddons("bundle", ADDONS, ["accounting"]);

    expect(result).toEqual(["accounting", "time", "project"]);
    expect(new Set(result).size).toBe(result.length);
  });

  it("leaves a full selection alone", () => {
    const full = ["accounting", "time", "project"];

    expect(defaultIncludedAddons("bundle", ADDONS, full)).toEqual(full);
  });

  it("never trims a selection bigger than the allowance", () => {
    // Moving from Advanced (6 free) down to the bundle (3). The extras are
    // charged, not cancelled — dropping them here would take away something
    // they pay for without a word.
    const six = ["accounting", "time", "project", "km", "booking", "inventory"];

    expect(defaultIncludedAddons("bundle", ADDONS, six)).toEqual(six);
  });

  it("keeps the order they were chosen in, because the allowance is positional", () => {
    // The server treats the first N of the stored array as the free ones, so
    // reordering this list would change which add-on gets charged.
    expect(defaultIncludedAddons("bundle", ADDONS, ["km", "booking"])).toEqual([
      "km",
      "booking",
      "accounting",
    ]);
  });

  it("drops payroll out of an existing selection rather than carrying it", () => {
    expect(defaultIncludedAddons("bundle", ADDONS, ["payroll", "km"])).toEqual([
      "km",
      "accounting",
      "time",
    ]);
  });

  it("copes with an empty catalogue instead of throwing", () => {
    expect(defaultIncludedAddons("bundle", [], ["km"])).toEqual(["km"]);
    expect(defaultIncludedAddons("bundle", [])).toEqual([]);
  });
});

describe("add-ons the person switched off by hand", () => {
  it("does not hand one back when the package refills its slots", () => {
    // The untick has to survive a package change, or it looks like it never
    // took: the new package refills the slot it was just removed from.
    expect(
      defaultIncludedAddons("bundle", ADDONS, [], ["accounting"]),
    ).not.toContain("accounting");
  });

  it("fills the slot with the next one instead of leaving it empty", () => {
    // A free slot is still free — it just can't be filled with the thing
    // that was turned down.
    expect(defaultIncludedAddons("bundle", ADDONS, [], ["accounting"])).toEqual(
      ["time", "project", "assets-advanced"],
    );
  });

  it("keeps a dismissed one out even when it is already in `current`", () => {
    // `current` wins — being in both is contradictory, and an explicit tick
    // is the more recent statement of intent.
    expect(
      defaultIncludedAddons("bundle", ADDONS, ["accounting"], ["accounting"]),
    ).toContain("accounting");
  });

  it("can empty the allowance entirely when everything is dismissed", () => {
    const all = ADDONS.map((addon) => addon.slug);

    expect(defaultIncludedAddons("bundle", ADDONS, [], all)).toEqual([]);
  });

  it("ignores a dismissal of something that was never on offer", () => {
    expect(
      defaultIncludedAddons("bundle", ADDONS, [], ["not-an-addon"]),
    ).toEqual(["accounting", "time", "project"]);
  });
});

describe("moving between packages", () => {
  /** What the picker does on a package change: drop the auto-filled, refill. */
  const move = (
    toPlan: string,
    deliberate: string[],
    dismissed: string[] = [],
  ) => defaultIncludedAddons(toPlan, ADDONS, deliberate, dismissed);

  it("drops what the old package gave away, on the way down", () => {
    // Advanced hands out six. Moving to a package that includes none must not
    // carry them across as charges nobody chose — only the two the business
    // actually has survive.
    expect(move("business", ["accounting", "km"])).toEqual([
      "accounting",
      "km",
    ]);
  });

  it("keeps something ticked by hand, even past the new allowance", () => {
    // Deliberate is deliberate: it gets charged rather than cancelled.
    expect(move("business", ["accounting", "km", "inventory"])).toEqual([
      "accounting",
      "km",
      "inventory",
    ]);
  });

  it("refills from scratch on the way up", () => {
    expect(move("advanced", ["accounting", "km"])).toHaveLength(6);
  });

  it("a dismissal survives the trip up and back down", () => {
    const up = move("advanced", ["km"], ["accounting"]);
    expect(up).not.toContain("accounting");

    const down = move("business", ["km"], ["accounting"]);
    expect(down).toEqual(["km"]);
  });
});
