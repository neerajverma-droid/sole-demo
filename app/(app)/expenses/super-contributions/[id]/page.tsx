import type { Metadata } from "next";

import { ContributionForm } from "@/components/super/contribution-form";

export const metadata: Metadata = {
  title: "Super contribution · Sole",
};

export default async function EditContributionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ContributionForm contributionId={id} />;
}
