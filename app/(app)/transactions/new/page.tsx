import type { Metadata } from "next";

import { ManualEntryForm } from "@/components/transactions/manual-entry-form";

export const metadata: Metadata = {
  title: "New transaction · Sole",
};

export default function ManualEntryPage() {
  return <ManualEntryForm />;
}
