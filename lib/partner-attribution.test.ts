import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ATTRIBUTION_COOKIE,
  attributionCookieDomain,
  attributionFromSearch,
  attributionSignupFields,
  cleanAttribution,
  decodeAttribution,
  encodeAttribution,
  readAttribution,
} from "@/lib/partner-attribution";

describe("cleanAttribution", () => {
  it("keeps a valid partner slug and code, trimmed and lower-cased slug", () => {
    expect(cleanAttribution(" PPortal ", " RAVI8X2K ")).toEqual({ partner: "pportal", code: "RAVI8X2K" });
  });

  it("drops anything missing or malformed", () => {
    expect(cleanAttribution("pportal", "")).toBeNull();
    expect(cleanAttribution(null, "RAVI8X2K")).toBeNull();
    expect(cleanAttribution("1bad", "RAVI8X2K")).toBeNull();
    expect(cleanAttribution("pportal", "bad code!")).toBeNull();
    expect(cleanAttribution("pportal", "x".repeat(33))).toBeNull();
  });
});

describe("attributionFromSearch", () => {
  it("needs both ref and partner", () => {
    expect(attributionFromSearch(new URLSearchParams("ref=RAVI8X2K&partner=pportal"))).toEqual({
      partner: "pportal",
      code: "RAVI8X2K",
    });
    expect(attributionFromSearch(new URLSearchParams("ref=RAVI8X2K"))).toBeNull();
    expect(attributionFromSearch(new URLSearchParams("partner=pportal"))).toBeNull();
  });
});

describe("cookie value", () => {
  it("round-trips and rejects extra parts", () => {
    const value = encodeAttribution({ partner: "pportal", code: "RAVI8X2K" });
    expect(value).toBe("pportal:RAVI8X2K");
    expect(decodeAttribution(value)).toEqual({ partner: "pportal", code: "RAVI8X2K" });
    expect(decodeAttribution("pportal:A:B")).toBeNull();
    expect(decodeAttribution("")).toBeNull();
  });
});

describe("attributionCookieDomain", () => {
  const frontend = "https://getsole.ai/";

  it("shares the cookie across the frontend URL's domain and its subdomains", () => {
    expect(attributionCookieDomain("getsole.ai", frontend)).toBe(".getsole.ai");
    expect(attributionCookieDomain("app.getsole.ai", frontend)).toBe(".getsole.ai");
    expect(attributionCookieDomain("GETSOLE.AI:443", frontend)).toBe(".getsole.ai");
  });

  it("keeps the cookie on the host anywhere else", () => {
    expect(attributionCookieDomain("localhost:3000", frontend)).toBeUndefined();
    expect(attributionCookieDomain("notgetsole.ai", frontend)).toBeUndefined();
    expect(attributionCookieDomain("getsole.ai.example.com", frontend)).toBeUndefined();
  });

  it("follows whatever the frontend URL is, not a fixed domain", () => {
    expect(attributionCookieDomain("webapp.getsole.ai", "https://webapp.getsole.ai/")).toBe(".webapp.getsole.ai");
    expect(attributionCookieDomain("getsole.ai", "https://webapp.getsole.ai/")).toBeUndefined();
    expect(attributionCookieDomain("app.example.com", "https://example.com")).toBe(".example.com");
  });

  it("keeps the cookie on the host when no usable frontend URL is set", () => {
    expect(attributionCookieDomain("getsole.ai", undefined)).toBeUndefined();
    expect(attributionCookieDomain("getsole.ai", "")).toBeUndefined();
    expect(attributionCookieDomain("getsole.ai", "not a url")).toBeUndefined();
  });

  it("never sets a domain for localhost or an IP, even when the frontend URL is one", () => {
    expect(attributionCookieDomain("localhost:3000", "http://localhost:3000")).toBeUndefined();
    expect(attributionCookieDomain("127.0.0.1:3000", "http://127.0.0.1:3000")).toBeUndefined();
    expect(attributionCookieDomain("[::1]:3000", "http://[::1]:3000")).toBeUndefined();
  });

  it("reads NEXT_PUBLIC_REDIRECT_URL when no URL is passed", () => {
    vi.stubEnv("NEXT_PUBLIC_REDIRECT_URL", "https://getsole.ai/");
    expect(attributionCookieDomain("app.getsole.ai")).toBe(".getsole.ai");
    vi.unstubAllEnvs();
  });
});

describe("reading the cookie in the browser", () => {
  afterEach(() => {
    document.cookie = `${ATTRIBUTION_COOKIE}=; max-age=0; path=/`;
  });

  it("reads the saved pair and turns it into sign-up fields", () => {
    document.cookie = `${ATTRIBUTION_COOKIE}=${encodeURIComponent("pportal:RAVI8X2K")}; path=/`;
    expect(readAttribution()).toEqual({ partner: "pportal", code: "RAVI8X2K" });
    expect(attributionSignupFields()).toEqual({ attribution_partner: "pportal", attribution_code: "RAVI8X2K" });
  });

  it("gives nothing without a cookie, or with a bad one", () => {
    expect(readAttribution()).toBeNull();
    expect(attributionSignupFields()).toEqual({});
    document.cookie = `${ATTRIBUTION_COOKIE}=${encodeURIComponent("bad value!")}; path=/`;
    expect(readAttribution()).toBeNull();
  });
});
