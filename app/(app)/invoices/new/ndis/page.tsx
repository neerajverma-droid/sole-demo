import { NewNdisInvoice } from "@/components/invoices/new-ndis-invoice";

export default async function NewNdisInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const { template } = await searchParams;
  return <NewNdisInvoice templateId={template} />;
}
