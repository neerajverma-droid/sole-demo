/**
 * The active business id — one value, one module.
 *
 * It used to be two. `utils/businessStorage.ts` kept it in localStorage under
 * `business_id` and `lib/api/cookies.ts` kept it in a cookie called
 * `businessId`, and nothing ever copied one to the other. The axios client
 * (which ~100 lib modules use) read the first; the fetch client and the
 * post-auth redirect wrote the second. So signing in set a business id that no
 * data request could see, every call fell through to the backend's own
 * "default business" branch, and a user whose last-opened business wasn't the
 * default silently landed in the wrong one.
 *
 * Both keys are still written, because both are still read — sole-webapp reads
 * the localStorage key on the same domain, and `lib/api/client.ts` reads the
 * cookie. Writing both from here is what makes them agree; reading prefers the
 * cookie, because it is the one that survives a localStorage wipe.
 */

const STORAGE_KEY = "business_id";
const COOKIE_KEY = "businessId";

/** Matches `lib/api/cookies.ts` — auth state outlives the browser session. */
const COOKIE_DAYS = 30;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(
      `(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`,
    ),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + COOKIE_DAYS * 864e5).toUTCString();
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${name}=${encodeURIComponent(
    value,
  )}; expires=${expires}; path=/; samesite=lax${secure}`;
}

function dropCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

/** Storage can throw outright in a private window — never worth a crash. */
function readStorage(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getBusinessId(): string | null {
  if (typeof window === "undefined") return null;
  // Cookie first: a wiped localStorage shouldn't silently reopen the account
  // in whatever business the backend happens to call default.
  return readCookie(COOKIE_KEY) || readStorage();
}

export function setBusinessId(id: string | number | null | undefined): void {
  if (typeof window === "undefined") return;

  if (id === undefined || id === null || id === "") {
    clearBusinessId();
    return;
  }

  const value = String(id);
  writeCookie(COOKIE_KEY, value);
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Cookie alone still scopes every request correctly.
  }
}

export function clearBusinessId(): void {
  if (typeof window === "undefined") return;
  dropCookie(COOKIE_KEY);
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — the cookie is gone either way.
  }
}
