import type { Metadata } from "next";

import { NewNdisQuote } from "@/components/quotes/new-ndis-quote";

export const metadata: Metadata = {
  title: "New NDIS quote · Sole",
};

export default async function NewNdisQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; duplicate?: string }>;
}) {
  const { template, duplicate } = await searchParams;
  return <NewNdisQuote templateId={template} duplicateId={duplicate} />;
}
