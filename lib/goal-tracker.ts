/**
 * The revenue goal's target — sole-ocr's `/goal/tracker` resource.
 *
 * The backend also computes progress figures (earned, average invoice,
 * invoices needed) off the goal it stores, but those are derived from
 * *reconciled transactions*, not invoices — a different basis than
 * `financialYearRevenue` in `lib/invoices.ts`, which the rest of the
 * dashboard (header, revenue goal card, business snapshot) already agrees on.
 * Mixing the two back in is exactly the drift this codebase has already
 * fixed once (see `REVENUE_GOAL`'s doc comment in `lib/dashboard-data.ts`),
 * so only the target itself is synced here — the progress figures stay
 * derived client-side from the real invoice store.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";

type ApiEnvelope<T> = { success: boolean; message?: string; error?: string; data?: T };

type ApiGoalResponse = {
  exists: boolean;
  goal?: { income_goal: number | string };
};

/** `null` means the account has never saved a goal — not "still loading". */
export async function fetchRevenueGoalTarget(): Promise<number | null> {
  const response = await api.get<ApiEnvelope<ApiGoalResponse>>(
    apiRoutes.goalTracker.get,
  );
  const data = response.data?.data;
  if (!data?.exists || !data.goal) return null;
  return Number(data.goal.income_goal) || null;
}

export async function saveRevenueGoalTarget(incomeGoal: number): Promise<void> {
  await api.post(apiRoutes.goalTracker.save, { income_goal: incomeGoal });
}
