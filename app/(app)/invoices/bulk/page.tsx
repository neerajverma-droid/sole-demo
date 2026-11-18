import type { Metadata } from "next";

import { InvoiceBulkUploadDialog } from "@/components/invoices/bulk-upload-dialog";

export const metadata: Metadata = {
  title: "Bulk upload invoices · Sole",
};

export default function BulkUploadPage() {
  return <InvoiceBulkUploadDialog page />;
}
