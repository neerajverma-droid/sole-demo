/**
 * Product analytics, as one function.
 *
 * The call shape this file has always had — one verb, an event name, a flat
 * bag of properties — is unchanged. What changed is the body: it now sends to
 * Mixpanel instead of writing to the development console. Every screen that
 * already called `track(...)` keeps working without edits.
 *
 * Properties are flat and primitive on purpose: every destination worth
 * sending these to flattens nested objects anyway, and the ones that don't
 * drop them.
 *
 * WHAT THIS FILE IS DEFENDING AGAINST. The previous Mixpanel integration (the
 * old `sole-webapp`, project 4054926) was not written carelessly, and every
 * one of its defects was silent — the code ran, nothing threw, and the data
 * was wrong for weeks:
 *
 *   - `identify()` was keyed on the email address, because the call site read
 *     `user.id` and the profile only ever carries `user_id`. All 479 profiles
 *     are email-keyed, and recovering needed a merge step in the reporting
 *     pipeline that should never have been necessary.
 *   - UTM was read from router state, which is empty before hydration, so
 *     every campaign attribution landed null.
 *   - `switching_from` was registered inside a guard that never evaluated
 *     true: across 18,918 events, not one carried it.
 *   - A tracker function was written, exported, and never called.
 *
 * So the rules below are paired with something that fails: a type error, a
 * dev-time console error, or an event that reports the defect itself.
 */

import mixpanel from "mixpanel-browser";

import {
  ALL_EVENT_NAMES,
  EVENTS,
  REQUIRED_PROPS,
  type EventName,
} from "@/lib/analytics-events";
// Type-only: `lib/subscription.ts` imports `track`/`EVENTS` from this file,
// so a value import here would be circular. A type import is erased at
// compile time and carries no such risk.
import type { SubscriptionInfo } from "@/lib/subscription";

export type AnalyticsProps = Record<
  string,
  string | number | boolean | null | undefined
>;

const TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
const DEV = process.env.NODE_ENV === "development";

/**
 * Set only for a self-hosted or non-US Mixpanel residency. Unset means the
 * default US ingestion host, which is what project 4054926 uses.
 */
const API_HOST = process.env.NEXT_PUBLIC_MIXPANEL_API_HOST;

/** Guards `init()` against React 19 Strict Mode running the effect twice. */
let started = false;

/** Who we last told Mixpanel we are, so re-renders don't re-identify. */
let identifiedAs: string | null = null;

/**
 * Events fired before `init()` finished.
 *
 * `mixpanel.track()` before `init()` does not queue — it logs and drops. The
 * bootstrap's effect runs before any page's, so in practice this stays empty,
 * but "the event was written and never arrived" is the exact failure this
 * integration exists to stop, so it is held rather than lost. Bounded, because
 * an unbounded buffer behind a missing token is a memory leak.
 */
const pending: Array<{ event: EventName; props: AnalyticsProps }> = [];
const PENDING_LIMIT = 50;

function ready(): boolean {
  return typeof window !== "undefined" && started;
}

/**
 * Runs one Mixpanel SDK call and swallows anything it throws.
 *
 * Every exported function below is called from the middle of a real business
 * action — `track()` from `saveInvoiceApi` after the invoice already saved,
 * `identify()` from the session bootstrap on every authenticated render. None
 * of those call sites expect analytics to be able to fail their own action,
 * and without this an SDK that throws — a conflicting third-party script, an
 * extension that half-loads it, a bug in `mixpanel-browser` itself — would
 * propagate out of `track()` and make an invoice that saved successfully
 * report itself as failed, or an editor's save button spin forever on a
 * promise that never resolves.
 *
 * The old project had exactly this protection: `safeExecute()` in
 * `sole-webapp`'s `lib/mixpanel.js`, whose own comment says "App NEVER
 * crashes due to analytics." This file is instrumenting far more of the
 * product's real money-moving actions than that one did, which makes the gap
 * more dangerous here, not less — this restores that guarantee.
 *
 * Returns whether the call succeeded, so a caller that has its own
 * bookkeeping to update on success (`identifiedAs`) can skip it on failure
 * and retry on the next call instead of wrongly marking it done.
 */
function safely(fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch (error) {
    if (DEV) console.error("[analytics] SDK call failed, continuing:", error);
    return false;
  }
}

/* ─────────────────────────────── internal flags ────────────────────────── */

/**
 * Staff, test and throwaway accounts.
 *
 * The one thing the analytics team asked for that the old project cannot
 * supply today: `yopmail.com` addresses sit in the middle of the customer
 * numbers there with no way to exclude them. It costs nothing to set now and
 * cannot be backfilled later, which is the whole argument for doing it on day
 * one rather than when someone first needs a clean figure.
 */
const INTERNAL_DOMAINS = [
  "soleapp.com.au",
  "getsole.ai",
  "yopmail.com",
  "mailinator.com",
  "example.com",
  "test.com",
];

export function isInternalEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const address = email.trim().toLowerCase();
  const domain = address.slice(address.lastIndexOf("@") + 1);
  if (INTERNAL_DOMAINS.includes(domain)) return true;
  // `someone+test@gmail.com` — the usual way a tester makes a second account.
  return /\+(test|qa|dev|staging)[^@]*@/.test(address);
}

/* ─────────────────────────── first-touch attribution ───────────────────── */

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

/**
 * Campaign attribution, read from the URL the browser is actually on.
 *
 * `window.location.search`, not `useSearchParams()` and not router state. The
 * old app read router state, which is empty until hydration finishes, so every
 * attribution it recorded was null. Reading the live URL inside an effect has
 * no such window — and `useSearchParams()` would additionally opt the whole
 * route into client rendering.
 *
 * Only keys that have a value are returned. Registering a null would be worse
 * than registering nothing: `register_once` never overwrites, so a null would
 * permanently block the real campaign from ever being recorded for that
 * browser.
 */
export function readLaunchProperties(
  search: string,
  referrer: string,
  pathname: string,
): AnalyticsProps {
  const params = new URLSearchParams(search);
  const props: AnalyticsProps = {};

  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) props[key] = value;
  }
  // `gclid` present with no utm_source is a Google Ads click that lost its
  // tagging; without this those land in "direct" alongside genuine ones.
  const gclid = params.get("gclid");
  if (gclid) props.gclid = gclid;

  if (referrer) props.referrer = referrer;
  if (pathname) props.landing_page = pathname;

  return props;
}

/* ──────────────────────────────── where it ran ─────────────────────────── */

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"];

/**
 * Whether this is a developer's machine or a deployed site.
 *
 * The old app solved the same problem by refusing to track on localhost at
 * all. That keeps the project clean and costs something real: there is then no
 * way to confirm the integration works before it is in front of customers,
 * which is exactly the gap that let "the event was written and never arrived"
 * go unnoticed for weeks there.
 *
 * So dev traffic is sent and labelled instead of dropped. `env` is the filter
 * every report should carry; `host` is sent alongside it because prod and UAT
 * have historically shared one Mixpanel project — one quota — and "deployed"
 * alone cannot tell them apart.
 */
export function deploymentEnv(hostname: string): "local" | "deployed" {
  const host = hostname.toLowerCase();
  if (LOCAL_HOSTS.includes(host)) return "local";
  if (host.endsWith(".local") || host.endsWith(".localhost")) return "local";
  if (host.startsWith("192.168.") || host.startsWith("10.")) return "local";
  return "deployed";
}

/**
 * The properties that describe the app rather than the person.
 *
 * Separate from `init` because `reset()` clears super properties along with
 * the identity, so these have to go back on after a sign-out.
 */
function baseProperties(): AnalyticsProps {
  const hostname =
    typeof window === "undefined" ? "" : window.location.hostname;
  return {
    /*
     * On every event, so a report can tell the two front ends apart during
     * the switch-over. The old app is a separate project today, but these
     * will be read side by side and may yet be merged.
     */
    app: "new_ui",
    env: deploymentEnv(hostname),
    host: hostname,
  };
}

/* ─────────────────────────────────── init ──────────────────────────────── */

/**
 * Whether analytics is allowed to run at all, before a token is even checked.
 *
 * `false` for now: this integration is brand new, the project is freshly
 * created, and the explicit ask was "sirf live mein use krna hai" — only on a
 * deployed build, not on anyone's machine. A single flag rather than deleting
 * the localhost branch, because the opposite call — the old `sole-webapp`
 * blocking localhost permanently — is the exact decision this project argued
 * against in its own plan doc: a developer can then never confirm the
 * integration works before it reaches a customer. Flip this to `true`
 * once local verification is wanted again; nothing else about `deploymentEnv`
 * or the `env` tagging needs to change when that happens.
 */
const ALLOW_LOCAL = false;

export function initAnalytics(): void {
  if (typeof window === "undefined") return;
  if (started) return;

  if (!ALLOW_LOCAL && deploymentEnv(window.location.hostname) === "local") {
    if (DEV) {
      console.warn(
        "[analytics] running on localhost — disabled for now (ALLOW_LOCAL is false in lib/analytics.ts). " +
          "Events will send once this runs on a deployed build.",
      );
    }
    return;
  }

  if (!TOKEN) {
    // Loud in development, silent in production. A missing token in a preview
    // build is normal; a developer who thinks they are emitting events and is
    // not should be told immediately.
    if (DEV) {
      console.warn(
        "[analytics] NEXT_PUBLIC_MIXPANEL_TOKEN is unset — events are being dropped.",
      );
    }
    return;
  }

  // Set before `init` rather than after: Strict Mode's second effect must find
  // this already true, and `init` itself is synchronous enough that nothing
  // can slip between the two lines.
  started = true;

  safely(() => mixpanel.init(TOKEN, {
    ...(API_HOST ? { api_host: API_HOST } : {}),
    debug: DEV,
    /*
     * Page views are sent by `AnalyticsBootstrap` from `usePathname()`. The
     * SDK's own page-view tracking cannot see an App Router client-side
     * navigation at all, so leaving it on would give one page view per hard
     * load and nothing else — which reads as every session being one page
     * long.
     */
    track_pageview: false,
    /*
     * localStorage, not cookies. Super properties plus first-touch
     * attribution overflow the 4KB cookie limit, and an overflowing cookie
     * does not error — it silently truncates the persisted distinct_id, which
     * splits one person into several.
     */
    persistence: "localStorage",
    /*
     * The browser's Do Not Track header is not honoured. Decided 7 Oct 2026.
     *
     * The SDK's default is to honour it, which is what `sole-webapp` does by
     * omission — and it is a silent data-loss source there: a Firefox user
     * with DNT on (Firefox turns it on by itself in a private window) sends
     * nothing at all, and that absence is indistinguishable from someone who
     * never visited. They do not appear in a funnel as a drop-off; they do
     * not appear.
     *
     * Set here from day one rather than later, deliberately. Changing it on a
     * project that already holds data puts a step change into every count on
     * the day it ships, and nobody can tell afterwards whether a jump was new
     * customers or newly visible ones. This project starts empty, so there is
     * no discontinuity to create.
     *
     * DNT is not binding — the W3C abandoned the standard in 2019 and the
     * Australian Privacy Act does not require honouring it. Consent for
     * analytics is handled as a policy matter, not by a header.
     */
    ignore_dnt: true,
    /*
     * One in ten sessions. In the old project `$mp_session_record` is 27,824
     * events — about a third of all volume — which is why `total_events` there
     * is useless as an engagement measure: it is mostly replay chunks and page
     * views, not work done. Sampling keeps replay useful without drowning the
     * signal.
     */
    record_sessions_percent: 10,
    /*
     * Everything on screen in this product is somebody's financial data:
     * invoice amounts, client names, bank balances, ABNs. Replay is for
     * watching where a person got stuck, and it does not need to read any of
     * it.
     */
    record_mask_all_text: true,
    record_mask_all_inputs: true,
    record_console: false,
    record_heatmap_data: false,
  }));

  // First-touch attribution, captured on the first load of the session and
  // never overwritten afterwards.
  const launch = readLaunchProperties(
    window.location.search,
    document.referrer,
    window.location.pathname,
  );
  if (Object.keys(launch).length > 0) {
    safely(() => mixpanel.register_once(launch));
  }

  safely(() => mixpanel.register(baseProperties()));

  // Anything that fired while the SDK was still booting. Each wrapped on its
  // own, so one bad event can't stop the rest of the queue from flushing.
  const queued = pending.splice(0, pending.length);
  for (const item of queued) {
    safely(() => mixpanel.track(item.event, item.props));
  }
}

/* ───────────────────────────────── identity ────────────────────────────── */

export const ADDON_FLAGS = {
  accounting: "is_accounting_add_on",
  time: "is_time_tracker_add_on",
  project: "is_projects_add_on",
  "assets-advanced": "is_advanced_assets_add_on",
  booking: "is_booking_add_on",
  km: "is_km_tracker_add_on",
  inventory: "is_inventory_add_on",
  crypto: "is_crypto_module_add_on",
} as const;

const ADDON_SLUG_ALIASES: Record<string, string> = {
  "time-tracker": "time",
  "km-tracker": "km",
  projects: "project",
  assets: "assets-advanced",
  scheduling: "booking",
};

export function addonFlags(addons: readonly string[]): Record<string, boolean> {
  const owned = new Set(addons.map((slug) => ADDON_SLUG_ALIASES[slug] ?? slug));
  return Object.fromEntries(
    Object.entries(ADDON_FLAGS).map(([slug, key]) => [key, owned.has(slug)]),
  );
}

export function planDuration(interval: string | null | undefined): string {
  return interval === "annual" ? "Annually" : "Monthly";
}

export function planProfile(
  subscription: SubscriptionInfo | null,
): AnalyticsProps {
  // An account that hasn't paid for its first subscription has no plan yet.
  // Nothing is set rather than "Free": the plan comes from sole-ocr's
  // `subscription_payment_completed` once Stripe confirms, and a session
  // still holding the pending state must not write over it.
  if (!subscription || subscription.requiresFirstSubscription) return {};
  return {
    // The tracking plan's value for the free tier is "Free"; the API's display
    // name is "Free plan", and the two would split one plan into two rows.
    plan_name: subscription.isFree ? "Free" : subscription.planName || null,
    plan_duration: planDuration(subscription.planInterval),
    ...addonFlags(subscription.addons ?? []),
  };
}

/* ─────────────── onboarding: what sign-up carries across checkout ────────── */

/**
 * Who the person said they are on onboarding's company step.
 *
 * `signup_completed` is sent once the first payment is confirmed, which is on
 * the far side of a full-page trip to Stripe — and possibly in a later visit,
 * if the tab was closed on Stripe or the confirmation outlasted the wait. So
 * what the company step collected (ABN, mobile, country) is kept in
 * localStorage, tagged with whose it is, until sign-up has been reported.
 */
export type OnboardingProfile = {
  primary_country: string | null;
  primary_email: string | null;
  primary_business_name: string | null;
  user_name: string | null;
  user_id: string | null;
  mobile_number: string | null;
  abn_number: string | null;
};

const ONBOARDING_PROFILE_KEY = "sole-analytics-onboarding-profile";
const SIGNUP_REPORTED_KEY = "sole-analytics-signup-completed";

export function rememberOnboardingProfile(profile: OnboardingProfile): void {
  try {
    window.localStorage.setItem(ONBOARDING_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Storage blocked: signup_completed falls back to what the session knows.
  }
}

/**
 * The kept profile — only if it is this user's. A shared browser must never
 * hand one person's ABN and mobile to the next person's sign-up.
 */
export function recallOnboardingProfile(
  userId?: string | null,
): Partial<OnboardingProfile> {
  try {
    const raw = window.localStorage.getItem(ONBOARDING_PROFILE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const profile = parsed as Partial<OnboardingProfile>;
    if (userId != null && profile.user_id != null && profile.user_id !== userId) {
      return {};
    }
    return profile;
  } catch {
    return {};
  }
}

export function forgetOnboardingProfile(): void {
  try {
    window.localStorage.removeItem(ONBOARDING_PROFILE_KEY);
  } catch {
    // Nothing to clean up if storage was never reachable.
  }
}

const ONBOARDING_PAYMENT_KEY = "sole-analytics-onboarding-payment";

/**
 * What the plan step sent to checkout, for `signup_completed`'s
 * `lifetime_value` — at sign-up, everything they've paid is that first
 * payment. The checkout total before any coupon (Stripe applies it); the
 * profile's own `lifetime_value` is kept by sole-ocr from the real invoice.
 */
export function rememberOnboardingPayment(amount: number): void {
  try {
    window.localStorage.setItem(ONBOARDING_PAYMENT_KEY, String(amount));
  } catch {
    // Storage blocked: signup_completed goes without it.
  }
}

/** The remembered amount, once — it's cleared as it's read. */
export function takeOnboardingPayment(): number | null {
  try {
    const raw = window.localStorage.getItem(ONBOARDING_PAYMENT_KEY);
    window.localStorage.removeItem(ONBOARDING_PAYMENT_KEY);
    const amount = raw == null ? NaN : Number(raw);
    return Number.isFinite(amount) ? amount : null;
  } catch {
    return null;
  }
}

/**
 * Whether `signup_completed` has already gone out for this user from this
 * browser. Mixpanel's `$insert_id` only folds duplicates that share a
 * timestamp, so a second confirmation (a reload, "Check again", a later
 * visit) has to be stopped here.
 */
export function signupAlreadyReported(userId: string): boolean {
  try {
    const raw = window.localStorage.getItem(SIGNUP_REPORTED_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) && ids.includes(userId);
  } catch {
    return false;
  }
}

export function markSignupReported(userId: string): void {
  try {
    const raw = window.localStorage.getItem(SIGNUP_REPORTED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const ids = Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
    if (!ids.includes(userId)) ids.push(userId);
    window.localStorage.setItem(SIGNUP_REPORTED_KEY, JSON.stringify(ids.slice(-20)));
  } catch {
    // Unreachable storage: the profile is forgotten anyway, which stops repeats
    // in the common case.
  }
}

export type PlanSelection = {
  planName: string | null;
  interval: string | null;
  addons: readonly string[];
  paidAmount: number;
  currency: string;
  businessId: string | null;
  /** Explicit, because the super property can still name the previous business. */
  businessName?: string | null;
  /** True on onboarding's plan step, false in Settings and Add business. */
  isOnboarding: boolean;
};

export function planSelectionProps(selection: PlanSelection): AnalyticsProps {
  return {
    plan_name: selection.planName,
    plan_duration: planDuration(selection.interval),
    ...addonFlags(selection.addons),
    business_id: selection.businessId,
    ...(selection.businessName !== undefined
      ? { business_name: selection.businessName }
      : {}),
    paid_amount: Math.round(selection.paidAmount * 100) / 100,
    currency: selection.currency,
    is_onboarding: selection.isOnboarding,
  };
}

export type IdentifyInput = {
  userId: string | null;
  email?: string | null;
  name?: string | null;
  subscription?: SubscriptionInfo | null;
  totalBusinesses?: number | null;
};

export function identify(input: IdentifyInput): void {
  if (!ready()) return;

  if (!input.userId) {
    console.error(
      "[analytics] authenticated session with no user_id — not identifying.",
    );
    return;
  }

  const internal = isInternalEmail(input.email);

  if (identifiedAs !== input.userId) {
    if (safely(() => mixpanel.identify(input.userId!))) {
      identifiedAs = input.userId;
    }
  }

  safely(() =>
    mixpanel.people.set({
      $email: input.email ?? null,
      $name: input.name ?? null,
      user_id: input.userId,
      primary_email: input.email ?? null,
      user_name: input.name ?? null,
      is_internal: internal,
      ...planProfile(input.subscription ?? null),
      ...(input.totalBusinesses
        ? { total_businesses: input.totalBusinesses }
        : {}),
    }),
  );

  safely(() => mixpanel.register({ is_internal: internal }));
}

export type BusinessContext = {
  id: string | null;
  name?: string | null;
  industry?: string | null;
};

const BUSINESS_KEYS = ["business_id", "business_name", "industry"] as const;

export function setBusinessContext(business: BusinessContext): void {
  if (!ready()) return;
  if (business.id) {
    /*
     * The business list and the industries list load after the session, so on
     * every hard load this first runs with the id alone. Registering nulls
     * then would wipe the name and industry persisted for that same business
     * and send every early event without them — so for the business already
     * registered, a missing value keeps what's there. A different business
     * gets nulls until its own values arrive, never the previous one's.
     */
    let registeredId: unknown;
    try {
      registeredId = mixpanel.get_property("business_id");
    } catch {
      registeredId = undefined;
    }
    const sameBusiness = registeredId === business.id;
    const props: AnalyticsProps = { business_id: business.id };
    if (business.name || !sameBusiness) props.business_name = business.name || null;
    if (business.industry || !sameBusiness) props.industry = business.industry || null;
    safely(() => mixpanel.register(props));
  } else {
    for (const key of BUSINESS_KEYS) {
      safely(() => mixpanel.unregister(key));
    }
  }
}

export function setUserProfile(
  props: AnalyticsProps,
  options: { once?: boolean; userId?: string | null } = {},
): void {
  if (!ready()) return;
  /*
   * The SDK holds every profile update in a local queue until identify() has
   * run on this page, and a reset() empties that queue. Onboarding's updates
   * were landing in exactly that gap — the events arrived, the profile never
   * got the properties. Given whose profile this is, identify first, so the
   * update goes straight to that profile instead of waiting in the queue.
   */
  if (options.userId && identifiedAs !== options.userId) {
    if (safely(() => mixpanel.identify(options.userId!))) {
      identifiedAs = options.userId;
    }
  }
  safely(() =>
    options.once ? mixpanel.people.set_once(props) : mixpanel.people.set(props),
  );
}

const CAMPAIGN_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;

export function campaignProps(): AnalyticsProps {
  const fromUrl =
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
  const props: AnalyticsProps = {};
  for (const key of CAMPAIGN_KEYS) {
    let value: unknown = fromUrl.get(key);
    if (!value && ready()) {
      try {
        value = mixpanel.get_property(key);
      } catch {
        value = null;
      }
    }
    props[key] = typeof value === "string" && value ? value : null;
  }
  return props;
}

/**
 * Methods `signup_initiated` has already been sent for in this page session,
 * so pressing the same start button twice is still one person starting.
 */
const signupInitiatedFor = new Set<string>();

/**
 * `signup_initiated` — someone starting to create an account, from one of the
 * plan's five buttons: "Don't have an account? Create one", Google and Apple
 * on the login page, and "Sign up with Google / Apple" on the register page.
 * (Not on arriving at /register or typing an email there.)
 */
export function trackSignupInitiated(
  method: string,
  { primaryEmail = null }: { primaryEmail?: string | null } = {},
): void {
  if (signupInitiatedFor.has(method)) return;
  signupInitiatedFor.add(method);
  trackWithProfile(EVENTS.SIGNUP_INITIATED, {
    signup_method: method,
    primary_email: primaryEmail?.trim() || null,
    ...campaignProps(),
  });
}

/* ─────────────── Google / Apple: a sign-up, or a sign-in? ─────────────── */

/**
 * The plan counts a Google or Apple press as a sign-up only for an email that
 * isn't registered yet — which isn't known until the provider has answered.
 * So the press is noted here (sessionStorage, which survives the round trip
 * through the provider in this tab), and reported from the callback once the
 * account turns out to be new.
 */
const SOCIAL_START_KEY = "sole-analytics-social-start";

export type SocialStartPage = "login" | "register";

export function rememberSocialStart(provider: string, page: SocialStartPage): void {
  try {
    window.sessionStorage.setItem(
      SOCIAL_START_KEY,
      JSON.stringify({ provider, page, at: Date.now() }),
    );
  } catch {
    // Storage blocked: the sign-up still works, it just isn't counted.
  }
}

/**
 * On the social callback: `signup_initiated` (and, for the register page's
 * buttons, `signup_details_entered`) when the account is new. A new account
 * is one with no business yet (`is_first_login`), the same test that sends it
 * to onboarding. Signing in to an existing account sends nothing.
 */
export function reportSocialSignup(user: {
  email?: string | null;
  is_first_login?: boolean | null;
} | null): void {
  let start: { provider?: unknown; page?: unknown; at?: unknown } | null = null;
  try {
    const raw = window.sessionStorage.getItem(SOCIAL_START_KEY);
    window.sessionStorage.removeItem(SOCIAL_START_KEY);
    start = raw ? JSON.parse(raw) : null;
  } catch {
    start = null;
  }
  if (!start || typeof start.provider !== "string" || !user?.is_first_login) return;
  // A press long ago (an abandoned attempt) is not this sign-in.
  if (typeof start.at === "number" && Date.now() - start.at > 30 * 60_000) return;

  const method = start.provider;
  const primaryEmail = user.email?.trim() || null;
  trackSignupInitiated(method, { primaryEmail });
  if (start.page === "register") {
    trackWithProfile(EVENTS.SIGNUP_DETAILS_ENTERED, {
      primary_email: primaryEmail,
      signup_method: method,
    });
  }
}

export function trackWithProfile(
  event: EventName,
  props: AnalyticsProps = {},
): void {
  track(event, props);
  setUserProfile(props);
}

/**
 * Sign-out: forget who this was.
 *
 * `reset()` clears the super properties along with the identity, so the ones
 * that describe the app rather than the person are put back. First-touch
 * attribution is intentionally not restored — a new anonymous visitor on this
 * browser has their own.
 */
export function resetAnalytics(): void {
  if (!ready()) return;
  safely(() => mixpanel.reset());
  // Unconditional, unlike `identify()`'s latch: this fires on sign-out, and
  // the browser must be treated as nobody afterwards regardless of whether
  // the SDK's own internal reset succeeded.
  identifiedAs = null;
  safely(() => mixpanel.register(baseProperties()));
}

/* ──────────────────────────────── page paths ──────────────────────────── */

/**
 * `/invoices/8f2c-…/edit` → `/invoices/[id]/edit`.
 *
 * Both are sent with a page view: `path` answers "which page", `route`
 * answers "which screen". Without the second, every invoice ever opened is
 * its own row and no report can say the invoice editor is the third most used
 * screen in the product — which is the question anybody actually asks of page
 * views.
 */
export function normalisePath(path: string): string {
  return (
    path
      .split("/")
      .map((segment) => {
        if (!segment) return segment;
        if (/^\d+$/.test(segment)) return "[id]";
        if (
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            segment,
          )
        ) {
          return "[id]";
        }
        // A long opaque key with digits in it is an identifier, not a word.
        if (
          segment.length >= 16 &&
          /\d/.test(segment) &&
          /[a-z]/i.test(segment)
        ) {
          return "[id]";
        }
        return segment;
      })
      .join("/") || "/"
  );
}

/* ────────────────────────────────── track ──────────────────────────────── */

/**
 * In development only: catch an event that cannot answer the question it was
 * added for.
 *
 * A count alone does not satisfy "invoices sent **with invoice value**", and
 * the old app's largest reporting gap was exactly this — 9,432 `module_used`
 * rows, every one carrying `action: "viewed"` and nothing else. The check runs
 * where the person who left the property out is still looking at the screen.
 */
function validate(event: EventName, props: AnalyticsProps): void {
  if (!DEV) return;

  if (!ALL_EVENT_NAMES.includes(event)) {
    console.error(
      `[analytics] "${event}" is not in the event contract. Add it to lib/analytics-events.ts.`,
    );
    return;
  }

  const required = REQUIRED_PROPS[event];
  if (!required) return;

  const missing = required.filter(
    (key) => props[key] === undefined || props[key] === null,
  );
  if (missing.length > 0) {
    console.error(
      `[analytics] "${event}" is missing required ${
        missing.length === 1 ? "property" : "properties"
      }: ${missing.join(", ")}.`,
    );
  }
}

/**
 * Send one event.
 *
 * `event` is the typed union, not `string`. That is the check behind the rule
 * "never rename an event": in the old project three events were renamed
 * mid-flight and each rename silently zeroed a funnel, because a renamed event
 * and a deleted one read identically — both are nothing. Here a rename or a
 * typo fails the build instead of a dashboard.
 */
export function track(event: EventName, props: AnalyticsProps = {}): void {
  // Guarded rather than assumed: this is called from client components, but a
  // future server caller shouldn't crash on a missing `window`.
  if (typeof window === "undefined") return;

  validate(event, props);

  if (!started) {
    if (pending.length < PENDING_LIMIT) pending.push({ event, props });
    return;
  }

  /*
   * This is the single most important `safely()` call in the file. `track()`
   * is called from dozens of real business actions — `saveInvoiceApi`,
   * `createExpenseApi`, `cancelSubscription` — every one of them *after* its
   * own server call already succeeded. An unguarded throw here would
   * propagate out of `track()` into those functions and make a save that
   * genuinely succeeded on the backend report itself as failed to the
   * person at the keyboard, which is a worse outcome than the event being
   * silently dropped.
   */
  safely(() => mixpanel.track(event, props));
}

/** The anonymous or identified id Mixpanel is currently using — for support. */
export function analyticsDistinctId(): string | null {
  if (!ready()) return null;
  try {
    return mixpanel.get_distinct_id() ?? null;
  } catch {
    return null;
  }
}
