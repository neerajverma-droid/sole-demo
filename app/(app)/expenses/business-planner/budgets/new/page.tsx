import type { Metadata } from "next";

import { BudgetDetail } from "@/components/planner/budget-detail";

export const metadata: Metadata = {
  title: "New budget · Sole",
};

export default function NewBudgetPage() {
  return <BudgetDetail />;
}
