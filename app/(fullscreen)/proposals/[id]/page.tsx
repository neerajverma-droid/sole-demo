import type { Metadata } from "next";

import { ProposalBuilder } from "@/components/proposals/proposal-builder";

export const metadata: Metadata = {
  title: "Proposal · Sole",
};

/** /proposals/:id[?comments=<thread id>] — a notification's link opens that comment thread. */
export default async function EditProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ comments?: string | string[] }>;
}) {
  const { id } = await params;
  const { comments } = await searchParams;
  return (
    <ProposalBuilder key={id} proposalId={id} focusThreadId={(Array.isArray(comments) ? comments[0] : comments) ?? null} />
  );
}
