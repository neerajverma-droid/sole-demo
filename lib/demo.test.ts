import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiPost } from "@/lib/api/client";
import { ensureDeviceId } from "@/lib/api/device";
import { setSession } from "@/lib/api/session";
import { isDemoUser, sendDemoHeartbeat, startDemo } from "@/lib/demo";

/**
 * Starting a demo visit: a device-bound call with no credentials, whose
 * session is then an ordinary one — stored the same way a sign-in's is.
 */

vi.mock("@/lib/api/client", () => ({ apiPost: vi.fn() }));
vi.mock("@/lib/api/device", () => ({ ensureDeviceId: vi.fn() }));
vi.mock("@/lib/api/session", () => ({ setSession: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

const post = vi.mocked(apiPost);
const deviceId = vi.mocked(ensureDeviceId);

beforeEach(() => {
  vi.clearAllMocks();
  deviceId.mockResolvedValue("device-42");
});

describe("startDemo", () => {
  it("stores the session it is given and hands back the user", async () => {
    const user = { user_id: 7, is_demo: true, token: "demo_t", refresh_token: "r" };
    post.mockResolvedValue({ success: true, status: 200, data: { user } });

    const result = await startDemo();

    expect(post).toHaveBeenCalledWith("/demo/login", { device_id: "device-42", platform: "WEBP" });
    expect(setSession).toHaveBeenCalledWith(user);
    expect(result).toEqual({ ok: true, user });
  });

  it("passes on what the backend says when every seat is taken", async () => {
    post.mockResolvedValue({
      success: false,
      status: 503,
      message: "Every demo seat is in use right now. Please try again in a few minutes.",
    });

    const result = await startDemo();

    expect(result).toEqual({
      ok: false,
      message: "Every demo seat is in use right now. Please try again in a few minutes.",
    });
    expect(setSession).not.toHaveBeenCalled();
  });

  it("asks nothing of the backend without a device", async () => {
    deviceId.mockResolvedValue(null);

    const result = await startDemo();

    expect(result.ok).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });
});

describe("isDemoUser", () => {
  it("is true only for a profile the backend marked", () => {
    expect(isDemoUser({ is_demo: true })).toBe(true);
    expect(isDemoUser({})).toBe(false);
    expect(isDemoUser(null)).toBe(false);
  });
});

describe("sendDemoHeartbeat", () => {
  it("is an authenticated call, so a dead visit goes down the normal sign-out path", async () => {
    post.mockResolvedValue({ success: true, status: 200, data: {} });

    await sendDemoHeartbeat();

    expect(post).toHaveBeenCalledWith("/demo/heartbeat", {}, { auth: "bearer" });
  });
});
