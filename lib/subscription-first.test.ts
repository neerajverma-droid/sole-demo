import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = { get: vi.fn(), post: vi.fn() };

vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const { NO_SUBSCRIPTION, fetchMySubscription, firstSubscriptionGate } =
  await import("@/lib/subscription");

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ *
 * Reading the flag off the server's answer
 * ------------------------------------------------------------------ */

describe("fetchMySubscription — first subscription", () => {
  const respond = (data: Record<string, unknown>) =>
    apiMock.get.mockResolvedValueOnce({ data: { success: true, data } });

  it("carries requires_first_subscription through", async () => {
    respond({
      subscription_detail: { status: "incomplete" },
      plan: { slug: "free", tier: "free" },
      requires_first_subscription: true,
    });

    const subscription = await fetchMySubscription();

    expect(subscription.requiresFirstSubscription).toBe(true);
  });

  it("is false when the server doesn't say so", async () => {
    respond({
      subscription_detail: { status: "incomplete" },
      plan: { slug: "free", tier: "free" },
    });

    expect((await fetchMySubscription()).requiresFirstSubscription).toBe(false);
  });

  it("is false for a paid account", async () => {
    respond({
      subscription_detail: { status: "active" },
      plan: { slug: "bundle", tier: "paid" },
      requires_first_subscription: false,
    });

    expect((await fetchMySubscription()).requiresFirstSubscription).toBe(false);
  });

  it("only a literal true counts — a truthy string must not close the app", async () => {
    respond({
      subscription_detail: { status: "incomplete" },
      requires_first_subscription: "false",
    });

    expect((await fetchMySubscription()).requiresFirstSubscription).toBe(false);
  });

  it("an empty answer is the no-subscription default, which doesn't gate", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { success: true } });

    const subscription = await fetchMySubscription();

    expect(subscription).toBe(NO_SUBSCRIPTION);
    expect(subscription.requiresFirstSubscription).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * The shell's decision
 * ------------------------------------------------------------------ */

describe("firstSubscriptionGate", () => {
  const settled = {
    sessionPending: false,
    isAccountant: false,
    subscriptionPending: false,
    requiresFirstSubscription: false as boolean | undefined,
  };

  it("sends an account that owes its first subscription to the plan step", () => {
    expect(
      firstSubscriptionGate({ ...settled, requiresFirstSubscription: true }),
    ).toBe("required");
  });

  it("opens for an account that already has a subscription", () => {
    expect(firstSubscriptionGate(settled)).toBe("open");
  });

  it("waits for the subscription rather than showing the app for a moment", () => {
    expect(
      firstSubscriptionGate({ ...settled, subscriptionPending: true }),
    ).toBe("loading");
  });

  it("waits for the session, so the accountant exemption can be read first", () => {
    expect(
      firstSubscriptionGate({
        ...settled,
        sessionPending: true,
        requiresFirstSubscription: true,
      }),
    ).toBe("loading");
  });

  it("opens when the subscription request failed — no data, no longer pending", () => {
    expect(
      firstSubscriptionGate({ ...settled, requiresFirstSubscription: undefined }),
    ).toBe("open");
  });

  it("never asks an accountant to subscribe on their own account", () => {
    expect(
      firstSubscriptionGate({
        ...settled,
        isAccountant: true,
        requiresFirstSubscription: true,
      }),
    ).toBe("open");
    // Not even while the rest is still loading.
    expect(
      firstSubscriptionGate({
        sessionPending: true,
        isAccountant: true,
        subscriptionPending: true,
        requiresFirstSubscription: undefined,
      }),
    ).toBe("open");
  });
});
