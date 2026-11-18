import { afterEach, describe, expect, it, vi } from "vitest";

import { ALL_EVENT_NAMES, REQUIRED_PROPS } from "@/lib/analytics-events";

const TEST_EVENT = "test_event" as never;

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
  get_property: vi.fn<(key: string) => string | undefined>(() => undefined),
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

    expect(mixpanel.track).not.toHaveBeenCalled();
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

  it("sets the plan, its duration and the add-ons on the profile", async () => {
    const analytics = await load();
    analytics.initAnalytics();

    analytics.identify({
      userId: "8421",
      subscription: {
        planName: "Compliance Bundle",
        planInterval: "annual",
        addons: ["time", "km"],
      } as import("@/lib/subscription").SubscriptionInfo,
      totalBusinesses: 2,
    });

    expect(mixpanel.people.set).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "8421",
        plan_name: "Compliance Bundle",
        plan_duration: "Annually",
        is_time_tracker_add_on: true,
        is_km_tracker_add_on: true,
        is_accounting_add_on: false,
        total_businesses: 2,
      }),
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
    analytics.track(TEST_EVENT);
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
    analytics.track(TEST_EVENT);

    expect(mixpanel.init).not.toHaveBeenCalled();
    expect(mixpanel.identify).not.toHaveBeenCalled();
    expect(mixpanel.track).not.toHaveBeenCalled();
  });
});

describe("track", () => {
  it("holds events fired before init and sends them after", async () => {
    const analytics = await load();

    analytics.track(TEST_EVENT, { source: "hero" });
    expect(mixpanel.track).not.toHaveBeenCalled();

    analytics.initAnalytics();

    // Dropping these would be the exact failure this integration exists to
    // stop: the event was written, and never arrived.
    expect(mixpanel.track).toHaveBeenCalledWith(TEST_EVENT, {
      source: "hero",
    });
  });

  it("sends the event name and a flat bag of properties", async () => {
    const analytics = await load();
    analytics.initAnalytics();

    analytics.track(TEST_EVENT, { amount: 1200, currency: "AUD" });

    expect(mixpanel.track).toHaveBeenCalledWith(TEST_EVENT, {
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
      analytics.track(TEST_EVENT, { amount: 500 }),
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

    expect(() => analytics.setBusinessContext({ id: "biz-1" })).not.toThrow();
    expect(() => analytics.setBusinessContext({ id: null })).not.toThrow();
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

    analytics.setBusinessContext({ id: "biz-9", name: "Acme", industry: "Arts" });
    expect(mixpanel.register).toHaveBeenCalledWith({
      business_id: "biz-9",
      business_name: "Acme",
      industry: "Arts",
    });

    analytics.setBusinessContext({ id: null });
    expect(mixpanel.unregister).toHaveBeenCalledWith("business_id");
    expect(mixpanel.unregister).toHaveBeenCalledWith("business_name");
    expect(mixpanel.unregister).toHaveBeenCalledWith("industry");
  });

  it("keeps the persisted name and industry while the same business's lists are still loading", async () => {
    const analytics = await load();
    analytics.initAnalytics();
    mixpanel.register.mockClear();
    mixpanel.get_property.mockImplementation((key: string) =>
      key === "business_id" ? "biz-9" : undefined,
    );

    analytics.setBusinessContext({ id: "biz-9", name: null, industry: null });
    expect(mixpanel.register).toHaveBeenLastCalledWith({ business_id: "biz-9" });

    // A different business never inherits the previous one's name.
    analytics.setBusinessContext({ id: "biz-10", name: null, industry: null });
    expect(mixpanel.register).toHaveBeenLastCalledWith({
      business_id: "biz-10",
      business_name: null,
      industry: null,
    });
    mixpanel.get_property.mockImplementation(() => undefined);
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

describe("planSelectionProps", () => {
  it("carries the plan, its add-ons and the amount rounded to cents", async () => {
    const { planSelectionProps } = await load();
    expect(
      planSelectionProps({
        planName: "Invoice and Expense",
        interval: "annual",
        addons: ["booking"],
        paidAmount: 29.991 * 12,
        currency: "AUD",
        businessId: "biz-3",
        businessName: "Acme Plumbing",
        isOnboarding: true,
      }),
    ).toEqual(
      expect.objectContaining({
        plan_name: "Invoice and Expense",
        plan_duration: "Annually",
        is_booking_add_on: true,
        is_inventory_add_on: false,
        business_id: "biz-3",
        business_name: "Acme Plumbing",
        paid_amount: 359.89,
        currency: "AUD",
        is_onboarding: true,
      }),
    );
  });

  it("leaves business_name to the super property when none is given", async () => {
    const { planSelectionProps } = await load();
    const props = planSelectionProps({
      planName: "Pro",
      interval: "monthly",
      addons: [],
      paidAmount: 10,
      currency: "AUD",
      businessId: "biz-3",
      isOnboarding: false,
    });
    expect(props).not.toHaveProperty("business_name");
    expect(props.is_onboarding).toBe(false);
  });
});

describe("planProfile", () => {
  it("is empty until the subscription has loaded", async () => {
    const { planProfile } = await load();
    expect(planProfile(null)).toEqual({});
  });

  it("calls anything that is not annual Monthly", async () => {
    const { planDuration } = await load();
    expect(planDuration("annual")).toBe("Annually");
    expect(planDuration("monthly")).toBe("Monthly");
    expect(planDuration(null)).toBe("Monthly");
  });

  it("maps every add-on slug to its flag", async () => {
    const { addonFlags } = await load();
    expect(addonFlags(["accounting", "assets-advanced", "crypto"])).toEqual({
      is_accounting_add_on: true,
      is_time_tracker_add_on: false,
      is_projects_add_on: false,
      is_advanced_assets_add_on: true,
      is_booking_add_on: false,
      is_km_tracker_add_on: false,
      is_inventory_add_on: false,
      is_crypto_module_add_on: true,
    });
  });
});

describe("signup_initiated", () => {
  it("sends the method with the campaign from the URL, to the event and the profile", async () => {
    const analytics = await load({
      search: "?utm_source=google&utm_medium=cpc&utm_campaign=spring",
    });
    analytics.initAnalytics();

    analytics.trackSignupInitiated("google");

    const expected = {
      signup_method: "google",
      primary_email: null,
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "spring",
    };
    expect(mixpanel.track).toHaveBeenCalledWith("signup_initiated", expected);
    expect(mixpanel.people.set).toHaveBeenCalledWith(expected);
  });

  it("falls back to the first-touch campaign once the URL has lost it", async () => {
    const analytics = await load({ search: "" });
    analytics.initAnalytics();
    mixpanel.get_property.mockImplementation((key: string) =>
      key === "utm_source" ? "newsletter" : undefined,
    );

    analytics.trackSignupInitiated("email");

    expect(mixpanel.track).toHaveBeenCalledWith(
      "signup_initiated",
      expect.objectContaining({
        signup_method: "email",
        utm_source: "newsletter",
        utm_medium: null,
      }),
    );
  });

  it("holds an event fired before init and sends it after", async () => {
    const analytics = await load();
    analytics.trackSignupInitiated("email");
    expect(mixpanel.track).not.toHaveBeenCalled();

    analytics.initAnalytics();
    expect(mixpanel.track).toHaveBeenCalledWith(
      "signup_initiated",
      expect.objectContaining({ signup_method: "email" }),
    );
  });
});

describe("signup_initiated once per method", () => {
  it("counts a login-page hand-off and the Create account press as one start", async () => {
    const analytics = await load();
    analytics.initAnalytics();

    analytics.trackSignupInitiated("email");
    analytics.trackSignupInitiated("email");
    analytics.trackSignupInitiated("google");

    const sent = mixpanel.track.mock.calls.filter(
      ([event]) => event === "signup_initiated",
    );
    expect(sent.map(([, props]) => props.signup_method)).toEqual([
      "email",
      "google",
    ]);
  });
});

describe("plan_name for the free tier", () => {
  it("is the tracking plan's 'Free', not the API's 'Free plan'", async () => {
    const { planProfile } = await load();
    const { NO_SUBSCRIPTION } = await import("@/lib/subscription");
    expect(planProfile(NO_SUBSCRIPTION).plan_name).toBe("Free");
    expect(
      planProfile({ ...NO_SUBSCRIPTION, isFree: false, planName: "Pro" })
        .plan_name,
    ).toBe("Pro");
  });
});

describe("pay-first sign-up: no plan before the first payment", () => {
  it("planProfile sets nothing for an account still owing its first subscription", async () => {
    const { planProfile } = await load();
    const { NO_SUBSCRIPTION } = await import("@/lib/subscription");
    expect(
      planProfile({ ...NO_SUBSCRIPTION, requiresFirstSubscription: true }),
    ).toEqual({});
  });

  it("identify leaves the plan alone while the first payment is pending", async () => {
    const analytics = await load();
    analytics.initAnalytics();
    const { NO_SUBSCRIPTION } = await import("@/lib/subscription");

    analytics.identify({
      userId: "42",
      email: "new@customer.com",
      subscription: { ...NO_SUBSCRIPTION, requiresFirstSubscription: true },
    });

    const profile = mixpanel.people.set.mock.calls.at(-1)?.[0] ?? {};
    expect(profile).not.toHaveProperty("plan_name");
    expect(profile).not.toHaveProperty("is_accounting_add_on");
  });

  /** The suite's `window` stub has no storage; give these a real-shaped one. */
  const withLocalStorage = () => {
    const store = new Map<string, string>();
    const sessionStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    };
    vi.stubGlobal("window", {
      ...(typeof window === "undefined" ? {} : window),
      localStorage: sessionStorage,
    });
    return sessionStorage;
  };

  it("keeps the company step's profile across the Stripe round trip, then forgets it", async () => {
    const {
      rememberOnboardingProfile,
      recallOnboardingProfile,
      forgetOnboardingProfile,
    } = await load();
    withLocalStorage();
    const profile = {
      primary_country: "Australia",
      primary_email: "new@customer.com",
      primary_business_name: "Acme Plumbing",
      user_name: "Sam Lee",
      user_id: "42",
      mobile_number: "0400 000 000",
      abn_number: "51 824 753 556",
    };
    rememberOnboardingProfile(profile);
    expect(recallOnboardingProfile()).toEqual(profile);
    // Never another person's profile on a shared browser.
    expect(recallOnboardingProfile("99")).toEqual({});
    expect(recallOnboardingProfile("42")).toEqual(profile);
    forgetOnboardingProfile();
    expect(recallOnboardingProfile()).toEqual({});
  });

  it("remembers that signup_completed went out, per user", async () => {
    const { signupAlreadyReported, markSignupReported } = await load();
    withLocalStorage();
    expect(signupAlreadyReported("42")).toBe(false);
    markSignupReported("42");
    expect(signupAlreadyReported("42")).toBe(true);
    expect(signupAlreadyReported("43")).toBe(false);
  });

  it("recalls nothing rather than throwing on a corrupt entry, or with no storage at all", async () => {
    const { recallOnboardingProfile } = await load();
    withLocalStorage().setItem("sole-analytics-onboarding-profile", "{not json");
    expect(recallOnboardingProfile()).toEqual({});
    vi.stubGlobal("window", { location: window.location });
    expect(recallOnboardingProfile()).toEqual({});
  });
});

describe("addonFlags with older slugs", () => {
  it("reads time-tracker and km-tracker as the add-ons they are", async () => {
    const { addonFlags } = await load();
    expect(addonFlags(["time-tracker", "km-tracker", "projects"])).toEqual(
      expect.objectContaining({
        is_time_tracker_add_on: true,
        is_km_tracker_add_on: true,
        is_projects_add_on: true,
        is_accounting_add_on: false,
      }),
    );
  });
});

describe("signup — the plan's five start buttons", () => {
  /** The suite's `window` stub has no storage; this block needs sessionStorage. */
  const withStorage = () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    };
    vi.stubGlobal("window", {
      ...(typeof window === "undefined" ? {} : window),
      sessionStorage: storage,
      localStorage: storage,
    });
  };

  it("carries the email typed on the login page with 'Create one'", async () => {
    const analytics = await load();
    analytics.initAnalytics();
    analytics.trackSignupInitiated("email", { primaryEmail: " new@customer.com " });
    expect(mixpanel.track).toHaveBeenCalledWith(
      "signup_initiated",
      expect.objectContaining({ signup_method: "email", primary_email: "new@customer.com" }),
    );
  });

  it("counts a Google press on the register page as both events, once the account is new", async () => {
    const analytics = await load();
    analytics.initAnalytics();
    withStorage();
    mixpanel.track.mockClear();

    analytics.rememberSocialStart("google", "register");
    analytics.reportSocialSignup({ email: "new@customer.com", is_first_login: true });

    const names = mixpanel.track.mock.calls.map(([event]) => event);
    expect(names).toEqual(["signup_initiated", "signup_details_entered"]);
    expect(mixpanel.track.mock.calls[1][1]).toEqual(
      expect.objectContaining({ signup_method: "google", primary_email: "new@customer.com" }),
    );
  });

  it("counts a login-page Apple press as signup_initiated only", async () => {
    const analytics = await load();
    analytics.initAnalytics();
    withStorage();
    mixpanel.track.mockClear();

    analytics.rememberSocialStart("apple", "login");
    analytics.reportSocialSignup({ email: "new@customer.com", is_first_login: true });

    expect(mixpanel.track.mock.calls.map(([event]) => event)).toEqual(["signup_initiated"]);
  });

  it("sends nothing when Google signs in to an account that already exists", async () => {
    const analytics = await load();
    analytics.initAnalytics();
    withStorage();
    mixpanel.track.mockClear();

    analytics.rememberSocialStart("google", "login");
    analytics.reportSocialSignup({ email: "old@customer.com", is_first_login: false });

    expect(mixpanel.track).not.toHaveBeenCalled();
  });

  it("sends nothing on a callback no button started", async () => {
    const analytics = await load();
    analytics.initAnalytics();
    withStorage();
    mixpanel.track.mockClear();

    analytics.reportSocialSignup({ email: "new@customer.com", is_first_login: true });

    expect(mixpanel.track).not.toHaveBeenCalled();
  });
});

describe("profile properties land on the user's profile", () => {
  it("identifies the user before setting them, so they aren't left in the SDK's queue", async () => {
    const analytics = await load();
    analytics.initAnalytics();
    mixpanel.identify.mockClear();
    mixpanel.people.set.mockClear();

    analytics.setUserProfile({ abn_number: "51 824 753 556" }, { userId: "20666" });

    expect(mixpanel.identify).toHaveBeenCalledWith("20666");
    expect(mixpanel.identify.mock.invocationCallOrder[0]).toBeLessThan(
      mixpanel.people.set.mock.invocationCallOrder[0],
    );
    expect(mixpanel.people.set).toHaveBeenCalledWith({ abn_number: "51 824 753 556" });

    // Already identified as that user: not identified again.
    analytics.setUserProfile({ mobile_number: "0400" }, { userId: "20666" });
    expect(mixpanel.identify).toHaveBeenCalledTimes(1);
  });
});

describe("onboarding payment for signup_completed", () => {
  it("is read once", async () => {
    const analytics = await load();
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      ...(typeof window === "undefined" ? {} : window),
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    });
    analytics.rememberOnboardingPayment(479.9);
    expect(analytics.takeOnboardingPayment()).toBe(479.9);
    expect(analytics.takeOnboardingPayment()).toBeNull();
  });
});
