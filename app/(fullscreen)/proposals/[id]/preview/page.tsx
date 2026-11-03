import { ProposalPreviewScreen } from "@/components/proposals/proposal-preview-screen";

export default async function ProposalPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProposalPreviewScreen proposalId={id} />;
}
