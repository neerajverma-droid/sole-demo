import type { Metadata } from "next";

import { PlanDetail } from "@/components/planner/plan-detail";

export const metadata: Metadata = {
  title: "New plan · Sole",
};

export default function NewPlanPage() {
  return <PlanDetail />;
}
