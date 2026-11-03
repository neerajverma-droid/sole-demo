import { Suspense } from "react";

import { ExpensesScreen } from "@/components/expenses/expenses-screen";

export default function ExpensesPage() {
  return (
    <Suspense fallback={null}>
      <ExpensesScreen />
    </Suspense>
  );
}
