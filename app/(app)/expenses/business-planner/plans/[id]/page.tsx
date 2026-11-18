import type { Metadata } from "next";

import { PlanDetail } from "@/components/planner/plan-detail";

export const metadata: Metadata = {
  title: "Plan · Sole",
};

export default async function PlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PlanDetail planId={id} />;
}
