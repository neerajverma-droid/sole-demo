import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";

import { proxy } from "./proxy";

/**
 * The proxy end to end: a partner link (?ref=CODE&partner=<slug>) saves the cookie, and the
 * partner is told about the visit once per link.
 */

const LINK = "http://localhost:3000/register?ref=XG7RF63R&partner=pportal";

function setup() {
  const waits: Promise<unknown>[] = [];
  const event = { waitUntil: (p: Promise<unknown>) => waits.push(p) } as unknown as NextFetchEvent;
  const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
  vi.stubGlobal("fetch", fetchMock);
  const run = async (url: string, headers: Record<string, string> = {}, method = "GET") => {
    const response = proxy(new NextRequest(url, { method, headers }), event);
    await Promise.all(waits);
    return response;
  };
  return { run, fetchMock };
}

/** The JSON the partner was sent on its first call. */
function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

beforeEach(() => {
  vi.stubEnv("PARTNER_CLICK_URL", "https://portal.example/api/clicks");
  vi.stubEnv("PARTNER_CLICK_SECRET", "a-click-beacon-secret-123456");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("proxy: partner link click", () => {
  it("counts the visit and saves the cookie when the cookie has nothing", async () => {
    const { run, fetchMock } = setup();
    const response = await run(LINK, { "x-forwarded-for": "203.0.113.9", "user-agent": "test-agent" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("https://portal.example/api/clicks");
    expect(sentBody(fetchMock)).toMatchObject({
      partner: "pportal",
      code: "XG7RF63R",
      ip: "203.0.113.9",
      userAgent: "test-agent",
    });
    expect(response.cookies.get("sole_partner_ref")?.value).toBe("pportal:XG7RF63R");
  });

  it("counts it when the cookie has a different code, and replaces the cookie", async () => {
    const { run, fetchMock } = setup();
    const response = await run(LINK, { cookie: "sole_partner_ref=pportal%3AOTHER123" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBody(fetchMock)).toMatchObject({ code: "XG7RF63R" });
    expect(response.cookies.get("sole_partner_ref")?.value).toBe("pportal:XG7RF63R");
  });

  it("counts it when the cookie is there but is not a valid pair", async () => {
    const { run, fetchMock } = setup();
    await run(LINK, { cookie: "sole_partner_ref=garbage" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not count a repeat of the same link (the cookie already has it)", async () => {
    const { run, fetchMock } = setup();
    const response = await run(LINK, { cookie: "sole_partner_ref=pportal%3AXG7RF63R" });

    expect(fetchMock).not.toHaveBeenCalled();
    // The cookie is still refreshed, so its 90 days start again.
    expect(response.cookies.get("sole_partner_ref")?.value).toBe("pportal:XG7RF63R");
  });

  it("does not count a prefetch, or a request that is not a GET", async () => {
    const { run, fetchMock } = setup();
    await run(LINK, { "next-router-prefetch": "1" });
    await run(LINK, {}, "POST");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing for a page without a partner link", async () => {
    const { run, fetchMock } = setup();
    const response = await run("http://localhost:3000/register");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.cookies.get("sole_partner_ref")).toBeUndefined();
  });

  it("still saves the cookie, and sends nothing, when the beacon is not set up", async () => {
    vi.stubEnv("PARTNER_CLICK_URL", "");
    vi.stubEnv("PARTNER_CLICK_SECRET", "");
    const { run, fetchMock } = setup();
    const response = await run(LINK);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.cookies.get("sole_partner_ref")?.value).toBe("pportal:XG7RF63R");
  });

  it("still saves the cookie when the partner cannot be reached", async () => {
    const { run, fetchMock } = setup();
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const response = await run(LINK);
    expect(response.cookies.get("sole_partner_ref")?.value).toBe("pportal:XG7RF63R");
  });
});
