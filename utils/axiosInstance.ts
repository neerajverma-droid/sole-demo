/**
 * axiosInstance — the single Axios client for the Sole API.
 *
 * Request interceptor
 *   • Attaches the apiKey header every endpoint expects.
 *   • Injects the Bearer token.
 *   • Appends business_id as a query-param (skipped when already present).
 *
 * Response interceptor
 *   • Any answer that means "no usable session" — a 401, or a body saying
 *     `token_expired` / `Missing Authorization header` / `User is logged out`,
 *     whatever the status — refreshes once and replays the request.
 *   • If the refresh fails, the session is cleared (which wipes every cookie,
 *     both storages, the persisted stores and the query cache — see
 *     `lib/api/teardown.ts`) and the browser is sent to sign-in.
 *   • A 403 naming a business the account can't open clears the stored
 *     business id and replays once, rather than leaving a stale id to fail
 *     every request forever.
 *
 * Session handling is NOT implemented here. It used to be: this file read
 * tokens through `utils/authSession.ts`, which kept the refresh token under
 * `refresh_token` while `lib/api/cookies.ts` kept it under `refreshToken`, and
 * sent people to `/login` — a route this app does not have. Both halves now go
 * through `lib/api/session.ts`, the same module the auth screens use.
 */

import axios, { AxiosHeaders } from "axios";
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";

import {
  looksLikeStaleBusiness,
  looksUnauthenticated,
} from "@/lib/api/auth-failure";
import { clearBusinessId, getBusinessId } from "@/lib/api/business-id";
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  isFreshlyMintedToken,
  redirectToLogin,
  refreshAccessToken,
} from "@/lib/api/session";
import { handleMockRequest } from "@/lib/demo-seed/mock-server";

// Extend config to carry the retry flags.
interface RetryableConfig extends InternalAxiosRequestConfig {
  _authRetry?: boolean;
  _businessRetry?: boolean;
}

// Same env var apiRoutes.ts is built from — NEXT_PUBLIC_BASE_URL points at
// production, so using it here would send every local request there instead.
const BASE_URL =
  process.env.NEXT_PUBLIC_SOLE_OCR_URL ?? "http://localhost:3001/api";

const api = axios.create({
  baseURL: BASE_URL,
});

const defaultAdapter = api.defaults.adapter;
api.defaults.adapter = async (config) => {
  const method = config.method || "GET";
  const url = config.url || "";
  const mock = handleMockRequest(method, url, config.params, config.data);
  if (mock) {
    return {
      data: mock.data,
      status: mock.status,
      statusText: "OK",
      headers: new AxiosHeaders(mock.headers || {}),
      config,
      request: {},
    };
  }
  const adapter =
    typeof defaultAdapter === "function"
      ? defaultAdapter
      : axios.getAdapter(defaultAdapter || ["xhr", "http", "fetch"]);
  return adapter(config);
};

/* ------------------------------------------------------------------ *
 * Request interceptor                                                  *
 * ------------------------------------------------------------------ */

api.interceptors.request.use(
  (config: RetryableConfig) => {
    config.headers = config.headers ?? new AxiosHeaders();
    config.headers.set("apiKey", process.env.NEXT_PUBLIC_API_KEY ?? "");

    const token = getAccessToken();
    const businessId = getBusinessId();

    if (token) {
      config.headers.set("Authorization", `Bearer ${token}`);
      // A token again means a new session — re-arm the teardown. See
      // `sessionEnded` below for why this can't wait for a page load.
      sessionEnded = false;
    }

    if (businessId) {
      config.params = {
        ...config.params,
        // Don't overwrite if the caller already set business_id explicitly.
        business_id:
          (config.params as Record<string, unknown>)?.business_id ?? businessId,
      };
    }

    return config;
  },
  (error) => Promise.reject(error),
);

/* ------------------------------------------------------------------ *
 * Response interceptor                                                 *
 * ------------------------------------------------------------------ */

/** Nothing inside the refresh handshake may itself trigger a refresh. */
function isAuthHandshake(url: string): boolean {
  return (
    url.includes("/auth/refresh") ||
    url.includes("/auth/refresh-token") ||
    url.includes("/auth/logout")
  );
}

/**
 * Whether there is anything left to authenticate or renew with.
 *
 * Cookies can go away underneath a running page — cleared by hand in
 * devtools, evicted, wiped by the other app on this domain, or expired. From
 * that moment every request leaves without an Authorization header and comes
 * back "Missing Authorization header", and there is no token to refresh and
 * no refresh token to spend, so retrying can only produce the same 401 again.
 *
 * This case used to fall through the `hadSession` guard below — false,
 * because the token had ALREADY gone — and so nothing happened at all: no
 * clear, no redirect, just a rejected promise per call. The app sat there
 * looking signed in while every request on the screen failed, which is what
 * the network panel full of red 401s was.
 */
function noCredentialsLeft(): boolean {
  return !getAccessToken() && !getRefreshToken();
}

/**
 * Whether this page has already torn the session down.
 *
 * A dead session doesn't fail one request, it fails every request the screen
 * has in flight — a dashboard is a dozen at once. Without this, each one
 * would run the whole teardown (every cookie, both storages, every persisted
 * store, the query cache) and fire a redirect, a dozen times over.
 *
 * Reset in the request interceptor as soon as a token exists again, because
 * signing back in from the sign-in screen is a client-side navigation: no
 * reload, so nothing else would clear this and the next genuine expiry would
 * be ignored.
 */
let sessionEnded = false;

/**
 * The end of the line: there is no usable session and nothing can renew it.
 *
 * Clears everything and hard-navigates. `redirectToLogin` is a no-op when the
 * browser is already on the sign-in route, so a failed call on that screen
 * doesn't bounce it against itself.
 */
function endSession(): void {
  if (sessionEnded) return;
  sessionEnded = true;
  clearSession();
  redirectToLogin("session_expired");
}

/**
 * A 200 body can still say the session is dead — see `auth-failure.ts`. Axios
 * only calls the error handler on a non-2xx status, so that case has to be
 * caught on the success path.
 */
api.interceptors.response.use(
  async (response) => {
    const config = response.config as RetryableConfig;
    const url = String(config?.url ?? "");

    if (
      config?._authRetry ||
      isAuthHandshake(url) ||
      !looksUnauthenticated(response.status, response.data)
    ) {
      return response;
    }

    config._authRetry = true;

    // Neither token is left, so there is nothing to renew and nothing to
    // retry with: sign out rather than failing this call and the next ten.
    if (noCredentialsLeft()) {
      endSession();
      return response;
    }

    /*
     * A token issued seconds ago cannot have expired, so a 401 on a request
     * carrying it is the ROUTE's answer, not the session's — `/bank/accounts`
     * returns 401 whenever it can't resolve an owner, whatever token it was
     * given. Refreshing again would spend another single-use refresh token to
     * no purpose, and two such calls racing would end the session for real.
     */
    if (isFreshlyMintedToken(getAccessToken())) {
      return response;
    }

    const hadSession = Boolean(getAccessToken());
    const token = await refreshAccessToken();

    if (!token) {
      // `refreshAccessToken` only drops the tokens when the server actually
      // rejected them — a renewal that failed in transit leaves them alone so
      // the next call can retry. Tokens gone means the session is really over.
      if (hadSession && !getAccessToken()) endSession();
      return response;
    }

    const headers = new AxiosHeaders(config.headers);
    headers.set("Authorization", `Bearer ${token}`);
    config.headers = headers;
    return api(config as AxiosRequestConfig);
  },
  async (error) => {
    const { response, config } = error as {
      response?: { status: number; data?: { message?: string } };
      config?: RetryableConfig;
    };

    if (!response || !config) return Promise.reject(error);

    const url = String(config.url ?? "");

    /*
     * A stored business id that no longer resolves — deleted, or belonging to
     * an account that has since been signed out of — 403s every request for
     * the rest of the session. Dropping it and replaying once lets the backend
     * fall back to the account's default business, which is what it does when
     * no business_id is supplied at all.
     */
    if (
      looksLikeStaleBusiness(response.status, response.data) &&
      !config._businessRetry
    ) {
      config._businessRetry = true;
      clearBusinessId();
      if (config.params && typeof config.params === "object") {
        delete (config.params as Record<string, unknown>).business_id;
      }
      return api(config as AxiosRequestConfig);
    }

    if (
      config._authRetry ||
      isAuthHandshake(url) ||
      !looksUnauthenticated(response.status, response.data)
    ) {
      return Promise.reject(error);
    }

    config._authRetry = true;

    // Neither token is left, so there is nothing to renew and nothing to
    // retry with: sign out rather than failing this call and the next ten.
    if (noCredentialsLeft()) {
      endSession();
      return Promise.reject(error);
    }

    /*
     * A token issued seconds ago cannot have expired, so a 401 on a request
     * carrying it is the ROUTE's answer, not the session's — `/bank/accounts`
     * returns 401 whenever it can't resolve an owner, whatever token it was
     * given. Refreshing again would spend another single-use refresh token to
     * no purpose, and two such calls racing would end the session for real.
     */
    if (isFreshlyMintedToken(getAccessToken())) {
      return Promise.reject(error);
    }

    /*
     * Past the check above there IS a token or a refresh token. `hadSession`
     * distinguishes the two ways the renewal below can come back empty: the
     * server rejected the tokens (they're gone now — end the session) or the
     * request never landed (they're still here — let the next call retry).
     */
    const hadSession = Boolean(getAccessToken());

    const token = await refreshAccessToken();

    if (!token) {
      if (hadSession && !getAccessToken()) endSession();
      return Promise.reject(error);
    }

    const headers = new AxiosHeaders(config.headers);
    headers.set("Authorization", `Bearer ${token}`);
    config.headers = headers;

    return api(config as AxiosRequestConfig);
  },
);

export default api;
