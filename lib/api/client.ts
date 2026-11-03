/**
 * The one way this app talks to the backend.
 *
 * Every call carries the apiKey header, an authenticated one carries the bearer
 * token and the active business id, and an expired access token is renewed and
 * the request replayed once before anyone is told anything went wrong.
 *
 * Nothing here throws. A network failure, a 500 and a `{ success: false }` body
 * all come back in the same shape, because every caller has to handle the last
 * of those anyway and a try/catch around each one only adds a second way to get
 * it wrong.
 */

import { API_BASE, API_KEY, API_CONFIGURED } from "@/lib/api/env";
import { looksUnauthenticated } from "@/lib/api/auth-failure";
import { getBusinessId } from "@/lib/api/cookies";
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshAccessToken,
} from "@/lib/api/session";

export type ApiResponse<T = unknown> = {
  success: boolean;
  message?: string;
  data?: T;
  /** HTTP status, or 0 when the request never landed. */
  status: number;
};

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | boolean | null | undefined>;
  /**
   * "bearer" sends the session token and treats its rejection as a dead
   * session. "public" sends only the apiKey — sign-in, sign-up and every step
   * that happens before there is a session.
   */
  auth?: "bearer" | "public";
  headers?: Record<string, string>;
  /** The refresh call itself, and anything that must not trigger a sign-out. */
  skipAuthRetry?: boolean;
  /**
   * Hard-navigate to sign-in when the session turns out to be dead.
   *
   * Off by default, because clearing the session already tells the provider,
   * and the guard's own redirect carries the route being left so signing back
   * in returns to it. This is the blunt fallback for anything rendered outside
   * the guard, where nothing else would move the person off a dead screen.
   */
  redirectOnAuthFailure?: boolean;
  signal?: AbortSignal;
};

const NETWORK_MESSAGE =
  "We couldn't reach Sole. Check your connection and try again.";

/**
 * A request that never lands looks identical to a browser whether the server is
 * down or the browser refused to send it — fetch rejects with the same opaque
 * TypeError either way, and the CORS reason is only ever printed to the
 * console. Since the app cannot tell the two apart, it says so once, in
 * development, naming the origin the backend would have to allow.
 *
 * The backend's allow-list lives in sole-ocr/src/config/middleware.js and
 * includes localhost:3000 and :3002 — which is why `npm run dev` pins the port
 * rather than letting Next pick the next free one.
 */
let warnedAboutUnreachable = false;
function warnUnreachable(url: string) {
  if (warnedAboutUnreachable || process.env.NODE_ENV === "production") return;
  warnedAboutUnreachable = true;
  console.warn(
    [
      `[sole] Request to ${url} never landed.`,
      `Origin: ${typeof window === "undefined" ? "(server)" : window.location.origin}`,
      "If the API is up, this is usually CORS: the backend only answers",
      "origins on its allow-list (localhost:3000 and :3002 in dev).",
    ].join(" "),
  );
}

const NOT_CONFIGURED_MESSAGE =
  "Sole isn't connected to a backend yet. Set NEXT_PUBLIC_SOLE_OCR_URL.";

function buildUrl(
  path: string,
  params: RequestOptions["params"],
  withBusinessId: boolean,
): string {
  const url = new URL(
    path.startsWith("http") ? path : `${API_BASE}${path}`,
    typeof window === "undefined" ? "http://localhost" : window.location.origin,
  );

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  // Every business-scoped route needs it and none of the callers should have to
  // remember. An explicit business_id in params always wins.
  if (withBusinessId && !url.searchParams.has("business_id")) {
    const businessId = getBusinessId();
    if (businessId) url.searchParams.set("business_id", businessId);
  }

  return url.toString();
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const {
    method = "GET",
    body,
    params,
    auth = "public",
    headers = {},
    skipAuthRetry = false,
    redirectOnAuthFailure = false,
    signal,
  } = options;

  if (!API_CONFIGURED) {
    return { success: false, status: 0, message: NOT_CONFIGURED_MESSAGE };
  }

  const url = buildUrl(path, params, auth === "bearer");
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;

  const send = async (token: string | null) => {
    const requestHeaders: Record<string, string> = {
      apiKey: API_KEY,
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...headers,
    };
    // Omitted rather than sent as "Bearer null", so the backend's real
    // "missing header" answer is what drives the sign-out below.
    if (token) requestHeaders.Authorization = `Bearer ${token}`;

    return fetch(url, {
      method,
      headers: requestHeaders,
      credentials: "include",
      signal,
      ...(body === undefined || body === null
        ? {}
        : { body: isForm ? (body as FormData) : JSON.stringify(body) }),
    });
  };

  const hadSession = auth === "bearer" && Boolean(getAccessToken());

  let response: Response;
  try {
    response = await send(auth === "bearer" ? getAccessToken() : null);
  } catch {
    warnUnreachable(url);
    return { success: false, status: 0, message: NETWORK_MESSAGE };
  }

  let payload = await readBody(response);

  if (
    !skipAuthRetry &&
    auth === "bearer" &&
    looksUnauthenticated(response.status, payload)
  ) {
    /*
     * Nothing left to authenticate OR renew with.
     *
     * The cookies are gone rather than stale — cleared by hand, evicted, or
     * expired — so this request went out with no Authorization header at all
     * and every one after it would too. The renewal below can't help (it has
     * no refresh token to spend and no access token to re-arm one with), and
     * the `hadSession` check under it wouldn't fire either, because the token
     * it tests for had already gone. Without this the app stayed on screen
     * looking signed in while every call 401'd.
     */
    if (!getAccessToken() && !getRefreshToken()) {
      // Clears the cookies, both storages, the persisted stores and the query
      // cache, and tells the session provider — which is what flips the UI to
      // signed-out and sends the guard to the sign-in screen.
      clearSession();
      if (redirectOnAuthFailure) redirectToLogin("session_expired");
      return {
        success: false,
        status: response.status,
        message: "Your session has expired. Please sign in again.",
      };
    }

    const token = await refreshAccessToken();

    if (token) {
      try {
        response = await send(token);
        payload = await readBody(response);
      } catch {
        warnUnreachable(url);
        return { success: false, status: 0, message: NETWORK_MESSAGE };
      }
    } else if (hadSession && !getAccessToken()) {
      // refreshAccessToken only clears the tokens when the server actually
      // rejected them — a renewal that failed in transit leaves them in place
      // so the next call can retry. Tokens gone means the session is over.
      clearSession();
      if (redirectOnAuthFailure) redirectToLogin("session_expired");
      return {
        success: false,
        status: response.status,
        message: "Your session has expired. Please sign in again.",
      };
    }
  }

  return toApiResponse<T>(response, payload);
}

async function readBody(
  response: Response,
): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toApiResponse<T>(
  response: Response,
  payload: Record<string, unknown> | null,
): ApiResponse<T> {
  if (!payload) {
    return {
      success: false,
      status: response.status,
      message: response.ok
        ? undefined
        : "Something went wrong. Please try again.",
    };
  }

  return {
    // A body that says nothing about success is judged on its status, which is
    // what a route returning bare data does.
    success:
      typeof payload.success === "boolean" ? payload.success : response.ok,
    message: typeof payload.message === "string" ? payload.message : undefined,
    data: payload.data as T,
    status: response.status,
  };
}

/** Shorthands, purely so call sites read as the verb they are. */
export const apiGet = <T = unknown>(
  path: string,
  options: Omit<RequestOptions, "method" | "body"> = {},
) => apiRequest<T>(path, { ...options, method: "GET" });

export const apiPost = <T = unknown>(
  path: string,
  body?: unknown,
  options: Omit<RequestOptions, "method" | "body"> = {},
) => apiRequest<T>(path, { ...options, method: "POST", body });
