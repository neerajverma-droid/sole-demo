import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/proxy-image/route";

const LOGO =
  "https://s3.ap-southeast-2.amazonaws.com/assets.soleapp.com.au/staging/493/business/logo.jpg";

const get = (src?: string) =>
  GET(
    new NextRequest(
      `http://localhost:3000/api/proxy-image${src === undefined ? "" : `?src=${encodeURIComponent(src)}`}`,
    ),
  );

const upstream = (body: BodyInit, headers: Record<string, string>, status = 200) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { status, headers }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("proxy-image", () => {
  it("serves a remote image from our own origin", async () => {
    const fetchSpy = upstream(new Uint8Array([0xff, 0xd8, 0xff]), { "content-type": "image/jpeg" });

    const response = await get(LOGO);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
    expect(String(fetchSpy.mock.calls[0][0])).toBe(LOGO);
  });

  it("unwraps a double-encoded src", async () => {
    const fetchSpy = upstream("x", { "content-type": "image/png" });

    await get(encodeURIComponent(LOGO));
    expect(String(fetchSpy.mock.calls[0][0])).toBe(LOGO);
  });

  it.each([
    ["no src", undefined],
    ["a non-http scheme", "file:///etc/passwd"],
    ["localhost", "http://localhost:3001/api/secret"],
    ["a loopback address", "http://127.0.0.1/admin"],
    ["a private network address", "http://192.168.1.10/cam.jpg"],
    ["cloud metadata", "http://169.254.169.254/latest/meta-data/"],
  ])("refuses %s without fetching", async (_label, src) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await get(src);

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses anything that isn't an image", async () => {
    upstream("<html></html>", { "content-type": "text/html" });

    expect((await get(LOGO)).status).toBe(415);
  });

  it("refuses an image over 10MB", async () => {
    upstream("x", { "content-type": "image/jpeg", "content-length": String(11 * 1024 * 1024) });

    expect((await get(LOGO)).status).toBe(413);
  });

  it("passes on the upstream failure status", async () => {
    upstream("missing", { "content-type": "text/plain" }, 404);

    expect((await get(LOGO)).status).toBe(404);
  });

  it("answers 502 when the host can't be reached", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    expect((await get(LOGO)).status).toBe(502);
  });
});
