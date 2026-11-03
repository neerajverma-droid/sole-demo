import { ProposalTemplatePreviewScreen } from "@/components/proposals/proposal-template-preview-screen";

export default async function ProposalTemplatePreviewPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  return <ProposalTemplatePreviewScreen templateId={templateId} />;
}
