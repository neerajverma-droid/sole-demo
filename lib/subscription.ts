/**
 * The account's subscription — plan, status and free trial.
 *
 * Same endpoint and the same `trial_end`/`current_period_end` maths
 * sole-webapp's Settings → Subscriptions screen uses (components/Settings/
 * Subscriptions/index.js), so the two apps can't quote a different number of
 * trial days left for the same account.
 */

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

type ApiSubscriptionDetail = {
  status?: string;
  platform?: string;
  plan_interval?: string;
  trial_end?: string | null;
  current_period_end?: string | null;
  canceled_at?: string | null;
  addons?: Array<string | { slug?: string }> | null;
};

type ApiPlan = {
  tier?: string;
  name?: string;
  slug?: string;
  price?: number;
};

/** The server's own arithmetic, which is what the next invoice will say. */
type ApiBilling = {
  plan_price?: number | string | null;
  addons_total?: number | string | null;
  next_billing_amount?: number | string | null;
  next_billing_date?: string | null;
  discount_percent?: number | string | null;
  effective_next_billing_amount?: number | string | null;
};

type ApiMySubscription = {
  subscription_detail?: ApiSubscriptionDetail;
  plan?: ApiPlan;
  billing?: ApiBilling | null;
};

export type SubscriptionInfo = {
  planName: string;
  planTier: string;
  planSlug: string;
  planPrice: number;
  status: string | null;
  isFree: boolean;
  /** Currently within a trial window — `trialDaysLeft` is only meaningful when this is true. */
  isTrialing: boolean;
  isExpired: boolean;
  /** Null once there's no trial to count down — a paid or expired subscription doesn't show a number. */
  trialDaysLeft: number | null;
  /** ISO date the trial (or the current paid period) ends, whichever applies. */
  subscriptionDueDate: string | null;
  /**
   * Cancelled but not yet over — Stripe keeps serving the plan to the end of
   * the paid period, so this is a plan that can still be resumed rather than
   * one that has already lapsed. `isExpired` is the one that has.
   */
  isCancelled: boolean;
  /** "monthly" or "annual", as the plan is billed. Null on the free plan. */
  planInterval: string | null;
  /**
   * Where the subscription was bought. Only a web one can be changed from
   * here — an App Store or Play subscription is managed on that device, and
   * sole-webapp hides its own plan controls the same way.
   */
  platform: string | null;
  /** Add-on slugs currently on the plan, so a plan change can carry them over. */
  addons: string[];
  /**
   * What the next invoice comes to, worked out by the server.
   *
   * `planPrice` above is the base package alone, which is what the overview
   * used to show as the whole bill — so a business paying for the bundle plus
   * two charged add-ons was told it paid $24.99. This is the figure the server
   * will actually charge: the package, plus the add-ons past the package's free
   * allowance, with any additional-business discount applied.
   *
   * Null when the server didn't send a billing block — an older deployment, or
   * an account with no subscription at all. The screen falls back to the
   * package price rather than inventing a total of its own, because a number
   * this app computed and the invoice disagreed with would be worse than a
   * number that is merely incomplete.
   */
  nextBillingAmount: number | null;
  /** The add-ons' share of that, after the free allowance. Null for the same reason. */
  addonsTotal: number | null;
};

/** A subscription nobody has fetched yet, or one the request failed for — no trial banner, no plan claims. */
export const NO_SUBSCRIPTION: SubscriptionInfo = {
  planName: "Free plan",
  planTier: "free",
  planSlug: "free",
  planPrice: 0,
  status: null,
  isFree: true,
  isTrialing: false,
  isExpired: false,
  trialDaysLeft: null,
  subscriptionDueDate: null,
  isCancelled: false,
  planInterval: null,
  platform: null,
  addons: [],
  nextBillingAmount: null,
  addonsTotal: null,
};

const DAY_MS = 1000 * 60 * 60 * 24;

/** `"24.99"` and `24.99` both arrive; anything else is "no figure". */
function money(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSubscription(raw: ApiMySubscription): SubscriptionInfo {
  const detail = raw.subscription_detail ?? {};
  const plan = raw.plan ?? {};
  const billing = raw.billing ?? {};
  const now = new Date();

  const trialEnd = detail.trial_end ? new Date(detail.trial_end) : null;
  const periodEnd = detail.current_period_end
    ? new Date(detail.current_period_end)
    : null;

  const isFree = plan.tier === "free";
  const isTrialing = detail.status === "trialing" && trialEnd != null;

  // Same rule sole-webapp's Subscriptions/index.js applies: canceled is always
  // expired, and anything else is only expired once both the paid period and
  // (if there was one) the trial have run out.
  const isExpired =
    detail.status === "canceled" ||
    (detail.status !== "active" &&
      detail.status !== "trialing" &&
      periodEnd != null &&
      periodEnd < now &&
      (!trialEnd || trialEnd < now));

  const trialDaysLeft = isTrialing
    ? Math.max(0, Math.ceil((trialEnd!.getTime() - now.getTime()) / DAY_MS))
    : null;

  return {
    planName: plan.name || (isFree ? "Free plan" : "Plan"),
    planTier: plan.tier || "free",
    planSlug: plan.slug || "free",
    planPrice: plan.price ?? 0,
    status: detail.status ?? null,
    isFree,
    isTrialing,
    isExpired,
    trialDaysLeft,
    subscriptionDueDate:
      (isTrialing ? detail.trial_end : detail.current_period_end) ?? null,
    isCancelled: Boolean(detail.canceled_at),
    planInterval: detail.plan_interval?.toLowerCase() ?? null,
    platform: detail.platform ?? null,
    addons: (detail.addons ?? [])
      .map((addon) => (typeof addon === "string" ? addon : addon?.slug))
      .filter((slug): slug is string => Boolean(slug)),
    /*
     * The discounted figure where there is one. A business on the additional-
     * business 50% deal is charged the effective amount, so quoting the full
     * one would overstate its bill by half.
     */
    nextBillingAmount:
      money(billing.effective_next_billing_amount) ??
      money(billing.next_billing_amount),
    addonsTotal: money(billing.addons_total),
  };
}

export async function fetchMySubscription(): Promise<SubscriptionInfo> {
  const response = await api.get<ApiEnvelope<ApiMySubscription>>(
    apiRoutes.subscription.mySubscription,
  );
  const data = response.data?.data;
  if (!data) return NO_SUBSCRIPTION;
  return normalizeSubscription(data);
}

/* ------------------------------------------------------------------ *
 * Plans — `GET /subscription/plans`
 *
 * One row per plan PER BILLING INTERVAL, so "Business monthly" and "Business
 * annual" arrive as two packages sharing a slug. sole-webapp's PricingModal
 * groups them by slug and picks the variant matching the chosen interval;
 * `plansForInterval` below is that same grouping.
 * ------------------------------------------------------------------ */

type ApiPlanPackage = {
  slug?: string;
  name?: string;
  description?: string | null;
  price?: number | string | null;
  plan_interval?: string | null;
  badge?: string | null;
  coming_soon?: unknown;
  features?: { includes?: string[] | null; excludes?: string[] | null } | null;
};

type ApiPlans = {
  packages?: ApiPlanPackage[] | null;
  addons?: ApiPlanPackage[] | null;
};

export type SubscriptionPlan = {
  slug: string;
  name: string;
  description: string;
  /** As charged for the interval — not per month. `monthlyPrice` is that. */
  price: number;
  /** "monthly", "annual", or null on the free plan, which has no interval. */
  interval: string | null;
  /** The annual price divided out, so two intervals can be compared on one axis. */
  monthlyPrice: number;
  badge: string | null;
  comingSoon: boolean;
  includes: string[];
  excludes: string[];
};

export type BillingInterval = "monthly" | "annual";

function normalizePlan(raw: ApiPlanPackage): SubscriptionPlan | null {
  if (!raw.slug) return null;
  const price = Number(raw.price ?? 0) || 0;
  const interval = raw.plan_interval?.toLowerCase() || null;
  return {
    slug: raw.slug,
    name: raw.name || raw.slug,
    description: raw.description || "",
    price,
    interval,
    // Same divisor PricingModal's `perMonth` applies.
    monthlyPrice: interval === "annual" ? price / 12 : price,
    badge: raw.badge || null,
    comingSoon: Boolean(raw.coming_soon),
    includes: raw.features?.includes ?? [],
    excludes: raw.features?.excludes ?? [],
  };
}

function normalizePlans(rows: ApiPlanPackage[] | null | undefined) {
  return (rows ?? [])
    .map(normalizePlan)
    .filter((plan): plan is SubscriptionPlan => plan !== null);
}

export async function fetchSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  return (await fetchSubscriptionCatalogue()).packages;
}

export type SubscriptionCatalogue = {
  packages: SubscriptionPlan[];
  /**
   * Add-ons, minus the synthetic `payroll` row — payroll is billed per seat
   * through `PlanSelection.payroll`, never as a flat add-on.
   */
  addons: SubscriptionPlan[];
};

export async function fetchSubscriptionCatalogue(): Promise<SubscriptionCatalogue> {
  const response = await api.get<ApiEnvelope<ApiPlans>>(
    apiRoutes.subscription.plans,
  );
  const data = response.data?.data;
  return {
    packages: normalizePlans(data?.packages),
    addons: normalizePlans(data?.addons).filter((addon) => addon.slug !== "payroll"),
  };
}

/**
 * Add-ons each package already includes, before any is charged — the same
 * `FREE_ADDON_LIMITS` sole-ocr's `createSession` applies, so the total shown
 * before checkout is the one Stripe charges.
 */
export const INCLUDED_ADDON_COUNT: Record<string, number> = {
  bundle: 3,
  advanced: 6,
  pro: Number.POSITIVE_INFINITY,
};

/**
 * The add-on a package's own copy names before it starts counting.
 *
 * Both paid packages describe their allowance in two halves — the bundle says
 * "Accounting Module Included" then "Any 2 Add-ons Included", Advanced says
 * "Core Accounting Included" then "Any 5" — and the server's single number
 * covers both (3 and 6). So accounting isn't a bonus beside the allowance, it
 * is the first slot of it, and it is the one to fill first when nothing else
 * has been chosen.
 */
const LEAD_ADDON_SLUG = "accounting";

/**
 * Which add-ons a package should arrive with switched on.
 *
 * Picking "Compliance Bundle" and seeing every add-on unticked under a line
 * that says it includes three reads as a page that hasn't loaded — the offer
 * and the form disagree. The allowance is free either way, so leaving the
 * slots empty charges nobody anything but does lose them what they just paid
 * for.
 *
 * `current` is never reduced. Someone switching to a smaller package keeps the
 * add-ons they already have and is charged for the ones past the allowance;
 * silently dropping them would cancel something they pay for in order to make
 * a number look tidier. So this only ever tops up to fill free slots.
 *
 * Order is the catalogue's, with accounting first, because the server's
 * allowance is positional — the first N of the array it stores are the free
 * ones. Sending them in the order they'll be charged in is what makes the
 * "Included" ticks on screen match the invoice.
 */
export function defaultIncludedAddons(
  planSlug: string | null | undefined,
  addons: SubscriptionPlan[],
  current: string[] = [],
  /**
   * Add-ons the person has switched off by hand.
   *
   * A free slot is an offer, not an instruction. Without this, unticking
   * something and then changing package hands it straight back — the package
   * refills the slot it just vacated, and the untick looks like it didn't
   * take. They stay out until they are ticked again.
   */
  dismissed: string[] = [],
): string[] {
  const allowance = INCLUDED_ADDON_COUNT[planSlug ?? ""] ?? 0;
  // Payroll is billed per seat and is never one of these, free slot or not.
  const kept = current.filter((slug) => slug !== "payroll");
  if (allowance <= kept.length) return kept;

  const candidates = addons
    .filter(
      (addon) =>
        !addon.comingSoon &&
        addon.slug !== "payroll" &&
        !kept.includes(addon.slug) &&
        !dismissed.includes(addon.slug),
    )
    .sort((a, b) => {
      if (a.slug === LEAD_ADDON_SLUG) return -1;
      if (b.slug === LEAD_ADDON_SLUG) return 1;
      return 0;
    });

  // `Infinity` on pro: every add-on there is, which `slice` handles already.
  return [...kept, ...candidates.slice(0, allowance - kept.length)].map(
    (entry) => (typeof entry === "string" ? entry : entry.slug),
  );
}

/** Per average month, for a package plus add-ons, before any discount. */
export function selectionMonthlyTotal(
  pkg: SubscriptionPlan | null,
  addons: SubscriptionPlan[],
): number {
  if (!pkg) return 0;
  const included = INCLUDED_ADDON_COUNT[pkg.slug] ?? 0;
  const charged = addons.slice(Math.min(included, addons.length));
  return (
    pkg.monthlyPrice + charged.reduce((sum, addon) => sum + addon.monthlyPrice, 0)
  );
}

/**
 * One row per plan, at the chosen interval.
 *
 * A plan with no variant for that interval — the free plan carries no
 * `plan_interval` at all — falls back to whatever variant exists, so it still
 * appears in the list instead of vanishing when the annual toggle is on.
 */
export function plansForInterval(
  plans: SubscriptionPlan[],
  interval: BillingInterval,
): SubscriptionPlan[] {
  const slugs = [...new Set(plans.map((plan) => plan.slug))];
  return slugs
    .map((slug) => {
      const variants = plans.filter((plan) => plan.slug === slug);
      return variants.find((v) => v.interval === interval) ?? variants[0];
    })
    .filter(Boolean);
}

/* ------------------------------------------------------------------ *
 * Billing history — `GET /subscription/history`
 * ------------------------------------------------------------------ */

type ApiHistoryItem = {
  id?: string | number;
  event_type?: string;
  status?: string;
  amount?: number | string | null;
  currency?: string | null;
  created_at?: string | null;
  from_plan_slug?: string | null;
  to_plan_slug?: string | null;
  from_interval?: string | null;
  to_interval?: string | null;
};

export type BillingEvent = {
  id: string;
  /** `event_type` where there is one, else the payment `status`. */
  type: string;
  amount: number | null;
  currency: string;
  date: string | null;
  /** "business · annual" — the plan and interval the event moved to, or from. */
  plan: string;
};

export async function fetchBillingHistory(): Promise<BillingEvent[]> {
  const response = await api.get<
    ApiEnvelope<{
      history?: ApiHistoryItem[];
      items?: ApiHistoryItem[];
      invoices?: ApiHistoryItem[];
    }>
  >(apiRoutes.subscription.history, { params: { page: 1, page_size: 20 } });

  const data = response.data?.data;
  // The endpoint has been seen keying this three ways; sole-webapp's own
  // loader reads all of them rather than betting on one.
  const items = data?.history ?? data?.items ?? data?.invoices ?? [];

  return items.map((item, index) => ({
    id: String(item.id ?? index),
    type: item.event_type || item.status || "Event",
    amount: item.amount != null ? Number(item.amount) : null,
    currency: item.currency || "AUD",
    date: item.created_at ?? null,
    plan: [
      item.to_plan_slug || item.from_plan_slug,
      item.to_interval || item.from_interval,
    ]
      .filter(Boolean)
      .join(" · "),
  }));
}

/* ------------------------------------------------------------------ *
 * Checkout and plan changes
 *
 * `create` and `manage` hand back a Stripe URL to send the browser to;
 * `update`, `cancel` and `resume` apply server-side and answer with a message.
 * Every one of them posts an encrypted body, the same as sole-webapp's
 * `encryptPayload(...)` calls on these routes.
 * ------------------------------------------------------------------ */

/** Settings → Subscription — where a checkout started from Settings comes back to. */
export const SUBSCRIPTION_SETTINGS_PATH = "/settings?section=subscription";

/**
 * Marks a URL as a return from Stripe Checkout, so the page it lands on can
 * tell "back from paying" from "opened normally" without guessing from
 * whichever other params happen to be there.
 */
const CHECKOUT_MARKER = "checkout";

/**
 * Where Stripe sends the browser back to — `returnPath` plus what was chosen.
 * sole-ocr appends `session_id` on success and nothing on cancel, so the one
 * URL serves both outcomes.
 */
function checkoutReturnUrl(
  returnPath: string,
  params: Record<string, string> = {},
): string {
  const url = new URL(returnPath, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function postSubscription<T>(
  route: string,
  fields: Record<string, unknown>,
  failureMessage: string,
  config?: { params?: Record<string, string> },
): Promise<ApiEnvelope<T>> {
  const response = await api.post<ApiEnvelope<T>>(
    route,
    buildEncryptedRequestBody(fields),
    config,
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || failureMessage);
  }
  return response.data;
}

export type CheckoutReturn = {
  /** Stripe sent a `session_id` back — paid (or trial started). */
  outcome: "success" | "cancelled";
  planSlug: string | null;
  billing: BillingInterval | null;
};

/**
 * Reads a return from Stripe Checkout off a query string, or null when this
 * isn't one.
 *
 * Tolerant of the malformed URL older sole-ocr builds produced — they appended
 * `?session_id=` to a URL that already had a query, so the id arrived glued to
 * the previous value (`billing=monthly?session_id=cs_…`). Splitting each value
 * on `?` recovers both, so a deploy of the frontend doesn't have to wait on the
 * backend fix.
 */
export function parseCheckoutReturn(search: string): CheckoutReturn | null {
  const params = new URLSearchParams(search);
  if (!params.has(CHECKOUT_MARKER)) return null;

  let sessionId = params.get("session_id");
  const clean = (key: string) => {
    const [value, glued] = (params.get(key) ?? "").split("?");
    if (glued?.startsWith("session_id=")) {
      sessionId ??= glued.slice("session_id=".length);
    }
    return value || null;
  };

  const planSlug = clean("plan");
  const billing = clean("billing");
  clean(CHECKOUT_MARKER);

  return {
    outcome: sessionId ? "success" : "cancelled",
    planSlug,
    billing: billing === "annual" || billing === "monthly" ? billing : null,
  };
}

/** The params a checkout return adds, for stripping once it's been handled. */
export const CHECKOUT_RETURN_PARAMS = [
  CHECKOUT_MARKER,
  "plan",
  "billing",
  "session_id",
] as const;

/**
 * Whether the webhook has caught up with a checkout for `planSlug`.
 *
 * The return from Stripe lands before Stripe's webhook has written the
 * subscription, so this is what the page polls for rather than trusting the
 * redirect — a checkout that started a trial is as live as a paid one.
 */
export function isSubscriptionActivated(
  subscription: SubscriptionInfo,
  planSlug: string | null,
): boolean {
  const live =
    subscription.status === "active" || subscription.status === "trialing";
  if (!live) return false;
  return planSlug ? subscription.planSlug === planSlug : !subscription.isFree;
}

export type PlanSelection = {
  planSlug: string;
  billing: BillingInterval;
  addons?: string[];
  couponCode?: string;
  /**
   * Payroll seats to carry on the same Stripe subscription. `seats: 0` takes
   * payroll off the plan; leaving this out keeps whatever seats are already
   * there (the server no longer reads an absent value as "remove").
   */
  payroll?: { seats: number; interval: "monthly" | "annual" };
};

/** The seat fields both checkout and plan changes send, when there are any. */
function payrollFields(selection: PlanSelection): Record<string, unknown> {
  if (!selection.payroll) return {};
  return {
    payroll_seats: Math.max(0, Math.round(selection.payroll.seats)),
    payroll_interval: selection.payroll.interval,
  };
}

/** Payroll is billed per seat, never as a flat add-on — same as sole-webapp. */
function chargedAddons(selection: PlanSelection): string[] {
  return (selection.addons ?? []).filter((slug) => slug !== "payroll");
}

export type CheckoutOptions = {
  /**
   * The business being paid for, when it isn't the open one — adding a
   * business pays for the new one while the old one is still active. Sent as
   * the `business_id` query param, which the axios client leaves alone when a
   * caller sets it and which sole-ocr's `resolveBusinessContext` reads.
   */
  businessId?: string;
  /** Where Stripe returns to. Settings → Subscription unless told otherwise. */
  returnPath?: string;
};

/**
 * Starts a Stripe Checkout session and returns the URL to send the browser to.
 *
 * The caller navigates rather than this function doing it, so a failure is a
 * thrown error with the server's message rather than a half-navigation.
 */
export async function createCheckoutSession(
  selection: PlanSelection,
  options: CheckoutOptions = {},
): Promise<string> {
  const data = await postSubscription<{ url?: string }>(
    apiRoutes.subscription.create,
    {
      plan_slug: selection.planSlug,
      billing: selection.billing,
      addons: chargedAddons(selection),
      coupon_code: selection.couponCode ?? "",
      ...payrollFields(selection),
      url: checkoutReturnUrl(options.returnPath ?? SUBSCRIPTION_SETTINGS_PATH, {
        [CHECKOUT_MARKER]: "1",
        plan: selection.planSlug,
        billing: selection.billing,
      }),
    },
    "Could not start the subscription.",
    options.businessId ? { params: { business_id: options.businessId } } : undefined,
  );

  const url = data.data?.url;
  if (!url) throw new Error("Could not start the subscription.");
  return url;
}

/* ------------------------------------------------------------------ *
 * Coupons — `POST /subscription/validate-coupon`
 * ------------------------------------------------------------------ */

export type CouponDiscount = {
  type: "percent" | "fixed";
  /** Percent off, or dollars off. */
  amount: number;
  /** Stripe's `once` | `repeating` | `forever`. */
  duration: string;
  durationInMonths: number | null;
};

export type CouponCheck =
  | { valid: true; code: string; discount: CouponDiscount }
  | { valid: false; code: string; message: string };

type ApiCouponResult = {
  success?: boolean;
  valid?: boolean;
  message?: string;
  discount?: {
    type?: string;
    amount?: number;
    duration?: string;
    duration_in_months?: number | null;
  };
};

/**
 * Checks a coupon before checkout, so a typo is caught here rather than as a
 * failed checkout.
 *
 * Plain JSON, not the encrypted envelope: the handler reads `req.body.coupon_code`
 * directly, the same way sole-webapp's PricingModal posts it. An unknown code
 * answers 404, which is an answer ("invalid"), not a failure — only a network
 * or server error throws.
 */
export async function validateCoupon(code: string): Promise<CouponCheck> {
  const trimmed = code.trim();
  try {
    const response = await api.post<ApiCouponResult>(
      apiRoutes.subscription.validateCoupon,
      { coupon_code: trimmed },
    );
    const result = response.data;
    if (result?.valid && result.discount?.amount != null) {
      return {
        valid: true,
        code: trimmed,
        discount: {
          type: result.discount.type === "fixed" ? "fixed" : "percent",
          amount: Number(result.discount.amount),
          duration: result.discount.duration || "once",
          durationInMonths: result.discount.duration_in_months ?? null,
        },
      };
    }
    return {
      valid: false,
      code: trimmed,
      message: result?.message || "That code isn't valid.",
    };
  } catch (error) {
    const response = (error as { response?: { status?: number; data?: ApiCouponResult } })
      .response;
    if (response && response.status && response.status < 500) {
      return {
        valid: false,
        code: trimmed,
        message: response.data?.message || "Invalid or expired coupon code",
      };
    }
    throw error;
  }
}

/** "20% off for 3 months" / "$10 off your first payment". */
export function describeCoupon(discount: CouponDiscount): string {
  const off =
    discount.type === "percent"
      ? `${discount.amount}% off`
      : `$${discount.amount.toFixed(2)} off`;
  if (discount.duration === "forever") return `${off} for as long as you subscribe`;
  if (discount.duration === "repeating" && discount.durationInMonths) {
    return `${off} for ${discount.durationInMonths} ${discount.durationInMonths === 1 ? "month" : "months"}`;
  }
  return `${off} your first payment`;
}

/**
 * A coupon the account already holds — one it signed up with, or FITREC for a
 * Fitrec member — so checkout opens with it applied, the way sole-webapp's
 * Subscriptions screen pre-fills its modal.
 */
export async function fetchAccountCoupon(): Promise<string> {
  const response = await api.post<
    ApiEnvelope<{ user?: { coupon_code?: string | null; fitrec_id?: string | null } }>
  >(apiRoutes.user.getUserProfile, buildEncryptedRequestBody({}));
  const user = response.data?.data?.user;
  return user?.coupon_code?.trim() || (user?.fitrec_id ? "FITREC" : "");
}

/** The Stripe customer portal — cards, receipts and tax details live there. */
export async function createPortalSession(): Promise<string> {
  const data = await postSubscription<{ url?: string }>(
    apiRoutes.subscription.manage,
    { url: checkoutReturnUrl(SUBSCRIPTION_SETTINGS_PATH) },
    "Could not open the billing portal.",
  );

  const url = data.data?.url;
  if (!url) throw new Error("Could not open the billing portal.");
  return url;
}

/** Switches an existing subscription's plan in place — no checkout round trip. */
export async function updateSubscriptionPlan(
  selection: PlanSelection,
): Promise<string | undefined> {
  const data = await postSubscription<unknown>(
    apiRoutes.subscription.update,
    {
      plan_slug: selection.planSlug,
      billing: selection.billing,
      addons: chargedAddons(selection),
      coupon_code: selection.couponCode ?? "",
      ...payrollFields(selection),
    },
    "Could not change your plan.",
  );
  return data.message;
}

/**
 * Cancels at the end of the paid period.
 *
 * The reason is posted to `cancel-feedback` first and deliberately not awaited
 * for its result — sole-webapp swallows that call's failure too, because
 * losing the survey answer is not a reason to block the cancellation itself.
 */
export async function cancelSubscription(
  reason: string,
  otherText = "",
): Promise<string | undefined> {
  void api
    .post(
      apiRoutes.subscription.cancelFeedback,
      buildEncryptedRequestBody({ reason, other_text: otherText }),
    )
    .catch(() => {});

  const data = await postSubscription<unknown>(
    apiRoutes.subscription.cancel,
    {},
    "Could not cancel your plan.",
  );

  /*
   * The predefined reason only. `otherText` is free text the customer typed
   * and it MUST NOT reach Mixpanel — it cannot be redacted once it is in a
   * third-party tool, and people put account details, names and complaints in
   * that box. It stays in the Sole database, where the cancel-feedback
   * endpoint above already put it.
   *
   * `has_other_text` is sent instead, which answers "is the free-text box
   * worth reading this month" without carrying a word of it.
   */
  track(EVENTS.PLAN_CANCELED, {
    reason,
    has_other_text: otherText.trim().length > 0,
  });

  return data.message;
}

/** Undoes a cancellation that hasn't taken effect yet. */
export async function resumeSubscription(): Promise<string | undefined> {
  const data = await postSubscription<unknown>(
    apiRoutes.subscription.resume,
    {},
    "Could not resume your plan.",
  );
  track(EVENTS.SUBSCRIPTION_REACTIVATED);
  return data.message;
}

/** The same five sole-webapp's `CancellationReasonDialog` offers. */
export const CANCELLATION_REASONS = [
  "Missing features",
  "Too expensive",
  "Bank account issue",
  "Didn't get time to try it",
  "Something else",
] as const;

/** The one reason that asks for a sentence of its own. */
export const CANCELLATION_OTHER = "Something else";
