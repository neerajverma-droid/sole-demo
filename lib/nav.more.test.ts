import { describe, expect, it } from "vitest";

import { ADDITIONAL_NAV, NAV, additionalById, searchTargets } from "@/lib/nav";
import { addonById } from "@/lib/addons";

describe("More → Additional items", () => {
  it("leaves tax estimator and reputation to Add-ons rather than More", () => {
    expect(additionalById("tax-estimator")).toBeUndefined();
    expect(additionalById("reputation")).toBeUndefined();
    expect(addonById("tax-estimator")?.href).toBe("/tax-estimator");
    expect(addonById("reputation")?.href).toBe("/reputation");
  });

  it("no longer offers geographic insights — its dashboard card is the way in", () => {
    expect(additionalById("geographic-insights")).toBeUndefined();
  });

  it("doesn't offer the reporting suite, which is in Main for everyone", () => {
    expect(additionalById("reporting")).toBeUndefined();
    const reporting = NAV[0].items.find((item) => item.id === "reporting");
    expect(reporting?.children?.[0]?.href).toBe("/reports/profit-loss");
  });

  it("gives every item a unique id", () => {
    const ids = ADDITIONAL_NAV.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("searchTargets", () => {
  it("lists the tax estimator once, not again under Resources", () => {
    const hits = searchTargets().filter((target) => target.href === "/tax-estimator");
    expect(hits).toHaveLength(1);
  });

  it("finds geographic insights", () => {
    expect(searchTargets().some((target) => target.href === "/dashboard/geographic-insights")).toBe(true);
  });
});

describe("Proposals", () => {
  const proposalAddon = addonById("proposals");

  it("is defined as an add-on in the Add-ons section", () => {
    expect(proposalAddon).toBeDefined();
    expect(proposalAddon?.name).toBe("Proposals");
  });

  it("holds the list and Templates — short labels that fit the rail", () => {
    expect(proposalAddon?.pages?.map((child) => [child.id, child.label, child.href])).toEqual([
      ["proposals", "Proposals", "/proposals"],
      ["proposal-templates", "Templates", "/proposals/templates"],
    ]);
  });

  it("is not in Main section", () => {
    const main = NAV[0].items;
    expect(main.some((item) => item.id === "proposals-group" || item.id === "proposals")).toBe(false);
  });

  it("is not one of the Sales documents", () => {
    const main = NAV[0].items;
    const sales = main.find((item) => item.id === "sales");
    expect(sales?.children?.map((child) => child.id)).not.toContain("proposals");
  });

  it("lists Create proposal once in search", () => {
    expect(searchTargets().filter((target) => target.href === "/proposals/new")).toHaveLength(1);
  });
});
