import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The guard that stops a route's own 401 from burning a refresh.
 *
 * `/auth/refresh` rotates the refresh token — each one is single-use. A route
 * that answers 401 for a reason of its own (`/bank/accounts` returns
 * "Authentication required" when it can't resolve an owner) made the
 * interceptor refresh on every single call, spending a rotation each time.
 * Two of those racing meant the second sent a refresh token the first had
 * already replaced, which really does end the session.
 */

let fakeDocument: { cookie: string };

beforeEach(() => {
  vi.resetModules();
  fakeDocument = { cookie: "" };
  vi.stubGlobal("document", fakeDocument);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A refresh response carrying a rotated pair, as the backend sends it. */
function refreshResponse(token: string) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      data: { token, refresh_token: `r-${token}` },
    }),
  };
}

describe("isFreshlyMintedToken", () => {
  it("is false before anything has been refreshed", async () => {
    const { isFreshlyMintedToken } = await import("@/lib/api/session");
    expect(isFreshlyMintedToken("anything")).toBe(false);
  });

  it("is false for a null token rather than throwing", async () => {
    const { isFreshlyMintedToken } = await import("@/lib/api/session");
    expect(isFreshlyMintedToken(null)).toBe(false);
  });

  it("recognises the token a refresh just produced", async () => {
    const session = await import("@/lib/api/session");
    session.setSession({ refresh_token: "r-old" });
    vi.mocked(fetch).mockResolvedValue(
      refreshResponse("t-new") as unknown as Response,
    );

    await session.refreshAccessToken();

    expect(session.isFreshlyMintedToken("t-new")).toBe(true);
  });

  it("does not vouch for any other token", async () => {
    const session = await import("@/lib/api/session");
    session.setSession({ refresh_token: "r-old" });
    vi.mocked(fetch).mockResolvedValue(
      refreshResponse("t-new") as unknown as Response,
    );

    await session.refreshAccessToken();

    // The token it replaced must not inherit the freshness — otherwise a
    // genuinely expired token would be trusted for the whole window.
    expect(session.isFreshlyMintedToken("t-old")).toBe(false);
  });

  it("stops vouching once the window has passed", async () => {
    vi.useFakeTimers();
    const session = await import("@/lib/api/session");
    session.setSession({ refresh_token: "r-old" });
    vi.mocked(fetch).mockResolvedValue(
      refreshResponse("t-new") as unknown as Response,
    );

    await session.refreshAccessToken();
    expect(session.isFreshlyMintedToken("t-new")).toBe(true);

    // 30s is the window; past it, a 401 on this token is worth a refresh again.
    vi.advanceTimersByTime(31_000);
    expect(session.isFreshlyMintedToken("t-new")).toBe(false);
  });

  it("forgets the token when the session is cleared", async () => {
    const session = await import("@/lib/api/session");
    session.setSession({ refresh_token: "r-old" });
    vi.mocked(fetch).mockResolvedValue(
      refreshResponse("t-new") as unknown as Response,
    );

    await session.refreshAccessToken();
    session.clearSession();

    // A new sign-in starts with no inherited trust — otherwise the next
    // session's first 401 would be waved through on the last one's credit.
    expect(session.isFreshlyMintedToken("t-new")).toBe(false);
  });
});

/**
 * Where a dead session must not bounce from. A refresh failing on a sign-in
 * screen redirecting to sign-in would reload the page the person is typing on.
 */
describe("isSignedOutRoute", () => {
  it("covers sign-in, sign-up and the /auth/* steps around them", async () => {
    const { isSignedOutRoute } = await import("@/lib/api/session");
    for (const path of [
      "/login",
      "/register",
      "/auth/forgot-password",
      "/auth/verify-email",
      "/accountant-invite",
    ]) {
      expect(isSignedOutRoute(path)).toBe(true);
    }
  });

  it("does not cover the app, or paths that merely share a prefix", async () => {
    const { isSignedOutRoute } = await import("@/lib/api/session");
    for (const path of ["/", "/dashboard", "/login-help", "/registers", "/authors"]) {
      expect(isSignedOutRoute(path)).toBe(false);
    }
  });
});
