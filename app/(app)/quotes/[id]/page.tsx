import type { Metadata } from "next";

import { QuoteEditor } from "@/components/quotes/quote-editor";

export const metadata: Metadata = {
  title: "Quote · Sole",
};

export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <QuoteEditor quoteId={id} />;
}
