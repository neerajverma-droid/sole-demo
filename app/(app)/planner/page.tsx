import { Suspense } from "react";

import { TaskPlannerScreen } from "@/components/task-planner/task-planner-screen";

/** Suspense because the screen reads its filters from the URL. */
export default function PlannerPage() {
  return (
    <Suspense fallback={null}>
      <TaskPlannerScreen />
    </Suspense>
  );
}
