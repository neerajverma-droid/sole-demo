import type { Metadata } from "next";

import { BulkUploadWizard } from "@/components/transactions/bulk-upload-wizard";

export const metadata: Metadata = {
  title: "Bulk upload transactions · Sole",
};

export default async function BulkUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return <BulkUploadWizard from={from === "migrations" ? "migrations" : undefined} />;
}
