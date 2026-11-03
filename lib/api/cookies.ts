/**
 * Cookie storage for the session, with the same keys sole-webapp writes.
 *
 * Hand-rolled rather than js-cookie: it's four functions, and sharing key names
 * with the other app matters more than sharing a dependency — a session created
 * in either one is readable by the other on the same domain.
 */

export const TOKEN_KEY = "token";
export const REFRESH_TOKEN_KEY = "refreshToken";
export const DEVICE_ID_KEY = "deviceId";
export const BUSINESS_ID_KEY = "businessId";
/**
 * What `utils/authSession.ts` used to write its refresh token under. The two
 * modules disagreed on the name — this one wrote `refreshToken`, that one
 * `refresh_token` — so a token stored by one was invisible to the other and a
 * sign-out only ever cleared half of them.
 */
export const LEGACY_REFRESH_TOKEN_KEY = "refresh_token";

/**
 * Session cookies vanish when the browser closes, which would end a session the
 * backend still considers live. Auth cookies get an explicit lifetime instead,
 * long enough for the refresh token to do its job.
 */
const DEFAULT_DAYS = 30;

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(
      `(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`,
    ),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function setCookie(
  name: string,
  value: string,
  { days = DEFAULT_DAYS }: { days?: number } = {},
): void {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  // Lax rather than Strict: the SSO callback and the emailed verification
  // link are both top-level navigations from another origin, and Strict
  // would hide the session from the page they land on.
  //
  // `window` is read defensively rather than assumed from `document` existing:
  // the two are separate globals, and a host that provides one without the
  // other (a test stub, a non-browser DOM) would otherwise throw on a write
  // the `document` guard above had just declared safe. No `window` means no
  // https to detect, so the flag is simply left off.
  const secure =
    typeof window !== "undefined" && window.location?.protocol === "https:"
      ? "; secure"
      : "";
  document.cookie = `${name}=${encodeURIComponent(
    value,
  )}; expires=${expires}; path=/; samesite=lax${secure}`;
}

export function removeCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

export const getStoredToken = () => getCookie(TOKEN_KEY);
export const setStoredToken = (token: string) => setCookie(TOKEN_KEY, token);

export const getStoredRefreshToken = () => getCookie(REFRESH_TOKEN_KEY);
export const setStoredRefreshToken = (token: string) => {
  if (!token) return;
  setCookie(REFRESH_TOKEN_KEY, token);
};

export function clearAuthCookies(): void {
  removeCookie(TOKEN_KEY);
  removeCookie(REFRESH_TOKEN_KEY);
  removeCookie(BUSINESS_ID_KEY);
  // The legacy spelling the axios stack wrote before the two token stores were
  // merged. Still removed, so a session created by an older build of this app
  // can't leave a usable refresh token behind after a sign-out.
  removeCookie(LEGACY_REFRESH_TOKEN_KEY);
}

export const getDeviceId = () => getCookie(DEVICE_ID_KEY);
/** Outlives a session on purpose — the device row is the browser, not the user. */
export const setDeviceId = (id: string) =>
  setCookie(DEVICE_ID_KEY, id, { days: 365 });

/**
 * Re-exported, not implemented here. The business id used to live in this
 * cookie AND, separately, in a localStorage key `utils/businessStorage.ts`
 * owned — two values that never agreed. `lib/api/business-id.ts` is now the
 * one writer of both. See its file doc.
 */
export {
  getBusinessId,
  setBusinessId,
  clearBusinessId,
} from "@/lib/api/business-id";
