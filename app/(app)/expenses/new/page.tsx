import type { Metadata } from "next";

import { CreateExpenseChooser } from "@/components/expenses/create-expense-chooser";

export const metadata: Metadata = {
  title: "New expense · Sole",
};

export default function CreateExpensePage() {
  return <CreateExpenseChooser />;
}
