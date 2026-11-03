import { BudgetDetail } from "@/components/planner/budget-detail";

export default async function BudgetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BudgetDetail budgetId={id} />;
}
