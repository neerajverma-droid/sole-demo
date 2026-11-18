import type { Metadata } from "next";

import { CreateInvoiceChooser } from "@/components/invoices/create-invoice-chooser";

export const metadata: Metadata = {
  title: "New invoice · Sole",
};

export default function CreateInvoicePage() {
  return <CreateInvoiceChooser />;
}
