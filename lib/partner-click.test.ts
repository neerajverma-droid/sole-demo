import { describe, expect, it } from "vitest";

import {
  clickBeaconConfig,
  clickBody,
  clientIp,
  isNewAttribution,
  isPrefetch,
  reportPartnerClick,
  signClick,
  type LandingDetails,
} from "@/lib/partner-click";

const details: LandingDetails = {
  attribution: { partner: "pportal", code: "XG7RF63R" },
  ip: "203.0.113.9",
  userAgent: "test-agent",
  referrer: "https://news.example/post",
  search: new URLSearchParams("ref=XG7RF63R&partner=pportal&utm_source=newsletter&utm_medium=email&other=1"),
};

describe("clickBeaconConfig", () => {
  it("needs both the URL and the secret", () => {
    expect(clickBeaconConfig({})).toBeNull();
    expect(clickBeaconConfig({ PARTNER_CLICK_URL: "https://p.example/api/clicks" })).toBeNull();
    expect(clickBeaconConfig({ PARTNER_CLICK_SECRET: "s" })).toBeNull();
    expect(clickBeaconConfig({ PARTNER_CLICK_URL: "https://p.example/api/clicks", PARTNER_CLICK_SECRET: " s " })).toEqual({
      url: "https://p.example/api/clicks",
      secret: "s",
    });
  });

  it("ignores a URL that is not http(s)", () => {
    expect(clickBeaconConfig({ PARTNER_CLICK_URL: "not a url", PARTNER_CLICK_SECRET: "s" })).toBeNull();
    expect(clickBeaconConfig({ PARTNER_CLICK_URL: "ftp://p.example", PARTNER_CLICK_SECRET: "s" })).toBeNull();
  });
});

describe("clickBody", () => {
  it("carries the partner, the code, the visitor details and only the UTM keys", () => {
    expect(JSON.parse(clickBody(details))).toEqual({
      partner: "pportal",
      code: "XG7RF63R",
      ip: "203.0.113.9",
      userAgent: "test-agent",
      referrer: "https://news.example/post",
      utm: { utm_source: "newsletter", utm_medium: "email" },
    });
  });

  it("sends nulls for what the request did not have", () => {
    const body = JSON.parse(clickBody({ ...details, ip: null, userAgent: null, referrer: null, search: new URLSearchParams() }));
    expect(body.ip).toBeNull();
    expect(body.userAgent).toBeNull();
    expect(body.referrer).toBeNull();
    expect(body.utm).toEqual({});
  });
});

describe("signClick", () => {
  it("is sha256 over '<timestamp>.<body>', the same as the partner portal computes", () => {
    // Reference value from the portal's scheme: HMAC-SHA256(secret, "1700000000." + body), hex.
    expect(signClick("a-click-beacon-secret-123456", "1700000000", '{"a":1}')).toBe(
      "sha256=b4918d2d7dbeabef786fae58a449f59335c94e946b0fb5546eabad8a8f3b1a95",
    );
  });
});

describe("isNewAttribution", () => {
  const incoming = { partner: "pportal", code: "XG7RF63R" };

  it("is new when there is no cookie, or the cookie is not a valid pair", () => {
    expect(isNewAttribution(undefined, incoming)).toBe(true);
    expect(isNewAttribution(null, incoming)).toBe(true);
    expect(isNewAttribution("", incoming)).toBe(true);
    expect(isNewAttribution("garbage", incoming)).toBe(true);
  });

  it("is not new when the cookie holds the same partner and code", () => {
    expect(isNewAttribution("pportal:XG7RF63R", incoming)).toBe(false);
    expect(isNewAttribution("pportal%3AXG7RF63R", incoming)).toBe(false);
  });

  it("is new when the code or the partner differs (the latest link wins)", () => {
    expect(isNewAttribution("pportal:OTHER123", incoming)).toBe(true);
    expect(isNewAttribution("another:XG7RF63R", incoming)).toBe(true);
  });

  it("treats the code as case-sensitive", () => {
    expect(isNewAttribution("pportal:xg7rf63r", incoming)).toBe(true);
  });
});

describe("clientIp and isPrefetch", () => {
  it("takes the first hop of x-forwarded-for, else x-real-ip", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIp(new Headers())).toBeNull();
  });

  it("recognises a prefetch", () => {
    expect(isPrefetch(new Headers({ "next-router-prefetch": "1" }))).toBe(true);
    expect(isPrefetch(new Headers({ purpose: "prefetch" }))).toBe(true);
    expect(isPrefetch(new Headers({ "sec-purpose": "prefetch;prerender" }))).toBe(true);
    expect(isPrefetch(new Headers())).toBe(false);
  });
});

describe("reportPartnerClick", () => {
  const config = { url: "https://p.example/api/clicks", secret: "a-click-beacon-secret-123456" };

  it("posts the signed body with the timestamp it signed", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch;

    await reportPartnerClick(config, details, { fetch: fakeFetch, now: () => 1_700_000_000_000 });

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    const headers = init.headers as Record<string, string>;
    expect(url).toBe(config.url);
    expect(init.method).toBe("POST");
    expect(headers["x-click-timestamp"]).toBe("1700000000");
    expect(headers["x-click-signature"]).toBe(signClick(config.secret, "1700000000", init.body as string));
  });

  it("never throws, whatever the partner does", async () => {
    const failing = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await expect(reportPartnerClick(config, details, { fetch: failing })).resolves.toBeUndefined();
  });
});
