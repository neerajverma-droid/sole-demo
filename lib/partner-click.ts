import { createHmac } from "node:crypto";

import { decodeAttribution, type PartnerAttribution } from "@/lib/partner-attribution";

/**
 * Tell the partner when someone lands on their link.
 *
 * A partner link (?ref=CODE&partner=<slug>) points at this app, so the partner's own server never
 * sees the visit. The proxy (proxy.ts) reports it from here instead: one small signed POST, so the
 * partner can count the click. It is a courtesy and nothing waits on it: the page loads either
 * way, and any failure (no setting, slow partner, network) is dropped.
 *
 * Needs PARTNER_CLICK_URL and PARTNER_CLICK_SECRET (server only). Without both, nothing is sent.
 * The secret is shared with the partner, who checks the signature before counting anything.
 *
 * The visitor's IP goes to the partner inside the signed body. The partner hashes it on arrival
 * (for de-duplication) and does not keep the address.
 */

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
/** The partner answers in milliseconds; past this we stop waiting. */
const TIMEOUT_MS = 2000;
const MAX_FIELD = 512;

export type ClickBeaconConfig = { url: string; secret: string };

export type LandingDetails = {
  attribution: PartnerAttribution;
  ip: string | null;
  userAgent: string | null;
  referrer: string | null;
  search: URLSearchParams;
};

type Env = Record<string, string | undefined>;

/** The beacon settings, or null when either is missing or the URL is not usable. */
export function clickBeaconConfig(env: Env = process.env): ClickBeaconConfig | null {
  const url = env.PARTNER_CLICK_URL?.trim();
  const secret = env.PARTNER_CLICK_SECRET?.trim();
  if (!url || !secret) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? { url: parsed.toString(), secret } : null;
  } catch {
    return null;
  }
}

/** The visitor's address as the proxy saw it: the first hop in x-forwarded-for. */
export function clientIp(headers: Headers): string | null {
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first ? first : (headers.get("x-real-ip")?.trim() || null);
}

/**
 * True unless the saved cookie already holds this same partner and code. The partner is told
 * once per link: a reload or a second visit with the same link does not call again, while a
 * different code or partner (the latest link wins) does. `saved` is the cookie's value, if any.
 */
export function isNewAttribution(saved: string | null | undefined, incoming: PartnerAttribution): boolean {
  let raw = saved;
  try {
    // Next hands the value over decoded; a still-encoded one ("pportal%3ACODE") reads the same.
    raw = saved ? decodeURIComponent(saved) : saved;
  } catch {
    // keep the value as it came
  }
  const current = decodeAttribution(raw);
  return !current || current.partner !== incoming.partner || current.code !== incoming.code;
}

/** A link prefetch is the browser guessing, not a visit. */
export function isPrefetch(headers: Headers): boolean {
  return (
    headers.has("next-router-prefetch") ||
    headers.get("purpose") === "prefetch" ||
    headers.get("sec-purpose")?.startsWith("prefetch") === true
  );
}

function clip(value: string | null): string | null {
  return value ? value.slice(0, MAX_FIELD) : null;
}

/** The JSON the partner receives. */
export function clickBody(details: LandingDetails): string {
  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = details.search.get(key);
    if (value) utm[key] = value.slice(0, 256);
  }
  return JSON.stringify({
    partner: details.attribution.partner,
    code: details.attribution.code,
    ip: clip(details.ip),
    userAgent: clip(details.userAgent),
    referrer: details.referrer ? details.referrer.slice(0, 2048) : null,
    utm,
  });
}

/** `sha256=<hex>` over `<timestamp>.<body>`: the partner recomputes it from the exact bytes. */
export function signClick(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

/** Send the click. Never throws and never waits longer than the timeout. */
export async function reportPartnerClick(
  config: ClickBeaconConfig,
  details: LandingDetails,
  deps: { fetch?: typeof fetch; now?: () => number } = {},
): Promise<void> {
  try {
    const body = clickBody(details);
    const timestamp = String(Math.floor((deps.now ?? Date.now)() / 1000));
    await (deps.fetch ?? fetch)(config.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-click-timestamp": timestamp,
        "x-click-signature": signClick(config.secret, timestamp, body),
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // The visit is not worth a failed page.
  }
}
