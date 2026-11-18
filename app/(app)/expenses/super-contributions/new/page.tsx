import type { Metadata } from "next";

import { ContributionForm } from "@/components/super/contribution-form";

export const metadata: Metadata = {
  title: "New super contribution · Sole",
};

export default async function NewContributionPage({
  searchParams,
}: {
  /** `?copy=` arrives from Super contributions → Duplicate. */
  searchParams: Promise<{ copy?: string }>;
}) {
  const { copy } = await searchParams;
  return <ContributionForm copyOfId={copy} />;
}
