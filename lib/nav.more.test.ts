import { describe, expect, it } from "vitest";

import { ADDITIONAL_NAV, NAV, additionalById, searchTargets } from "@/lib/nav";

describe("More → Additional items", () => {
  it.each([
    ["tax-estimator", "/tax-estimator"],
    ["geographic-insights", "/dashboard/geographic-insights"],
  ])("offers %s, which has no other way in from the rail", (id, href) => {
    const item = additionalById(id);
    expect(item?.href).toBe(href);
    expect(item?.description).toBeTruthy();
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
  const main = NAV[0].items;

  it("is its own top-level module, right after Contacts", () => {
    const ids = main.map((item) => item.id);
    expect(ids.indexOf("proposals")).toBe(ids.indexOf("contacts") + 1);
    expect(main.find((item) => item.id === "proposals")).toMatchObject({ href: "/proposals" });
  });

  it("is not one of the Sales documents", () => {
    const sales = main.find((item) => item.id === "sales");
    expect(sales?.children?.map((child) => child.id)).not.toContain("proposals");
  });
});
