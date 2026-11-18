import type { Metadata } from "next";

import { InvoiceEditor } from "@/components/invoices/invoice-editor";
import { ExpenseInvoiceEditor } from "@/components/expenses/expense-invoice-editor";
import { TimeInvoiceEditor } from "@/components/time-tracker/time-invoice-editor";

export const metadata: Metadata = {
  title: "New invoice · Sole",
};

export default async function NewGeneralInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{
    template?: string;
    item?: string;
    /** An expense being on-charged, from Expenses → Convert to invoice. */
    expense?: string;
    /** An accepted quote being billed, from Quotes → Convert to invoice. */
    quote?: string;
    /**
     * An existing invoice being copied, from the list's Duplicate action. The
     * editor works out on its own whether the copy is an NDIS claim, from the
     * record it loads, so both kinds arrive here.
     */
    duplicate?: string;
    /** Sessions being invoiced, from Time Tracker → Create invoice. */
    time?: string;
  }>;
}) {
  const { template, item, expense, quote, duplicate, time } = await searchParams;
  if (time) return <TimeInvoiceEditor handoffKey={time} />;
  if (expense) return <ExpenseInvoiceEditor expenseId={expense} />;
  return (
    <InvoiceEditor
      templateId={template}
      itemId={item}
      quoteId={quote}
      duplicateId={duplicate}
    />
  );
}
