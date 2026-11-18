import type { Metadata } from "next";

import { GoalDetail } from "@/components/planner/goal-detail";

export const metadata: Metadata = {
  title: "New goal · Sole",
};

export default function NewGoalPage() {
  return <GoalDetail />;
}
