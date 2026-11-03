import { ExpenseForm } from "@/components/expenses/expense-form";

export default async function NewExpensePage({
  searchParams,
}: {
  /** `?copy=` arrives from Expenses → Duplicate. */
  searchParams: Promise<{ copy?: string }>;
}) {
  const { copy } = await searchParams;
  return <ExpenseForm copyOfId={copy} />;
}
