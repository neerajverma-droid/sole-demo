import CryptoJS from "crypto-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Accountant (SPM) referral links: what a link turns into, how long it is kept,
 * and the invite sign-up's three outcomes.
 */

vi.mock("@/lib/api/client", () => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock("@/lib/api/device", () => ({ ensureDeviceId: vi.fn() }));
vi.mock("@/lib/api/session", () => ({
  getAccessToken: vi.fn(),
  setSession: vi.fn(),
}));

import { apiGet, apiPost } from "@/lib/api/client";
import { ensureDeviceId } from "@/lib/api/device";
import { getAccessToken, setSession } from "@/lib/api/session";
import {
  buildSpmReferralPayload,
  captureSpmReferral,
  clearSpmReferral,
  fetchMySpmReferral,
  getSpmReferral,
  parseSpmReferral,
  signUpFromInvite,
  updateSpmReferral,
} from "@/lib/spm-referral";

/** Encrypted the way the backend does it: base64url(iv + ":" + ciphertext). */
function encryptLikeBackend(value: unknown): string {
  const iv = CryptoJS.lib.WordArray.random(16);
  const key = CryptoJS.SHA256(process.env.NEXT_PUBLIC_SECRET_KEY as string);
  const cipher = CryptoJS.AES.encrypt(JSON.stringify(value), key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  }).toString();
  const combined = `${CryptoJS.enc.Base64.stringify(iv)}:${cipher}`;
  return btoa(combined).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A localStorage good enough for the module: get, set and remove. */
function stubStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal("window", {
    location: { search: "", hostname: "localhost" },
    localStorage: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    },
  });
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  stubStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("parseSpmReferral", () => {
  it("reads a plain link, keeping the valid optional details", () => {
    const referral = parseSpmReferral(
      "?spm_accountant_id=acc-7&email=Jane+test@Example.com&name=Jane%20Doe" +
        "&abn=51%20824%20753%20556&industry_id=12&phone=%2B61400000000&coupon_code=SPM10&sig=s&exp=99",
    );
    expect(referral).toMatchObject({
      accountant_id: "acc-7",
      // "+" in a query reads back as a space; an address can't hold one.
      email: "jane+test@example.com",
      name: "Jane Doe",
      abn: "51824753556",
      industry_id: "12",
      phone: "+61400000000",
      coupon_code: "SPM10",
      sig: "s",
      exp: "99",
    });
  });

  it("drops a bad optional value rather than refusing the link", () => {
    const referral = parseSpmReferral(
      "?spm_accountant_id=acc-7&email=jane@example.com&abn=123&business_email=nope&industry_id=x",
    );
    expect(referral).toMatchObject({ abn: "", business_email: "", industry_id: "" });
  });

  it("reads the client's country, and takes another country's business number by its own length", () => {
    const base = "?spm_accountant_id=acc-7&email=jane@example.com";
    expect(parseSpmReferral(`${base}&country_iso2=nz`)).toMatchObject({
      country_iso2: "NZ",
    });
    expect(
      parseSpmReferral(`${base}&country_iso2=NZ&abn=9429041234567`),
    ).toMatchObject({ abn: "9429041234567" });
    // Without a country an ABN is 11 digits, so an NZBN is dropped.
    expect(parseSpmReferral(`${base}&abn=9429041234567`)).toMatchObject({
      abn: "",
      country_iso2: "",
    });
    for (const bad of ["NZL", "N", "1Z"]) {
      expect(parseSpmReferral(`${base}&country_iso2=${bad}`)).toMatchObject({
        country_iso2: "",
      });
    }
  });

  it("is not a referral without the accountant id or a valid email", () => {
    expect(parseSpmReferral("?email=jane@example.com")).toBeNull();
    expect(parseSpmReferral("?spm_accountant_id=acc-7&email=jane")).toBeNull();
    expect(parseSpmReferral("")).toBeNull();
  });

  it("reads an encrypted `data` link, and that alone", () => {
    const data = encryptLikeBackend({
      accountant_id: "acc-9",
      email: "client@example.com",
      business_name: "Client Co",
    });
    const referral = parseSpmReferral(
      `?data=${data}&spm_accountant_id=ignored&email=other@example.com`,
    );
    expect(referral).toMatchObject({
      accountant_id: "acc-9",
      email: "client@example.com",
      business_name: "Client Co",
    });
  });

  it("keeps the partner from an encrypted link Sole emailed (any onboarded partner)", () => {
    const data = encryptLikeBackend({
      partner: "sole_command_centre",
      accountant_id: "acc-9",
      email: "client@example.com",
    });
    const referral = parseSpmReferral(`?data=${data}`);
    expect(referral?.partner).toBe("sole_command_centre");
    expect(buildSpmReferralPayload(referral)).toMatchObject({ partner: "sole_command_centre", accountant_id: "acc-9" });
  });

  it("reads ?partner= on a plain link, drops a malformed one, and leaves it out when absent", () => {
    expect(parseSpmReferral("?partner=acme_cc&spm_accountant_id=a&email=j@example.com")?.partner).toBe("acme_cc");
    expect(parseSpmReferral("?partner=Bad%20Slug!&spm_accountant_id=a&email=j@example.com")?.partner).toBe("");
    // An old SPM link: no partner goes up, and the backend treats it as SPM.
    expect(buildSpmReferralPayload(parseSpmReferral("?spm_accountant_id=a&email=j@example.com"))).not.toHaveProperty("partner");
  });

  it("treats a `data` value that won't decrypt as an invalid link", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      parseSpmReferral("?data=garbage&spm_accountant_id=acc-7&email=jane@example.com"),
    ).toBeNull();
  });
});

describe("keeping the referral across the sign-up hops", () => {
  const link = "?spm_accountant_id=acc-7&email=jane@example.com&sig=s&exp=1";

  it("captures from the URL, then serves the kept copy on pages without the params", () => {
    expect(captureSpmReferral(link)?.accountant_id).toBe("acc-7");
    expect(captureSpmReferral("")?.accountant_id).toBe("acc-7");
    expect(getSpmReferral()?.email).toBe("jane@example.com");
  });

  it("expires after a day", () => {
    vi.useFakeTimers();
    captureSpmReferral(link);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    expect(getSpmReferral()).toBeNull();
  });

  it("takes the client's edits but never the accountant id or signature", () => {
    captureSpmReferral(link);
    const next = updateSpmReferral({
      email: "new@example.com",
      accountant_id: "forged",
      sig: "forged",
    });
    expect(next).toMatchObject({ email: "new@example.com", accountant_id: "acc-7", sig: "s" });
  });

  it("never lets the client's edits change the partner", () => {
    captureSpmReferral(`${link}&partner=acme_cc`);
    expect(updateSpmReferral({ partner: "spm" })?.partner).toBe("acme_cc");
  });

  it("is forgotten once cleared", () => {
    captureSpmReferral(link);
    clearSpmReferral();
    expect(getSpmReferral()).toBeNull();
  });

  it("sends only the filled-in fields", () => {
    const payload = buildSpmReferralPayload(parseSpmReferral(link));
    expect(payload).toEqual({ accountant_id: "acc-7", email: "jane@example.com", sig: "s", exp: "1" });
    expect(buildSpmReferralPayload(null)).toBeUndefined();
  });
});

describe("fetchMySpmReferral", () => {
  it("doesn't ask without a session — an anonymous call would sign the visitor out", async () => {
    vi.mocked(getAccessToken).mockReturnValue(null);
    expect(await fetchMySpmReferral()).toBeNull();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("returns the server's copy for a signed-in client", async () => {
    vi.mocked(getAccessToken).mockReturnValue("token");
    vi.mocked(apiGet).mockResolvedValue({ success: true, status: 200, data: { business_name: "Client Co" } });
    expect(await fetchMySpmReferral()).toEqual({ business_name: "Client Co" });
    expect(apiGet).toHaveBeenCalledWith("/spm-referral/me", { auth: "bearer" });
  });
});

describe("signUpFromInvite", () => {
  const params = {
    email: " Jane@Example.com ",
    password: "Passw0rd!",
    spm_referral: { accountant_id: "acc-7", email: "jane@example.com" },
  };

  beforeEach(() => {
    vi.mocked(ensureDeviceId).mockResolvedValue(42 as never);
  });

  it("a trusted invite is ready at once, with a session", async () => {
    const user = { id: 1, email: "jane@example.com", token: "t" };
    vi.mocked(apiPost).mockResolvedValue({ success: true, status: 200, data: { user } });
    const result = await signUpFromInvite(params);
    expect(result).toEqual({ ok: true, status: "ready", user });
    expect(setSession).toHaveBeenCalledWith(user);
    expect(vi.mocked(apiPost).mock.calls[0][0]).toBe("/spm-referral/signup");
    expect(vi.mocked(apiPost).mock.calls[0][1]).toMatchObject({
      email: "jane@example.com",
      confirm_password: "Passw0rd!",
      device_id: 42,
      // The default tenant on a host without a tenant subdomain.
      tenant: expect.any(String),
      spm_referral: params.spm_referral,
    });
  });

  it("any other invite waits for the verification email", async () => {
    vi.mocked(apiPost).mockResolvedValue({ success: true, status: 200, data: { pending_verification: true } });
    expect(await signUpFromInvite(params)).toEqual({ ok: true, status: "verify" });
    expect(setSession).not.toHaveBeenCalled();
  });

  it("names an address that is already an account", async () => {
    vi.mocked(apiPost).mockResolvedValue({ success: false, status: 200, message: "Email already in use." });
    expect(await signUpFromInvite(params)).toMatchObject({ ok: false, reason: "exists" });
  });

  it("says so when the browser can't be registered", async () => {
    vi.mocked(ensureDeviceId).mockResolvedValue(null as never);
    expect(await signUpFromInvite(params)).toMatchObject({ ok: false, reason: "other" });
    expect(apiPost).not.toHaveBeenCalled();
  });
});
