import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
import apiRoutes from "@/config/api-routes";
import { pollUntil } from "@/lib/poll-until";

const apiMock = { get: vi.fn(), post: vi.fn() };

vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const {
  NO_SUBSCRIPTION,
  createCheckoutSession,
  describeCoupon,
  fetchAccountCoupon,
  fetchSubscriptionCatalogue,
  isSubscriptionActivated,
  parseCheckoutReturn,
  selectionMonthlyTotal,
  validateCoupon,
} = await import("@/lib/subscription");

function decryptedBody(body: unknown): Record<string, unknown> {
  return decryptPayload((body as { data: string }).data);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
});

/* ------------------------------------------------------------------ *
 * Starting checkout
 * ------------------------------------------------------------------ */

describe("createCheckoutSession", () => {
  it("returns to Settings → Subscription, marked as a checkout return", async () => {
    apiMock.post.mockResolvedValueOnce({
      data: { success: true, data: { url: "https://checkout.stripe.test/s" } },
    });

    const url = await createCheckoutSession({ planSlug: "bundle", billing: "annual" });

    expect(url).toBe("https://checkout.stripe.test/s");
    const [route, body, config] = apiMock.post.mock.calls[0];
    expect(route).toBe(apiRoutes.subscription.create);
    // Not business-scoped by the caller — the axios client's active business applies.
    expect(config).toBeUndefined();

    const fields = decryptedBody(body);
    expect(fields.plan_slug).toBe("bundle");
    expect(fields.billing).toBe("annual");
    const returnUrl = new URL(fields.url as string);
    expect(returnUrl.pathname).toBe("/settings");
    expect(returnUrl.searchParams.get("section")).toBe("subscription");
    expect(returnUrl.searchParams.get("checkout")).toBe("1");
    expect(returnUrl.searchParams.get("plan")).toBe("bundle");
    expect(returnUrl.searchParams.get("billing")).toBe("annual");
  });

  it("pays for a specific business and returns to its own page", async () => {
    apiMock.post.mockResolvedValueOnce({
      data: { success: true, data: { url: "https://checkout.stripe.test/b" } },
    });

    await createCheckoutSession(
      { planSlug: "business", billing: "monthly", addons: ["time"] },
      { businessId: "42", returnPath: "/businesses/new?business=42&step=payment" },
    );

    const [, body, config] = apiMock.post.mock.calls[0];
    // The query param sole-ocr's resolveBusinessContext reads — and one the
    // axios interceptor won't overwrite with the open business.
    expect(config).toEqual({ params: { business_id: "42" } });

    const fields = decryptedBody(body);
    expect(fields.addons).toEqual(["time"]);
    const returnUrl = new URL(fields.url as string);
    expect(returnUrl.pathname).toBe("/businesses/new");
    expect(returnUrl.searchParams.get("business")).toBe("42");
    expect(returnUrl.searchParams.get("step")).toBe("payment");
    expect(returnUrl.searchParams.get("checkout")).toBe("1");
  });

  it("surfaces the server's message when checkout can't start", async () => {
    apiMock.post.mockResolvedValueOnce({
      data: {
        success: false,
        message: "This business already has an active subscription.",
      },
    });

    await expect(
      createCheckoutSession({ planSlug: "pro", billing: "monthly" }),
    ).rejects.toThrow("This business already has an active subscription.");
  });
});

/* ------------------------------------------------------------------ *
 * Coming back from Stripe
 * ------------------------------------------------------------------ */

describe("parseCheckoutReturn", () => {
  it("ignores a page that wasn't opened from checkout", () => {
    expect(parseCheckoutReturn("section=subscription")).toBeNull();
    // `plan` alone isn't a return — only the marker is.
    expect(parseCheckoutReturn("section=subscription&plan=pro")).toBeNull();
  });

  it("reads a paid return", () => {
    expect(
      parseCheckoutReturn(
        "section=subscription&checkout=1&plan=pro&billing=annual&session_id=cs_test_123",
      ),
    ).toEqual({ outcome: "success", planSlug: "pro", billing: "annual" });
  });

  it("reads a cancelled return — same URL, no session id", () => {
    expect(
      parseCheckoutReturn("section=subscription&checkout=1&plan=pro&billing=monthly"),
    ).toEqual({ outcome: "cancelled", planSlug: "pro", billing: "monthly" });
  });

  it("recovers the session id an older backend glued onto the last value", () => {
    // `${url}?session_id=` on a URL that already had a query.
    expect(
      parseCheckoutReturn(
        "section=subscription&checkout=1&plan=bundle&billing=monthly?session_id=cs_test_9",
      ),
    ).toEqual({ outcome: "success", planSlug: "bundle", billing: "monthly" });
  });

  it("drops a billing value it doesn't recognise", () => {
    expect(parseCheckoutReturn("checkout=1&plan=pro&billing=weekly")?.billing).toBeNull();
  });
});

describe("isSubscriptionActivated", () => {
  const sub = (overrides: Partial<typeof NO_SUBSCRIPTION>) => ({
    ...NO_SUBSCRIPTION,
    ...overrides,
  });

  it("is live once the webhook has written the chosen plan — a trial counts", () => {
    expect(
      isSubscriptionActivated(
        sub({ status: "trialing", planSlug: "pro", isFree: false }),
        "pro",
      ),
    ).toBe(true);
    expect(
      isSubscriptionActivated(
        sub({ status: "active", planSlug: "pro", isFree: false }),
        "pro",
      ),
    ).toBe(true);
  });

  it("keeps waiting while the record still shows the old plan", () => {
    expect(
      isSubscriptionActivated(
        sub({ status: "active", planSlug: "business", isFree: false }),
        "pro",
      ),
    ).toBe(false);
  });

  it("keeps waiting on a status that isn't live", () => {
    expect(
      isSubscriptionActivated(sub({ status: "incomplete", planSlug: "pro" }), "pro"),
    ).toBe(false);
    expect(isSubscriptionActivated(NO_SUBSCRIPTION, "pro")).toBe(false);
  });

  it("without a plan to match, any paid live plan will do", () => {
    expect(
      isSubscriptionActivated(sub({ status: "active", planSlug: "bundle", isFree: false }), null),
    ).toBe(true);
    expect(
      isSubscriptionActivated(sub({ status: "active", planSlug: "free", isFree: true }), null),
    ).toBe(false);
  });
});

describe("pollUntil — the wait for the webhook", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves as soon as the check passes", async () => {
    const check = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const done = pollUntil(check, { intervalMs: 2000, timeoutMs: 60000 });
    await vi.advanceTimersByTimeAsync(4000);

    await expect(done).resolves.toBe("done");
    expect(check).toHaveBeenCalledTimes(3);
  });

  it("treats a failed check as 'not yet' rather than giving up", async () => {
    const check = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(true);

    const done = pollUntil(check, { intervalMs: 2000, timeoutMs: 60000 });
    await vi.advanceTimersByTimeAsync(2000);

    await expect(done).resolves.toBe("done");
  });

  it("gives up after the timeout instead of spinning forever", async () => {
    const check = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);

    const done = pollUntil(check, { intervalMs: 2000, timeoutMs: 10000 });
    await vi.advanceTimersByTimeAsync(12000);

    await expect(done).resolves.toBe("timeout");
  });

  it("stops checking once aborted — an unmounted page stops polling", async () => {
    const check = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
    const controller = new AbortController();

    const done = pollUntil(check, {
      intervalMs: 2000,
      timeoutMs: 60000,
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(10000);

    await expect(done).resolves.toBe("aborted");
    expect(check).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ *
 * Coupons
 * ------------------------------------------------------------------ */

describe("validateCoupon", () => {
  it("posts the code as plain JSON — the handler reads req.body.coupon_code", async () => {
    apiMock.post.mockResolvedValueOnce({
      data: {
        success: true,
        valid: true,
        discount: { type: "percent", amount: 20, duration: "repeating", duration_in_months: 3 },
      },
    });

    const result = await validateCoupon("  SOLE20 ");

    const [route, body] = apiMock.post.mock.calls[0];
    expect(route).toBe(apiRoutes.subscription.validateCoupon);
    expect(body).toEqual({ coupon_code: "SOLE20" });
    expect(result).toEqual({
      valid: true,
      code: "SOLE20",
      discount: { type: "percent", amount: 20, duration: "repeating", durationInMonths: 3 },
    });
  });

  it("reads the 404 for an unknown code as an answer, not a failure", async () => {
    apiMock.post.mockRejectedValueOnce({
      response: { status: 404, data: { valid: false, message: "Invalid or expired coupon code" } },
    });

    await expect(validateCoupon("NOPE")).resolves.toEqual({
      valid: false,
      code: "NOPE",
      message: "Invalid or expired coupon code",
    });
  });

  it("still throws when the server itself fails", async () => {
    apiMock.post.mockRejectedValueOnce({ response: { status: 500, data: {} } });
    await expect(validateCoupon("SOLE20")).rejects.toBeTruthy();
  });

  it("describes each kind of discount the way Stripe applies it", () => {
    expect(
      describeCoupon({ type: "percent", amount: 20, duration: "repeating", durationInMonths: 3 }),
    ).toBe("20% off for 3 months");
    expect(
      describeCoupon({ type: "fixed", amount: 10, duration: "once", durationInMonths: null }),
    ).toBe("$10.00 off your first payment");
    expect(
      describeCoupon({ type: "percent", amount: 50, duration: "forever", durationInMonths: null }),
    ).toBe("50% off for as long as you subscribe");
  });

  it("opens with a coupon the account already holds, or FITREC for a member", async () => {
    apiMock.post.mockResolvedValueOnce({
      data: { success: true, data: { user: { coupon_code: "WELCOME10" } } },
    });
    await expect(fetchAccountCoupon()).resolves.toBe("WELCOME10");

    apiMock.post.mockResolvedValueOnce({
      data: { success: true, data: { user: { coupon_code: "", fitrec_id: "fr_1" } } },
    });
    await expect(fetchAccountCoupon()).resolves.toBe("FITREC");

    apiMock.post.mockResolvedValueOnce({ data: { success: true, data: { user: {} } } });
    await expect(fetchAccountCoupon()).resolves.toBe("");
  });
});

/* ------------------------------------------------------------------ *
 * The catalogue the add-business picker prices against
 * ------------------------------------------------------------------ */

describe("fetchSubscriptionCatalogue", () => {
  it("returns packages and add-ons, without the per-seat payroll row", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          packages: [
            { slug: "business", name: "Business", price: "14.99", plan_interval: "monthly" },
            { slug: "business", name: "Business", price: "143.90", plan_interval: "annual" },
          ],
          addons: [
            { slug: "time", name: "Time Tracker", price: "4.99", plan_interval: "monthly", description: "Log hours" },
            { slug: "payroll", name: "Payroll", price: "4.99", plan_interval: "monthly" },
          ],
        },
      },
    });

    const { packages, addons } = await fetchSubscriptionCatalogue();

    expect(packages).toHaveLength(2);
    expect(packages[1].monthlyPrice).toBeCloseTo(143.9 / 12);
    expect(addons.map((addon) => addon.slug)).toEqual(["time"]);
    expect(addons[0].description).toBe("Log hours");
  });
});

describe("selectionMonthlyTotal — matches what create-session charges", () => {
  const plan = (slug: string, monthlyPrice: number) => ({
    slug,
    name: slug,
    description: "",
    price: monthlyPrice,
    interval: "monthly",
    monthlyPrice,
    badge: null,
    comingSoon: false,
    includes: [],
    excludes: [],
  });
  const addons = [plan("accounting", 7.99), plan("time", 4.99), plan("km", 4.99), plan("booking", 4.99)];

  it("charges every add-on on a package that includes none", () => {
    expect(selectionMonthlyTotal(plan("business", 14.99), addons)).toBeCloseTo(
      14.99 + 7.99 + 4.99 * 3,
    );
  });

  it("only charges add-ons past the ones a bundle includes", () => {
    // bundle includes 3 — the fourth switched on is the first charged.
    expect(selectionMonthlyTotal(plan("bundle", 24.99), addons)).toBeCloseTo(24.99 + 4.99);
  });

  it("charges nothing extra on pro, which includes them all", () => {
    expect(selectionMonthlyTotal(plan("pro", 59.99), addons)).toBeCloseTo(59.99);
  });

  it("is zero with no package chosen", () => {
    expect(selectionMonthlyTotal(null, addons)).toBe(0);
  });
});
