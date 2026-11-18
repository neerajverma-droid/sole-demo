import type { Metadata } from "next";

import { ProposalTemplatePreviewScreen } from "@/components/proposals/proposal-template-preview-screen";

export const metadata: Metadata = {
  title: "Template preview · Sole",
};

export default async function ProposalTemplatePreviewPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  return <ProposalTemplatePreviewScreen templateId={templateId} />;
}
