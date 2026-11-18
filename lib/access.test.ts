import { describe, expect, it } from "vitest";

import {
  hasPlanFeature,
  isActionBlocked,
  mapAccessProfile,
  type AccessProfile,
} from "@/lib/access";

const profile = (over: Partial<AccessProfile>): AccessProfile => ({
  permissions: null,
  isLoginAs: false,
  allowedFeatures: null,
  assetLimit: { canAdd: true, used: null, max: null, displayLimit: false, resetsOn: null },
  ...over,
});

describe("isActionBlocked", () => {
  it("never blocks before the profile has loaded", () => {
    expect(isActionBlocked(undefined, "invoice", "edit")).toBe(false);
  });

  it("never blocks the owner, even if a grant is attached", () => {
    expect(
      isActionBlocked(
        profile({ isLoginAs: false, permissions: { invoice: ["view"] } }),
        "invoice",
        "edit",
      ),
    ).toBe(false);
  });

  it("treats a login-as session with no grant as unrestricted", () => {
    expect(
      isActionBlocked(profile({ isLoginAs: true, permissions: null }), "invoice", "delete"),
    ).toBe(false);
  });

  it("blocks an action the grant doesn't name, and allows one it does", () => {
    const accountant = profile({
      isLoginAs: true,
      permissions: { invoice: ["view", "edit"] },
    });
    expect(isActionBlocked(accountant, "invoice", "edit")).toBe(false);
    expect(isActionBlocked(accountant, "invoice", "delete")).toBe(true);
  });

  it("blocks a module the grant doesn't mention at all", () => {
    expect(
      isActionBlocked(
        profile({ isLoginAs: true, permissions: { expense: ["view"] } }),
        "invoice",
        "view",
      ),
    ).toBe(true);
  });

  it("reads a grant stored as an object of actions", () => {
    expect(
      isActionBlocked(
        profile({
          isLoginAs: true,
          permissions: { invoice: { 0: "view", 1: "edit" } },
        }),
        "invoice",
        "edit",
      ),
    ).toBe(false);
  });
});

describe("hasPlanFeature", () => {
  it("withholds nothing before the profile has loaded", () => {
    expect(hasPlanFeature(undefined, "transactions")).toBe(true);
  });

  it("follows the feature list the server computed", () => {
    const bundle = profile({ allowedFeatures: ["sales", "transactions"] });
    expect(hasPlanFeature(bundle, "transactions")).toBe(true);
    expect(hasPlanFeature(bundle, "payments")).toBe(false);
  });

  it("falls back to the free tier when the profile names no features", () => {
    expect(hasPlanFeature(profile({}), "sales")).toBe(true);
    expect(hasPlanFeature(profile({}), "transactions")).toBe(false);
  });
});

describe("mapAccessProfile", () => {
  it("reads the three fields and ignores junk in the feature list", () => {
    expect(
      mapAccessProfile({
        permissions: { invoice: ["view"] },
        isLoginAs: true,
        allowed_features: ["sales", 3, null, "transactions"],
      }),
    ).toEqual({
      permissions: { invoice: ["view"] },
      isLoginAs: true,
      allowedFeatures: ["sales", "transactions"],
      assetLimit: { canAdd: true, used: null, max: null, displayLimit: false, resetsOn: null },
    });
  });

  it("treats an empty or missing profile as unrestricted", () => {
    expect(mapAccessProfile(undefined)).toEqual({
      permissions: null,
      isLoginAs: false,
      allowedFeatures: null,
      assetLimit: { canAdd: true, used: null, max: null, displayLimit: false, resetsOn: null },
    });
  });

  it("reads the free-tier asset allowance from the profile's can block", () => {
    expect(
      mapAccessProfile({
        can: { add_asset: false, assets: "3", max_assets: 3, display_limit_sec: true, limit_reset: "1 December" },
      }).assetLimit,
    ).toEqual({ canAdd: false, used: 3, max: 3, displayLimit: true, resetsOn: "1 December" });
    // Missing add_asset is not a refusal.
    expect(mapAccessProfile({ can: {} }).assetLimit.canAdd).toBe(true);
  });
});
