import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALL_EVENT_NAMES, EVENTS, REQUIRED_PROPS } from "@/lib/analytics-events";

/**
 * The Mixpanel integration.
 *
 * Every case below is a defect that actually shipped in the previous
 * integration (`sole-webapp`, Mixpanel project 4054926) and went unnoticed for
 * weeks, because all of them were silent: the code ran, nothing threw, and the
 * data was simply wrong. Pinning them here is the only thing that makes "we
 * fixed it" mean anything — the bug class is "looks fine, reads wrong", so
 * reading the code again would not have caught any of them either.
 */

const mixpanel = {
  init: vi.fn(),
  identify: vi.fn(),
  track: vi.fn(),
  register: vi.fn(),
  register_once: vi.fn(),
  unregister: vi.fn(),
  reset: vi.fn(),
  get_distinct_id: vi.fn(() => "distinct"),
  people: { set: vi.fn() },
};

vi.mock("mixpanel-browser", () => ({ default: mixpanel }));

/**
 * The module keeps `started` and `identifiedAs` at module scope — deliberately,
 * because the SDK is a singleton — so each test needs its own copy of it.
 */
async function load({
  token = "test-token",
  search = "",
  referrer = "",
  pathname = "/",
  hostname = "app.soleapp.com.au",
} = {}) {
  vi.resetModules();
  for (const fn of Object.values(mixpanel)) {
    if (typeof fn === "function") fn.mockClear();
  }
  mixpanel.people.set.mockClear();

  if (token) process.env.NEXT_PUBLIC_MIXPANEL_TOKEN = token;
  else delete process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;

  vi.stubGlobal("window", { location: { search, pathname, hostname } });
  vi.stubGlobal("document", { referrer });

  return import("@/lib/analytics");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
});

describe("identify", () => {
  it("keys the profile on the backend user id", async () => {
    const analytics = await load();
    analytics.initAnalytics();

    analytics.identify({
      userId: "8421",
      email: "sam@example.org",
      name: "Sam",
      plan: "trial",
      trialActive: true,
      businessId: "biz-1",
    });

    expect(mixpanel.identify).toHaveBeenCalledWith("8421");
    expect(mixpanel.people.set).toHaveBeenCalledWith(
      expect.objectContaining({ $email: "sam@example.org", $name: "Sam" }),
    );
  });

  it("NEVER falls back to the email address when the id is missing", async () => {
    const analytics = await load();
    analytics.initAnalytics();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    analytics.identify({ userId: null, email: "sam@example.org" });

    /*
     * The single most expensive defect in the old project. It used
     * `String(user.id || email)`, and `user.id` is not a field the profile
     * endpoint returns — so the fallback fired every single time and all 479
     * profiles there are keyed on an email address. Email is not a stable
     * key, and the reporting pipeline carries a merge step to this day
     * because of it.
     */
    expect(mixpanel.identify).not.toHaveBeenCalled();
    expect(mixpanel.people.set).not.toHaveBeenCalled();

    // Reported as data rather than only to a console nobody is watching.
    expect(mixpanel.track).toHaveBeenCalledWith(
      EVENTS.IDENTIFY_FAILED,
      expect.objectContaining({ has_email: true }),
    );
    expect(error).toHaveBeenCalled();
  });

  it("does not re-identify the same person on every render", async () => {
    const analytics = await load();
    analytics.initAnalytics();

    analytics.identify({ userId: "8421", email: "sam@example.org" });
    analytics.identify({ userId: "8421", email: "sam@example.org" });

    expect(mixpanel.identify).toHaveBeenCalledTimes(1);
    // The profile is still re-asserted: set-at-signup-only is why just 60 of
    // 479 profiles in the old project carry trial dates at all.
    expect(mixpanel.people.set).toHaveBeenCalledTimes(2);
  });

  it("re-identifies when a different person signs in", async () => {
    const analytics = await load();
    analytics.initAnalytics();

    analytics.identify({ userId: "8421" });
    analytics.identify({ userId: "9977" });

    expect(mixpanel.identify).toHaveBeenNthCalledWith(1, "8421");
    expect(mixpanel.identify).toHaveBeenNthCalledWith(2, "9977");
  });

  it("carries plan and trial through to the super properties", async () => {
    const analytics = await load();
    analytics.initAnalytics();

    analytics.identify({ userId: "8421", plan: "trial", trialActive: true });

    /*
     * In the old project every profile reads `plan: 'free'`, mid-trial people
     * included, so filtering on plan to find trial users returns zero and
     * they are only findable through a trial date.
     */
    expect(mixpanel.register).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "trial", trial_active: true }),
    );
  });

  it("flags staff and throwaway accounts", async () => {
    const analytics = await load();
    analytics.initAnalytics();

    analytics.identify({ userId: "1", email: "ashish@soleapp.com.au" });
    expect(mixpanel.people.set).toHaveBeenLastCalledWith(
      expect.objectContaining({ is_internal: true }),
    );

    analytics.identify({ userId: "2", email: "real@customer.com.au" });
    expect(mixpanel.people.set).toHaveBeenLastCalledWith(
      expect.objectContaining({ is_internal: false }),
    );
  });
});

describe("isInternalEmail", () => {
  it("catches the addresses that sit in the middle of the customer numbers", async () => {
    const { isInternalEmail } = await load();

    expect(isInternalEmail("someone@yopmail.com")).toBe(true);
    expect(isInternalEmail("ASHISH@SoleApp.com.au")).toBe(true);
    expect(isInternalEmail(" qa@getsole.ai ")).toBe(true);
    expect(isInternalEmail("dev+test1@gmail.com")).toBe(true);

    expect(isInternalEmail("sam@plumbing.com.au")).toBe(false);
    expect(isInternalEmail(null)).toBe(false);
    expect(isInternalEmail("")).toBe(false);
  });
});

describe("readLaunchProperties", () => {
  it("reads the campaign off the live URL", async () => {
    const { readLaunchProperties } = await load();

    const props = readLaunchProperties(
      "?utm_source=google&utm_medium=cpc&utm_campaign=spring",
      "https://google.com/",
      "/signup",
    );

    expect(props).toEqual({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "spring",
      referrer: "https://google.com/",
      landing_page: "/signup",
    });
  });

  it("omits keys with no value rather than registering a null", async () => {
    const { readLaunchProperties } = await load();

    const props = readLaunchProperties("?utm_source=", "", "/");

    /*
     * `register_once` never overwrites. A null registered on a visitor's
     * first load would therefore block the real campaign from ever being
     * recorded for that browser — worse than recording nothing.
     */
    expect(props).not.toHaveProperty("utm_source");
    expect(props).not.toHaveProperty("referrer");
    expect(props).toEqual({ landing_page: "/" });
  });

  it("keeps a Google Ads click that lost its tagging", async () => {
    const { readLaunchProperties } = await load();
    const props = readLaunchProperties("?gclid=abc123", "", "/");
    expect(props.gclid).toBe("abc123");
  });
});

describe("initAnalytics", () => {
  it("registers first-touch attribution from window.location, not router state", async () => {
    const analytics = await load({
      search: "?utm_source=newsletter",
      referrer: "https://news.example/",
      pathname: "/pricing",
    });

    analytics.initAnalytics();

    /*
     * The old app read UTM from router state, which is empty until hydration
     * finishes — so every campaign attribution it recorded was null.
     */
    expect(mixpanel.register_once).toHaveBeenCalledWith({
      utm_source: "newsletter",
      referrer: "https://news.example/",
      landing_page: "/pricing",
    });
    expect(mixpanel.register).toHaveBeenCalledWith(
      expect.objectContaining({ app: "new_ui" }),
    );
  });

  it("does not run on localhost — ALLOW_LOCAL is off by request", async () => {
    const analytics = await load({ hostname: "localhost" });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    /*
     * Current policy, explicitly asked for: "abhi local mein nahi, sirf live
     * mein" — nothing should send from a developer's machine until that is
     * revisited. `ALLOW_LOCAL` in lib/analytics.ts is the one flag that
     * decides this; flipping it back to `true` is the only change needed to
     * restore the labelled-not-blocked behaviour the plan doc otherwise
     * argues for.
     */
    analytics.initAnalytics();
    expect(mixpanel.init).not.toHaveBeenCalled();

    analytics.identify({ userId: "8421" });
    analytics.track(EVENTS.BUSINESS_CREATED);
    expect(mixpanel.identify).not.toHaveBeenCalled();
    expect(mixpanel.track).not.toHaveBeenCalled();
  });

  it("names the reason in development, the same way the no-token case does", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const analytics = await load({ hostname: "localhost" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    analytics.initAnalytics();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("localhost"));
  });

  it("still measures 192.168.x and other private hosts as local", async () => {
    const analytics = await load({ hostname: "192.168.1.14" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    analytics.initAnalytics();
    expect(mixpanel.init).not.toHaveBeenCalled();
  });

  it("tells prod and UAT apart, which share one project", async () => {
    const { deploymentEnv } = await load();

    expect(deploymentEnv("app.soleapp.com.au")).toBe("deployed");
    expect(deploymentEnv("uat.soleapp.com.au")).toBe("deployed");
    expect(deploymentEnv("127.0.0.1")).toBe("local");
    expect(deploymentEnv("192.168.1.14")).toBe("local");
    expect(deploymentEnv("ashish-pc.local")).toBe("local");
  });

  it("is safe to run twice, as Strict Mode does", async () => {
    const analytics = await load();

    analytics.initAnalytics();
    analytics.initAnalytics();

    expect(mixpanel.init).toHaveBeenCalledTimes(1);
  });

  it("configures replay masked and sampled", async () => {
    const analytics = await load();
    analytics.initAnalytics();

    const [, config] = mixpanel.init.mock.calls[0];
    // Replay is for watching where somebody got stuck; it does not need to
    // read invoice amounts, client names or bank balances.
    expect(config).toMatchObject({
      record_mask_all_text: true,
      record_mask_all_inputs: true,
      record_sessions_percent: 10,
      // Page views come from usePathname(); the SDK cannot see an App Router
      // client-side navigation at all.
      track_pageview: false,
      persistence: "localStorage",
    });
  });

  it("does not honour Do Not Track", async () => {
    const analytics = await load();
    analytics.initAnalytics();

    const [, config] = mixpanel.init.mock.calls[0];
    /*
     * Pinned rather than left to the SDK default, which is the opposite.
     * Honouring DNT loses a Firefox user entirely — Firefox turns it on by
     * itself in a private window — and that absence is indistinguishable from
     * someone who never visited, so it reads as a lower funnel rather than as
     * missing data. Decided 7 Oct 2026, and set from day one: changing it on
     * a project that already holds data would put a step change into every
     * count with no way to tell it from real growth.
     */
    expect(config.ignore_dnt).toBe(true);
  });

  it("does nothing at all without a token", async () => {
    const analytics = await load({ token: "" });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    analytics.initAnalytics();
    analytics.identify({ userId: "8421" });
    analytics.track(EVENTS.BUSINESS_CREATED);

    expect(mixpanel.init).not.toHaveBeenCalled();
    expect(mixpanel.identify).not.toHaveBeenCalled();
    expect(mixpanel.track).not.toHaveBeenCalled();
  });
});

describe("track", () => {
  it("holds events fired before init and sends them after", async () => {
    const analytics = await load();

    analytics.track(EVENTS.SIGNUP_INITIATED, { source: "hero" });
    expect(mixpanel.track).not.toHaveBeenCalled();

    analytics.initAnalytics();

    // Dropping these would be the exact failure this integration exists to
    // stop: the event was written, and never arrived.
    expect(mixpanel.track).toHaveBeenCalledWith(EVENTS.SIGNUP_INITIATED, {
      source: "hero",
    });
  });

  it("sends the event name and a flat bag of properties", async () => {
    const analytics = await load();
    analytics.initAnalytics();

    analytics.track(EVENTS.INVOICE_SENT, { amount: 1200, currency: "AUD" });

    expect(mixpanel.track).toHaveBeenCalledWith(EVENTS.INVOICE_SENT, {
      amount: 1200,
      currency: "AUD",
    });
  });

  it("never throws out of a caller, even when the SDK itself throws", async () => {
    const analytics = await load();
    analytics.initAnalytics();
    vi.spyOn(console, "error").mockImplementation(() => {});

    mixpanel.track.mockImplementationOnce(() => {
      throw new Error("mixpanel-browser internal error");
    });

    /*
     * The case this whole wrapper exists for: `track()` is called from the
     * middle of real actions — `saveInvoiceApi` calls it right after the
     * invoice has already been saved to the server. If this throws, that
     * save would report itself as failed to the person at the keyboard
     * despite having succeeded on the backend, which is worse than the event
     * being silently dropped.
     */
    expect(() =>
      analytics.track(EVENTS.INVOICE_SENT, { amount: 500 }),
    ).not.toThrow();
  });
});

describe("crash safety", () => {
  /**
   * Every exported function that reaches the SDK, proven not to throw when
   * the SDK itself does. Table-driven rather than one test per function so a
   * new exported function added later without a case here is a visible gap
   * in the table, not a silent one.
   */
  const sdkMethods = [
    "init",
    "identify",
    "track",
    "register",
    "register_once",
    "unregister",
    "reset",
  ] as const;

  function makeEverythingThrow() {
    for (const method of sdkMethods) {
      (mixpanel[method] as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error(`mixpanel.${method} is broken`);
      });
    }
    mixpanel.people.set.mockImplementation(() => {
      throw new Error("mixpanel.people.set is broken");
    });
  }

  it("initAnalytics does not throw when every SDK method is broken", async () => {
    const analytics = await load();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    makeEverythingThrow();

    expect(() => analytics.initAnalytics()).not.toThrow();
  });

  it("identify does not throw when every SDK method is broken", async () => {
    const analytics = await load();
    vi.spyOn(console, "error").mockImplementation(() => {});
    analytics.initAnalytics();
    makeEverythingThrow();

    expect(() =>
      analytics.identify({ userId: "8421", email: "sam@example.org" }),
    ).not.toThrow();
  });

  it("identify(no userId) does not throw when every SDK method is broken", async () => {
    const analytics = await load();
    vi.spyOn(console, "error").mockImplementation(() => {});
    analytics.initAnalytics();
    makeEverythingThrow();

    expect(() => analytics.identify({ userId: null })).not.toThrow();
  });

  it("resetAnalytics does not throw when every SDK method is broken", async () => {
    const analytics = await load();
    vi.spyOn(console, "error").mockImplementation(() => {});
    analytics.initAnalytics();
    analytics.identify({ userId: "8421" });
    makeEverythingThrow();

    expect(() => analytics.resetAnalytics()).not.toThrow();
    // Sign-out still means signed out, even if the SDK's own reset failed —
    // the next identify() must not be treated as a no-op repeat of the last.
    makeEverythingThrow();
    expect(() => analytics.identify({ userId: "8421" })).not.toThrow();
  });

  it("setBusinessContext does not throw when every SDK method is broken", async () => {
    const analytics = await load();
    vi.spyOn(console, "error").mockImplementation(() => {});
    analytics.initAnalytics();
    makeEverythingThrow();

    expect(() => analytics.setBusinessContext("biz-1")).not.toThrow();
    expect(() => analytics.setBusinessContext(null)).not.toThrow();
  });

  it("a thrown identify() does not falsely mark the session identified", async () => {
    const analytics = await load();
    analytics.initAnalytics();
    vi.spyOn(console, "error").mockImplementation(() => {});

    mixpanel.identify.mockImplementationOnce(() => {
      throw new Error("mixpanel.identify is broken");
    });
    analytics.identify({ userId: "8421" });

    // The failed call must not have been latched as a success — a working
    // identify() on the very next call should still go through, not be
    // skipped as "already identified as 8421".
    analytics.identify({ userId: "8421" });
    expect(mixpanel.identify).toHaveBeenCalledTimes(2);
  });
});

describe("resetAnalytics", () => {
  it("forgets the person but keeps the app tag", async () => {
    const analytics = await load();
    analytics.initAnalytics();
    analytics.identify({ userId: "8421" });

    mixpanel.register.mockClear();
    analytics.resetAnalytics();

    expect(mixpanel.reset).toHaveBeenCalled();
    // reset() clears super properties too, so the ones describing the app
    // rather than the person go back on.
    expect(mixpanel.register).toHaveBeenCalledWith(
      expect.objectContaining({ app: "new_ui", env: "deployed" }),
    );

    // And the next sign-in identifies again rather than being deduped
    // against the person who just left.
    analytics.identify({ userId: "8421" });
    expect(mixpanel.identify).toHaveBeenCalledTimes(2);
  });
});

describe("setBusinessContext", () => {
  it("registers the active business and clears it when there is none", async () => {
    const analytics = await load();
    analytics.initAnalytics();

    analytics.setBusinessContext("biz-9");
    expect(mixpanel.register).toHaveBeenCalledWith({ business_id: "biz-9" });

    analytics.setBusinessContext(null);
    expect(mixpanel.unregister).toHaveBeenCalledWith("business_id");
  });
});

describe("normalisePath", () => {
  it("collapses record ids so a screen is one row, not one per record", async () => {
    const { normalisePath } = await load();

    expect(normalisePath("/invoices/4821/edit")).toBe("/invoices/[id]/edit");
    expect(
      normalisePath("/assets/3f2504e0-4f89-11d3-9a0c-0305e82c3301"),
    ).toBe("/assets/[id]");
    expect(normalisePath("/transactions")).toBe("/transactions");
    expect(normalisePath("/")).toBe("/");
  });

  it("leaves real route segments alone", async () => {
    const { normalisePath } = await load();

    // Words, not identifiers — collapsing these would merge unrelated screens.
    expect(normalisePath("/settings/notifications")).toBe(
      "/settings/notifications",
    );
    expect(normalisePath("/reports/profit-and-loss")).toBe(
      "/reports/profit-and-loss",
    );
  });
});

describe("the event contract", () => {
  it("has no duplicate names", async () => {
    // Two keys sharing a value would silently merge two different things into
    // one series, and no report would show it.
    expect(new Set(ALL_EVENT_NAMES).size).toBe(ALL_EVENT_NAMES.length);
  });

  it("only requires properties of events that exist", async () => {
    for (const name of Object.keys(REQUIRED_PROPS)) {
      expect(ALL_EVENT_NAMES).toContain(name);
    }
  });

  it("names events in snake_case, as the old project does", async () => {
    // The onboarding and signup names are shared with project 4054926 on
    // purpose, so the two funnels can be read side by side across the switch.
    for (const name of ALL_EVENT_NAMES) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe("derivePlan", () => {
  // Only the two fields `derivePlan` reads — the real `SubscriptionInfo` has
  // more, and a test building a full one would break every time that type
  // grows a field this function doesn't look at.
  const sub = (over: { isTrialing?: boolean; isFree?: boolean } = {}) =>
    ({ isTrialing: false, isFree: false, ...over }) as import("@/lib/subscription").SubscriptionInfo;

  it("says 'free' before anything has loaded — not until it is actually known", async () => {
    const { derivePlan } = await load();
    /*
     * `null`, not `'free'`. The old project's bug was exactly the shape
     * "default to free and never correct it" — stamping a value here before
     * the subscription fetch lands would reproduce it inside the fix meant to
     * remove it.
     */
    expect(derivePlan(null)).toBeNull();
  });

  it("reads 'trial' from isTrialing, never from a plan string", async () => {
    const { derivePlan } = await load();
    expect(derivePlan(sub({ isTrialing: true }))).toBe("trial");
  });

  it("reads 'free' only once the subscription has confirmed it", async () => {
    const { derivePlan } = await load();
    expect(derivePlan(sub({ isFree: true }))).toBe("free");
  });

  it("falls through to 'paid' for anything that is neither trialing nor free", async () => {
    const { derivePlan } = await load();
    expect(derivePlan(sub())).toBe("paid");
  });

  it("prefers isTrialing over isFree when both are somehow set", async () => {
    const { derivePlan } = await load();
    // Shouldn't happen from the real API, but a trial is the more specific
    // and more useful fact if it ever does.
    expect(derivePlan(sub({ isTrialing: true, isFree: true }))).toBe("trial");
  });
});

describe("the dev validator", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
  });

  it("complains when an event arrives without the value it was added for", async () => {
    const analytics = await load();
    analytics.initAnalytics();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    analytics.track(EVENTS.INVOICE_SENT, {});

    /*
     * The old integration's largest reporting gap was one missing property:
     * all 9,432 `module_used` rows carry `action: "viewed"`. A count alone
     * does not answer "invoices sent with invoice value", which is the
     * question actually asked of it.
     */
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("missing required property: amount"),
    );
    // Still sent — a warning, not a gate. Dropping it would turn a reporting
    // gap into a reporting hole.
    expect(mixpanel.track).toHaveBeenCalled();
  });

  it("stays quiet when the required properties are there", async () => {
    const analytics = await load();
    analytics.initAnalytics();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    analytics.track(EVENTS.INVOICE_PAID, { amount: 900, days_to_payment: 12 });

    expect(error).not.toHaveBeenCalled();
  });

  it("accepts a zero without calling it missing", async () => {
    const analytics = await load();
    analytics.initAnalytics();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    // Paid on the day it was sent, and a $0 line is a real thing people send.
    analytics.track(EVENTS.INVOICE_PAID, { amount: 0, days_to_payment: 0 });

    expect(error).not.toHaveBeenCalled();
  });
});
