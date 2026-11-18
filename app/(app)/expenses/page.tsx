import type { Metadata } from "next";
import { Suspense } from "react";

import { ExpensesScreen } from "@/components/expenses/expenses-screen";

export const metadata: Metadata = {
  title: "Expenses · Sole",
};

export default function ExpensesPage() {
  return (
    <Suspense fallback={null}>
      <ExpensesScreen />
    </Suspense>
  );
}
