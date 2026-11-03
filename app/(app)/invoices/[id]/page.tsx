import { InvoiceEditor } from "@/components/invoices/invoice-editor";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InvoiceEditor invoiceId={id} />;
}
