import { NextResponse, type NextRequest } from "next/server";

/**
 * Same-origin image proxy — sole-webapp's `pages/api/proxy-image.js`.
 *
 * The business-logo bucket sends no CORS headers. A plain <img> can still
 * show it, but html2canvas (the proposal PDF) can't read a cross-origin
 * image without CORS, so the logo silently dropped out of the export.
 * Serving it from our own origin fixes both.
 *
 * Images only, http(s) only, never a private or loopback host, capped at
 * 10MB — this must not become a way to reach the internal network.
 */

const MAX_BYTES = 10 * 1024 * 1024;

const PRIVATE_HOST =
  /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

function normaliseSrc(value: string | null): URL | null {
  if (!value?.trim()) return null;
  let decoded = value.trim();
  // Callers sometimes double-encode; unwrap up to twice.
  for (let index = 0; index < 2; index += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  try {
    const url = new URL(decoded);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (PRIVATE_HOST.test(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const src = normaliseSrc(request.nextUrl.searchParams.get("src"));
  if (!src) {
    return NextResponse.json({ error: "Missing or invalid src parameter" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(src, { redirect: "follow", cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 });
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: "Failed to fetch image" }, { status: upstream.status });
  }

  const type = upstream.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) {
    return NextResponse.json({ error: "Not an image" }, { status: 415 });
  }
  const length = Number(upstream.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  const body = await upstream.arrayBuffer();
  if (body.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
