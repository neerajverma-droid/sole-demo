import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ATTRIBUTION_COOKIE } from "@/lib/partner-attribution";
import { clearClientState } from "./teardown";

/**
 * A partner link (?ref=CODE&partner=pportal) lands a visitor on a page that sends them to
 * sign-in. Clearing the session there must not throw away the partner code they arrived
 * with, or the sign-up that follows is no longer attributed to the partner.
 *
 * No DOM library here, so the cookie jar is a small stand-in: a write with a past expiry
 * removes the cookie of that name, any other write sets it.
 */
function fakeBrowser(initial: Record<string, string>) {
  const jar = new Map(Object.entries(initial));
  const doc = {
    get cookie() {
      return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    set cookie(line: string) {
      const [pair = "", ...attrs] = line.split(";").map((s) => s.trim());
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq);
      const expired = attrs.some((a) => /^expires=/i.test(a) && new Date(a.slice(8)).getTime() < Date.now());
      if (expired) jar.delete(name);
      else jar.set(name, pair.slice(eq + 1));
    },
  };
  const store = { length: 0, key: () => null, removeItem: () => undefined, clear: () => undefined };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", {
    location: { hostname: "localhost", pathname: "/login" },
    localStorage: store,
    sessionStorage: store,
  });
  return jar;
}

describe("clearing client state keeps a partner link's code", () => {
  beforeEach(() => vi.stubGlobal("navigator", {}));
  afterEach(() => vi.unstubAllGlobals());

  it("removes the account's cookies but leaves the partner code", () => {
    const code = encodeURIComponent("pportal:XG7RF63R");
    const jar = fakeBrowser({ [ATTRIBUTION_COOKIE]: code, "sole-session": "abc", "sole-businesses": "x" });

    clearClientState();

    expect(jar.has("sole-session")).toBe(false);
    expect(jar.has("sole-businesses")).toBe(false);
    expect(jar.get(ATTRIBUTION_COOKIE)).toBe(code);
  });
});
