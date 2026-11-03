import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = { get: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const { fetchAdminAnalytics, mapAnalytics, tenantMix } = await import("@/lib/admin/dashboard");
const { default: apiRoutes } = await import("@/config/api-routes");

beforeEach(() => apiMock.get.mockReset());

describe("mapAnalytics", () => {
  it("maps the snake_case payload and defaults missing counts to zero", () => {
    const result = mapAnalytics({
      tenants: { total: 12, active: 9, new_30d: 2 },
      recent_tenants: [{ id: 4, name: " Acme ", slug: "acme", status: "trial", created_at: "2026-09-01T00:00:00Z" }],
    });

    expect(result.tenants).toEqual({ total: 12, active: 9, trial: 0, suspended: 0, new30d: 2 });
    expect(result.users.total).toBe(0);
    expect(result.recentTenants).toEqual([
      { id: "4", name: "Acme", slug: "acme", status: "trial", createdAt: "2026-09-01T00:00:00Z" },
    ]);
  });

  it("names a tenant with no name rather than leaving the cell blank", () => {
    expect(mapAnalytics({ recent_tenants: [{ id: 1, name: "  " }] }).recentTenants[0].name).toBe(
      "Untitled tenant",
    );
  });
});

describe("fetchAdminAnalytics", () => {
  it("reads the analytics route", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { tenants: { total: 1 } } } });
    const result = await fetchAdminAnalytics();
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.superAdmin.analytics);
    expect(result.tenants.total).toBe(1);
  });

  it("throws on an unsuccessful or empty response instead of showing zeroes", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    await expect(fetchAdminAnalytics()).rejects.toThrow();
  });
});

describe("tenantMix", () => {
  it("adds the remainder as cancelled or other so the bar sums to the total", () => {
    const mix = tenantMix({ total: 10, active: 5, trial: 2, suspended: 1, new30d: 0 });
    expect(mix.map((segment) => [segment.key, segment.value])).toEqual([
      ["active", 5],
      ["trial", 2],
      ["suspended", 1],
      ["other", 2],
    ]);
    expect(mix.reduce((sum, segment) => sum + segment.percent, 0)).toBeCloseTo(100);
  });

  it("drops an empty remainder and never divides by zero", () => {
    const mix = tenantMix({ total: 0, active: 0, trial: 0, suspended: 0, new30d: 0 });
    expect(mix.some((segment) => segment.key === "other")).toBe(false);
    expect(mix.every((segment) => segment.percent === 0)).toBe(true);
  });
});
