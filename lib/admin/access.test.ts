import { describe, expect, it } from "vitest";

import {
  NO_ADMIN_ACCESS,
  canAccessAdminPanel,
  canPass,
  firstAdminLanding,
  isSuperAdminUser,
  resolveAdminRoute,
  safeAdminRedirect,
  type AdminAccess,
} from "@/lib/admin/access";

const SUPER: AdminAccess = { isSuperAdmin: true, features: [] };
const delegated = (...features: string[]): AdminAccess => ({
  isSuperAdmin: false,
  features,
});

describe("isSuperAdminUser", () => {
  it("accepts the flag as a boolean or 1", () => {
    expect(isSuperAdminUser({ isSuperAdmin: true })).toBe(true);
    expect(isSuperAdminUser({ isSuperAdmin: 1 } as never)).toBe(true);
  });

  it("accepts the legacy role spellings, case-insensitively", () => {
    expect(isSuperAdminUser({ role: "Super_Admin" })).toBe(true);
    expect(isSuperAdminUser({ roles: [{ slug: "platform-admin" }] } as never)).toBe(true);
  });

  it("rejects a delegated admin and nobody at all", () => {
    expect(isSuperAdminUser({ role: "admin" })).toBe(false);
    expect(isSuperAdminUser(null)).toBe(false);
  });
});

describe("canAccessAdminPanel", () => {
  it("lets in super admins and delegated admins only", () => {
    expect(canAccessAdminPanel({ isSuperAdmin: true })).toBe(true);
    expect(canAccessAdminPanel({ role: "admin" })).toBe(true);
    expect(canAccessAdminPanel({ role: "user" })).toBe(false);
  });
});

describe("canPass", () => {
  it("never delegates a super-admin-only gate", () => {
    expect(canPass({ superAdminOnly: true }, delegated("tenants"))).toBe(false);
    expect(canPass({ superAdminOnly: true }, SUPER)).toBe(true);
  });

  it("checks one grant, or any of several", () => {
    expect(canPass({ feature: "users" }, delegated("users"))).toBe(true);
    expect(canPass({ anyOf: ["growth", "support"] }, delegated("support"))).toBe(true);
    expect(canPass({ anyOf: ["growth"] }, NO_ADMIN_ACCESS)).toBe(false);
  });
});

describe("resolveAdminRoute", () => {
  it("lets a super admin through everywhere", () => {
    expect(resolveAdminRoute("/admin/command-centre/cash", SUPER)).toEqual({ kind: "allow" });
    expect(resolveAdminRoute("/admin/access", SUPER)).toEqual({ kind: "allow" });
  });

  it("uses the dashboard's own rule over the hub's", () => {
    const access = delegated("growth");
    expect(resolveAdminRoute("/admin/command-centre", access)).toEqual({ kind: "allow" });
    expect(resolveAdminRoute("/admin/command-centre/growth", access)).toEqual({ kind: "allow" });
    expect(resolveAdminRoute("/admin/command-centre/support", access)).toEqual({
      kind: "redirect",
      href: "/admin/command-centre",
    });
  });

  it("matches whole segments, not string prefixes", () => {
    // `/admin/users-report` is not under `/admin/users`.
    expect(resolveAdminRoute("/admin/users-report", NO_ADMIN_ACCESS)).toEqual({ kind: "allow" });
  });

  it("sends someone without the grant to the first section they can open", () => {
    expect(resolveAdminRoute("/admin/dashboard", delegated("users"))).toEqual({
      kind: "redirect",
      href: "/admin/users",
    });
  });

  it("reports no access when there's nowhere to go", () => {
    expect(resolveAdminRoute("/admin/tenants/12", NO_ADMIN_ACCESS)).toEqual({ kind: "none" });
  });
});

describe("firstAdminLanding", () => {
  it("never lands a delegated admin on a super-admin-only section", () => {
    expect(firstAdminLanding(NO_ADMIN_ACCESS)).toBeNull();
    expect(firstAdminLanding(SUPER)).toBe("/admin/dashboard");
  });
});

describe("safeAdminRedirect", () => {
  it("keeps admin paths, including their query", () => {
    expect(safeAdminRedirect("/admin/tenants/4?tab=users")).toBe("/admin/tenants/4?tab=users");
  });

  it("falls back for anything outside the admin area or back to sign-in", () => {
    expect(safeAdminRedirect("/dashboard")).toBe("/admin/dashboard");
    expect(safeAdminRedirect("//evil.example/admin")).toBe("/admin/dashboard");
    expect(safeAdminRedirect("/admin/login?next=/admin")).toBe("/admin/dashboard");
    expect(safeAdminRedirect("/administrator")).toBe("/admin/dashboard");
    expect(safeAdminRedirect(null)).toBe("/admin/dashboard");
  });
});
