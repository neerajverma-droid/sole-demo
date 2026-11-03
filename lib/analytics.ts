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
 * `true` for now: this integration is brand new, the project is freshly
 * created, and the explicit ask was "sirf live mein use krna hai" — only on a
 * deployed build, not on anyone's machine. A single flag rather than deleting
 * the localhost branch, because the opposite call — the old `sole-webapp`
 * blocking localhost permanently — is the exact decision this project argued
 * against in its own plan doc: a developer can then never confirm the
 * integration works before it reaches a customer. Flip this back to `true`
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

/**
 * `'free' | 'trial' | 'paid'`, from the subscription record — never from
 * `AuthUser.plan`.
 *
 * This is the fix for the single biggest data gap in the old project: every
 * one of its 479 profiles reads `plan: 'free'`, trial users included, because
 * the field it read comes from `user_details`, which carries no subscription
 * information at all — it is `undefined` for everyone, on the same backend
 * this app also talks to. Filtering on plan there to find trial users returns
 * zero; they were only findable through a trial-end date on each event. The
 * old app's own fix for this — `components/Layout/Layout.js` in sole-webapp —
 * reads the subscription slice instead of the profile, for the same reason;
 * this is that fix, applied here.
 *
 * `null` while the subscription hasn't loaded yet, deliberately not `'free'`:
 * stamping a profile "free" before the real value arrives would misreport
 * every paying customer for however long the request takes. `identify()`
 * re-asserts this on every call, so it corrects itself the moment the fetch
 * lands — the caller just needs to re-call `identify()` when the subscription
 * store updates, which is what `AnalyticsBootstrap` does.
 */
export function derivePlan(subscription: SubscriptionInfo | null): string | null {
  if (!subscription) return null;
  if (subscription.isTrialing) return "trial";
  if (subscription.isFree) return "free";
  return "paid";
}

export type IdentifyInput = {
  /** The backend `user_id`. Read it through `sessionUserId()`, never inline. */
  userId: string | null;
  email?: string | null;
  name?: string | null;
  plan?: string | null;
  trialActive?: boolean | null;
  businessId?: string | null;
};

/**
 * Tie this browser to a person.
 *
 *   distinct_id   user_id      and nothing else, ever
 *   $user_id      user_id
 *   $email        email        a property, for lookup and support
 *
 * **No fallback to email.** The old integration used `String(user.id ||
 * email)`; `user.id` never existed on the auth payload, so every single
 * profile was keyed on an email address. Email is not a stable key — change
 * yours and you start a new history — and it is why the reporting pipeline
 * carries a merge step to this day.
 *
 * Being authenticated with no `user_id` is therefore a defect and not a case
 * to paper over. It reports itself as an event so it is visible in the same
 * place the rest of the data is, rather than only in a browser console nobody
 * is watching.
 */
export function identify(input: IdentifyInput): void {
  if (!ready()) return;

  if (!input.userId) {
    console.error(
      "[analytics] authenticated session with no user_id — not identifying.",
    );
    // Deliberately not identified: this is sent as whoever Mixpanel currently
    // thinks we are, which is the anonymous device id.
    safely(() =>
      mixpanel.track(EVENTS.IDENTIFY_FAILED, {
        has_email: Boolean(input.email),
      }),
    );
    return;
  }

  const internal = isInternalEmail(input.email);

  if (identifiedAs !== input.userId) {
    // Only latched on success — a transient SDK failure should retry on the
    // next call rather than being marked identified when it was not.
    if (safely(() => mixpanel.identify(input.userId!))) {
      identifiedAs = input.userId;
    }
  }

  /*
   * Re-asserted on every session start, not set once at signup.
   *
   * Set-at-signup-only is why just 60 of 479 profiles in the old project carry
   * trial dates: its `trackSignup` runs once, and everyone who signed up
   * before tracking existed never got them and never will. Re-asserting
   * backfills every person who comes back.
   */
  safely(() =>
    mixpanel.people.set({
      $email: input.email ?? null,
      $name: input.name ?? null,
      is_internal: internal,
      /*
       * `plan` must say what it is. In the old project every profile reads
       * 'free' — including people mid-trial — so filtering on plan to find trial
       * users returns zero, and they are only findable through a trial date.
       */
      plan: input.plan ?? null,
      trial_active: input.trialActive ?? null,
      last_seen_app: "new_ui",
    }),
  );

  // Super properties: on every subsequent event, so no report has to join.
  safely(() =>
    mixpanel.register({
      is_internal: internal,
      plan: input.plan ?? null,
      trial_active: input.trialActive ?? null,
      ...(input.businessId ? { business_id: input.businessId } : {}),
    }),
  );
}

/** The active business changed under the same signed-in person. */
export function setBusinessContext(businessId: string | null): void {
  if (!ready()) return;
  if (businessId) {
    safely(() => mixpanel.register({ business_id: businessId }));
  } else {
    safely(() => mixpanel.unregister("business_id"));
  }
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
