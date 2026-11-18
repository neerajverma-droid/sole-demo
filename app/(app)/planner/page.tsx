import type { Metadata } from "next";
import { Suspense } from "react";

import { TaskPlannerScreen } from "@/components/task-planner/task-planner-screen";

export const metadata: Metadata = {
  title: "Planner · Sole",
};

/** Suspense because the screen reads its filters from the URL. */
export default function PlannerPage() {
  return (
    <Suspense fallback={null}>
      <TaskPlannerScreen />
    </Suspense>
  );
}
