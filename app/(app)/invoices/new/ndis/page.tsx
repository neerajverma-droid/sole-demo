import type { Metadata } from "next";

import { NewNdisInvoice } from "@/components/invoices/new-ndis-invoice";

export const metadata: Metadata = {
  title: "New NDIS invoice · Sole",
};

export default async function NewNdisInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const { template } = await searchParams;
  return <NewNdisInvoice templateId={template} />;
}
