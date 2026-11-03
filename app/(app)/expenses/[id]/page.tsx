import { ExpenseForm } from "@/components/expenses/expense-form";

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExpenseForm expenseId={id} />;
}
