import { describe, expect, it, vi, beforeEach } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
import apiRoutes from "@/config/api-routes";

const apiMock = { get: vi.fn(), post: vi.fn() };

vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const { createCheckoutSession, updateSubscriptionPlan } = await import(
  "@/lib/subscription"
);

function decryptedBody(body: unknown): Record<string, unknown> {
  return decryptPayload((body as { data: string }).data);
}

beforeEach(() => {
  vi.clearAllMocks();
  // createCheckoutSession builds its return URL from the page's origin.
  vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
});

describe("payroll seats on the plan", () => {
  it("sends seats and their interval with checkout, never payroll as an add-on", async () => {
    apiMock.post.mockResolvedValueOnce({
      data: { success: true, data: { url: "https://checkout.stripe.test/x" } },
    });

    await createCheckoutSession({
      planSlug: "pro",
      billing: "annual",
      addons: ["accounting", "payroll"],
      payroll: { seats: 6, interval: "annual" },
    });

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.subscription.create);
    const fields = decryptedBody(body);
    expect(fields.payroll_seats).toBe(6);
    expect(fields.payroll_interval).toBe("annual");
    expect(fields.addons).toEqual(["accounting"]);
  });

  it("sends 0 seats to take payroll off the plan", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: true } });

    await updateSubscriptionPlan({
      planSlug: "pro",
      billing: "monthly",
      payroll: { seats: 0, interval: "monthly" },
    });

    const fields = decryptedBody(apiMock.post.mock.calls[0][1]);
    expect(fields.payroll_seats).toBe(0);
  });

  it("leaves seats out entirely when the caller doesn't know them", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: true } });

    await updateSubscriptionPlan({ planSlug: "pro", billing: "monthly" });

    const fields = decryptedBody(apiMock.post.mock.calls[0][1]);
    expect(fields).not.toHaveProperty("payroll_seats");
    expect(fields).not.toHaveProperty("payroll_interval");
  });
});
