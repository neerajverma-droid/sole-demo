import type { Metadata } from "next";

import { ExpenseBulkUploadDialog } from "@/components/expenses/bulk-upload-dialog";

export const metadata: Metadata = {
  title: "Bulk upload expenses · Sole",
};

export default function BulkUploadPage() {
  return <ExpenseBulkUploadDialog page />;
}
