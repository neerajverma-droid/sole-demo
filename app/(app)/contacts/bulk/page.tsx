import type { Metadata } from "next";

import { BulkUploadDialog } from "@/components/contacts/bulk-upload-dialog";

export const metadata: Metadata = {
  title: "Bulk upload contacts · Sole",
};

export default function BulkUploadPage() {
  return <BulkUploadDialog page />;
}
