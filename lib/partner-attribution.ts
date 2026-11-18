/**
 * Partner links: any integration partner (the Partner Portal, a future
 * affiliate tool) sends people to getsole.ai/?ref=CODE&partner=<slug>.
 *
 * The proxy (proxy.ts) keeps the pair in a cookie on the shared .getsole.ai
 * domain, so it survives the redirect to /dashboard, the sign-in wall and a few
 * days of thinking it over. The register screen sends it as
 * `attribution_partner` + `attribution_code`, and the backend saves it on the
 * new account only.
 *
 * Last code wins: a newer partner link replaces the cookie. Whatever is in the
 * cookie at sign-up is what the account keeps, for good.
 *
 * The pair is a claim from the browser, never a fact: the backend drops an
 * unknown partner, and the partner decides what a code is worth. That is also
 * why the cookie is not httpOnly; it carries nothing secret, and the register
 * screen needs to read it.
 */

export const ATTRIBUTION_CODE_PARAM = "ref";
export const ATTRIBUTION_PARTNER_PARAM = "partner";
export const ATTRIBUTION_COOKIE = "sole_partner_ref";
/** 90 days, in seconds. */
export const ATTRIBUTION_MAX_AGE = 90 * 24 * 60 * 60;

export type PartnerAttribution = { partner: string; code: string };

/** Same rules as the backend (src/modules/partner/attribution). */
const SLUG_RE = /^[a-z][a-z0-9_]{1,31}$/;
const CODE_RE = /^[A-Za-z0-9_-]{3,32}$/;

/** The pair if both look right, otherwise null. */
export function cleanAttribution(
  partner: string | null | undefined,
  code: string | null | undefined,
): PartnerAttribution | null {
  const slug = (partner ?? "").trim().toLowerCase();
  const ref = (code ?? "").trim();
  return SLUG_RE.test(slug) && CODE_RE.test(ref) ? { partner: slug, code: ref } : null;
}

/** From a URL's query string: both `ref` and `partner` must be there. */
export function attributionFromSearch(params: URLSearchParams): PartnerAttribution | null {
  return cleanAttribution(params.get(ATTRIBUTION_PARTNER_PARAM), params.get(ATTRIBUTION_CODE_PARAM));
}

/** Cookie value: "<slug>:<code>". */
export function encodeAttribution(value: PartnerAttribution): string {
  return `${value.partner}:${value.code}`;
}

export function decodeAttribution(raw: string | null | undefined): PartnerAttribution | null {
  const [partner, code, ...rest] = (raw ?? "").split(":");
  return rest.length ? null : cleanAttribution(partner, code);
}

/**
 * The shared domain: the host of this app's own frontend URL (NEXT_PUBLIC_REDIRECT_URL),
 * e.g. "getsole.ai" for https://getsole.ai/. Null when the setting is missing or unusable, and
 * for localhost or an IP address, which cannot carry a domain cookie.
 */
export function sharedDomain(frontendUrl: string | null | undefined = process.env.NEXT_PUBLIC_REDIRECT_URL): string | null {
  const raw = (frontendUrl ?? "").trim();
  if (!raw) return null;
  try {
    const name = new URL(raw).hostname.toLowerCase();
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(name) || name.includes(":");
    return name && name !== "localhost" && !name.endsWith(".localhost") && !isIp ? name : null;
  } catch {
    return null;
  }
}

/**
 * The cookie domain for this host: the frontend URL's domain (`.getsole.ai` for
 * https://getsole.ai), on that host and its subdomains. Anywhere else (localhost, preview URLs,
 * or no frontend URL set) the cookie stays on the host itself.
 */
export function attributionCookieDomain(
  host: string,
  frontendUrl: string | null | undefined = process.env.NEXT_PUBLIC_REDIRECT_URL,
): string | undefined {
  const shared = sharedDomain(frontendUrl);
  if (!shared) return undefined;
  const name = host.split(":")[0].toLowerCase();
  return name === shared || name.endsWith(`.${shared}`) ? `.${shared}` : undefined;
}

/** Read the saved pair in the browser. Null on the server or when there is none. */
export function readAttribution(): PartnerAttribution | null {
  if (typeof document === "undefined") return null;
  const entry = document.cookie.split("; ").find((part) => part.startsWith(`${ATTRIBUTION_COOKIE}=`));
  if (!entry) return null;
  try {
    return decodeAttribution(decodeURIComponent(entry.slice(ATTRIBUTION_COOKIE.length + 1)));
  } catch {
    return null;
  }
}

/** The sign-up request fields, or nothing when there's no saved link. */
export function attributionSignupFields(): { attribution_partner?: string; attribution_code?: string } {
  const saved = readAttribution();
  return saved ? { attribution_partner: saved.partner, attribution_code: saved.code } : {};
}
