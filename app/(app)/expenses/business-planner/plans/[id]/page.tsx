import { PlanDetail } from "@/components/planner/plan-detail";

export default async function PlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PlanDetail planId={id} />;
}
