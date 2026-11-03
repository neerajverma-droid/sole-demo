import { describe, expect, it } from "vitest";

import { NO_ADMIN_ACCESS, type AdminAccess } from "@/lib/admin/access";
import { activeAdminNavId, visibleAdminNav } from "@/lib/admin/nav";

const delegated = (...features: string[]): AdminAccess => ({ isSuperAdmin: false, features });

/** The rail as section → row ids, which is what the tests care about. */
const shape = (access: AdminAccess) =>
  Object.fromEntries(
    visibleAdminNav(access).map((section) => [section.section, section.items.map((item) => item.id)]),
  );

describe("visibleAdminNav", () => {
  it("shows a super admin every row, including Cash and Admin access", () => {
    const nav = shape({ isSuperAdmin: true, features: [] });
    expect(nav.Platform).toEqual(["dashboard", "tenants", "users", "countries", "chart-of-accounts"]);
    expect(nav["Command Centre"]).toContain("cc-cash");
    expect(nav.Administration).toEqual(["access"]);
  });

  it("shows a delegated admin only the sections they were granted", () => {
    expect(shape(delegated("users", "growth"))).toEqual({
      Platform: ["users"],
      "Command Centre": ["command-centre", "cc-growth"],
    });
  });

  it("drops a whole section when nothing in it is granted", () => {
    expect(shape(delegated("tenants"))).toEqual({ Platform: ["tenants"] });
  });

  it("never shows Cash or Admin access to a delegated admin, whatever they hold", () => {
    const nav = shape(delegated("cash", "access", "dashboard"));
    expect(nav["Command Centre"]).toBeUndefined();
    expect(nav.Administration).toBeUndefined();
  });

  it("shows the hub alone for a grant with no page of its own", () => {
    // Mixpanel is a tab inside two dashboards, so it opens the hub and nothing else.
    expect(shape(delegated("mixpanel"))).toEqual({ "Command Centre": ["command-centre"] });
  });

  it("shows nothing at all without grants", () => {
    expect(visibleAdminNav(NO_ADMIN_ACCESS)).toEqual([]);
  });
});

describe("activeAdminNavId", () => {
  it("picks the dashboard row over the hub for a dashboard path", () => {
    const sections = visibleAdminNav({ isSuperAdmin: true, features: [] });
    expect(activeAdminNavId("/admin/command-centre/growth", sections)).toBe("cc-growth");
    expect(activeAdminNavId("/admin/command-centre", sections)).toBe("command-centre");
    expect(activeAdminNavId("/admin/tenants/12", sections)).toBe("tenants");
  });
});

describe("the Country Registry row", () => {
  it("opens for a delegated admin granted country_config, with the chart beside it", () => {
    // One grant, both screens: an account's name in South Africa and the VAT
    // rate it posts at are maintained by the same person, in one sitting.
    expect(shape(delegated("country_config"))).toEqual({
      Platform: ["countries", "chart-of-accounts"],
    });
  });

  it("stays hidden from an admin granted something else", () => {
    expect(shape(delegated("tenants")).Platform).not.toContain("countries");
  });

  it("claims a country's own page as well as the list", () => {
    const sections = visibleAdminNav({ isSuperAdmin: true, features: [] });
    expect(activeAdminNavId("/admin/countries", sections)).toBe("countries");
    expect(activeAdminNavId("/admin/countries/NZ", sections)).toBe("countries");
  });
});
