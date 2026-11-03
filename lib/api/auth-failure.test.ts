import { describe, expect, it } from "vitest";

import {
  isUnauthenticatedMessage,
  looksLikeStaleBusiness,
  looksUnauthenticated,
} from "@/lib/api/auth-failure";

/**
 * The messages below are copied from `sole-ocr/src/middleware/auth.js` and
 * `clerkAuth.js` rather than invented — the whole value of this module is that
 * it recognises what the backend actually sends, so a test that asserts
 * against made-up strings would prove nothing.
 */
describe("looksUnauthenticated", () => {
  it("treats any 401 as a dead session, whatever the body says", () => {
    expect(looksUnauthenticated(401, null)).toBe(true);
    expect(looksUnauthenticated(401, { message: "Something else" })).toBe(true);
  });

  it.each([
    "Missing Authorization header",
    "Invalid token format",
    "Invalid or expired token",
    "token_expired",
    "User is logged out",
    "Unauthorized",
    "Unauthorized - Token verification failed",
    "Authentication failed",
  ])("recognises %j even on a 200", (message) => {
    // The case that no status check would ever catch, and the reason this
    // reads the body at all.
    expect(looksUnauthenticated(200, { message })).toBe(true);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(looksUnauthenticated(200, { message: "  TOKEN_EXPIRED " })).toBe(
      true,
    );
  });

  it("leaves an ordinary failure alone", () => {
    expect(looksUnauthenticated(500, { message: "Something went wrong" })).toBe(
      false,
    );
    expect(looksUnauthenticated(404, { message: "Business not found" })).toBe(
      false,
    );
    expect(looksUnauthenticated(200, null)).toBe(false);
    expect(looksUnauthenticated(200, {})).toBe(false);
  });

  it("does not sign anyone out over a 403", () => {
    // 403 is "not your business", not "not signed in" — see the note on the
    // function. Getting this wrong would log people out for having a stale id.
    expect(
      looksUnauthenticated(403, {
        message: "You do not have access to this business.",
      }),
    ).toBe(false);
  });

  it("is false for an absent message rather than throwing", () => {
    expect(isUnauthenticatedMessage(undefined)).toBe(false);
    expect(isUnauthenticatedMessage(null)).toBe(false);
    expect(isUnauthenticatedMessage("")).toBe(false);
  });
});

describe("looksLikeStaleBusiness", () => {
  it("recognises a business the account can't open (403)", () => {
    expect(
      looksLikeStaleBusiness(403, {
        message: "You do not have access to this business.",
      }),
    ).toBe(true);
  });

  it("recognises a malformed stored id (400)", () => {
    // Storage holding the literal string "undefined" is the usual way in.
    expect(
      looksLikeStaleBusiness(400, {
        message: "A valid business_id is required.",
      }),
    ).toBe(true);
  });

  it("pairs each message with the status the backend actually sends it on", () => {
    // Swapped round, neither should match — a 401 is a session problem and
    // belongs to `looksUnauthenticated`, not to the business-id recovery.
    expect(
      looksLikeStaleBusiness(401, {
        message: "You do not have access to this business.",
      }),
    ).toBe(false);
    expect(
      looksLikeStaleBusiness(403, {
        message: "A valid business_id is required.",
      }),
    ).toBe(false);
  });

  it("leaves an unrelated 403 alone", () => {
    expect(
      looksLikeStaleBusiness(403, { message: "Your plan doesn't include this" }),
    ).toBe(false);
  });
});
