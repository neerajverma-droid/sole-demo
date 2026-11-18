import type { Metadata } from "next";

import { QuoteEditor } from "@/components/quotes/quote-editor";

export const metadata: Metadata = {
  title: "New quote · Sole",
};

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; duplicate?: string }>;
}) {
  const { template, duplicate } = await searchParams;
  return <QuoteEditor templateId={template} duplicateId={duplicate} />;
}
