import type { Metadata } from "next";

import { GoalDetail } from "@/components/planner/goal-detail";

export const metadata: Metadata = {
  title: "Goal · Sole",
};

export default async function GoalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GoalDetail goalId={id} />;
}
