import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE,
  attributionCookieDomain,
  attributionFromSearch,
  encodeAttribution,
} from "@/lib/partner-attribution";
import {
  clickBeaconConfig,
  clientIp,
  isNewAttribution,
  isPrefetch,
  reportPartnerClick,
} from "@/lib/partner-click";

/**
 * Keep a partner link's code (?ref=CODE&partner=<slug>) in a cookie, on
 * whichever page the link lands, and tell the partner about the visit. It only
 * sets a cookie and sends a background note: no redirect, no change to the page.
 * The latest link wins. See lib/partner-attribution.ts and lib/partner-click.ts.
 */
export function proxy(request: NextRequest, event: NextFetchEvent) {
  const response = NextResponse.next();
  const attribution = attributionFromSearch(request.nextUrl.searchParams);

  if (attribution) {
    // Count the visit for the partner, once per link: skipped when the cookie already holds this
    // same partner and code (a repeat visit, a reload). A real page load only (not a prefetch),
    // after the page is on its way, and skipped entirely when the beacon is not set up.
    const beacon = clickBeaconConfig();
    if (
      beacon &&
      request.method === "GET" &&
      !isPrefetch(request.headers) &&
      isNewAttribution(request.cookies.get(ATTRIBUTION_COOKIE)?.value, attribution)
    ) {
      event.waitUntil(
        reportPartnerClick(beacon, {
          attribution,
          ip: clientIp(request.headers),
          userAgent: request.headers.get("user-agent"),
          referrer: request.headers.get("referer"),
          search: request.nextUrl.searchParams,
        }),
      );
    }

    response.cookies.set(ATTRIBUTION_COOKIE, encodeAttribution(attribution), {
      maxAge: ATTRIBUTION_MAX_AGE,
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      domain: attributionCookieDomain(request.headers.get("host") ?? request.nextUrl.host),
    });
  }

  return response;
}

export const config = {
  // Pages only: skip API routes, Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
