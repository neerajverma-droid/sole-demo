import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = { get: vi.fn(), post: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const {
  deleteUserApi,
  emailConfirmed,
  exportFileName,
  exportUsersCsv,
  fetchPlatformUsersPage,
  impersonateBlockedReason,
  impersonateUserApi,
  mapPlatformUser,
  platformLabel,
  reasonShortfall,
  signupSourceLabel,
  userDisplayName,
  userInitials,
  usersParams,
} = await import("@/lib/admin/users");
const { default: apiRoutes } = await import("@/config/api-routes");

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.post.mockReset();
});

const FILTERS = { search: "", platform: "all", accounts: "Active" } as const;

describe("usersParams", () => {
  it("sends nothing for the defaults", () => {
    expect(usersParams(FILTERS)).toEqual({});
  });

  it("maps each filter to the backend's params", () => {
    expect(usersParams({ search: " ana ", platform: "IPHN", accounts: "Deleted" })).toEqual({
      q: "ana",
      platform: "IPHN",
      deleted: "only",
    });
    expect(usersParams({ ...FILTERS, accounts: "All" })).toEqual({ deleted: "all" });
  });
});

describe("mapPlatformUser", () => {
  it("maps the row and normalises the flags", () => {
    expect(
      mapPlatformUser({
        id: 4,
        email: "a@b.co",
        tenant_id: 2,
        platform: "WEBP",
        signup_source: "3",
        account_verified: 1,
        first_name: "Ana",
      }),
    ).toMatchObject({ id: "4", tenantId: "2", signupSource: 3, verified: true, deletedAt: null, firstName: "Ana" });
  });

  it("treats a zero tenant and source as none", () => {
    expect(mapPlatformUser({ id: 1, tenant_id: 0, signup_source: 0 })).toMatchObject({
      tenantId: null,
      signupSource: null,
      verified: false,
    });
  });
});

describe("labels", () => {
  it("names platforms and sign-up sources", () => {
    expect(platformLabel("IPHN")).toBe("iOS");
    expect(platformLabel(null)).toBe("Unknown");
    expect(signupSourceLabel(5)).toBe("Apple");
    expect(signupSourceLabel(9)).toBe("Source 9");
  });

  it("builds a name and initials, falling back to the email", () => {
    expect(userDisplayName({ firstName: "", lastName: "", email: "x@y.z" })).toBe("x@y.z");
    expect(userInitials({ firstName: "Ana", lastName: "Lee", email: "" })).toBe("AL");
  });
});

describe("impersonateBlockedReason", () => {
  it("blocks deleted accounts and accounts outside a tenant", () => {
    expect(impersonateBlockedReason({ tenantId: "1", deletedAt: null }, true)).toBeNull();
    expect(impersonateBlockedReason({ tenantId: null, deletedAt: null }, true)).toMatch(/tenant/);
    expect(impersonateBlockedReason({ tenantId: "1", deletedAt: "2026-01-01" }, true)).toMatch(/Deleted/);
  });

  it("needs the tenants grant, because the backend gates impersonation on it", () => {
    expect(impersonateBlockedReason({ tenantId: "1", deletedAt: null }, false)).toMatch(/Tenants/);
  });
});

describe("fetchPlatformUsersPage", () => {
  it("sends the filters with page and limit", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [{ id: 1 }], meta: { total: 31 } } });
    const result = await fetchPlatformUsersPage({
      page: 2,
      pageSize: 25,
      filters: { ...FILTERS, platform: "ANDR" },
    });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.superAdmin.users, {
      params: { platform: "ANDR", page: 2, limit: 25 },
    });
    expect(result.pageInfo).toMatchObject({ page: 2, total: 31, from: 26, to: 31 });
  });
});

describe("exportUsersCsv", () => {
  it("asks for CSV as a blob with the same filters", async () => {
    apiMock.get.mockResolvedValue({ data: new Blob(["id"]) });
    await exportUsersCsv({ ...FILTERS, search: "acme" });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.superAdmin.users, {
      params: { q: "acme", format: "csv" },
      responseType: "blob",
    });
  });

  it("names the file by date", () => {
    expect(exportFileName(new Date(2026, 0, 5))).toBe("users-export-2026-01-05.csv");
  });
});

describe("impersonateUserApi", () => {
  it("returns the sign-in link", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { impersonate_url: "https://x/auth/impersonate?token=t" } } });
    const result = await impersonateUserApi("2", "9");
    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.superAdmin.impersonate("2", "9"));
    expect(result.url).toContain("token=t");
  });

  it("throws when no link comes back", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    await expect(impersonateUserApi("2", "9")).rejects.toThrow();
  });
});

describe("deleteUserApi", () => {
  it("posts the typed email and reason, trimmed", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { alreadyDeleted: false } } });
    await deleteUserApi("9", " a@b.co ", "  Requested by the owner  ");
    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.superAdmin.deleteUser("9"), {
      confirmEmail: "a@b.co",
      reason: "Requested by the owner",
    });
  });
});

describe("delete form checks", () => {
  it("matches the email case-insensitively and counts the reason shortfall", () => {
    expect(emailConfirmed(" A@B.co ", "a@b.co")).toBe(true);
    expect(emailConfirmed("", "")).toBe(false);
    expect(reasonShortfall("  short ")).toBe(5);
    expect(reasonShortfall("long enough reason")).toBe(0);
  });
});
