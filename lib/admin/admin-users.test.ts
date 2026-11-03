import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = { get: vi.fn(), post: vi.fn(), delete: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const {
  GRANTABLE_FEATURE_KEYS,
  adminDisplayName,
  adminInitials,
  createAdminIssues,
  createAdminUserApi,
  featureLabel,
  fetchAdminUsersPage,
  grantFeaturesApi,
  grantedCount,
  mapAdminUser,
  revokeAllAccessApi,
  revokeFeaturesApi,
} = await import("@/lib/admin/admin-users");
const { default: apiRoutes } = await import("@/config/api-routes");

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.post.mockReset();
  apiMock.delete.mockReset();
});

describe("GRANTABLE_FEATURE_KEYS", () => {
  it("offers the platform sections and dashboards but never cash", () => {
    expect(GRANTABLE_FEATURE_KEYS).toEqual(expect.arrayContaining(["dashboard", "tenants", "users", "growth", "mixpanel"]));
    expect(GRANTABLE_FEATURE_KEYS).not.toContain("cash");
    expect(new Set(GRANTABLE_FEATURE_KEYS).size).toBe(GRANTABLE_FEATURE_KEYS.length);
  });
});

describe("featureLabel", () => {
  it("names known keys and falls back to the key itself", () => {
    expect(featureLabel("customerHealth")).toBe("Customer Health");
    expect(featureLabel("somethingNew")).toBe("somethingNew");
  });
});

describe("mapAdminUser", () => {
  it("flattens userInfo and keeps only string grants", () => {
    expect(
      mapAdminUser({ id: 9, email: "a@b.co", userInfo: { first_name: " Ana " }, features: ["users", 3] }),
    ).toEqual({ id: "9", email: "a@b.co", firstName: "Ana", lastName: "", createdAt: null, features: ["users"] });
  });
});

describe("adminDisplayName / adminInitials", () => {
  it("prefers the name, else the email", () => {
    expect(adminDisplayName({ firstName: "Ana", lastName: "Lee", email: "x@y.z" })).toBe("Ana Lee");
    expect(adminDisplayName({ firstName: "", lastName: "", email: "x@y.z" })).toBe("x@y.z");
    expect(adminInitials({ firstName: "Ana", lastName: "Lee", email: "" })).toBe("AL");
    expect(adminInitials({ firstName: "", lastName: "", email: "zed@y.z" })).toBe("ZE");
  });
});

describe("grantedCount", () => {
  it("counts only sections this screen offers", () => {
    expect(grantedCount(["users", "cash", "unknown"])).toBe(1);
  });
});

describe("fetchAdminUsersPage", () => {
  it("sends the search and maps the page", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [{ id: 1 }], meta: { total: 1 } } });
    const result = await fetchAdminUsersPage({ page: 1, pageSize: 20, search: " ana " });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.superAdmin.adminUsers, {
      params: { page: 1, limit: 20, q: "ana" },
    });
    expect(result.admins[0].id).toBe("1");
  });
});

describe("createAdminUserApi", () => {
  it("lowercases the email and de-dupes the grants", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 5, email: "ana@sole.com" } } });
    await createAdminUserApi({
      email: " Ana@Sole.com ",
      password: "longenough",
      firstName: "Ana",
      lastName: "",
      featureKeys: ["users", "users", "growth"],
    });
    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.superAdmin.adminUsers, {
      email: "ana@sole.com",
      password: "longenough",
      firstName: "Ana",
      lastName: "",
      featureKeys: ["users", "growth"],
    });
  });
});

describe("grant and revoke", () => {
  it("grants in one batch and revokes with the keys in the body", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    apiMock.delete.mockResolvedValue({ data: { success: true } });

    await grantFeaturesApi("5", ["users", "tenants"]);
    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.superAdmin.featureAccess, {
      userId: "5",
      featureKeys: ["users", "tenants"],
    });

    await revokeFeaturesApi("5", ["users"]);
    expect(apiMock.delete).toHaveBeenCalledWith(apiRoutes.superAdmin.featureAccess, {
      data: { userId: "5", featureKeys: ["users"] },
    });

    await revokeAllAccessApi("5");
    expect(apiMock.delete).toHaveBeenLastCalledWith(apiRoutes.superAdmin.adminUser("5"));
  });
});

describe("createAdminIssues", () => {
  it("needs a valid email and an 8-character password", () => {
    expect(createAdminIssues({ email: "a@b.co", password: "12345678", firstName: "", lastName: "", featureKeys: [] })).toEqual({});
    expect(
      Object.keys(createAdminIssues({ email: "nope", password: "short", firstName: "", lastName: "", featureKeys: [] })).sort(),
    ).toEqual(["email", "password"]);
  });
});
