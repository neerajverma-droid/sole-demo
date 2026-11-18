import type { Metadata } from "next";

import { InvoiceEditor } from "@/components/invoices/invoice-editor";
import { ExpenseInvoiceEditor } from "@/components/expenses/expense-invoice-editor";
import { TimeInvoiceEditor } from "@/components/time-tracker/time-invoice-editor";

export const metadata: Metadata = {
  title: "Invoice · Sole",
};

export default async function EditInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /**
   * `time`: sessions from Time Tracker being added to this draft.
   * `expense`: an expense from Expenses → Convert to invoice, likewise.
   */
  searchParams: Promise<{ time?: string; expense?: string }>;
}) {
  const { id } = await params;
  const { time, expense } = await searchParams;
  if (time) return <TimeInvoiceEditor handoffKey={time} invoiceId={id} />;
  if (expense) return <ExpenseInvoiceEditor expenseId={expense} invoiceId={id} />;
  return <InvoiceEditor invoiceId={id} />;
}
