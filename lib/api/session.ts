/**
 * session — the single place the app reads, writes and renews auth tokens.
 *
 * Cookies are authoritative. Nothing else stores a token: a second copy in
 * local state or a store goes stale the moment the token rotates, and it was
 * exactly that split that used to leave half an app seeing no session after an
 * SSO sign-in.
 *
 * Refreshing is single-flight. A burst of parallel 401s produces ONE call to
 * /auth/refresh and every caller awaits the same promise — without that, the
 * first refresh rotates the token and the rest immediately 401 with a token
 * that has already been spent.
 */

import { API_BASE, API_KEY } from "@/lib/api/env";
import { apiRoutes } from "@/lib/api/routes";
import {
  clearAuthCookies,
  getStoredRefreshToken,
  getStoredToken,
  setStoredRefreshToken,
  setStoredToken,
} from "@/lib/api/cookies";
import { clearClientState } from "@/lib/api/teardown";

/** Where an unrecoverable auth failure lands. */
export const LOGIN_ROUTE = "/login";
export const REGISTER_ROUTE = "/register";

/**
 * Screens a signed-out visitor is meant to be on: sign-in, sign-up, and the
 * /auth/* steps around them (forgot password, verify email, two-step…).
 */
export function isSignedOutRoute(pathname: string): boolean {
  return [LOGIN_ROUTE, REGISTER_ROUTE, "/auth"].some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export type SessionTokens = {
  token?: string | null;
  refresh_token?: string | null;
};

export const getAccessToken = (): string | null => getStoredToken();
export const getRefreshToken = (): string | null => getStoredRefreshToken();

/* ------------------------------------------------------------------ *
 * Demo visits (lib/demo.ts)
 * ------------------------------------------------------------------ */

/**
 * A demo visit's access token starts with this — sole-ocr's demo
 * `TOKEN_PREFIX`. Here rather than in lib/demo.ts, which imports this file.
 */
const DEMO_TOKEN_PREFIX = "demo_";

/**
 * Whether the session just cleared was a demo visit. The token is gone by the
 * time anything redirects, so it is noted on the way out; it lasts until the
 * page is left, or the next session starts.
 */
let demoJustEnded = false;

const holdsDemoSession = (): boolean =>
  Boolean(getAccessToken()?.startsWith(DEMO_TOKEN_PREFIX));

/**
 * Why a dead session is being sent to sign-in. A demo that ended — timed out,
 * or wiped while the tab sat open — says so, rather than "your session
 * expired", which reads like a fault to someone who never had an account.
 */
export function sessionEndReason(): "demo_ended" | "session_expired" {
  return demoJustEnded || holdsDemoSession() ? "demo_ended" : "session_expired";
}

/**
 * Persist a login/refresh response. Accepts either the `user` object from
 * login/signup/verify or the `data` object from /auth/refresh — both carry the
 * same token fields.
 */
export function setSession(payload: SessionTokens | null | undefined): void {
  if (!payload) return;
  demoJustEnded = false;
  if (payload.token) setStoredToken(payload.token);
  if (payload.refresh_token) setStoredRefreshToken(payload.refresh_token);
}

/* ------------------------------------------------------------------ *
 * Telling the app the session ended
 * ------------------------------------------------------------------ */

type SessionListener = () => void;
const listeners = new Set<SessionListener>();

/**
 * Called whenever the session is cleared, from anywhere — a failed refresh deep
 * inside a data call, an explicit sign-out, another tab.
 *
 * The provider subscribes so the UI flips to signed-out without waiting for a
 * navigation, which is what makes "token missing" show as a sign-out rather
 * than as a screen full of failed requests.
 */
export function onSessionCleared(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearSession(): void {
  demoJustEnded = demoJustEnded || holdsDemoSession();
  // Cookies first, so the browser stops being able to authenticate even if
  // something below throws.
  clearAuthCookies();
  forgetMintedToken();
  /*
   * Then everything else this browser knows about the account: the rest of the
   * cookies, both web storages, every persisted store and React Query's cache.
   *
   * Clearing only the three auth cookies left the whole account behind —
   * `sole-session` holds the user profile, `sole-businesses` the rail's name,
   * `sole-preferences` the per-business settings — and nothing re-mounts between
   * signing out and the sign-in screen, so the previous user stayed on screen
   * on the way out and came back on the next load. See `lib/api/teardown.ts`.
   */
  clearClientState();
  listeners.forEach((listener) => listener());
  if (typeof window !== "undefined") {
    // Signing out in one tab signs out the rest: cookies are shared, so the
    // others are already dead — they just don't know it yet.
    try {
      window.localStorage.setItem("sole.auth.signed-out", String(Date.now()));
    } catch {
      // Private-mode browsers simply don't get the cross-tab nudge.
    }
  }
}

/**
 * Send the user back to sign-in after an unrecoverable auth failure. The end
 * of a demo visit, by timeout or by "Exit demo", always says that's what it was.
 */
export function redirectToLogin(
  reason: "session_expired" | "signed_out" | "account_deleted" = "session_expired",
): void {
  if (typeof window === "undefined") return;
  if (isSignedOutRoute(window.location.pathname)) return;
  const shown =
    reason !== "account_deleted" && sessionEndReason() === "demo_ended"
      ? "demo_ended"
      : reason;
  window.location.href = `${LOGIN_ROUTE}?error=${shown}`;
}

/* ------------------------------------------------------------------ *
 * Renewal
 * ------------------------------------------------------------------ */

/** Distinguishes "the server said no" from "the request never landed". */
const NETWORK_ERROR = Symbol("network-error");

type PostResult =
  | typeof NETWORK_ERROR
  | { ok: boolean; body: { success?: boolean; data?: SessionTokens } | null };

async function postJson(
  path: string,
  { body, bearer }: { body?: unknown; bearer?: string } = {},
): Promise<PostResult> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apiKey: API_KEY,
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      credentials: "include",
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, body: json };
  } catch {
    return NETWORK_ERROR;
  }
}

/**
 * Re-arm the refresh half of a session using the ACCESS token.
 *
 * Covers the two cases /auth/refresh cannot: no refresh token was ever issued,
 * and the refresh token has expired. As long as the access token is still valid
 * the person is signed in, so the server mints a fresh refresh token rather
 * than forcing a re-login.
 */
export async function ensureRefreshToken(): Promise<string | null> {
  const accessToken = getAccessToken();
  if (!accessToken) return null;

  const result = await postJson(apiRoutes.auth.refreshToken, {
    bearer: accessToken,
  });
  if (result === NETWORK_ERROR) return null;
  if (
    !result.ok ||
    !result.body?.success ||
    !result.body?.data?.refresh_token
  ) {
    return null;
  }

  setSession(result.body.data);
  const minted = result.body.data.token || accessToken;
  rememberMintedToken(minted);
  return minted;
}

/* ------------------------------------------------------------------ *
 * "Is this token too new to be the problem?"
 * ------------------------------------------------------------------ */

/**
 * The access token the last successful refresh produced, and when.
 *
 * Not every 401 is a dead session. A route can answer 401 for a reason of its
 * own — `/bank/accounts` returns "Authentication required" when it can't
 * resolve an owner — and the interceptor cannot tell that apart from an
 * expired token by the status alone. Without this it refreshed on every such
 * call, and because the backend ROTATES the refresh token on each
 * `/auth/refresh` (single-use by design), a route that always 401s burned one
 * rotation per request. Interleave two of those and the second spends a
 * refresh token the first already replaced, which ends the session for real.
 *
 * A token minted seconds ago cannot have expired, so a 401 on a request
 * carrying it is about something other than the session.
 */
let lastMintedToken: string | null = null;
let lastMintedAt = 0;

/** How long a just-issued token is trusted for. Generous: access tokens live
 * for minutes at least, so anything inside this window is unambiguous. */
const FRESH_TOKEN_MS = 30_000;

function rememberMintedToken(token: string): void {
  lastMintedToken = token;
  lastMintedAt = Date.now();
}

/**
 * Whether this exact token was just issued by a refresh.
 *
 * Callers use it to skip a renewal that cannot help. Compares the value as
 * well as the time, so a token that has since been replaced doesn't ride on
 * its predecessor's freshness.
 */
export function isFreshlyMintedToken(token: string | null): boolean {
  if (!token || token !== lastMintedToken) return false;
  return Date.now() - lastMintedAt < FRESH_TOKEN_MS;
}

/** Cleared on sign-out so a new session starts with no inherited trust. */
function forgetMintedToken(): void {
  lastMintedToken = null;
  lastMintedAt = 0;
}

let inFlightRefresh: Promise<string | null> | null = null;

/**
 * Renew the session, trying both directions:
 *
 *   1. refresh token → new pair            (POST /auth/refresh)
 *   2. access token  → new refresh token   (POST /auth/refresh-token)
 *
 * Step 2 runs when there is no refresh token to spend, or when the one we had
 * was rejected — an expired refresh token doesn't end a session whose access
 * token is still good. Only when both fail is the session really dead, and only
 * then are the tokens cleared.
 *
 * @returns a usable access token, or null if the person has to sign in again.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    try {
      const refreshToken = getRefreshToken();

      if (refreshToken) {
        const result = await postJson(apiRoutes.auth.refresh, {
          body: { refresh_token: refreshToken },
        });

        // A network failure is not a dead session — keep the tokens so the next
        // attempt can succeed once connectivity is back.
        if (result === NETWORK_ERROR) return null;

        if (result.ok && result.body?.success && result.body?.data?.token) {
          setSession(result.body.data);
          rememberMintedToken(result.body.data.token);
          return result.body.data.token;
        }
      }

      const recovered = await ensureRefreshToken();
      if (recovered) return recovered;

      clearSession();
      return null;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}
