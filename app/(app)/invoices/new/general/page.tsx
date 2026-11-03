import { InvoiceEditor } from "@/components/invoices/invoice-editor";

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
  }>;
}) {
  const { template, item, expense, quote, duplicate } = await searchParams;
  return (
    <InvoiceEditor
      templateId={template}
      itemId={item}
      expenseId={expense}
      quoteId={quote}
      duplicateId={duplicate}
    />
  );
}
