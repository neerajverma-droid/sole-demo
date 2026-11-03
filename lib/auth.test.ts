import { beforeEach, describe, expect, it, vi } from "vitest";

import { resumeSession } from "@/lib/auth";
import { apiGet } from "@/lib/api/client";
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  refreshAccessToken,
} from "@/lib/api/session";

/**
 * Resuming a session on load: prove the token, renew it if it's spent, and
 * sign out only once neither token can buy a profile.
 *
 * The bug this guards against: an absent access token was treated as an absent
 * session, so a browser still holding a perfectly good refresh token was sent
 * to the sign-in form without a single request going out. The two cookies are
 * written together but don't always die together — only `token` is rewritten
 * on every renewal, and sole-webapp shares the domain and the cookie names.
 */

vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock("@/lib/api/session", () => ({
  clearSession: vi.fn(),
  getAccessToken: vi.fn(),
  getRefreshToken: vi.fn(),
  refreshAccessToken: vi.fn(),
  setSession: vi.fn(),
}));

const USER = { id: 1, email: "a@b.c" };

/** What `/auth/profile` answers, by turn. */
const profileReturns = (...turns: Array<typeof USER | null>) => {
  const call = vi.mocked(apiGet);
  turns.forEach((user) =>
    call.mockResolvedValueOnce(
      user
        ? { success: true, status: 200, data: { user } }
        : { success: false, status: 401 },
    ),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resumeSession", () => {
  it("is signed out, without asking the server, when neither token exists", async () => {
    vi.mocked(getAccessToken).mockReturnValue(null);
    vi.mocked(getRefreshToken).mockReturnValue(null);

    expect(await resumeSession()).toBeNull();
    expect(apiGet).not.toHaveBeenCalled();
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it("resumes on a live access token", async () => {
    vi.mocked(getAccessToken).mockReturnValue("t-live");
    profileReturns(USER);

    expect(await resumeSession()).toEqual(USER);
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("spends the refresh token when the access token has expired out", async () => {
    vi.mocked(getAccessToken).mockReturnValue(null);
    vi.mocked(getRefreshToken).mockReturnValue("r-good");
    vi.mocked(refreshAccessToken).mockResolvedValue("t-new");
    profileReturns(USER);

    expect(await resumeSession()).toEqual(USER);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("signs out when the surviving refresh token is itself dead", async () => {
    vi.mocked(getAccessToken).mockReturnValue(null);
    vi.mocked(getRefreshToken).mockReturnValue("r-dead");
    vi.mocked(refreshAccessToken).mockResolvedValue(null);

    expect(await resumeSession()).toBeNull();
    expect(apiGet).not.toHaveBeenCalled();
    expect(clearSession).toHaveBeenCalled();
  });

  it("renews once when the token is present but rejected, then resumes", async () => {
    vi.mocked(getAccessToken).mockReturnValue("t-expired");
    vi.mocked(refreshAccessToken).mockResolvedValue("t-new");
    profileReturns(null, USER);

    expect(await resumeSession()).toEqual(USER);
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("signs out when a renewed token still can't read a profile", async () => {
    vi.mocked(getAccessToken).mockReturnValue("t-expired");
    vi.mocked(refreshAccessToken).mockResolvedValue("t-new");
    profileReturns(null, null);

    expect(await resumeSession()).toBeNull();
    expect(clearSession).toHaveBeenCalled();
  });
});
