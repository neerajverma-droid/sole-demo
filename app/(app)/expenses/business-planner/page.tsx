import type { Metadata } from "next";

import { PlannerScreen } from "@/components/planner/planner-screen";

export const metadata: Metadata = {
  title: "Business planner · Sole",
};

export default function BusinessPlannerPage() {
  return <PlannerScreen />;
}
