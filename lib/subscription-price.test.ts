import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * `GET /subscription/my-subscription` sends `plan` as the raw database row, so
 * `plan.price` (a DECIMAL) arrives as the STRING "14.99". The Subscription screen
 * calls `planPrice.toFixed(2)`; a string there throws "toFixed is not a function"
 * and the whole page falls to Next's "This page couldn't load".
 */
const apiMock = { get: vi.fn(), post: vi.fn() };

vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const { fetchMySubscription } = await import("@/lib/subscription");

const respond = (plan: Record<string, unknown> | undefined) =>
  apiMock.get.mockResolvedValueOnce({
    data: {
      success: true,
      data: {
        subscription_detail: { status: "active", plan_interval: "monthly" },
        plan,
        billing: { addons_total: "9.98", next_billing_amount: 24.97 },
      },
    },
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("planPrice from my-subscription", () => {
  it("is a number even though the server sends a string, so .toFixed works", async () => {
    respond({ name: "Invoices and Expenses", slug: "business", tier: "paid", price: "14.99" });
    const info = await fetchMySubscription();
    expect(info.planPrice).toBe(14.99);
    expect(typeof info.planPrice).toBe("number");
    expect(info.planPrice.toFixed(2)).toBe("14.99");
    // The other money fields were already numbers.
    expect(info.addonsTotal).toBe(9.98);
    expect(info.nextBillingAmount).toBe(24.97);
  });

  it("still accepts a real number", async () => {
    respond({ slug: "bundle", tier: "paid", price: 24.99 });
    await expect(fetchMySubscription()).resolves.toMatchObject({ planPrice: 24.99 });
  });

  it("is 0, never a non-number, for a missing, empty or unreadable price", async () => {
    for (const price of [undefined, null, "", "abc", {}]) {
      respond({ slug: "free", tier: "free", price });
      const info = await fetchMySubscription();
      expect(info.planPrice).toBe(0);
      expect(() => info.planPrice.toFixed(2)).not.toThrow();
    }
  });

  it("is 0 when there is no plan at all", async () => {
    respond(undefined);
    const info = await fetchMySubscription();
    expect(info.planPrice).toBe(0);
  });
});
