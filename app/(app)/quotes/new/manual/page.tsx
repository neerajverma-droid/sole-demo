import { QuoteEditor } from "@/components/quotes/quote-editor";

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; duplicate?: string }>;
}) {
  const { template, duplicate } = await searchParams;
  return <QuoteEditor templateId={template} duplicateId={duplicate} />;
}
