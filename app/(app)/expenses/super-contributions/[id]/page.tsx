import { ContributionForm } from "@/components/super/contribution-form";

export default async function EditContributionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ContributionForm contributionId={id} />;
}
