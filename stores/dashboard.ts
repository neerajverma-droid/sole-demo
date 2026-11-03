import { create } from "zustand";
import { persist } from "zustand/middleware";

import { REVENUE_GOAL } from "@/lib/dashboard-data";

type DashboardState = {
  /**
   * Annual revenue target in whole dollars; 0 means no goal set.
   *
   * Synced from the real `/goal/tracker` endpoint by `useRevenueGoalQuery`
   * (`hooks/use-goal-tracker-query.ts`) once a saved goal exists.
   */
  goalTarget: number;
  setGoalTarget: (value: number) => void;
  /**
   * Local-only: the backend has no delete for a saved goal (it rejects
   * `income_goal <= 0`), so this clears the figure on this device without
   * telling the server — the next real sync brings the saved target back.
   */
  resetGoalTarget: () => void;
};

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      goalTarget: REVENUE_GOAL.defaultTarget,
      setGoalTarget: (value) => set({ goalTarget: value }),
      resetGoalTarget: () => set({ goalTarget: 0 }),
    }),
    {
      name: "sole-dashboard",
      // Rehydrated after mount so server and first client render match.
      skipHydration: true,
    },
  ),
);
