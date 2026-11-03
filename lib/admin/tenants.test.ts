import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = { get: vi.fn(), post: vi.fn(), patch: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const {
  createTenantApi,
  createTenantIssues,
  fetchTenantsPage,
  mapTenant,
  seatUsage,
  setTenantStatusApi,
  slugify,
  tenantUrl,
  tenantsPageInfo,
} = await import("@/lib/admin/tenants");
const { default: apiRoutes } = await import("@/config/api-routes");

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.post.mockReset();
  apiMock.patch.mockReset();
});

const validInput = {
  name: "Acme",
  slug: "acme",
  adminEmail: "",
  adminFirstName: "",
  adminLastName: "",
  maxUsers: 10,
};

describe("mapTenant", () => {
  it("maps the row and defaults missing counts", () => {
    expect(mapTenant({ id: 3, name: "Acme", slug: "acme", status: "active", member_count: 4 })).toEqual({
      id: "3",
      name: "Acme",
      slug: "acme",
      status: "active",
      customDomain: null,
      maxUsers: 0,
      memberCount: 4,
      createdAt: null,
    });
  });
});

describe("tenantsPageInfo", () => {
  it("builds the range label bounds", () => {
    expect(tenantsPageInfo(2, 20, 45)).toEqual({ page: 2, pageCount: 3, total: 45, from: 21, to: 40 });
  });

  it("clamps a page past the end and handles no results", () => {
    expect(tenantsPageInfo(9, 20, 45).page).toBe(3);
    expect(tenantsPageInfo(1, 20, 0)).toEqual({ page: 1, pageCount: 1, total: 0, from: 0, to: 0 });
  });
});

describe("tenantUrl", () => {
  it("prefers a custom domain, then the subdomain", () => {
    expect(tenantUrl({ slug: "acme", customDomain: "books.acme.com" })).toBe("https://books.acme.com");
    expect(tenantUrl({ slug: "acme", customDomain: null })).toMatch(/^https:\/\/acme\./);
    expect(tenantUrl({ slug: "", customDomain: null })).toBeNull();
  });
});

describe("seatUsage", () => {
  it("caps at 100 and is 0 without a limit", () => {
    expect(seatUsage({ memberCount: 5, maxUsers: 10 })).toBe(50);
    expect(seatUsage({ memberCount: 12, maxUsers: 10 })).toBe(100);
    expect(seatUsage({ memberCount: 5, maxUsers: 0 })).toBe(0);
  });
});

describe("fetchTenantsPage", () => {
  it("sends page, limit, search and the lowercased status", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [{ id: 1 }], meta: { total: 1 } } });
    const result = await fetchTenantsPage({ page: 1, pageSize: 25, search: " acme ", status: "Suspended" });

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.superAdmin.tenants, {
      params: { page: 1, limit: 25, q: "acme", status: "suspended" },
    });
    expect(result.tenants).toHaveLength(1);
    expect(result.pageInfo.total).toBe(1);
  });

  it("leaves out an empty search and the All filter", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [], meta: { total: 0 } } });
    await fetchTenantsPage({ page: 1, pageSize: 25, search: "  ", status: "All" });
    expect(apiMock.get.mock.calls[0][1]).toEqual({ params: { page: 1, limit: 25 } });
  });
});

describe("createTenantApi", () => {
  it("posts plain JSON and drops empty admin fields", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { tenant: { id: 7, name: "Acme" } } } });
    const tenant = await createTenantApi({ ...validInput, adminEmail: " owner@acme.com " });

    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.superAdmin.tenants, {
      name: "Acme",
      slug: "acme",
      max_users: 10,
      admin_email: "owner@acme.com",
    });
    expect(tenant.id).toBe("7");
  });
});

describe("setTenantStatusApi", () => {
  it("patches the status route", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });
    await setTenantStatusApi("4", "suspended");
    expect(apiMock.patch).toHaveBeenCalledWith(apiRoutes.superAdmin.tenantStatus("4"), { status: "suspended" });
  });
});

describe("slugify", () => {
  it("makes a subdomain-safe slug", () => {
    expect(slugify("Acme & Co.")).toBe("acme-co");
    expect(slugify("  Café Zoë  ")).toBe("cafe-zoe");
    expect(slugify("x".repeat(80))).toHaveLength(63);
  });
});

describe("createTenantIssues", () => {
  it("passes a valid form", () => {
    expect(createTenantIssues(validInput)).toEqual({});
  });

  it("flags each field the backend would reject", () => {
    const issues = createTenantIssues({ ...validInput, name: " ", slug: "-Bad-", adminEmail: "nope", maxUsers: 0 });
    expect(Object.keys(issues).sort()).toEqual(["adminEmail", "maxUsers", "name", "slug"]);
  });
});
