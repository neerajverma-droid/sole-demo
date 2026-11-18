import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({ apiPost: vi.fn() }));
vi.mock("@/lib/api/device", () => ({ ensureDeviceId: vi.fn() }));
vi.mock("@/lib/api/session", () => ({ setSession: vi.fn() }));

import { apiPost } from "@/lib/api/client";
import { ensureDeviceId } from "@/lib/api/device";
import { setSession } from "@/lib/api/session";
import { activateAccount, isActivationToken, lookupActivation } from "@/lib/partner-activation";

const TOKEN = "a".repeat(64);

beforeEach(() => vi.clearAllMocks());

describe("isActivationToken", () => {
  it("accepts only 64 hex characters", () => {
    expect(isActivationToken(TOKEN)).toBe(true);
    expect(isActivationToken("abc")).toBe(false);
    expect(isActivationToken(null)).toBe(false);
    expect(isActivationToken("g".repeat(64))).toBe(false);
  });
});

describe("lookupActivation", () => {
  it("doesn't call the server for a malformed link", async () => {
    expect(await lookupActivation("nope")).toMatchObject({ ok: false });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("posts the token in the body (never the URL) and returns the details", async () => {
    vi.mocked(apiPost).mockResolvedValue({ success: true, status: 200, data: { email: "c@x.com", first_name: "Jane", business_name: "Jane Co", accountant: "Firm" } });
    const out = await lookupActivation(TOKEN);
    expect(vi.mocked(apiPost).mock.calls[0]).toEqual(["/partner-referral/activate/lookup", { token: TOKEN }]);
    expect(out).toEqual({ ok: true, details: { email: "c@x.com", first_name: "Jane", business_name: "Jane Co", accountant: "Firm" } });
  });

  it("passes the server's message for an expired or used link", async () => {
    vi.mocked(apiPost).mockResolvedValue({ success: false, status: 410, message: "This link has expired or was already used." });
    expect(await lookupActivation(TOKEN)).toEqual({ ok: false, message: "This link has expired or was already used." });
  });
});

describe("activateAccount", () => {
  it("sets the password with a device id and stores the session", async () => {
    vi.mocked(ensureDeviceId).mockResolvedValue(42 as never);
    const user = { id: 800, email: "c@x.com", token: "t" };
    vi.mocked(apiPost).mockResolvedValue({ success: true, status: 200, data: { user } });
    const out = await activateAccount(TOKEN, "Str0ng!pass");
    expect(vi.mocked(apiPost).mock.calls[0]).toEqual(["/partner-referral/activate", { token: TOKEN, password: "Str0ng!pass", confirm_password: "Str0ng!pass", device_id: 42 }]);
    expect(setSession).toHaveBeenCalledWith(user);
    expect(out).toEqual({ ok: true, user });
  });

  it("stops without a device, and reports server errors", async () => {
    vi.mocked(ensureDeviceId).mockResolvedValue(null as never);
    expect(await activateAccount(TOKEN, "Str0ng!pass")).toMatchObject({ ok: false });
    expect(apiPost).not.toHaveBeenCalled();

    vi.mocked(ensureDeviceId).mockResolvedValue(42 as never);
    vi.mocked(apiPost).mockResolvedValue({ success: false, status: 410, message: "expired" });
    expect(await activateAccount(TOKEN, "Str0ng!pass")).toEqual({ ok: false, message: "expired" });
    expect(setSession).not.toHaveBeenCalled();
  });
});
