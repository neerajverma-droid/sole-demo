import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// Imported after the mock so `lib/goal-tracker.ts`'s own
// `import api from "@/utils/axiosInstance"` resolves to the mocked module above.
const { fetchRevenueGoalTarget, saveRevenueGoalTarget } = await import("@/lib/goal-tracker");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchRevenueGoalTarget", () => {
  it("GETs /goal/tracker with no params", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { exists: false } } });
    await fetchRevenueGoalTarget();
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.goalTracker.get);
  });

  it("returns the saved income_goal, ignoring the server's own progress figures", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          exists: true,
          goal: { income_goal: 250000, total_income: 12, average_invoice_size: 3 },
        },
      },
    });
    expect(await fetchRevenueGoalTarget()).toBe(250000);
  });

  it("coerces a decimal-string income_goal (as MySQL DECIMAL columns come back)", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { exists: true, goal: { income_goal: "180000.00" } } },
    });
    expect(await fetchRevenueGoalTarget()).toBe(180000);
  });

  it("is null — 'no goal saved yet' — when exists is false", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { exists: false, goal: { income_goal: 5000 } } },
    });
    expect(await fetchRevenueGoalTarget()).toBeNull();
  });

  it("is null when exists is true but no goal object came back", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { exists: true } } });
    expect(await fetchRevenueGoalTarget()).toBeNull();
  });

  it("is null when the envelope has no data at all", async () => {
    apiMock.get.mockResolvedValue({ data: {} });
    expect(await fetchRevenueGoalTarget()).toBeNull();
  });

  it("is null rather than 0 for a zero or unparseable goal", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: { success: true, data: { exists: true, goal: { income_goal: 0 } } },
    });
    expect(await fetchRevenueGoalTarget()).toBeNull();

    apiMock.get.mockResolvedValueOnce({
      data: { success: true, data: { exists: true, goal: { income_goal: "abc" } } },
    });
    expect(await fetchRevenueGoalTarget()).toBeNull();
  });
});

describe("saveRevenueGoalTarget", () => {
  it("POSTs { income_goal } as plain JSON to /goal/tracker", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await saveRevenueGoalTarget(320000);
    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.goalTracker.save, { income_goal: 320000 });
  });

  it("resolves to undefined", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });
    await expect(saveRevenueGoalTarget(1)).resolves.toBeUndefined();
  });

  it("propagates a rejected request (e.g. the backend's 400 for income_goal <= 0)", async () => {
    apiMock.post.mockRejectedValue(new Error("Income goal must be greater than 0"));
    await expect(saveRevenueGoalTarget(0)).rejects.toThrow("Income goal must be greater than 0");
  });
});
