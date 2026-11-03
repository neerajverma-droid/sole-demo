/**
 * "Does this response mean the session is gone?" — one answer, both clients.
 *
 * The two API clients used to disagree. `lib/api/client.ts` read the body as
 * well as the status; `utils/axiosInstance.ts` tested `status !== 401` and
 * nothing else, so every other way the backend says no — a `token_expired`
 * body, a missing Authorization header, a token the server has marked logged
 * out — went back to the caller as an ordinary failure. The screen rendered an
 * error state and the person stayed "signed in" with a token that no longer
 * worked.
 *
 * The messages below are the ones `sole-ocr/src/middleware/auth.js` and
 * `clerkAuth.js` actually return. Matched on a normalised prefix rather than
 * exactly, because several of them carry a trailing explanation
 * ("Unauthorized - Token verification failed") that isn't worth pinning.
 */

/** Lowercased prefixes of every message the backend uses to refuse a session. */
const UNAUTHENTICATED_MESSAGES = [
  "missing authorization header",
  "invalid token format",
  "invalid or expired token",
  "token_expired",
  "user is logged out",
  "unauthorized",
  "authentication failed",
  // Not a message of the backend's, but the shape a proxy or gateway in front
  // of it returns when it rejects the token before the app ever sees it.
  "jwt expired",
] as const;

export function isUnauthenticatedMessage(
  message: string | null | undefined,
): boolean {
  if (!message) return false;
  const normalised = message.trim().toLowerCase();
  return UNAUTHENTICATED_MESSAGES.some((prefix) =>
    normalised.startsWith(prefix),
  );
}

/**
 * @param status HTTP status, or 0 when the request never landed.
 * @param body   the parsed response body, if there was one.
 *
 * A 401 is always a dead session. A body message is read as well, because
 * these endpoints have been seen to report an expired token as HTTP 200 with
 * `{ success: false, message: "token_expired" }` — which no status check would
 * ever catch.
 *
 * A 403 is deliberately NOT included: the backend uses it for "you do not have
 * access to this business", which is a stale business id rather than a dead
 * session. Signing someone out over it would be the wrong fix, and it has its
 * own recovery — see `utils/axiosInstance.ts`.
 */
export function looksUnauthenticated(
  status: number,
  body: { message?: string } | null | undefined,
): boolean {
  if (status === 401) return true;
  return isUnauthenticatedMessage(body?.message);
}

/**
 * The backend's "that business isn't yours" refusal, which a stale stored
 * business id produces on every single request until it's cleared.
 *
 * Separate from the function above on purpose: the recovery is to drop the
 * business id and retry, not to sign the person out of an account they are
 * still perfectly well signed in to.
 */
export function looksLikeStaleBusiness(
  status: number,
  body: { message?: string } | null | undefined,
): boolean {
  const message = (body?.message ?? "").trim().toLowerCase();

  // 403: the id names a real business, but not one on this account — it was
  // deleted, or left over from whoever used this browser last.
  if (
    status === 403 &&
    message.startsWith("you do not have access to this business")
  ) {
    return true;
  }

  // 400: the id isn't a positive integer at all. Storage holding the string
  // "undefined" is the usual way in, and it fails every request until it's
  // dropped. `businessContext.js` sends this one on 400, not 403.
  return status === 400 && message.startsWith("a valid business_id is required");
}
