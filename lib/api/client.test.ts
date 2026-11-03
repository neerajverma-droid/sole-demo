import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiGet } from "@/lib/api/client";
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshAccessToken,
} from "@/lib/api/session";

/**
 * What a bearer call does when the answer says the session is no good.
 *
 * The case this is here for: the cookies are GONE — cleared by hand in
 * devtools, evicted, expired — so the request goes out with no Authorization
 * header and comes back "Missing Authorization header". There is nothing to
 * renew with, and the interceptor's own "did we have a session?" check reads
 * false (the token had already gone), so this used to end in a plain rejected
 * promise: no clear, no redirect, and a screen that kept firing calls while
 * looking signed in.
 */

vi.mock("@/lib/api/session", () => ({
  clearSession: vi.fn(),
  getAccessToken: vi.fn(),
  getRefreshToken: vi.fn(),
  redirectToLogin: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

vi.mock("@/lib/api/cookies", () => ({ getBusinessId: () => null }));

/** The backend's answer when no Authorization header arrives. */
const unauthorised = () =>
  ({
    ok: false,
    status: 401,
    json: async () => ({
      success: false,
      message: "Missing Authorization header",
    }),
  }) as unknown as Response;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(unauthorised()));
});

describe("a bearer call with no tokens left", () => {
  beforeEach(() => {
    vi.mocked(getAccessToken).mockReturnValue(null);
    vi.mocked(getRefreshToken).mockReturnValue(null);
  });

  it("ends the session instead of failing quietly", async () => {
    const result = await apiGet("/dashboard/summary", { auth: "bearer" });

    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/sign in again/i);
  });

  it("doesn't try to renew what it hasn't got", async () => {
    await apiGet("/dashboard/summary", { auth: "bearer" });

    // No refresh token to spend and no access token to re-arm one with — a
    // renewal here can only produce the same 401 and, on a burst of parallel
    // calls, spend a rotation each time.
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("leaves the redirect to the caller that asked for one", async () => {
    await apiGet("/dashboard/summary", { auth: "bearer" });
    // The default is no hard navigation: clearing the session tells the
    // provider, and the guard is what moves the person.
    expect(redirectToLogin).not.toHaveBeenCalled();

    await apiGet("/dashboard/summary", {
      auth: "bearer",
      redirectOnAuthFailure: true,
    });
    expect(redirectToLogin).toHaveBeenCalledWith("session_expired");
  });

  it("leaves a public call alone — an anonymous 401 is not a sign-out", async () => {
    const result = await apiGet("/quote/public");

    expect(clearSession).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });
});

describe("a bearer call whose token is merely stale", () => {
  it("renews and replays rather than ending the session", async () => {
    vi.mocked(getAccessToken).mockReturnValue("t-expired");
    vi.mocked(getRefreshToken).mockReturnValue("r-good");
    vi.mocked(refreshAccessToken).mockResolvedValue("t-new");
    vi.mocked(fetch)
      .mockResolvedValueOnce(unauthorised())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { total: 1 } }),
      } as unknown as Response);

    const result = await apiGet("/dashboard/summary", { auth: "bearer" });

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(clearSession).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});
