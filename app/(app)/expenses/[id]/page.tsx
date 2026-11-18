import type { Metadata } from "next";

import { ExpenseForm } from "@/components/expenses/expense-form";

export const metadata: Metadata = {
  title: "Expense · Sole",
};

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExpenseForm expenseId={id} />;
}
