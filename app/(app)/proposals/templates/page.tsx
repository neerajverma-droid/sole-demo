import type { Metadata } from "next";

import { ProposalTemplatesScreen } from "@/components/proposals/proposal-templates-screen";
import { kindFromSlug } from "@/lib/proposal-templates";

export const metadata: Metadata = {
  title: "Proposal templates · Sole",
};

/** /proposals/templates[?type=introduction | terms | thank-you] — one tab per kind. */
export default async function ProposalTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  const { type } = await searchParams;
  const kind = kindFromSlug(Array.isArray(type) ? type[0] : type);
  // Keyed by kind: a new tab starts with a fresh search and filter.
  return <ProposalTemplatesScreen key={kind} kind={kind} />;
}
