import { ProposalBuilder } from "@/components/proposals/proposal-builder";

export default async function EditProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProposalBuilder key={id} proposalId={id} />;
}
